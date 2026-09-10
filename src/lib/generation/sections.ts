import type { IntakeFieldKey } from "@/lib/intake-fields";

// Section 7: the seven independently-generated section keys, matching the
// `content` JSON structure.
export type SectionKey =
  | "introduction"
  | "project_scope"
  | "recommended_approach"
  | "deliverables"
  | "timeline"
  | "pricing"
  | "next_steps";

// Most sections are a single flowing paragraph ("prose"). Deliverables,
// Timeline, and Pricing instead render as a bulleted list / a phase table /
// a milestone table in the client-facing document, so Claude (and the mock
// fallback) produce structured data for those three instead of a paragraph.
export type SectionFormat = "prose" | "list" | "timeline_table" | "pricing_table";

export type DeliverablesContent = string[];

export type TimelinePhase = { phase: string; focus: string; details: string };
export type TimelineContent = { intro: string; phases: TimelinePhase[] };

export type PricingMilestone = { label: string; percent: number };
export type PricingContent = {
  summary: string;
  totalInvestmentLabel: string;
  milestones: PricingMilestone[];
};

export type StructuredSectionContent = DeliverablesContent | TimelineContent | PricingContent;

// What ends up stored per section key. The [NEEDS INPUT: field] sentinel
// (missing required intake data) is always a plain string, even for the
// three structured sections — renderers fall back to plain-paragraph
// display whenever a section's stored value isn't (yet) its structured
// shape, which also covers proposals generated before this format existed.
export type SectionContent = string | StructuredSectionContent;

export type SectionConfig = {
  key: SectionKey;
  title: string;
  // Intake fields this section can't be generated confidently without
  // (Section 8). A blank value here means [NEEDS INPUT: field] instead of
  // an invented one.
  requiredFields: IntakeFieldKey[];
  // What Claude should do with the proposal context to produce this
  // section's content.
  instructions: string;
  // Shape of this section's generated content — see SectionFormat above.
  format: SectionFormat;
};

// Single config list (Section 11.4 reuse principle) so adding, removing, or
// reordering a section is a one-line change, and both the generation route
// and the missing-field check read from the same source.
export const SECTIONS: SectionConfig[] = [
  {
    key: "introduction",
    title: "Introduction",
    requiredFields: ["client_needs_summary"],
    instructions:
      "Write a short introductory paragraph opening the proposal, addressed to the client, referencing the discovery call and summarizing their needs in the salesperson's voice.",
    format: "prose",
  },
  {
    key: "project_scope",
    title: "Project Scope",
    requiredFields: ["project_scope"],
    instructions:
      "Write the project scope section as proposal prose, based directly on the scope described from the intake call.",
    format: "prose",
  },
  {
    key: "recommended_approach",
    title: "Recommended Approach",
    requiredFields: ["recommended_services"],
    instructions:
      "Synthesize a recommended-approach paragraph explaining how the recommended services address the client's needs and project scope. This section is AI-inferred, not a direct intake field — ground it strictly in the provided context and do not invent services beyond what's given.",
    format: "prose",
  },
  {
    key: "deliverables",
    title: "Deliverables",
    requiredFields: ["recommended_services"],
    instructions:
      "List the concrete deliverables implied by the recommended services and project scope. This section is AI-inferred — do not invent deliverables unrelated to the given context.",
    format: "list",
  },
  {
    key: "timeline",
    title: "Timeline",
    requiredFields: ["proposed_timeline"],
    instructions:
      "Describe the proposed timeline based directly on the intake's proposed timeline, broken into phases suitable for a table (phase label, focus, and what happens during it).",
    format: "timeline_table",
  },
  {
    key: "pricing",
    title: "Pricing",
    requiredFields: ["estimated_pricing"],
    instructions:
      "Describe the pricing based directly on the intake's estimated pricing: a short summary of what's included, the total investment, and the payment milestones.",
    format: "pricing_table",
  },
  {
    key: "next_steps",
    title: "Next Steps",
    requiredFields: [],
    instructions:
      "Write a brief closing next-steps paragraph inviting the client to confirm and move forward, referencing the salesperson as the point of contact.",
    format: "prose",
  },
];

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && SECTIONS.some((section) => section.key === value);
}
