"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SECTIONS, type SectionConfig, type SectionKey } from "@/lib/generation/sections";
import { INTAKE_FIELDS, type IntakeFieldKey } from "@/lib/intake-fields";
import type { Approval, Proposal, ProposalStatus } from "@/lib/types";

// Section 5's note: recommended_approach and deliverables are AI-derived,
// not direct intake fields — flagged so the salesperson double-checks them.
const AI_INFERRED_SECTIONS: SectionKey[] = ["recommended_approach", "deliverables"];

export default function ProposalReview({
  proposal,
  approvals,
  canEdit,
  canApprove,
  isAdmin,
}: {
  proposal: Proposal;
  approvals: Approval[];
  canEdit: boolean;
  canApprove: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ProposalStatus>(proposal.status);
  const [proposalLink, setProposalLink] = useState<string | null>(proposal.proposal_link);
  const [pdfUrl, setPdfUrl] = useState<string | null>(proposal.pdf_url);
  const [content, setContent] = useState<Record<string, string>>(
    (proposal.content as Record<string, string>) ?? {}
  );
  const [intakeValues, setIntakeValues] = useState<Record<IntakeFieldKey, string>>(() => {
    const initial = {} as Record<IntakeFieldKey, string>;
    for (const field of INTAKE_FIELDS) {
      initial[field.key] = (proposal[field.key] as string | null) ?? "";
    }
    return initial;
  });
  // Sections whose required intake field changed after they were last
  // generated — a nudge to regenerate, not an automatic one (the cache
  // still serves the old content until the salesperson acts on it).
  const [staleSections, setStaleSections] = useState<Set<SectionKey>>(new Set());
  // Auto-revert on edit: editing while pending_approval pulls the proposal
  // back into draft server-side (generate-section.ts / PATCH route) — this
  // just surfaces that it happened, since it's not something the
  // salesperson explicitly clicked a button for.
  const [revertNotice, setRevertNotice] = useState<string | null>(null);

  // Every status transition is driven by a server-side write, so the
  // server-rendered header badge (page.tsx) needs a refresh alongside the
  // local state update — otherwise it keeps showing whatever status was
  // current when the page first loaded.
  function handleStatusChange(newStatus: ProposalStatus) {
    setStatus((prev) => {
      if (prev === "pending_approval" && newStatus === "draft") {
        setRevertNotice(
          "This proposal was pulled back to draft because it was edited — resubmit when you're ready."
        );
      }
      return newStatus;
    });
    router.refresh();
  }

  function handleSectionUpdate(key: SectionKey, value: string) {
    setContent((prev) => ({ ...prev, [key]: value }));
    setStaleSections((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function handleIntakeSaved(updatedFields: Partial<Record<IntakeFieldKey, string>>) {
    setIntakeValues((prev) => ({ ...prev, ...updatedFields }));

    const changedKeys = Object.keys(updatedFields) as IntakeFieldKey[];
    const affected = SECTIONS.filter(
      (section) =>
        content[section.key] !== undefined &&
        section.requiredFields.some((field) => changedKeys.includes(field))
    ).map((section) => section.key);

    if (affected.length > 0) {
      setStaleSections((prev) => new Set([...prev, ...affected]));
    }
  }

  // Section 11.2 (as extended): editable while draft OR pending_approval —
  // editing while pending_approval auto-reverts status to draft server-side
  // rather than requiring an admin override first.
  const editable = canEdit && (status === "draft" || status === "pending_approval");

  // Section 12: export/send are open to salesperson or admin — if this
  // page rendered at all, RLS already confirmed the viewer is the owner or
  // an admin.
  const canDeliver = status === "approved" || status === "sent" || status === "failed";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {isAdmin && (
        <AdminOverrideBar
          proposalId={proposal.id}
          status={status}
          onReset={() => handleStatusChange("draft")}
          onDeleted={() => router.push("/dashboard")}
        />
      )}

      {revertNotice && (
        <p className="border border-slate bg-paper-shade p-3 font-sans text-sm text-slate">
          {revertNotice}
        </p>
      )}

      {approvals.length > 0 && <ReviewerFeedback approvals={approvals} />}

      {editable && (
        <IntakeDetailsPanel
          proposalId={proposal.id}
          values={intakeValues}
          onSaved={handleIntakeSaved}
          onStatusChange={handleStatusChange}
        />
      )}

      {editable && status === "draft" && (
        <SubmitBar
          proposalId={proposal.id}
          onSubmitted={() => {
            handleStatusChange("pending_approval");
            setRevertNotice(null);
          }}
        />
      )}

      {canApprove && status === "pending_approval" && (
        <ApprovalBar
          proposalId={proposal.id}
          onDecided={(decision) => handleStatusChange(decision)}
        />
      )}

      {canDeliver && (
        <DeliveryBar
          proposalId={proposal.id}
          status={status}
          proposalLink={proposalLink}
          pdfUrl={pdfUrl}
          onExported={(link, pdf) => {
            setProposalLink(link);
            setPdfUrl(pdf);
            handleStatusChange("approved");
          }}
          onExportFailed={() => handleStatusChange("failed")}
          onSent={() => handleStatusChange("sent")}
          onSendFailed={() => handleStatusChange("failed")}
        />
      )}

      <div className="flex flex-col gap-10 border border-rule bg-paper p-10 font-serif text-ink">
        {SECTIONS.map((section) => (
          <SectionBlock
            key={section.key}
            proposalId={proposal.id}
            section={section}
            content={content[section.key] ?? ""}
            hasContent={content[section.key] !== undefined}
            editable={editable}
            isStale={staleSections.has(section.key)}
            onUpdate={(value) => handleSectionUpdate(section.key, value)}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </div>
  );
}

// Approval decisions and their comments (approve/approve/route.ts) previously
// only reached the owner by email — this surfaces the same feedback inline
// on the proposal itself, most-recent first, for anyone who can already see
// this page (approvals_select's owner-or-admin RLS already applies to the
// query that produced this data server-side).
function ReviewerFeedback({ approvals }: { approvals: Approval[] }) {
  return (
    <div className="flex flex-col gap-3 border border-rule bg-paper-shade p-4 font-sans text-sm">
      <p className="text-ink/70">Reviewer feedback</p>
      {approvals.map((approval) => (
        <div key={approval.id} className="flex flex-col gap-0.5 border-t border-rule pt-2 first:border-t-0 first:pt-0">
          <p>
            <span className={approval.decision === "approved" ? "text-brass" : "text-oxblood"}>
              {approval.decision === "approved" ? "Approved" : "Rejected"}
            </span>
            {" — "}
            <span className="text-ink/60">
              {approval.approver?.name || approval.approver?.email || "Unknown reviewer"} ·{" "}
              {new Date(approval.created_at).toLocaleString()}
            </span>
          </p>
          {approval.comment && <p className="text-ink/80">{approval.comment}</p>}
        </div>
      ))}
    </div>
  );
}

function AdminOverrideBar({
  proposalId,
  status,
  onReset,
  onDeleted,
}: {
  proposalId: string;
  status: ProposalStatus;
  onReset: () => void;
  onDeleted: () => void;
}) {
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);

  async function handleReset() {
    if (isResetting) return;
    // Section 3: admin override — confirm since it bypasses whatever
    // decision (approval/rejection/delivery) has already been recorded.
    if (!window.confirm("Reset this proposal to draft? This bypasses the current approval/delivery status so the owner can edit it again.")) {
      return;
    }

    setIsResetting(true);
    setError(null);
    setAuditWarning(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}/reset-status`, { method: "POST" });
      const data = await response.json();

      if (data.auditLogWarning) {
        setAuditWarning(data.auditLogWarning);
      }

      if (!response.ok) {
        setError(data.error ?? "Reset failed.");
        return;
      }

      onReset();
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setIsResetting(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) return;
    if (!window.confirm("Delete this proposal permanently? This removes its content, version history, and approval record, and cannot be undone.")) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setAuditWarning(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}`, { method: "DELETE" });
      const data = await response.json();

      if (data.auditLogWarning) {
        setAuditWarning(data.auditLogWarning);
      }

      if (!response.ok) {
        setError(data.error ?? "Delete failed.");
        return;
      }

      onDeleted();
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 border border-rule bg-paper-shade p-4 font-sans text-sm">
      <p className="text-ink/70">Admin override.</p>
      <div className="flex flex-wrap items-center gap-2">
        {status !== "draft" && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isResetting || isDeleting}
            className="border border-oxblood px-3 py-1.5 text-oxblood transition-colors hover:bg-oxblood hover:text-paper disabled:pointer-events-none disabled:opacity-50"
          >
            {isResetting ? "Resetting…" : "Reset to draft"}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={isResetting || isDeleting}
          className="border border-oxblood bg-oxblood px-3 py-1.5 text-paper transition-colors hover:bg-oxblood/80 disabled:pointer-events-none disabled:opacity-50"
        >
          {isDeleting ? "Deleting…" : "Delete proposal"}
        </button>
        {error && <p className="text-oxblood">{error}</p>}
      </div>
      {auditWarning && <p className="text-oxblood">{auditWarning}</p>}
    </div>
  );
}

function IntakeDetailsPanel({
  proposalId,
  values,
  onSaved,
  onStatusChange,
}: {
  proposalId: string;
  values: Record<IntakeFieldKey, string>;
  onSaved: (updatedFields: Partial<Record<IntakeFieldKey, string>>) => void;
  onStatusChange: (status: ProposalStatus) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(values);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);

  function startEditing() {
    setDraft(values);
    setError(null);
    setIsEditing(true);
  }

  async function handleSave() {
    if (isSaving) return;

    const changed: Partial<Record<IntakeFieldKey, string>> = {};
    for (const field of INTAKE_FIELDS) {
      if (draft[field.key] !== values[field.key]) {
        changed[field.key] = draft[field.key];
      }
    }

    if (Object.keys(changed).length === 0) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);
    setAuditWarning(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake: changed }),
      });
      const data = await response.json();

      // Section 10: a failed audit_log write must surface, not fail silently.
      if (data.auditLogWarning) {
        setAuditWarning(data.auditLogWarning);
      }

      if (!response.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }

      onSaved(changed);
      if (data.proposal?.status) {
        onStatusChange(data.proposal.status as ProposalStatus);
      }
      setIsEditing(false);
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border border-rule bg-paper-shade p-4 font-sans text-sm">
      <div className="flex items-center justify-between">
        <p className="text-ink/70">Intake details</p>
        {!isEditing && (
          <button
            type="button"
            onClick={startEditing}
            className="border border-rule px-3 py-1 text-ink/70 transition-colors hover:border-ink/40 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
          >
            Edit details
          </button>
        )}
      </div>

      {isEditing ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {INTAKE_FIELDS.filter((field) => field.editable !== false).map((field) => (
              <label key={field.key} className="flex flex-col gap-1">
                {field.label}
                {field.type === "textarea" ? (
                  <textarea
                    value={draft[field.key]}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                    rows={3}
                    className="border border-rule bg-paper px-2 py-1 text-sm text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
                  />
                ) : (
                  <input
                    type={field.type}
                    value={draft[field.key]}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                    className="border border-rule bg-paper px-2 py-1 text-sm text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
                  />
                )}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="border border-ink px-3 py-1 text-ink disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setError(null);
              }}
              disabled={isSaving}
              className="border border-rule px-3 py-1 text-ink/70 transition-colors hover:border-ink/40 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="grid gap-x-6 gap-y-1 text-ink/70 sm:grid-cols-2">
          {INTAKE_FIELDS.map((field) => (
            <p key={field.key} className="truncate">
              <span className="text-ink/50">{field.label}:</span> {values[field.key] || "—"}
            </p>
          ))}
        </div>
      )}

      {error && <p className="text-oxblood">{error}</p>}
      {auditWarning && <p className="text-oxblood">{auditWarning}</p>}
    </div>
  );
}

function SubmitBar({
  proposalId,
  onSubmitted,
}: {
  proposalId: string;
  onSubmitted: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}/submit`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Submission failed.");
        return;
      }

      onSubmitted();
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 border border-rule bg-paper-shade p-4 font-sans text-sm">
      <p className="text-ink/70">
        Once submitted, this proposal is locked from further edits until an admin decides.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="bg-ink px-3 py-1.5 text-paper transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isSubmitting ? "Submitting…" : "Submit for approval"}
        </button>
        {error && <p className="text-oxblood">{error}</p>}
      </div>
    </div>
  );
}

function ApprovalBar({
  proposalId,
  onDecided,
}: {
  proposalId: string;
  onDecided: (decision: "approved" | "rejected") => void;
}) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);

  async function handleDecide(decision: "approved" | "rejected") {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setAuditWarning(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const data = await response.json();

      // Section 10: a failed audit_log write must surface, not fail silently.
      if (data.auditLogWarning) {
        setAuditWarning(data.auditLogWarning);
      }

      if (!response.ok) {
        setError(data.error ?? "Recording the decision failed.");
        return;
      }

      onDecided(decision);
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border border-rule bg-paper-shade p-4 font-sans text-sm">
      <label className="flex flex-col gap-1">
        Comment
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          className="w-full border border-rule bg-paper p-2 text-sm text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleDecide("approved")}
          disabled={isSubmitting}
          className="border border-brass px-3 py-1.5 text-brass transition-colors hover:bg-brass hover:text-paper disabled:pointer-events-none disabled:opacity-50"
        >
          {isSubmitting ? "Working…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => handleDecide("rejected")}
          disabled={isSubmitting}
          className="border border-oxblood px-3 py-1.5 text-oxblood transition-colors hover:bg-oxblood hover:text-paper disabled:pointer-events-none disabled:opacity-50"
        >
          {isSubmitting ? "Working…" : "Reject"}
        </button>
        {error && <p className="text-oxblood">{error}</p>}
      </div>
      {auditWarning && <p className="text-oxblood">{auditWarning}</p>}
    </div>
  );
}

function DeliveryBar({
  proposalId,
  status,
  proposalLink,
  pdfUrl,
  onExported,
  onExportFailed,
  onSent,
  onSendFailed,
}: {
  proposalId: string;
  status: ProposalStatus;
  proposalLink: string | null;
  pdfUrl: string | null;
  onExported: (proposalLink: string, pdfUrl: string) => void;
  onExportFailed: () => void;
  onSent: () => void;
  onSendFailed: () => void;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);
  const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string } | null>(null);

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    setError(null);
    setAuditWarning(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}/export`, { method: "POST" });
      const data = await response.json();

      // Section 10: a failed audit_log write must surface, not fail silently.
      if (data.auditLogWarning) {
        setAuditWarning(data.auditLogWarning);
      }

      if (!response.ok) {
        setError(data.error ?? "Export failed.");
        onExportFailed();
        return;
      }

      onExported(data.proposal.proposal_link, data.proposal.pdf_url);
    } catch {
      setError("Unable to reach the server.");
      onExportFailed();
    } finally {
      setIsExporting(false);
    }
  }

  async function handleSend() {
    if (isSending) return;
    setIsSending(true);
    setError(null);
    setAuditWarning(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}/send`, { method: "POST" });
      const data = await response.json();

      // Section 10: a failed audit_log write must surface, not fail silently.
      if (data.auditLogWarning) {
        setAuditWarning(data.auditLogWarning);
      }

      if (!response.ok) {
        setError(data.error ?? "Sending failed.");
        onSendFailed();
        return;
      }

      setEmailPreview(data.email);
      onSent();
    } catch {
      setError("Unable to reach the server.");
      onSendFailed();
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border border-rule bg-paper-shade p-4 font-sans text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || status === "sent"}
          className="border border-ink px-3 py-1.5 text-ink transition-colors hover:bg-ink hover:text-paper disabled:pointer-events-none disabled:opacity-50"
        >
          {isExporting ? "Exporting…" : proposalLink ? "Re-export" : "Export"}
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={isSending || !proposalLink || status === "sent"}
          className="bg-ink px-3 py-1.5 text-paper transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isSending ? "Sending…" : "Send to client"}
        </button>
        {status === "failed" && <span className="text-oxblood">A step failed — see below.</span>}
        {status === "sent" && <span className="text-brass">Sent.</span>}
      </div>

      {proposalLink && (
        <p className="text-ink/70">
          Hosted page:{" "}
          <a href={proposalLink} target="_blank" rel="noreferrer" className="underline transition-colors hover:text-slate">
            {proposalLink}
          </a>
        </p>
      )}
      {pdfUrl && (
        <p className="text-ink/70">
          PDF:{" "}
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline transition-colors hover:text-slate">
            {pdfUrl}
          </a>
        </p>
      )}

      {emailPreview && (
        <div className="flex flex-col gap-1 border-t border-rule pt-3">
          <p className="text-ink/70">
            Client email — copy this if it wasn&apos;t sent automatically (no Brevo configured):
          </p>
          <p>
            <strong className="font-medium">Subject:</strong> {emailPreview.subject}
          </p>
          <pre className="whitespace-pre-wrap border border-rule bg-paper p-2 font-sans text-sm">
            {emailPreview.body}
          </pre>
        </div>
      )}

      {error && <p className="text-oxblood">{error}</p>}
      {auditWarning && <p className="text-oxblood">{auditWarning}</p>}
    </div>
  );
}

type GenerationResult =
  | { outcome: "cached" | "needs_input" | "generated"; content: string; status?: ProposalStatus }
  | { outcome: "rate_limited"; waitMinutes: number }
  | { outcome: "in_progress" }
  | { outcome: "failed"; error: string };

function SectionBlock({
  proposalId,
  section,
  content,
  hasContent,
  editable,
  isStale,
  onUpdate,
  onStatusChange,
}: {
  proposalId: string;
  section: SectionConfig;
  content: string;
  hasContent: boolean;
  editable: boolean;
  isStale: boolean;
  onUpdate: (value: string) => void;
  onStatusChange: (status: ProposalStatus) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAiInferred = AI_INFERRED_SECTIONS.includes(section.key);
  const needsInput = content.includes("[NEEDS INPUT");

  async function handleGenerate(isRegenerate: boolean) {
    // Section 11.1: ignore duplicate clicks while a request is in flight.
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      const endpoint = isRegenerate
        ? `/api/proposals/${proposalId}/regenerate-section`
        : `/api/proposals/${proposalId}/generate`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: section.key }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Generation failed.");
        return;
      }

      const result: GenerationResult | undefined = isRegenerate
        ? data.result
        : data.results?.[section.key];

      if (!result) {
        setError("Generation failed.");
        return;
      }

      if (result.outcome === "rate_limited") {
        const unit = result.waitMinutes === 1 ? "minute" : "minutes";
        setError(`Regeneration limit reached for this section. Wait ${result.waitMinutes} ${unit} and try again.`);
      } else if (result.outcome === "in_progress") {
        setError("A generation request for this section is already in progress.");
      } else if (result.outcome === "failed") {
        setError(result.error);
      } else {
        onUpdate(result.content);
        setDraft(result.content);
        if (result.status) {
          onStatusChange(result.status);
        }
      }
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: section.key, content: draft }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }

      onUpdate(draft);
      if (data.proposal?.status) {
        onStatusChange(data.proposal.status as ProposalStatus);
      }
      setIsEditing(false);
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={needsInput ? "-ml-4 border-l-2 border-oxblood pl-4" : ""}>
      <div className="mb-2 flex flex-wrap items-center gap-2 font-sans">
        <h2 className="text-base font-medium text-ink">{section.title}</h2>
        {isAiInferred && (
          <span className="border border-brass px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-brass">
            AI-inferred
          </span>
        )}
        {needsInput && (
          <span className="border border-oxblood px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-oxblood">
            Needs input
          </span>
        )}
        {isStale && (
          <span className="border border-slate px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate">
            Context changed — consider regenerating
          </span>
        )}
      </div>

      {isEditing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={5}
          className="w-full border border-rule bg-paper p-3 font-serif text-base text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
        />
      ) : hasContent ? (
        <p className="whitespace-pre-wrap text-base leading-relaxed">{content}</p>
      ) : (
        <p className="font-sans text-sm italic text-ink/50">Not generated yet.</p>
      )}

      {error && <p className="mt-2 font-sans text-sm text-oxblood">{error}</p>}

      {editable && (
        <div className="mt-3 flex gap-2 font-sans text-sm">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="border border-ink px-3 py-1 text-ink disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setDraft(content);
                }}
                disabled={isSaving}
                className="border border-rule px-3 py-1 text-ink/70 transition-colors hover:border-ink/40 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(content);
                  setIsEditing(true);
                }}
                className="border border-rule px-3 py-1 text-ink/70 transition-colors hover:border-ink/40 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleGenerate(hasContent)}
                disabled={isGenerating}
                className="border border-rule px-3 py-1 text-ink/70 transition-colors hover:border-ink/40 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
              >
                {isGenerating ? "Working…" : hasContent ? "Regenerate" : "Generate"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
