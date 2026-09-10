import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { Proposal, ProposalStatus } from "@/lib/types";
import { callClaudeForSection } from "./claude";
import { mockSectionContent } from "./mock";
import { SECTIONS, type SectionContent, type SectionKey } from "./sections";

// Section 11.1's cap ("after a small fixed limit... require the salesperson
// to edit manually instead of calling the API again") is a permanent,
// per-section lock with no way back. Per product decision, this replaces
// that with a rolling window instead: at most REGENERATION_LIMIT real API
// calls per section in any REGENERATION_WINDOW_MS-long window, after which
// regenerating is blocked with a "try again in N minutes" message rather
// than requiring a manual edit forever.
const REGENERATION_LIMIT = 3;
const REGENERATION_WINDOW_MS = 10 * 60 * 1000;

// Section 11.2: "Placeholder/junk intake values (e.g. 'TBD', 'n/a', '-')
// should be treated as missing information ... not passed to Claude as if
// they were real content."
const JUNK_VALUES = new Set(["tbd", "n/a", "na", "-", "--", "none"]);

function isMissing(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || JUNK_VALUES.has(normalized);
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

// Recorded on every AI-generated version as provenance (which intake
// context produced it) — not used to skip a Claude call. Per product
// decision, Regenerate always calls Claude again (bounded by the rate
// limit below); it no longer silently reuses a prior version even when
// nothing changed, since a "regenerate" click was landing as a no-op with
// no visible feedback.
function computeContextHash(proposal: Proposal): string {
  const raw = `${buildContextText(proposal)}\n---\n${proposal.supporting_material ?? ""}`;
  return createHash("sha256").update(raw).digest("hex");
}

export type GenerateOutcome =
  | { outcome: "needs_input"; content: string; missingFields: string[]; status: ProposalStatus }
  | { outcome: "generated"; content: SectionContent; inputTokens: number; outputTokens: number; status: ProposalStatus }
  | { outcome: "rate_limited"; waitMinutes: number };

/**
 * Generates (or regenerates) a single section for a proposal, applying
 * the remaining Section 11.1 cost controls:
 *  - missing-input short-circuit: if a required field is blank, skip the
 *    API call entirely and write the [NEEDS INPUT] marker directly —
 *    functionally equivalent to Section 8's behavior, at zero cost.
 *  - regeneration rate limit: at most REGENERATION_LIMIT real (mock or
 *    live) calls per section within any REGENERATION_WINDOW_MS window;
 *    further calls are rejected with how long until the next one is free.
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
  const contextHash = computeContextHash(proposal);

  const missingFields = section.requiredFields.filter((field) =>
    isMissing(proposal[field] as string | null)
  );

  if (missingFields.length > 0) {
    const content = missingFields.map((field) => `[NEEDS INPUT: ${field}]`).join(" ");
    await writeVersion(service, proposal.id, sectionKey, content, contextHash);
    const status = await updateProposalContent(supabase, proposal.id, sectionKey, content);
    return { outcome: "needs_input", content, missingFields, status };
  }

  // Rolling window: only real API calls in the last REGENERATION_WINDOW_MS
  // count (excludes [NEEDS INPUT] placeholder rows, which never called the
  // API). Ordered oldest-first so, once the limit is hit, the oldest of
  // these is exactly the one that determines when a slot next frees up.
  const windowStart = new Date(Date.now() - REGENERATION_WINDOW_MS).toISOString();
  const { data: recentCalls, error: countError } = await service
    .from("proposal_versions")
    .select("created_at")
    .eq("proposal_id", proposal.id)
    .eq("section_name", sectionKey)
    .eq("generated_by", "ai")
    // proposal_versions.content is jsonb; a [NEEDS INPUT: ...] sentinel is
    // stored as a jsonb string scalar, whose ::text cast is its quoted JSON
    // representation (e.g. '"[NEEDS INPUT: foo]"') — hence the leading %.
    .not("content::text", "like", '%"[NEEDS INPUT:%')
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true });

  if (countError) {
    throw new Error(countError.message);
  }

  if ((recentCalls?.length ?? 0) >= REGENERATION_LIMIT) {
    const oldest = recentCalls![0];
    const availableAt = new Date(oldest.created_at).getTime() + REGENERATION_WINDOW_MS;
    const waitMinutes = Math.max(1, Math.ceil((availableAt - Date.now()) / 60000));
    return { outcome: "rate_limited", waitMinutes };
  }

  const mode = process.env.CLAUDE_GENERATION_MODE === "live" ? "live" : "mock";

  let content: SectionContent;
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
    content = result.content;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  }

  await writeVersion(service, proposal.id, sectionKey, content, contextHash);
  const status = await updateProposalContent(supabase, proposal.id, sectionKey, content);

  return { outcome: "generated", content, inputTokens, outputTokens, status };
}

async function writeVersion(
  service: SupabaseClient,
  proposalId: string,
  sectionKey: SectionKey,
  content: SectionContent,
  contextHash: string
) {
  const { error } = await service.from("proposal_versions").insert({
    proposal_id: proposalId,
    section_name: sectionKey,
    content,
    generated_by: "ai",
    context_hash: contextHash,
  });
  if (error) {
    throw new Error(error.message);
  }
}

async function updateProposalContent(
  supabase: SupabaseClient,
  proposalId: string,
  sectionKey: SectionKey,
  content: SectionContent
): Promise<ProposalStatus> {
  // Atomic DB-side merge (merge_proposal_content, see its migration):
  // avoids the read-modify-write race where two sections generated or
  // regenerated close together could clobber each other's content, and
  // surfaces an RLS-blocked write (e.g. the proposal moved out of
  // draft/pending_approval mid-request) as an explicit empty result rather
  // than a silent no-op.
  const { data, error } = await supabase.rpc("merge_proposal_content", {
    p_proposal_id: proposalId,
    p_section: sectionKey,
    p_content: content,
  });

  if (error) {
    throw new Error(error.message);
  }

  const updated = data?.[0];
  if (!updated) {
    throw new Error("This proposal can no longer be edited (it may have moved out of draft/pending_approval).");
  }

  return updated.status as ProposalStatus;
}
