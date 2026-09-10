-- ProposalReview's "Reviewer feedback" panel joins approvals to
-- approver:users(name, email) so the proposal owner can see who
-- approved/rejected their proposal, not just the decision and comment.
--
-- approvals_select's RLS already lets the owner read the approval row
-- itself. But the nested users row is governed by its own, stricter
-- users_select policy (self, or admin) — so for a non-admin owner, that
-- embed came back null and the UI fell back to "Unknown reviewer" even
-- though the approval (decision/comment/timestamp) displayed correctly.
--
-- This adds a second permissive policy (RLS ORs same-command policies
-- together, so it only ever widens access): a user can also read the
-- users row of anyone who has approved one of their own proposals.
create policy "users_select_via_approval" on public.users
for select
using (
  exists (
    select 1
    from public.approvals a
    join public.proposals p on p.id = a.proposal_id
    where a.approver_id = users.id
      and p.owner_id = auth.uid()
  )
);
