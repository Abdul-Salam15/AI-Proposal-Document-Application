import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { isValidEmail } from "@/lib/intake-fields";
import { buildInviteEmail } from "@/lib/notifications/templates";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["salesperson", "admin"];

// Vercel's default serverless timeout (10s) can be too tight once Supabase
// Auth has to hand the invite email off to a real SMTP connection (custom
// SMTP, e.g. Brevo) instead of its own fast internal mailer.
export const maxDuration = 30;

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

// POST /api/users/invite — admin only. Provisioning a `users` row has never
// been exposed through the app (auth.ts: "provisioning that row happens
// outside this app") — this is that provisioning, done properly instead of
// by hand in Supabase. Creates the auth user via the admin API and its
// matching `public.users` row up front, with the role already assigned, so
// the invited user has a working profile the moment they accept.
//
// The invite email is sent by us, not by `inviteUserByEmail`'s built-in
// mailer: that mailer's link points straight at Supabase's `/verify`
// endpoint, which consumes the one-time token on the very first HTTP GET it
// receives — including one from an email/chat link-scanner prefetching the
// URL before the real recipient ever opens it, which is exactly what was
// producing "invite link is invalid or expired" for people who hadn't
// clicked anything yet. `generateLink` creates the same auth user but
// returns a `hashed_token` without emailing anyone, so we can point the link
// at our own `/accept-invite` page instead — a bot loads inert HTML there,
// and the token is only spent when `verifyOtp` runs on actual form submit
// (see accept-invite/page.tsx).
export async function POST(request: Request) {
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = body?.email;
  const name = body?.name;
  const role = body?.role;

  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  if (name !== undefined && name !== null && typeof name !== "string") {
    return NextResponse.json({ error: "Name must be a string." }, { status: 400 });
  }

  if (!isRole(role)) {
    return NextResponse.json({ error: "role must be one of: salesperson, admin." }, { status: 400 });
  }

  const service = createServiceClient();
  const origin = new URL(request.url).origin;

  const { data: invited, error: inviteError } = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${origin}/accept-invite` },
  });

  if (inviteError || !invited.user || !invited.properties?.hashed_token) {
    await writeAuditLog({
      actorId: user.id,
      action: "user_invite_failed",
      metadata: { email, role, error: inviteError?.message ?? "Invite failed." },
    });
    return NextResponse.json(
      { error: inviteError?.message ?? "Invite failed." },
      { status: 400 }
    );
  }

  const { data: profileRow, error: profileError } = await service
    .from("users")
    .insert({ id: invited.user.id, email, name: name || null, role })
    .select("id, email, name, role, created_at")
    .single();

  if (profileError || !profileRow) {
    // Don't leave a half-provisioned auth user with no matching `users` row
    // behind — that's exactly the "profile is null" edge case auth.ts warns
    // about, and here it'd be self-inflicted rather than pre-existing data.
    await service.auth.admin.deleteUser(invited.user.id);

    await writeAuditLog({
      actorId: user.id,
      action: "user_invite_failed",
      targetId: invited.user.id,
      metadata: { email, role, error: profileError?.message ?? "Could not create the user profile." },
    });
    return NextResponse.json(
      { error: profileError?.message ?? "Could not create the user profile." },
      { status: 500 }
    );
  }

  const acceptLink = `${origin}/accept-invite?token_hash=${invited.properties.hashed_token}&type=invite`;
  const { subject, body: emailBody } = buildInviteEmail(acceptLink, role);

  let mode: "brevo" | "manual" = "manual";

  try {
    const brevoApiKey = process.env.BREVO_API_KEY;

    if (brevoApiKey) {
      const fromEmail = process.env.BREVO_FROM_EMAIL;
      if (!fromEmail) {
        throw new Error("BREVO_FROM_EMAIL must be set to send email via Brevo.");
      }

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: fromEmail },
          to: [{ email }],
          subject,
          textContent: emailBody,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message ?? `Brevo request failed with status ${response.status}.`);
      }
      mode = "brevo";
    }
  } catch (err) {
    // Brevo is configured but broken: there's no resend affordance in the
    // admin UI yet, so a half-provisioned user the invite email never
    // reached would be permanently stuck. Roll back the same way the
    // profile-insert failure above does, rather than leaving it orphaned.
    await service.auth.admin.deleteUser(invited.user.id);

    const message = err instanceof Error ? err.message : "Sending the invite email failed.";
    await writeAuditLog({
      actorId: user.id,
      action: "user_invite_failed",
      targetId: invited.user.id,
      metadata: { email, role, error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const logged = await writeAuditLog({
    actorId: user.id,
    action: "user_invited",
    targetId: invited.user.id,
    metadata: { email, role, mode },
  });

  return NextResponse.json({
    user: profileRow,
    invite: { mode, acceptLink, email: { subject, body: emailBody } },
    ...(logged ? {} : { auditLogWarning: "The invite was sent, but the audit log entry failed to record. Contact an admin." }),
  });
}
