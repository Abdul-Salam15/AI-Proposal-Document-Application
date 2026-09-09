import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { Proposal } from "@/lib/types";
import { callClaudeForSection } from "./claude";
import { mockSectionContent } from "./mock";
import { SECTIONS, type SectionKey } from "./sections";

// Section 11.1: "After a small fixed limit (e.g. 3 per section), require
// the salesperson to edit manually instead of calling the API again."
const REGENERATION_CAP = 3;

function isMissing(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

function buildContextText(proposal: Proposal): string {
  return [
    `Client: ${proposal.client_name}`,
    `Company: ${proposal.company_name}`,
    `Salesperson: ${proposal.salesperson_name}`,
    `Date of call: ${proposal.date_of_call}`,
    `Client needs summary: ${proposal.client_needs_summary ?? ""}`,
    `Goals and objectives: ${proposal.goals_and_objectives ?? ""}`,
    `Project scope: ${proposal.project_scope ?? ""}`,
    `Recommended services: ${proposal.recommended_services ?? ""}`,
    `Proposed timeline: ${proposal.proposed_timeline ?? ""}`,
    `Estimated pricing: ${proposal.estimated_pricing ?? ""}`,
  ].join("\n");
}

export type GenerateOutcome =
  | { outcome: "cached"; content: string }
  | { outcome: "needs_input"; content: string; missingFields: string[] }
  | { outcome: "generated"; content: string; inputTokens: number; outputTokens: number }
  | { outcome: "capped" };

/**
 * Generates (or regenerates) a single section for a proposal, applying
 * every Section 11.1 cost control along the way:
 *  - cache: if a version already exists for this section, reuse it rather
 *    than calling the API again (the proposal's own fields — the only
 *    "inputs" to a section — have no edit route yet in this build, so they
 *    can't have changed since that version was written).
 *  - missing-input short-circuit: if a required field is blank, skip the
 *    API call entirely and write the [NEEDS INPUT] marker directly —
 *    functionally equivalent to Section 8's behavior, at zero cost.
 *  - regeneration cap: once REGENERATION_CAP real (mock or live) calls
 *    have been made for this section, further calls are rejected.
 * Callers (the generate/regenerate-section routes) are responsible for the
 * in-flight/duplicate-click guard and audit logging.
 */
export async function generateSection(
  supabase: SupabaseClient,
  proposal: Proposal,
  sectionKey: SectionKey
): Promise<GenerateOutcome> {
  const section = SECTIONS.find((candidate) => candidate.key === sectionKey);
  if (!section) {
    throw new Error(`Unknown section: ${sectionKey}`);
  }

  const service = createServiceClient();

  const { data: existingVersions, error: existingError } = await service
    .from("proposal_versions")
    .select("content")
    .eq("proposal_id", proposal.id)
    .eq("section_name", sectionKey)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingVersions && existingVersions.length > 0) {
    return { outcome: "cached", content: existingVersions[0].content as string };
  }

  const missingFields = section.requiredFields.filter((field) =>
    isMissing(proposal[field] as string | null)
  );

  if (missingFields.length > 0) {
    const content = missingFields.map((field) => `[NEEDS INPUT: ${field}]`).join(" ");
    await writeVersion(service, proposal.id, sectionKey, content);
    await updateProposalContent(supabase, proposal.id, sectionKey, content);
    return { outcome: "needs_input", content, missingFields };
  }

  const { count, error: countError } = await service
    .from("proposal_versions")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", proposal.id)
    .eq("section_name", sectionKey)
    .eq("generated_by", "ai");

  if (countError) {
    throw new Error(countError.message);
  }

  if ((count ?? 0) >= REGENERATION_CAP) {
    return { outcome: "capped" };
  }

  const mode = process.env.CLAUDE_GENERATION_MODE === "live" ? "live" : "mock";

  let content: string;
  let inputTokens = 0;
  let outputTokens = 0;

  if (mode === "mock") {
    content = mockSectionContent(sectionKey);
  } else {
    const result = await callClaudeForSection({
      section,
      contextText: buildContextText(proposal),
      supportingMaterial: proposal.supporting_material,
    });
    content = result.text;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  }

  await writeVersion(service, proposal.id, sectionKey, content);
  await updateProposalContent(supabase, proposal.id, sectionKey, content);

  return { outcome: "generated", content, inputTokens, outputTokens };
}

async function writeVersion(
  service: SupabaseClient,
  proposalId: string,
  sectionKey: SectionKey,
  content: string
) {
  const { error } = await service.from("proposal_versions").insert({
    proposal_id: proposalId,
    section_name: sectionKey,
    content,
    generated_by: "ai",
  });
  if (error) {
    throw new Error(error.message);
  }
}

async function updateProposalContent(
  supabase: SupabaseClient,
  proposalId: string,
  sectionKey: SectionKey,
  content: string
) {
  const { data: current, error: fetchError } = await supabase
    .from("proposals")
    .select("content")
    .eq("id", proposalId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const nextContent = { ...(current?.content as Record<string, unknown>), [sectionKey]: content };

  const { error: updateError } = await supabase
    .from("proposals")
    .update({ content: nextContent, updated_at: new Date().toISOString() })
    .eq("id", proposalId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}
