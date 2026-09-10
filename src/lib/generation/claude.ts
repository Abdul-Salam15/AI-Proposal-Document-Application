import Anthropic from "@anthropic-ai/sdk";
import type {
  DeliverablesContent,
  PricingContent,
  PricingMilestone,
  SectionConfig,
  SectionContent,
  SectionFormat,
  TimelineContent,
  TimelinePhase,
} from "./sections";

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
  content: SectionContent;
  inputTokens: number;
  outputTokens: number;
};

// One tool per structured format, forced via tool_choice so Claude can't
// fall back to prose for these three sections. `strict: true` enforces
// `required`/`additionalProperties` server-side.
const STRUCTURED_TOOLS: Record<Exclude<SectionFormat, "prose">, Anthropic.Tool> = {
  list: {
    name: "submit_deliverables",
    description: "Submit the deliverables section as a bulleted list of short items.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  timeline_table: {
    name: "submit_timeline",
    description: "Submit the timeline section as a short intro sentence plus phase rows for a table.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        intro: { type: "string", minLength: 1 },
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phase: { type: "string", minLength: 1 },
              focus: { type: "string", minLength: 1 },
              details: { type: "string", minLength: 1 },
            },
            required: ["phase", "focus", "details"],
            additionalProperties: false,
          },
          minItems: 1,
        },
      },
      required: ["intro", "phases"],
      additionalProperties: false,
    },
  },
  pricing_table: {
    name: "submit_pricing",
    description: "Submit the pricing section as a summary, a total investment label, and payment milestone rows.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", minLength: 1 },
        totalInvestmentLabel: {
          type: "string",
          minLength: 1,
          description:
            "Just the amount, e.g. '$24,500' — the document already prints the words 'Total Investment' next to this, so don't repeat them here.",
        },
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", minLength: 1 },
              percent: { type: "number" },
            },
            required: ["label", "percent"],
            additionalProperties: false,
          },
          minItems: 1,
        },
      },
      required: ["summary", "totalInvestmentLabel", "milestones"],
      additionalProperties: false,
    },
  },
};

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

// Mirrors isBareHeading below: a schema-valid tool call can still be
// degenerate (blank/placeholder strings) — this is the structured-format
// equivalent of "reject an unusable response instead of saving it."
function validateStructuredContent(
  format: Exclude<SectionFormat, "prose">,
  input: unknown,
  sectionTitle: string
): StructuredResultContent {
  const fail = (): never => {
    throw new Error(
      `Claude returned an unusable response for the ${sectionTitle} section (empty or malformed) — try regenerating.`
    );
  };

  if (format === "list") {
    const items = (input as { items?: unknown })?.items;
    if (!Array.isArray(items)) fail();
    const cleaned = (items as unknown[]).filter((item): item is string => !isBlank(item));
    if (cleaned.length === 0) fail();
    return cleaned as DeliverablesContent;
  }

  if (format === "timeline_table") {
    const { intro, phases } = (input as Partial<TimelineContent>) ?? {};
    if (isBlank(intro) || !Array.isArray(phases)) fail();
    const cleaned = (phases as unknown[]).filter(
      (row): row is TimelinePhase =>
        !!row &&
        typeof row === "object" &&
        !isBlank((row as TimelinePhase).phase) &&
        !isBlank((row as TimelinePhase).focus) &&
        !isBlank((row as TimelinePhase).details)
    );
    if (cleaned.length === 0) fail();
    return { intro: intro as string, phases: cleaned };
  }

  const { summary, totalInvestmentLabel, milestones } = (input as Partial<PricingContent>) ?? {};
  if (isBlank(summary) || isBlank(totalInvestmentLabel) || !Array.isArray(milestones)) fail();
  const cleaned = (milestones as unknown[]).filter(
    (row): row is PricingMilestone =>
      !!row &&
      typeof row === "object" &&
      !isBlank((row as PricingMilestone).label) &&
      typeof (row as PricingMilestone).percent === "number" &&
      Number.isFinite((row as PricingMilestone).percent)
  );
  if (cleaned.length === 0) fail();
  return { summary: summary as string, totalInvestmentLabel: totalInvestmentLabel as string, milestones: cleaned };
}

type StructuredResultContent = DeliverablesContent | TimelineContent | PricingContent;

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

  if (params.section.format === "prose") {
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
    // heading with no actual prose) making it into proposal content as if
    // it were a normal, usable section — a model ignoring the "no heading,
    // full paragraph" instruction above is a generation failure, not valid
    // output, and should surface as one (section_generation_failed) rather
    // than get silently saved and, worse, cached indefinitely.
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const isBareHeading = text.split("\n").filter((line) => line.trim()).length <= 1 && /^#{1,6}\s/.test(text);
    if (!text || wordCount < 8 || isBareHeading) {
      throw new Error(
        `Claude returned an unusable response for the ${params.section.title} section (too short or just a heading) — try regenerating.`
      );
    }

    return {
      content: text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  const tool = STRUCTURED_TOOLS[params.section.format];
  const prompt = `${params.section.instructions}

Proposal context:
${params.contextText}${supportingBlock}

Call the ${tool.name} tool exactly once with this section's content. Base every field strictly on the context above — do not invent facts, names, or numbers not present or directly implied there. Keep prose fields (not the whole tool call) client-facing and concise.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) {
    throw new Error(
      `Claude did not return structured content for the ${params.section.title} section — try regenerating.`
    );
  }

  const content = validateStructuredContent(params.section.format, toolUse.input, params.section.title);

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
