import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["salesperson", "approver", "admin"];

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

// PATCH /api/users/[id] — Section 12/13: admin only, changes a user's role.
// No other fields are editable through this route (Section 13: a user can
// update their own non-role fields themselves — that's a separate, unbuilt
// concern this route doesn't touch).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const role = body?.role;

  if (!isRole(role)) {
    return NextResponse.json(
      { error: "role must be one of: salesperson, approver, admin." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("users")
    .update({ role })
    .eq("id", id)
    .select("id, email, name, role, created_at")
    .single();

  if (error || !updated) {
    await writeAuditLog({
      actorId: user.id,
      action: "user_role_change_failed",
      targetId: id,
      metadata: { role, error: error?.message ?? "User not found." },
    });
    return NextResponse.json({ error: error?.message ?? "User not found." }, { status: 404 });
  }

  await writeAuditLog({
    actorId: user.id,
    action: "user_role_changed",
    targetId: id,
    metadata: { role },
  });

  return NextResponse.json({ user: updated });
}
