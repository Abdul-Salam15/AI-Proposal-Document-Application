// Single source of truth for the intake form's fields (Section 11.4 reuse
// principle), shared by the form component (rendering) and the
// POST /api/proposals route (validation), so the two can't drift apart.

export type IntakeFieldKey =
  | "client_name"
  | "client_email"
  | "company_name"
  | "date_of_call"
  | "salesperson_name"
  | "client_needs_summary"
  | "project_scope"
  | "goals_and_objectives"
  | "recommended_services"
  | "proposed_timeline"
  | "estimated_pricing"
  | "supporting_material";

export type IntakeFieldConfig = {
  key: IntakeFieldKey;
  label: string;
  type: "text" | "email" | "date" | "textarea";
  required: boolean;
  helpText?: string;
  // false means this field is derived server-side (e.g. from the logged-in
  // account) rather than typed by the user — omitted (undefined) means true.
  editable?: boolean;
};

// The 11 "Intake" sources from Section 5's field mapping, plus
// `supporting_material` from Section 4 (purpose described in Section 9 —
// passed to Claude as additional context during live generation).
export const INTAKE_FIELDS: IntakeFieldConfig[] = [
  { key: "client_name", label: "Client name", type: "text", required: true },
  { key: "client_email", label: "Client email", type: "email", required: true },
  { key: "company_name", label: "Company name", type: "text", required: true },
  { key: "date_of_call", label: "Date of call", type: "date", required: true },
  {
    key: "salesperson_name",
    label: "Salesperson name",
    type: "text",
    required: true,
    editable: false,
    helpText: "Set automatically from your account — this is who the client will hear from.",
  },
  {
    key: "client_needs_summary",
    label: "Client needs summary",
    type: "textarea",
    required: true,
  },
  { key: "project_scope", label: "Project scope", type: "textarea", required: true },
  {
    key: "goals_and_objectives",
    label: "Goals and objectives",
    type: "textarea",
    required: true,
  },
  {
    key: "recommended_services",
    label: "Recommended services",
    type: "textarea",
    required: true,
  },
  { key: "proposed_timeline", label: "Proposed timeline", type: "text", required: true },
  { key: "estimated_pricing", label: "Estimated pricing", type: "text", required: true },
  {
    key: "supporting_material",
    label: "Supporting material",
    type: "textarea",
    required: false,
    helpText:
      "Notes, prior proposals, or reference material. Used as context during generation.",
  },
];
