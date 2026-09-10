import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { Proposal, ProposalStatus } from "@/lib/types";
import { callClaudeForSection } from "./claude";
import { mockSectionContent } from "./mock";
import { SECTIONS, type SectionKey } from "./sections";

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

// A [NEEDS INPUT: field] placeholder (written below) is not real generated
// content — it's a note that a required field was blank at generation time.
// It must never be treated as a cache hit: unlike a real AI section, it can
// become wrong the moment the salesperson fills in the field it's pointing
// at, and nothing else re-checks that.
function isNeedsInputPlaceholder(content: string): boolean {
  return content.startsWith("[NEEDS INPUT:");
}

// claude.ts now rejects a degenerate response (e.g. a bare "# Project
// Scope" heading with no prose) before it's ever saved — but a proposal
// generated before that guard existed can already have one sitting in
// proposal_versions as a normal 'ai' row. Recognizing the same pattern here
// means clicking Regenerate on an already-corrupted section heals it (falls
// through to a fresh API call below) instead of re-serving the same
// unusable cached text forever.
function isBareHeading(content: string): boolean {
  return content.split("\n").filter((line) => line.trim()).length <= 1 && /^#{1,6}\s/.test(content);
}

function isUnusableCachedContent(content: string): boolean {
  return isNeedsInputPlaceholder(content) || isBareHeading(content);
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
  | { outcome: "cached"; content: string; status: ProposalStatus }
  | { outcome: "needs_input"; content: string; missingFields: string[]; status: ProposalStatus }
  | { outcome: "generated"; content: string; inputTokens: number; outputTokens: number; status: ProposalStatus }
  | { outcome: "rate_limited"; waitMinutes: number };

/**
 * Generates (or regenerates) a single section for a proposal, applying
 * every Section 11.1 cost control along the way:
 *  - cache: if a version already exists for this section, reuse it rather
 *    than calling the API again — even if an intake field has since
 *    changed. Per product decision, an edited field only flags the
 *    already-generated section as stale in the review UI (a nudge to
 *    regenerate); it never silently invalidates the cache and forces a
 *    fresh API call on the salesperson's behalf.
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

  const { data: existingVersions, error: existingError } = await service
    .from("proposal_versions")
    .select("content, generated_by")
    .eq("proposal_id", proposal.id)
    .eq("section_name", sectionKey)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const latest = existingVersions?.[0];
  const latestContent = latest?.content as string | undefined;

  // Section 8/11.2's missing-field check always takes priority over the
  // cache, even when a real cached version already exists: if a required
  // field has since gone blank or become a junk placeholder (e.g. pricing
  // edited to "TBD" after a real Pricing section was already generated),
  // that must surface as [NEEDS INPUT] rather than silently re-serving the
  // now-unsupported cached text. This costs nothing either way (no Claude
  // call on this path), so it's not in tension with the cache's cost-control
  // purpose — it's purely a correctness check that has to run first.
  const missingFields = section.requiredFields.filter((field) =>
    isMissing(proposal[field] as string | null)
  );

  if (missingFields.length > 0) {
    const content = missingFields.map((field) => `[NEEDS INPUT: ${field}]`).join(" ");
    await writeVersion(service, proposal.id, sectionKey, content);
    const status = await updateProposalContent(supabase, proposal.id, sectionKey, content);
    return { outcome: "needs_input", content, missingFields, status };
  }

  // Section 11.1 cache rule: reuse the latest version instead of calling
  // the API again — but only when it's still the AI's own last word on this
  // section. A manual edit (PATCH, generated_by: 'human') is a real input
  // change — the salesperson deliberately deviated from the AI output — so
  // it must not be masked by the cache; a following regenerate should hit
  // the API fresh. Same for a [NEEDS INPUT] placeholder or a degenerate
  // bare-heading response (isUnusableCachedContent above): neither is real
  // content, so this falls through to a fresh API call below instead of
  // memoizing something unusable.
  //
  // Still write-through to `content` even on a cache hit: this call costs
  // nothing (no Claude API call, just a cheap DB write), and without it a
  // proposal_versions row that exists but was never successfully synced to
  // `content` (e.g. from a since-fixed write bug, or a stale in-progress
  // edit) would return cached text on every future click forever without
  // ever actually persisting it.
  if (latest && latest.generated_by === "ai" && !isUnusableCachedContent(latestContent!)) {
    const status = await updateProposalContent(supabase, proposal.id, sectionKey, latestContent!);
    return { outcome: "cached", content: latestContent!, status };
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
    .not("content", "like", "[NEEDS INPUT:%")
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
  const status = await updateProposalContent(supabase, proposal.id, sectionKey, content);

  return { outcome: "generated", content, inputTokens, outputTokens, status };
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
