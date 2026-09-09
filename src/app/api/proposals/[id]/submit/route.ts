import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// POST /api/proposals/[id]/submit — Section 12: locks the proposal from
// further edits; status -> pending_approval. Salesperson (owner) only.
// Section 6 step 4.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (profile.role !== "salesperson") {
    return NextResponse.json(
      { error: "Only a salesperson can submit a proposal for approval." },
      { status: 403 }
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

  if (proposal.owner_id !== user.id) {
    return NextResponse.json({ error: "You do not own this proposal." }, { status: 403 });
  }

  if (proposal.status !== "draft") {
    return NextResponse.json(
      { error: "Only a draft proposal can be submitted for approval." },
      { status: 409 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("proposals")
    .update({ status: "pending_approval", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    await writeAuditLog({
      actorId: user.id,
      action: "proposal_submission_failed",
      targetId: id,
      metadata: { error: updateError.message },
    });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "proposal_submitted",
    targetId: id,
    metadata: {},
  });

  return NextResponse.json({ proposal: updated });
}
