import Anthropic from "@anthropic-ai/sdk";
import type { SectionConfig } from "./sections";

// Real calls only happen when CLAUDE_GENERATION_MODE=live (Section 11.1:
// mock mode is the default; real calls require an explicit opt-in).
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

const MODEL = "claude-haiku-4-5-20251001";
// Output guardrail: proposal sections are meant to be tight paragraphs, not
// essays — this caps runaway generation both at the token level (hard stop)
// and via an explicit length instruction in the prompt below (soft target).
const MAX_TOKENS = 400;

// Section 11.1: "Truncate/summarize long supporting material before
// sending it as context, since larger prompts cost more per call."
const SUPPORTING_MATERIAL_MAX_CHARS = 2000;

export function truncateSupportingMaterial(material: string): string {
  if (material.length <= SUPPORTING_MATERIAL_MAX_CHARS) {
    return material;
  }
  return `${material.slice(0, SUPPORTING_MATERIAL_MAX_CHARS)}\n[truncated]`;
}

export type ClaudeSectionResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export async function callClaudeForSection(params: {
  section: SectionConfig;
  contextText: string;
  supportingMaterial: string | null;
}): Promise<ClaudeSectionResult> {
  // Section 9: supporting material, when present, is passed in as
  // additional context so Claude can incorporate it into the section.
  const supportingBlock = params.supportingMaterial
    ? `\n\nSupporting material provided by the salesperson (context only):\n${truncateSupportingMaterial(params.supportingMaterial)}`
    : "";

  const prompt = `${params.section.instructions}

Proposal context:
${params.contextText}${supportingBlock}

Write only this section's content, as plain prose suitable for a client-facing proposal document: full sentences, no Markdown formatting (no #, *, -, or other markup), no heading or label of any kind. Never respond with just a title — write the complete paragraph. Keep it tight: 3-5 sentences, no more than about 120 words — synthesize, don't restate the full context.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  // Guards against a degenerate response (e.g. a bare "# Project Scope"
  // heading with no actual prose) making it into proposal content as if it
  // were a normal, usable section — a model ignoring the "no heading, full
  // paragraph" instruction above is a generation failure, not valid output,
  // and should surface as one (section_generation_failed) rather than get
  // silently saved and, worse, cached indefinitely.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const isBareHeading = text.split("\n").filter((line) => line.trim()).length <= 1 && /^#{1,6}\s/.test(text);
  if (!text || wordCount < 8 || isBareHeading) {
    throw new Error(
      `Claude returned an unusable response for the ${params.section.title} section (too short or just a heading) — try regenerating.`
    );
  }

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
