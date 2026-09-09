import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
};

export type Session =
  | { user: null; profile: null }
  | { user: User; profile: UserProfile | null };

/**
 * Auth session (Supabase Auth) and the matching row on the `users` table
 * (Section 4), which is where role lives. `profile` is null whenever a
 * user has an auth session but no row on `users` yet — provisioning that
 * row happens outside this app (Section 13: users INSERT is not exposed
 * as a general policy), so callers render an explanatory state instead of
 * treating it as "not signed in".
 */
export async function getSession(): Promise<Session> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, name, role")
    .eq("id", user.id)
    .single();

  return { user, profile: (profile as UserProfile) ?? null };
}
