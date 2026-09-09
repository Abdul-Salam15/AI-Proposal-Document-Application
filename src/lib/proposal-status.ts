import type { ProposalStatus } from "./types";

// Colors from implementation.md Section 14's "Ledger" palette: Slate for
// pending/in review, Brass for approved, Oxblood for rejected/failed, the
// separate muted grey-brown token for draft. `sent` isn't named in Section
// 14 explicitly; it's treated as a successful terminal state like `approved`.
export const PROPOSAL_STATUS_META: Record<
  ProposalStatus,
  { label: string; dotClassName: string }
> = {
  draft: { label: "Draft", dotClassName: "bg-draft" },
  pending_approval: { label: "Pending approval", dotClassName: "bg-slate" },
  approved: { label: "Approved", dotClassName: "bg-brass" },
  rejected: { label: "Rejected", dotClassName: "bg-oxblood" },
  sent: { label: "Sent", dotClassName: "bg-brass" },
  failed: { label: "Failed", dotClassName: "bg-oxblood" },
};
