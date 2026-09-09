export type UserRole = "salesperson" | "approver" | "admin";

export type ProposalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "sent"
  | "failed";

// Mirrors the `proposals` table (implementation.md Section 4).
export type Proposal = {
  id: string;
  owner_id: string;
  client_name: string;
  client_email: string;
  company_name: string;
  date_of_call: string;
  salesperson_name: string;
  client_needs_summary: string | null;
  project_scope: string | null;
  goals_and_objectives: string | null;
  recommended_services: string | null;
  proposed_timeline: string | null;
  estimated_pricing: string | null;
  supporting_material: string | null;
  status: ProposalStatus;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
