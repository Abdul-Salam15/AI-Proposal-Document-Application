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

const MODEL = "claude-opus-5";
const MAX_TOKENS = 1024;

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

Write only this section's content, as plain prose suitable for a client-facing proposal document. Do not include a heading or label.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
