-- The "approver" role is retired — only salesperson and admin remain.
-- Admin now performs the approval step approver used to do (the approve
-- route and every RLS policy below already treat them identically; this
-- just removes approver as a distinct, assignable role).
--
-- Postgres enums can't drop a value in place (there's no ALTER TYPE ...
-- DROP VALUE, only ADD VALUE / RENAME VALUE), and rebuilding the type would
-- mean dropping and recreating current_user_role() and every policy below
-- that depends on it. Not worth the risk for a class project's database:
-- 'approver' stays a possible value on public.user_role at the type level,
-- but nothing in the application (UsersTable.tsx's role dropdown, the
-- invite route, this migration's policies) can ever assign or check for it
-- again, so it's permanently unreachable rather than truly dropped.

-- Any existing approver accounts become admin — the same access they had
-- (approve/reject, view all proposals) plus what admin already had.
update public.users set role = 'admin' where role = 'approver';

-- --- proposals -------------------------------------------------------------

drop policy if exists "proposals_select" on public.proposals;

create policy "proposals_select" on public.proposals
for select
using (
  owner_id = auth.uid()
  or public.current_user_role() = 'admin'
);

-- --- proposal_versions -------------------------------------------------------

drop policy if exists "proposal_versions_select" on public.proposal_versions;

create policy "proposal_versions_select" on public.proposal_versions
for select
using (
  exists (
    select 1 from public.proposals p
    where p.id = proposal_versions.proposal_id
      and p.owner_id = auth.uid()
  )
  or public.current_user_role() = 'admin'
);

-- --- approvals ---------------------------------------------------------------

drop policy if exists "approvals_select" on public.approvals;

create policy "approvals_select" on public.approvals
for select
using (
  exists (
    select 1 from public.proposals p
    where p.id = approvals.proposal_id
      and p.owner_id = auth.uid()
  )
  or public.current_user_role() = 'admin'
);

drop policy if exists "approvals_insert" on public.approvals;

create policy "approvals_insert" on public.approvals
for insert
with check (
  public.current_user_role() = 'admin'
  and approver_id = auth.uid()
);
