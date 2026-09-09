import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { INTAKE_FIELDS } from "@/lib/intake-fields";
import { createClient } from "@/lib/supabase/server";

// POST /api/proposals — Section 12: create a proposal from intake fields,
// status set to `draft`. Salesperson only.
export async function POST(request: Request) {
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (profile.role !== "salesperson") {
    return NextResponse.json(
      { error: "Only a salesperson can create a proposal." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;

  for (const field of INTAKE_FIELDS) {
    const value = record[field.key];
    if (field.required && (typeof value !== "string" || !value.trim())) {
      return NextResponse.json(
        { error: `${field.label} is required.` },
        { status: 400 }
      );
    }
  }

  const insertPayload: Record<string, string | null> = { owner_id: user.id };
  for (const field of INTAKE_FIELDS) {
    const value = record[field.key];
    insertPayload[field.key] = typeof value === "string" && value.trim() ? value : null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposals")
    .insert({ ...insertPayload, status: "draft" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ proposal: data }, { status: 201 });
}

// GET /api/proposals — Section 12: list proposals, filtered by role.
// Salesperson sees own only, approver sees pending_approval, admin sees all.
export async function GET() {
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();
  let query = supabase
    .from("proposals")
    .select("*")
    .order("created_at", { ascending: false });

  if (profile.role === "salesperson") {
    query = query.eq("owner_id", user.id);
  } else if (profile.role === "approver") {
    query = query.eq("status", "pending_approval");
  }
  // admin: no filter — sees all.

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ proposals: data });
}
