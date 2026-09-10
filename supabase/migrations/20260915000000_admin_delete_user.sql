-- Admin user deletion. No new RLS policy is needed on `users` itself: the
-- initial schema already defined `users.id references auth.users (id) on
-- delete cascade`, so deleting the Supabase Auth account (via the admin API,
-- which the delete route uses) cascades to the matching `public.users` row
-- on its own.
--
-- `proposals.owner_id` and `approvals.approver_id` are deliberately left as
-- plain (restrictive) foreign keys — a user who owns proposals or has
-- recorded approval decisions can't be deleted out from under that data;
-- the delete route checks for and reports this rather than letting it
-- surface as a raw constraint violation.
--
-- `audit_log.actor_id` is different: it's not a business record being
-- protected, just "who did this" attached to a description of what
-- happened, and virtually every real user accumulates audit_log rows just
-- by using the app — leaving it restrictive would make deletion impossible
-- for exactly the users an admin is most likely to want to delete. Old
-- entries keep the action and its metadata; the actor reference goes null,
-- the way many systems "ghost" a deleted account in historical logs.
alter table public.audit_log alter column actor_id drop not null;

alter table public.audit_log
  drop constraint if exists audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey
    foreign key (actor_id) references public.users (id) on delete set null;
