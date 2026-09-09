import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { authorizeProposalOwner } from "@/lib/generation/authorize-proposal";
import { generateSection } from "@/lib/generation/generate-section";
import { release, tryAcquire } from "@/lib/generation/in-flight";
import { isSectionKey, SECTIONS, type SectionKey } from "@/lib/generation/sections";

// POST /api/proposals/[id]/generate — Section 12: first-time generation of
// all sections, or a single section via a `section` param. Salesperson
// (owner) only.
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

  const body = await request.json().catch(() => ({}));
  const requestedSection = body?.section;

  if (requestedSection !== undefined && !isSectionKey(requestedSection)) {
    return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  }

  const sectionKeys: SectionKey[] = requestedSection
    ? [requestedSection]
    : SECTIONS.map((section) => section.key);

  const results: Record<string, unknown> = {};

  for (const sectionKey of sectionKeys) {
    if (!tryAcquire(proposal.id, sectionKey)) {
      results[sectionKey] = { outcome: "in_progress" };
      continue;
    }

    try {
      const result = await generateSection(supabase, proposal, sectionKey);
      results[sectionKey] = result;

      await writeAuditLog({
        actorId: userId,
        action: "section_generated",
        targetId: proposal.id,
        metadata: {
          section: sectionKey,
          outcome: result.outcome,
          inputTokens: "inputTokens" in result ? result.inputTokens : 0,
          outputTokens: "outputTokens" in result ? result.outputTokens : 0,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      results[sectionKey] = { outcome: "failed", error: message };

      await writeAuditLog({
        actorId: userId,
        action: "section_generation_failed",
        targetId: proposal.id,
        metadata: { section: sectionKey, error: message },
      });
    } finally {
      release(proposal.id, sectionKey);
    }
  }

  return NextResponse.json({ proposalId: proposal.id, results });
}
