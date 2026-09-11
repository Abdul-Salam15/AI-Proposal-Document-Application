import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { buildClientEmail } from "@/lib/delivery/email-template";
import { getSession } from "@/lib/auth";
import { isValidEmail } from "@/lib/intake-fields";
import { getUserById } from "@/lib/notifications/recipients";
import { sendNotificationEmail } from "@/lib/notifications/send-email";
import { buildDeliveryFailedEmail, buildSentConfirmationEmail } from "@/lib/notifications/templates";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Proposal } from "@/lib/types";

// POST /api/proposals/[id]/send — Section 12: sends the client email using
// the client email template; status -> sent or failed. Salesperson,
// or admin — only after export succeeds (checked via the
// presence of proposal_link, since that's the concrete artifact export
// produces, rather than re-deriving it from status alone).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: proposal, error: fetchError } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  if (proposal.status === "sent") {
    return NextResponse.json({ error: "This proposal has already been sent." }, { status: 409 });
  }

  if (!proposal.proposal_link) {
    return NextResponse.json(
      { error: "Export the proposal before sending — there is no proposal link yet." },
      { status: 409 }
    );
  }

  const service = createServiceClient();

  if (!proposal.client_email || !isValidEmail(proposal.client_email)) {
    await service
      .from("proposals")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", id);

    const logged = await writeAuditLog({
      actorId: user.id,
      action: "email_failed",
      targetId: id,
      metadata: { error: "Client email is missing or malformed.", clientEmail: proposal.client_email },
    });

    return NextResponse.json(
      {
        error: "Client email is missing or malformed — fix it before sending.",
        ...(logged ? {} : { auditLogWarning: "This failure could not be recorded in the audit log. Contact an admin." }),
      },
      { status: 400 }
    );
  }

  const { subject, body } = buildClientEmail(proposal as Proposal);

  try {
    // Section 2: Brevo when configured, otherwise the manual copy-paste
    // fallback — the composed email is always returned to the caller so the
    // salesperson can send it themselves either way. Brevo verifies a single
    // sender email address rather than requiring a whole domain's DNS to be
    // proven, which fits a sender that doesn't own a domain yet.
    const brevoApiKey = process.env.BREVO_API_KEY;
    let mode: "brevo" | "manual" = "manual";

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
          to: [{ email: proposal.client_email }],
          subject,
          textContent: body,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message ?? `Brevo request failed with status ${response.status}.`);
      }
      mode = "brevo";
    }

    const { data: updated, error: updateError } = await service
      .from("proposals")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    const logged = await writeAuditLog({
      actorId: user.id,
      action: "email_sent",
      targetId: id,
      metadata: { mode, to: proposal.client_email, subject },
    });

    const owner = await getUserById(service, proposal.owner_id);
    if (owner) {
      const origin = new URL(request.url).origin;
      const confirmation = buildSentConfirmationEmail(updated as Proposal, origin);
      await sendNotificationEmail({
        to: owner.email,
        subject: confirmation.subject,
        text: confirmation.body,
        actorId: user.id,
        notificationType: "sent_confirmation",
        targetId: id,
      });
    }

    return NextResponse.json({
      proposal: updated,
      mode,
      email: { subject, body },
      ...(logged ? {} : { auditLogWarning: "The email was sent, but the audit log entry failed to record. Contact an admin." }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sending the email failed.";

    await service
      .from("proposals")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", id);

    const logged = await writeAuditLog({
      actorId: user.id,
      action: "email_failed",
      targetId: id,
      metadata: { error: message },
    });

    const owner = await getUserById(service, proposal.owner_id);
    if (owner) {
      const origin = new URL(request.url).origin;
      const failure = buildDeliveryFailedEmail(proposal as Proposal, "send", message, origin);
      await sendNotificationEmail({
        to: owner.email,
        subject: failure.subject,
        text: failure.body,
        actorId: user.id,
        notificationType: "delivery_failed",
        targetId: id,
      });
    }

    return NextResponse.json(
      {
        error: message,
        ...(logged ? {} : { auditLogWarning: "This failure could not be recorded in the audit log. Contact an admin." }),
      },
      { status: 500 }
    );
  }
}
