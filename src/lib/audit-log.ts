import { createServiceClient } from "./supabase/service";

// Section 12 notes: every route that touches a proposal writes a matching
// audit_log entry on success and on failure. INSERT on audit_log is
// service-role only (Section 13), so this always goes through the service
// client rather than the caller's session-scoped one.
//
// Returns whether the write succeeded. Section 10: "Logging failure itself
// should surface as a visible error state in the dashboard, not fail
// silently." Since a failed audit_log insert leaves no row of its own to
// surface later, the only place that can catch it is here, at write time —
// callers for the export/approval/email delivery steps named in Section 10
// pass this back to the caller so the dashboard can show it.
export async function writeAuditLog(entry: {
  actorId: string;
  action: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const service = createServiceClient();
  const { error } = await service.from("audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });

  if (error) {
    console.error("audit_log insert failed", { action: entry.action, error });
    return false;
  }
  return true;
}
