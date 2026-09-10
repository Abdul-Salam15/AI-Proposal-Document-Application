-- Extends Section 11.2's owner-edit lock: the owner may now also edit or
-- regenerate a proposal while it's `pending_approval`, not just `draft`.
-- The API layer (PATCH /api/proposals/[id], and updateProposalContent in
-- generate-section.ts used by generate/regenerate-section) always resets
-- status back to 'draft' as part of that same write, so an approver never
-- ends up reviewing a moving target — editing simply pulls the proposal
-- back out of the approval queue instead of requiring an admin override
-- (reset-status route) first. Only draft/pending_approval are reachable
-- this way; approved/rejected/sent/failed remain gated behind their own
-- server-role-only routes, unchanged.

drop policy if exists "proposals_update_owner" on public.proposals;

create policy "proposals_update_owner" on public.proposals
for update
using (
  owner_id = auth.uid()
  and status in ('draft', 'pending_approval')
)
with check (
  owner_id = auth.uid()
  and status in ('draft', 'pending_approval')
);
