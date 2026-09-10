import { writeAuditLog } from "@/lib/audit-log";

// Internal notification emails (submitted-for-approval, decisions, delivery
// confirmations, admin overrides) are a convenience layer on top of the core
// workflow, not a required step in it — unlike the client-facing email in
// send/route.ts, nothing here has a manual-copy-paste fallback UI. So this
// is deliberately best-effort: log failures to the audit log for admin
// visibility (Section 10's "failure should surface, not fail silently"
// principle), but never throw or block the action that triggered it.
export async function sendNotificationEmail(params: {
  to: string;
  subject: string;
  text: string;
  actorId: string;
  notificationType: string;
  targetId?: string;
}): Promise<void> {
  const { to, subject, text, actorId, notificationType, targetId } = params;

  const brevoApiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;

  if (!brevoApiKey || !fromEmail) {
    return;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: fromEmail },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.message ?? `Brevo request failed with status ${response.status}.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notification email failed.";
    await writeAuditLog({
      actorId,
      action: "notification_failed",
      targetId,
      metadata: { notificationType, to, error: message },
    });
  }
}
