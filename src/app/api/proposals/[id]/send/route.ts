import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { buildClientEmail } from "@/lib/delivery/email-template";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Proposal } from "@/lib/types";

// Section 11.2: "Malformed or missing client_email should be validated
// before the delivery step is attempted, rather than relying on the email
// provider to reject it."
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/proposals/[id]/send — Section 12: sends the client email using
// the client email template; status -> sent or failed. Salesperson,
// approver, or admin — only after export succeeds (checked via the
// presence of proposal_link, since that's the concrete artifact export
// produces, rather than re-deriving it from status alone).
export async function POST(
  _request: Request,
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

  if (!proposal.client_email || !EMAIL_REGEX.test(proposal.client_email)) {
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
    // Section 2: Resend when configured, otherwise the manual copy-paste
    // fallback — the composed email is always returned to the caller so the
    // salesperson can send it themselves either way.
    const resendApiKey = process.env.RESEND_API_KEY;
    let mode: "resend" | "manual" = "manual";

    if (resendApiKey) {
      const fromEmail = process.env.RESEND_FROM_EMAIL;
      if (!fromEmail) {
        throw new Error("RESEND_FROM_EMAIL must be set to send email via Resend.");
      }

      const { Resend } = await import("resend");
      const resend = new Resend(resendApiKey);
      const { error: sendError } = await resend.emails.send({
        from: fromEmail,
        to: proposal.client_email,
        subject,
        text: body,
      });

      if (sendError) {
        throw new Error(sendError.message);
      }
      mode = "resend";
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

    return NextResponse.json(
      {
        error: message,
        ...(logged ? {} : { auditLogWarning: "This failure could not be recorded in the audit log. Contact an admin." }),
      },
      { status: 500 }
    );
  }
}
