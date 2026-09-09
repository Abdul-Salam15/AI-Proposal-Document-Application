import { createServiceClient } from "./supabase/service";

// Section 12 notes: every route that touches a proposal writes a matching
// audit_log entry on success and on failure. INSERT on audit_log is
// service-role only (Section 13), so this always goes through the service
// client rather than the caller's session-scoped one.
export async function writeAuditLog(entry: {
  actorId: string;
  action: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const service = createServiceClient();
  const { error } = await service.from("audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });

  // Section 10: a logging failure must surface, not fail silently. There's
  // no dashboard failure-state UI yet (out of scope this stage), so the
  // best available surface is the server log.
  if (error) {
    console.error("audit_log insert failed", { action: entry.action, error });
  }
}
