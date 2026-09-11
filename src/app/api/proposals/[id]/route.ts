import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { isSectionKey, SECTIONS } from "@/lib/generation/sections";
import { INTAKE_FIELDS, validateIntakeValue, type IntakeFieldKey } from "@/lib/intake-fields";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const INTAKE_FIELD_KEYS = new Set<string>(INTAKE_FIELDS.map((field) => field.key));

function isIntakeFieldKey(value: string): value is IntakeFieldKey {
  return INTAKE_FIELD_KEYS.has(value);
}

// GET /api/proposals/[id] — Section 12: fetch a single proposal's full
// content and version history. Owner or admin (RLS-enforced).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user } = await getSession();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: proposal, error: proposalError } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .single();

  if (proposalError || !proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  const { data: versions, error: versionsError } = await supabase
    .from("proposal_versions")
    .select("*")
    .eq("proposal_id", id)
    .order("created_at", { ascending: true });

  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 });
  }

  return NextResponse.json({ proposal, versions });
}

// DELETE /api/proposals/[id] — admin only. Removes the proposal and
// everything scoped to it: version history and any approval decision cascade
// at the DB level (20260914000000_admin_delete_proposal.sql), and the
// exported PDF (if any) is removed from storage on a best-effort basis —
// its absence shouldn't block deleting the proposal row itself.
export async function DELETE(
  _request: Request,
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

  const service = createServiceClient();

  if (proposal.pdf_url) {
    await service.storage.from("proposal-pdfs").remove([`${id}.pdf`]);
  }

  const { error: deleteError } = await service.from("proposals").delete().eq("id", id);

  if (deleteError) {
    const logged = await writeAuditLog({
      actorId: user.id,
      action: "proposal_delete_failed",
      targetId: id,
      metadata: { error: deleteError.message },
    });
    return NextResponse.json(
      {
        error: deleteError.message,
        ...(logged ? {} : { auditLogWarning: "This failure could not be recorded in the audit log. Contact an admin." }),
      },
      { status: 500 }
    );
  }

  const logged = await writeAuditLog({
    actorId: user.id,
    action: "proposal_deleted",
    targetId: id,
    metadata: {
      companyName: proposal.company_name,
      clientName: proposal.client_name,
      statusAtDeletion: proposal.status,
    },
  });

  return NextResponse.json({
    success: true,
    ...(logged ? {} : { auditLogWarning: "The proposal was deleted, but the audit log entry failed to record. Contact an admin." }),
  });
}

// PATCH /api/proposals/[id] — Section 12: salesperson (owner) manually
// edits proposal content. Two distinct shapes:
//  - { section, content }: edits one *generated* section directly. No
//    Claude call. Writes a proposal_versions row (generated_by: 'human')
//    so the edit is preserved in history alongside AI-generated versions.
//  - { intake }: edits the raw intake fields (client_needs_summary,
//    goals_and_objectives, etc.) that generation reads from. These are
//    plain columns, not versioned content (Section 4 only versions section
//    content), so this updates `proposals` directly with no
//    proposal_versions row.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (profile.role !== "salesperson") {
    return NextResponse.json(
      { error: "Only a salesperson can edit proposal content." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);

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

  // Section 11.2 (as extended): editable while draft or pending_approval —
  // editing a pending_approval proposal auto-reverts it to draft below
  // rather than requiring an admin override first. RLS's
  // proposals_update_owner policy allows the same two statuses; anything
  // past that (approved/rejected/sent/failed) stays locked.
  if (proposal.status !== "draft" && proposal.status !== "pending_approval") {
    return NextResponse.json(
      { error: "This proposal is locked and can no longer be edited." },
      { status: 409 }
    );
  }

  const intake = body?.intake;
  if (intake !== undefined) {
    return handleIntakeEdit({ id, userId: user.id, supabase, proposal, intake });
  }

  const sectionKey = body?.section;
  const content = body?.content;

  if (!isSectionKey(sectionKey)) {
    return NextResponse.json({ error: "A valid section is required." }, { status: 400 });
  }

  // Deliverables/Timeline/Pricing are structured content (a list/table),
  // not a paragraph a salesperson can hand-edit in a plain text box — those
  // sections are AI-generated only; Regenerate is the way to change them.
  const section = SECTIONS.find((candidate) => candidate.key === sectionKey);
  if (section?.format !== "prose") {
    return NextResponse.json(
      { error: "This section is AI-generated only — use Regenerate to update it." },
      { status: 400 }
    );
  }

  if (typeof content !== "string") {
    return NextResponse.json({ error: "Content must be a string." }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const { error: versionError } = await service.from("proposal_versions").insert({
      proposal_id: id,
      section_name: sectionKey,
      content,
      generated_by: "human",
    });
    if (versionError) {
      throw new Error(versionError.message);
    }

    // Same atomic DB-side merge generate/regenerate-section uses
    // (merge_proposal_content) — avoids the read-modify-write race where a
    // concurrent generate/regenerate for a different section could clobber
    // this edit (or vice versa), and folds in the same auto-revert-on-edit
    // status transition.
    const { data, error: updateError } = await supabase.rpc("merge_proposal_content", {
      p_proposal_id: id,
      p_section: sectionKey,
      p_content: content,
    });

    if (updateError) {
      throw new Error(updateError.message);
    }

    const updated = data?.[0];
    if (!updated) {
      throw new Error("This proposal can no longer be edited (it may have moved out of draft/pending_approval).");
    }

    const revertedToDraft = proposal.status === "pending_approval" && updated.status === "draft";

    await writeAuditLog({
      actorId: user.id,
      action: "section_edited",
      targetId: id,
      metadata: { section: sectionKey, revertedToDraft },
    });

    return NextResponse.json({ proposal: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edit failed.";

    await writeAuditLog({
      actorId: user.id,
      action: "section_edit_failed",
      targetId: id,
      metadata: { section: sectionKey, error: message },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// { intake } branch of PATCH above: updates raw intake field columns
// directly (owner + draft/pending_approval already checked by the caller).
async function handleIntakeEdit(params: {
  id: string;
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  proposal: { status: string };
  intake: unknown;
}) {
  const { id, userId, supabase, proposal, intake } = params;

  if (typeof intake !== "object" || intake === null || Array.isArray(intake)) {
    return NextResponse.json({ error: "intake must be an object." }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(intake as Record<string, unknown>)) {
    if (!isIntakeFieldKey(key)) {
      return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
    }
    const fieldConfig = INTAKE_FIELDS.find((field) => field.key === key);
    if (fieldConfig?.editable === false) {
      return NextResponse.json(
        { error: `${fieldConfig.label} is set from your account and can't be edited.` },
        { status: 400 }
      );
    }
    if (typeof value !== "string") {
      return NextResponse.json({ error: `${key} must be a string.` }, { status: 400 });
    }
    // Same required + format rules as proposal creation (Section 12's
    // POST /api/proposals) — an edit can't leave a required field blank, or
    // an email field malformed, any more than creation could.
    const validationError = validateIntakeValue(fieldConfig!, value);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    updates[key] = value.trim() ? value : null;
  }

  const editedKeys = Object.keys(updates) as IntakeFieldKey[];
  if (editedKeys.length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  // Auto-revert on edit: matches the section-edit branch above and
  // generate/regenerate-section (generate-section.ts) — editing intake
  // details while pending_approval pulls the proposal back into draft.
  const revertedToDraft = proposal.status === "pending_approval";
  if (revertedToDraft) {
    updates.status = "draft";
  }

  const { data: updated, error: updateError } = await supabase
    .from("proposals")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    const logged = await writeAuditLog({
      actorId: userId,
      action: "proposal_details_edit_failed",
      targetId: id,
      metadata: { fields: editedKeys, error: updateError.message },
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
    actorId: userId,
    action: "proposal_details_edited",
    targetId: id,
    metadata: { fields: editedKeys, revertedToDraft },
  });

  return NextResponse.json({
    proposal: updated,
    ...(logged ? {} : { auditLogWarning: "The edit was saved, but the audit log entry failed to record. Contact an admin." }),
  });
}
