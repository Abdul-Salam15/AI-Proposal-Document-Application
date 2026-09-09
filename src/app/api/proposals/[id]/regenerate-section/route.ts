import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { authorizeProposalOwner } from "@/lib/generation/authorize-proposal";
import { generateSection } from "@/lib/generation/generate-section";
import { release, tryAcquire } from "@/lib/generation/in-flight";
import { isSectionKey } from "@/lib/generation/sections";

// POST /api/proposals/[id]/regenerate-section — Section 12: regenerate one
// section only; enforces the regeneration cap (Section 11.1) and writes a
// new proposal_versions row. Salesperson (owner) only.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await authorizeProposalOwner(id);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { userId, supabase, proposal } = auth;

  const body = await request.json().catch(() => null);
  const sectionKey = body?.section;

  if (!isSectionKey(sectionKey)) {
    return NextResponse.json({ error: "A valid section is required." }, { status: 400 });
  }

  // Section 11.1: ignore duplicate clicks — a second request for the same
  // section while one is already in flight is rejected outright.
  if (!tryAcquire(proposal.id, sectionKey)) {
    return NextResponse.json(
      { error: "A generation request for this section is already in progress." },
      { status: 409 }
    );
  }

  try {
    const result = await generateSection(supabase, proposal, sectionKey);

    await writeAuditLog({
      actorId: userId,
      action: "section_regenerated",
      targetId: proposal.id,
      metadata: {
        section: sectionKey,
        outcome: result.outcome,
        inputTokens: "inputTokens" in result ? result.inputTokens : 0,
        outputTokens: "outputTokens" in result ? result.outputTokens : 0,
      },
    });

    if (result.outcome === "capped") {
      return NextResponse.json(
        {
          error: "Regeneration limit reached for this section. Edit it manually instead.",
          outcome: "capped",
        },
        { status: 429 }
      );
    }

    return NextResponse.json({ proposalId: proposal.id, section: sectionKey, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regeneration failed.";

    await writeAuditLog({
      actorId: userId,
      action: "section_generation_failed",
      targetId: proposal.id,
      metadata: { section: sectionKey, error: message },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    release(proposal.id, sectionKey);
  }
}
