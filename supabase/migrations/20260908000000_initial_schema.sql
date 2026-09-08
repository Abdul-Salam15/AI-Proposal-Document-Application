-- Implementation Plan Section 4 (Data Model): tables, exactly as specified.
-- Implementation Plan Section 13 (RLS Policies): row level security, exactly as specified.

-- ---------------------------------------------------------------------------
-- Enum types backing the fixed value sets named in Section 4
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('salesperson', 'approver', 'admin');

create type public.proposal_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'sent',
  'failed'
);

create type public.version_generated_by as enum ('ai', 'human');

create type public.approval_decision as enum ('approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Tables (Section 4)
-- ---------------------------------------------------------------------------

-- `users`: id, email, password_hash, name, role, created_at
-- id mirrors the Supabase Auth user id, since Section 2 states auth is handled
-- by Supabase's built-in email/password auth and Section 13 policies key off
-- auth.uid() against this table.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  password_hash text,
  name text,
  role public.user_role not null,
  created_at timestamptz not null default now()
);

-- `proposals`: fields map directly to the intake form fields (Section 4)
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id),
  client_name text not null,
  client_email text not null,
  company_name text not null,
  date_of_call date not null,
  salesperson_name text not null,
  client_needs_summary text,
  project_scope text,
  goals_and_objectives text,
  recommended_services text,
  proposed_timeline text,
  estimated_pricing text,
  supporting_material text,
  status public.proposal_status not null default 'draft',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- `proposal_versions`: preserves per-section history (Section 4 / Testing Scenario 4)
create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id),
  section_name text not null,
  content text not null,
  generated_by public.version_generated_by not null,
  created_at timestamptz not null default now()
);

-- `approvals`
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id),
  approver_id uuid not null references public.users (id),
  decision public.approval_decision not null,
  comment text,
  created_at timestamptz not null default now()
);

-- `audit_log`: central record of every meaningful action (Section 4 / Section 10)
-- `action` is intentionally free-form text, not an enum: Section 4 lists its
-- values as examples ("e.g. proposal_created, ..."), not an exhaustive set.
-- `target_id` has no foreign key: the entity an action targets varies by
-- action (a proposal, a user, ...), so it can't reference a single table.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.users (id),
  action text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security (Section 13)
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_log enable row level security;

-- Helper function named in Section 13, used by policies below.
-- security definer so that policies on `users` can call it without the
-- resulting query against `users` recursing back into these same policies.
create function public.current_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

-- --- users ---------------------------------------------------------------

-- SELECT: a user can read their own row; admin can read all rows.
create policy "users_select" on public.users
for select
using (
  id = auth.uid()
  or public.current_user_role() = 'admin'
);

-- UPDATE: a user can update their own row but not the role column;
-- admin can update any row, including role, with no such restriction.
create policy "users_update_self" on public.users
for update
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
  and role = (select u.role from public.users u where u.id = auth.uid())
);

create policy "users_update_admin" on public.users
for update
using (
  public.current_user_role() = 'admin'
)
with check (
  public.current_user_role() = 'admin'
);

-- INSERT / DELETE: handled by the Supabase Auth signup flow / admin user
-- management, not exposed as a general policy — intentionally no policy.

-- --- proposals -------------------------------------------------------------

-- SELECT: owner, or approver/admin (API layer filters an approver's list
-- view to pending_approval; RLS just permits the read).
create policy "proposals_select" on public.proposals
for select
using (
  owner_id = auth.uid()
  or public.current_user_role() in ('approver', 'admin')
);

-- INSERT: salesperson creating their own proposal.
create policy "proposals_insert" on public.proposals
for insert
with check (
  public.current_user_role() = 'salesperson'
  and owner_id = auth.uid()
);

-- UPDATE: owner may update while still draft (locked once submitted).
create policy "proposals_update_owner" on public.proposals
for update
using (
  owner_id = auth.uid()
  and status = 'draft'
)
with check (
  owner_id = auth.uid()
  and status = 'draft'
);

-- UPDATE: admin may update regardless of status (override a stuck status).
create policy "proposals_update_admin" on public.proposals
for update
using (
  public.current_user_role() = 'admin'
)
with check (
  public.current_user_role() = 'admin'
);

-- DELETE: not permitted for any role — intentionally no policy.

-- --- proposal_versions -------------------------------------------------------

-- SELECT: parent proposal's owner, or approver/admin.
create policy "proposal_versions_select" on public.proposal_versions
for select
using (
  exists (
    select 1 from public.proposals p
    where p.id = proposal_versions.proposal_id
      and p.owner_id = auth.uid()
  )
  or public.current_user_role() in ('approver', 'admin')
);

-- INSERT: only via the server-side generate / regenerate-section routes
-- (service role, which bypasses RLS) — intentionally no policy for other
-- roles.
-- UPDATE / DELETE: not permitted — versions are append-only — intentionally
-- no policy.

-- --- approvals ---------------------------------------------------------------

-- SELECT: parent proposal's owner, or approver/admin.
create policy "approvals_select" on public.approvals
for select
using (
  exists (
    select 1 from public.proposals p
    where p.id = approvals.proposal_id
      and p.owner_id = auth.uid()
  )
  or public.current_user_role() in ('approver', 'admin')
);

-- INSERT: an approver or admin, recording their own decision.
create policy "approvals_insert" on public.approvals
for insert
with check (
  public.current_user_role() in ('approver', 'admin')
  and approver_id = auth.uid()
);

-- UPDATE / DELETE: not permitted — an approval decision is a permanent
-- record — intentionally no policy.

-- --- audit_log -----------------------------------------------------------

-- SELECT: admin only.
create policy "audit_log_select" on public.audit_log
for select
using (
  public.current_user_role() = 'admin'
);

-- INSERT: server-side only (service role, which bypasses RLS) —
-- intentionally no policy for other roles.
-- UPDATE / DELETE: not permitted for any role — intentionally no policy.
