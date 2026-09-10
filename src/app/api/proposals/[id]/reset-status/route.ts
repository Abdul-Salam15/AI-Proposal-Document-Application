import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { getUserById } from "@/lib/notifications/recipients";
import { sendNotificationEmail } from "@/lib/notifications/send-email";
import { buildStatusResetConfirmationEmail, buildStatusResetEmail } from "@/lib/notifications/templates";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Proposal } from "@/lib/types";

// POST /api/proposals/[id]/reset-status — Section 3: the admin capability
// to "override a stuck status if needed." Not its own row in Section 12's
// route table, but authorized there and already backed by Section 13's
// unrestricted admin UPDATE policy on `proposals` — this just gives that
// capability a route and a button instead of requiring direct SQL. Resets
// back to `draft` so the owner can resume editing; admin only.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
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

  if (proposal.status === "draft") {
    return NextResponse.json({ error: "This proposal is already a draft." }, { status: 409 });
  }

  const service = createServiceClient();
  const { data: updated, error: updateError } = await service
    .from("proposals")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    const logged = await writeAuditLog({
      actorId: user.id,
      action: "status_reset_failed",
      targetId: id,
      metadata: { fromStatus: proposal.status, error: updateError.message },
    });
    return NextResponse.json(
      {
        error: updateError.message,
        ...(logged ? {} : { auditLogWarning: "This failure could not be recorded in the audit log. Contact an admin." }),
      },
      { status: 500 }
    );
  }

  const logged = await writeAuditLog({
    actorId: user.id,
    action: "status_reset_to_draft",
    targetId: id,
    metadata: { fromStatus: proposal.status },
  });

  const origin = new URL(request.url).origin;
  const adminName = profile.name || profile.email;

  const owner = await getUserById(service, proposal.owner_id);
  if (owner) {
    const ownerEmail = buildStatusResetEmail(updated as Proposal, adminName, origin);
    await sendNotificationEmail({
      to: owner.email,
      subject: ownerEmail.subject,
      text: ownerEmail.body,
      actorId: user.id,
      notificationType: "status_reset",
      targetId: id,
    });
  }

  const adminConfirmation = buildStatusResetConfirmationEmail(updated as Proposal, origin);
  await sendNotificationEmail({
    to: user.email!,
    subject: adminConfirmation.subject,
    text: adminConfirmation.body,
    actorId: user.id,
    notificationType: "status_reset_confirmation",
    targetId: id,
  });

  return NextResponse.json({
    proposal: updated,
    ...(logged ? {} : { auditLogWarning: "The status was reset, but the audit log entry failed to record. Contact an admin." }),
  });
}
