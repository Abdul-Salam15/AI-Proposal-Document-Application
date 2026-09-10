-- users_update_self's WITH CHECK re-read the caller's own role with a raw
-- subquery on public.users:
--
--   role = (select u.role from public.users u where u.id = auth.uid())
--
-- Postgres treats any policy that queries its own table like that as a
-- self-reference and refuses with "infinite recursion detected in policy
-- for relation users" — the exact trap current_user_role() (initial schema)
-- was already introduced to avoid everywhere else. It only surfaced now
-- because it takes a self-update to trigger this policy's WITH CHECK at
-- all: an admin editing their own row hits both users_update_admin and
-- users_update_self (permissive policies OR together), so the broken
-- subquery gets evaluated even though users_update_admin alone would have
-- allowed it.
drop policy if exists "users_update_self" on public.users;

create policy "users_update_self" on public.users
for update
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
  and role = public.current_user_role()
);
