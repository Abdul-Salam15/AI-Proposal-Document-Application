import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { INTAKE_FIELDS, validateIntakeValue } from "@/lib/intake-fields";
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
    if (field.editable === false) continue;
    const value = record[field.key];
    if (typeof value !== "string" && value !== undefined) {
      return NextResponse.json({ error: `${field.label} must be a string.` }, { status: 400 });
    }
    const validationError = validateIntakeValue(field, typeof value === "string" ? value : "");
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  // salesperson_name is not client-editable (editable: false in
  // intake-fields.ts) — always the owning account's own name, never
  // whatever a request body claims, so it can't be spoofed via a direct
  // API call either.
  const insertPayload: Record<string, string | null> = {
    owner_id: user.id,
    salesperson_name: profile.name?.trim() || profile.email,
  };
  for (const field of INTAKE_FIELDS) {
    if (field.editable === false) continue;
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
// Salesperson sees own only, admin sees all.
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
  }
  // admin: no filter — sees all.

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ proposals: data });
}
