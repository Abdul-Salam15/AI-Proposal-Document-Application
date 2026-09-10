import type { SupabaseClient } from "@supabase/supabase-js";

type UserContact = { id: string; email: string; name: string | null };

// Callers pass their service-role client so this works the same regardless
// of the caller's own RLS visibility (a salesperson, for instance, can't
// see other users' rows directly).
export async function getUserById(
  service: SupabaseClient,
  id: string
): Promise<UserContact | null> {
  const { data } = await service.from("users").select("id, email, name").eq("id", id).single();
  return data ?? null;
}

// Everyone able to act on a pending_approval proposal (admin-only decision
// rule) — the "waiting for approval" audience.
export async function getAdmins(service: SupabaseClient): Promise<UserContact[]> {
  const { data } = await service.from("users").select("id, email, name").eq("role", "admin");
  return data ?? [];
}
