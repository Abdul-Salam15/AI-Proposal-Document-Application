import type { Proposal } from "@/lib/types";

// Section 5's Client Email Placeholder table: {{company_name}}, {{client_name}},
// {{proposal_link}}, {{salesperson_name}} — all sourced directly from the
// proposal row (proposal_link is set by the export step). No implementation.md
// copy for the surrounding body was included in this repo, so the connective
// text here is minimal, generic prose around exactly those four placeholders.
export function buildClientEmail(proposal: Proposal): { subject: string; body: string } {
  if (!proposal.proposal_link) {
    throw new Error("Cannot build the client email before export has produced a proposal link.");
  }

  const subject = `Proposal for ${proposal.company_name}`;

  const body = [
    `Hi ${proposal.client_name},`,
    "",
    `Thank you again for the time on our call. Your proposal for ${proposal.company_name} is ready:`,
    "",
    proposal.proposal_link,
    "",
    "Let us know if you have any questions.",
    "",
    "Best,",
    proposal.salesperson_name,
  ].join("\n");

  return { subject, body };
}
