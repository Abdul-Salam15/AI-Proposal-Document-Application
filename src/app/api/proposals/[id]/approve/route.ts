import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const DECISIONS = ["approved", "rejected"] as const;
type Decision = (typeof DECISIONS)[number];

function isDecision(value: unknown): value is Decision {
  return typeof value === "string" && (DECISIONS as readonly string[]).includes(value);
}

// POST /api/proposals/[id]/approve — Section 12: records the decision in
// `approvals`; status -> approved or rejected. Approver or admin only.
// Section 6 step 5 — no client delivery happens here (Section 6: "No client
// delivery occurs before this step"). Section 4's approval_decision enum
// only has approved/rejected — no other states are introduced.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (profile.role !== "approver" && profile.role !== "admin") {
    return NextResponse.json(
      { error: "Only an approver or admin can record an approval decision." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const decision = body?.decision;
  const comment = typeof body?.comment === "string" && body.comment.trim() ? body.comment : null;

  if (!isDecision(decision)) {
    return NextResponse.json(
      { error: "decision must be 'approved' or 'rejected'." },
      { status: 400 }
    );
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

  if (proposal.status !== "pending_approval") {
    return NextResponse.json(
      { error: "Only a proposal pending approval can be approved or rejected." },
      { status: 409 }
    );
  }

  // approvals INSERT is allowed for the approver's own session (Section 13:
  // current_user_role() in ('approver','admin') and approver_id = auth.uid()).
  const { error: approvalError } = await supabase.from("approvals").insert({
    proposal_id: id,
    approver_id: user.id,
    decision,
    comment,
  });

  if (approvalError) {
    await writeAuditLog({
      actorId: user.id,
      action: "approval_failed",
      targetId: id,
      metadata: { decision, error: approvalError.message },
    });
    return NextResponse.json({ error: approvalError.message }, { status: 500 });
  }

  // Section 13 gives approvers no direct UPDATE policy on `proposals` — the
  // status transition only happens through this validated route, via the
  // service client, the same pattern already used for proposal_versions
  // and audit_log writes.
  const service = createServiceClient();
  const { data: updated, error: updateError } = await service
    .from("proposals")
    .update({ status: decision, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    await writeAuditLog({
      actorId: user.id,
      action: "approval_failed",
      targetId: id,
      metadata: { decision, error: updateError.message },
    });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: decision, // Section 4 example action values: "approved, rejected"
    targetId: id,
    metadata: { comment },
  });

  return NextResponse.json({ proposal: updated });
}
