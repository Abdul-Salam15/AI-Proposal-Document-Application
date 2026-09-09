-- Fixes a bug in `proposals_update_owner` (20260908000000_initial_schema.sql):
-- its WITH CHECK required the row to *still* be 'draft' after the update,
-- which made it impossible for an owner to ever submit their own proposal
-- (draft -> pending_approval) through their own session — RLS would reject
-- the write before the API route's business logic even mattered.
--
-- Section 13 only specifies the *read* condition ("Allowed if owner_id =
-- auth.uid() AND status IN ('draft')") — i.e. what row you're allowed to
-- touch — not that the row must remain draft afterward. The fix keeps that
-- read condition on USING (so a locked, non-draft proposal still can't be
-- touched by its owner at all) and narrows WITH CHECK to the one
-- transition Section 6/12 actually grants the owner: staying in draft
-- (ordinary edits) or moving to pending_approval (submit). Owner still has
-- no path to set approved/rejected/sent/failed directly — those remain
-- gated behind the approve route's service-role write, matching how
-- proposal_versions/audit_log writes already work.

drop policy if exists "proposals_update_owner" on public.proposals;

create policy "proposals_update_owner" on public.proposals
for update
using (
  owner_id = auth.uid()
  and status = 'draft'
)
with check (
  owner_id = auth.uid()
  and status in ('draft', 'pending_approval')
);
