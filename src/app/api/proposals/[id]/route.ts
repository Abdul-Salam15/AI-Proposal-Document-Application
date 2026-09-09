import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { isSectionKey } from "@/lib/generation/sections";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/proposals/[id] — Section 12: fetch a single proposal's full
// content and version history. Owner, approver, or admin (RLS-enforced).
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

// PATCH /api/proposals/[id] — Section 12: salesperson (owner) manually
// edits a section's content directly. No Claude call. Writes a
// proposal_versions row (generated_by: 'human') so the edit is preserved
// in history alongside AI-generated versions.
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
  const sectionKey = body?.section;
  const content = body?.content;

  if (!isSectionKey(sectionKey)) {
    return NextResponse.json({ error: "A valid section is required." }, { status: 400 });
  }

  if (typeof content !== "string") {
    return NextResponse.json({ error: "Content must be a string." }, { status: 400 });
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

  // Section 11.2: locked from further edits once submitted. Submission
  // isn't built yet, so every proposal is currently `draft`, but this keeps
  // the check honest for when it is — RLS enforces the same rule at the DB
  // layer regardless.
  if (proposal.status !== "draft") {
    return NextResponse.json(
      { error: "This proposal is locked and can no longer be edited." },
      { status: 409 }
    );
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

    const nextContent = { ...(proposal.content as Record<string, unknown>), [sectionKey]: content };
    const { data: updated, error: updateError } = await supabase
      .from("proposals")
      .update({ content: nextContent, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    await writeAuditLog({
      actorId: user.id,
      action: "section_edited",
      targetId: id,
      metadata: { section: sectionKey },
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
