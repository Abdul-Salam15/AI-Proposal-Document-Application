import type { Proposal, UserRole } from "@/lib/types";

// Internal (dashboard) notification emails — distinct from
// delivery/email-template.ts's buildClientEmail, which is the external,
// client-facing proposal email. These all link back to the dashboard review
// page, not the public hosted page.
function dashboardLink(origin: string, proposalId: string): string {
  return `${origin}/dashboard/proposals/${proposalId}`;
}

export function buildSubmittedForApprovalEmail(proposal: Proposal, origin: string) {
  return {
    subject: `Proposal awaiting approval: ${proposal.company_name}`,
    body: [
      `${proposal.salesperson_name} submitted a proposal for ${proposal.company_name} and it's waiting for your review.`,
      "",
      dashboardLink(origin, proposal.id),
    ].join("\n"),
  };
}

export function buildDecisionEmail(
  proposal: Proposal,
  decision: "approved" | "rejected",
  comment: string | null,
  origin: string
) {
  const subject =
    decision === "approved"
      ? `Approved: ${proposal.company_name}`
      : `Changes requested: ${proposal.company_name}`;

  const body = [
    decision === "approved"
      ? `Your proposal for ${proposal.company_name} was approved.`
      : `Your proposal for ${proposal.company_name} was rejected and needs another look.`,
    "",
    ...(comment ? [`Reviewer comment: ${comment}`, ""] : []),
    dashboardLink(origin, proposal.id),
  ].join("\n");

  return { subject, body };
}

export function buildSentConfirmationEmail(proposal: Proposal, origin: string) {
  return {
    subject: `Sent to client: ${proposal.company_name}`,
    body: [
      `The proposal for ${proposal.company_name} was emailed to ${proposal.client_email}.`,
      "",
      dashboardLink(origin, proposal.id),
    ].join("\n"),
  };
}

export function buildDeliveryFailedEmail(
  proposal: Proposal,
  step: "export" | "send",
  error: string,
  origin: string
) {
  const action = step === "export" ? "Exporting" : "Sending";
  return {
    subject: `Action needed: ${proposal.company_name}`,
    body: [
      `${action} the proposal for ${proposal.company_name} failed: ${error}`,
      "You can retry from the proposal page.",
      "",
      dashboardLink(origin, proposal.id),
    ].join("\n"),
  };
}

export function buildStatusResetEmail(proposal: Proposal, adminName: string, origin: string) {
  return {
    subject: `Reset to draft: ${proposal.company_name}`,
    body: [
      `${adminName} reset your proposal for ${proposal.company_name} back to draft, so you can edit and resubmit it.`,
      "",
      dashboardLink(origin, proposal.id),
    ].join("\n"),
  };
}

export function buildStatusResetConfirmationEmail(proposal: Proposal, origin: string) {
  return {
    subject: `You reset a proposal to draft: ${proposal.company_name}`,
    body: [
      `You reset the proposal for ${proposal.company_name} (owner: ${proposal.salesperson_name}) back to draft.`,
      "",
      dashboardLink(origin, proposal.id),
    ].join("\n"),
  };
}

export function buildRoleChangedEmail(
  oldRole: UserRole,
  newRole: UserRole,
  adminName: string,
  origin: string
) {
  return {
    subject: `Your role changed to ${newRole}`,
    body: [
      `${adminName} changed your role from ${oldRole} to ${newRole}.`,
      "",
      `${origin}/dashboard`,
    ].join("\n"),
  };
}

export function buildRoleChangeConfirmationEmail(
  targetEmail: string,
  oldRole: UserRole,
  newRole: UserRole,
  origin: string
) {
  return {
    subject: `You changed a user's role`,
    body: [
      `You changed ${targetEmail}'s role from ${oldRole} to ${newRole}.`,
      "",
      `${origin}/dashboard/admin/users`,
    ].join("\n"),
  };
}
