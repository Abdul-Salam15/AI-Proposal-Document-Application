import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/lib/types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
// by hand in Supabase. Creates the auth user via the admin API (which emails
// them an invite link) and its matching `public.users` row up front, with
// the role already assigned, so the invited user has a working profile the
// moment they accept.
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

  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
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

  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/accept-invite`,
  });

  if (inviteError || !invited.user) {
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

  const logged = await writeAuditLog({
    actorId: user.id,
    action: "user_invited",
    targetId: invited.user.id,
    metadata: { email, role },
  });

  return NextResponse.json({
    user: profileRow,
    ...(logged ? {} : { auditLogWarning: "The invite was sent, but the audit log entry failed to record. Contact an admin." }),
  });
}
