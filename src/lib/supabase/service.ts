import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Bypasses RLS with the service role key. Section 13: `proposal_versions`
// and `audit_log` INSERT policies are service-role only — never exposed to
// the browser or the authenticated (anon-key) client. Use only for the
// narrow set of server-side writes those policies require.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
