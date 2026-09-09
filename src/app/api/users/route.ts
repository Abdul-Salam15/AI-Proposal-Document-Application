import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// GET /api/users — Section 12: list users and their roles, for role
// management. Admin only.
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
    .from("users")
    .select("id, email, name, role, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data });
}
