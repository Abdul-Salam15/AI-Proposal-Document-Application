-- Section 7: "regeneration only replaces the targeted section... without
-- risking drift in unrelated sections." The prior generate/regenerate/edit
-- path read `proposals.content` in application code, merged one section's
-- key into it, then wrote the whole object back — a read-modify-write race:
-- two sections written close together could each read the same pre-update
-- snapshot, and whichever write landed second would silently overwrite the
-- section the other had just added. This function makes the merge atomic
-- at the database level (`content || jsonb_build_object(...)`, evaluated
-- against the row's live value under Postgres's own row lock) and folds in
-- the auto-revert-on-edit status transition, so read-current-value +
-- merge + status-transition is one indivisible statement instead of a
-- separate SELECT then UPDATE.
--
-- `language sql` (not `security definer`) so this still runs as the calling
-- role — RLS's proposals_update_owner policy applies exactly as before.
-- Returns zero rows (instead of silently "succeeding") when that policy
-- blocks the write, so callers can detect it instead of assuming success.
create or replace function public.merge_proposal_content(
  p_proposal_id uuid,
  p_section text,
  p_content text
)
returns setof public.proposals
language sql
as $$
  update public.proposals
  set content = content || jsonb_build_object(p_section, p_content),
      status = case when status = 'pending_approval' then 'draft'::public.proposal_status else status end,
      updated_at = now()
  where id = p_proposal_id
  returning *;
$$;
