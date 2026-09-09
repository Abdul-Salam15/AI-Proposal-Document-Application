import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// GET /api/audit-log — Section 12: full audit trail across all proposals
// and users. Admin only — Section 13's audit_log SELECT policy is
// admin-only too, so the session client enforces the same rule at the DB
// layer, not just here.
export async function GET() {
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*, actor:users(name, email)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}
