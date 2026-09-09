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
  },
  {
    key: "project_scope",
    title: "Project Scope",
    requiredFields: ["project_scope"],
    instructions:
      "Write the project scope section as proposal prose, based directly on the scope described from the intake call.",
  },
  {
    key: "recommended_approach",
    title: "Recommended Approach",
    requiredFields: ["recommended_services"],
    instructions:
      "Synthesize a recommended-approach paragraph explaining how the recommended services address the client's needs and project scope. This section is AI-inferred, not a direct intake field — ground it strictly in the provided context and do not invent services beyond what's given.",
  },
  {
    key: "deliverables",
    title: "Deliverables",
    requiredFields: ["recommended_services"],
    instructions:
      "List the concrete deliverables implied by the recommended services and project scope. This section is AI-inferred — do not invent deliverables unrelated to the given context.",
  },
  {
    key: "timeline",
    title: "Timeline",
    requiredFields: ["proposed_timeline"],
    instructions:
      "Write the proposed timeline section as proposal prose, based directly on the intake's proposed timeline.",
  },
  {
    key: "pricing",
    title: "Pricing",
    requiredFields: ["estimated_pricing"],
    instructions:
      "Write the pricing section as proposal prose, based directly on the intake's estimated pricing.",
  },
  {
    key: "next_steps",
    title: "Next Steps",
    requiredFields: [],
    instructions:
      "Write a brief closing next-steps paragraph inviting the client to confirm and move forward, referencing the salesperson as the point of contact.",
  },
];

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && SECTIONS.some((section) => section.key === value);
}
