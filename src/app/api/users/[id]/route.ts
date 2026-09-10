import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { sendNotificationEmail } from "@/lib/notifications/send-email";
import { buildRoleChangeConfirmationEmail, buildRoleChangedEmail } from "@/lib/notifications/templates";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["salesperson", "admin"];

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

// PATCH /api/users/[id] — Section 12/13: admin only, changes a user's role
// and/or display name. (Section 13: a user can update their own non-role
// fields themselves — that's a separate, unbuilt concern this route doesn't
// touch.)
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
  const hasRole = !!body && Object.prototype.hasOwnProperty.call(body, "role");
  const hasName = !!body && Object.prototype.hasOwnProperty.call(body, "name");

  if (!hasRole && !hasName) {
    return NextResponse.json({ error: "Provide a role and/or name to update." }, { status: 400 });
  }

  if (hasRole && !isRole(body.role)) {
    return NextResponse.json(
      { error: "role must be one of: salesperson, admin." },
      { status: 400 }
    );
  }

  if (hasName && body.name !== null && typeof body.name !== "string") {
    return NextResponse.json({ error: "Name must be a string or null." }, { status: 400 });
  }

  const updates: { role?: UserRole; name?: string | null } = {};
  if (hasRole) updates.role = body.role;
  if (hasName) updates.name = typeof body.name === "string" ? body.name.trim() || null : null;

  const supabase = await createClient();

  const { data: before } = await supabase.from("users").select("role, name").eq("id", id).single();

  const { data: updated, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", id)
    .select("id, email, name, role, created_at")
    .single();

  if (error || !updated) {
    await writeAuditLog({
      actorId: user.id,
      action: "user_update_failed",
      targetId: id,
      metadata: { ...updates, error: error?.message ?? "User not found." },
    });
    return NextResponse.json({ error: error?.message ?? "User not found." }, { status: 404 });
  }

  if (hasRole) {
    await writeAuditLog({
      actorId: user.id,
      action: "user_role_changed",
      targetId: id,
      metadata: { role: updated.role, fromRole: before?.role ?? null },
    });
  }

  if (hasName && before?.name !== updated.name) {
    await writeAuditLog({
      actorId: user.id,
      action: "user_name_changed",
      targetId: id,
      metadata: { name: updated.name, fromName: before?.name ?? null },
    });
  }

  const role = updated.role;
  if (hasRole && before?.role && before.role !== role) {
    const origin = new URL(request.url).origin;
    const adminName = profile.name || profile.email;

    const targetEmail = buildRoleChangedEmail(before.role, updated.role, adminName, origin);
    await sendNotificationEmail({
      to: updated.email,
      subject: targetEmail.subject,
      text: targetEmail.body,
      actorId: user.id,
      notificationType: "role_changed",
      targetId: id,
    });

    const adminEmail = buildRoleChangeConfirmationEmail(updated.email, before.role, updated.role, origin);
    await sendNotificationEmail({
      to: user.email!,
      subject: adminEmail.subject,
      text: adminEmail.body,
      actorId: user.id,
      notificationType: "role_change_confirmation",
      targetId: id,
    });
  }

  return NextResponse.json({ user: updated });
}

// DELETE /api/users/[id] — admin only. Deletes the Supabase Auth account;
// `users.id references auth.users (id) on delete cascade` (initial schema)
// removes the matching `public.users` row as a side effect, so there's no
// separate delete against `public.users` here.
//
// `proposals.owner_id` and `approvals.approver_id` are plain (restrictive)
// foreign keys — deleting a user who owns proposals or has approval
// decisions on record would otherwise fail deep in the cascade with an
// opaque constraint error, so both are checked up front and reported
// clearly instead.
export async function DELETE(
  _request: Request,
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

  if (id === user.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: target, error: targetError } = await service
    .from("users")
    .select("id, email, name, role")
    .eq("id", id)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { count: proposalCount } = await service
    .from("proposals")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", id);

  if (proposalCount) {
    return NextResponse.json(
      { error: `This user owns ${proposalCount} proposal(s) — reassign or delete them first.` },
      { status: 409 }
    );
  }

  const { count: approvalCount } = await service
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("approver_id", id);

  if (approvalCount) {
    return NextResponse.json(
      { error: `This user has ${approvalCount} approval decision(s) on record and can't be deleted.` },
      { status: 409 }
    );
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(id);

  if (deleteError) {
    await writeAuditLog({
      actorId: user.id,
      action: "user_delete_failed",
      targetId: id,
      metadata: { email: target.email, error: deleteError.message },
    });
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const logged = await writeAuditLog({
    actorId: user.id,
    action: "user_deleted",
    targetId: id,
    metadata: { email: target.email, name: target.name, role: target.role },
  });

  return NextResponse.json({
    success: true,
    ...(logged ? {} : { auditLogWarning: "The user was deleted, but the audit log entry failed to record. Contact an admin." }),
  });
}
