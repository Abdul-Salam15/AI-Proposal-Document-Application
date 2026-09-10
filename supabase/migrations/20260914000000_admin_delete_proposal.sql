-- Admin proposal deletion. The initial schema deliberately shipped `proposals`
-- with no DELETE policy at all ("not permitted for any role"), matching the
-- original spec. This migration adds the one case now wanted: admin only,
-- mirroring the shape of the existing proposals_update_admin policy.
drop policy if exists "proposals_delete_admin" on public.proposals;

create policy "proposals_delete_admin" on public.proposals
for delete
using (
  public.current_user_role() = 'admin'
);

-- A plain foreign key (no ON DELETE behavior) blocks deleting a proposal the
-- moment it has any version history or an approval decision recorded against
-- it — i.e. almost always. Deleting a proposal is meant to remove it and
-- everything scoped to it, so both child tables cascade. Postgres has no
-- ALTER ... ON DELETE, so each constraint is dropped and recreated; names are
-- Postgres's default for a single-column inline `references` (unchanged
-- since the initial schema, which named neither explicitly).
alter table public.proposal_versions
  drop constraint if exists proposal_versions_proposal_id_fkey,
  add constraint proposal_versions_proposal_id_fkey
    foreign key (proposal_id) references public.proposals (id) on delete cascade;

alter table public.approvals
  drop constraint if exists approvals_proposal_id_fkey,
  add constraint approvals_proposal_id_fkey
    foreign key (proposal_id) references public.proposals (id) on delete cascade;
