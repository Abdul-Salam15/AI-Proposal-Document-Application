"use client";

import { useState } from "react";
import { SECTIONS, type SectionConfig, type SectionKey } from "@/lib/generation/sections";
import type { Proposal, ProposalStatus } from "@/lib/types";

// Section 5's note: recommended_approach and deliverables are AI-derived,
// not direct intake fields — flagged so the salesperson double-checks them.
const AI_INFERRED_SECTIONS: SectionKey[] = ["recommended_approach", "deliverables"];

export default function ProposalReview({
  proposal,
  canEdit,
  canApprove,
}: {
  proposal: Proposal;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const [status, setStatus] = useState<ProposalStatus>(proposal.status);
  const [proposalLink, setProposalLink] = useState<string | null>(proposal.proposal_link);
  const [pdfUrl, setPdfUrl] = useState<string | null>(proposal.pdf_url);
  const [content, setContent] = useState<Record<string, string>>(
    (proposal.content as Record<string, string>) ?? {}
  );

  function handleSectionUpdate(key: SectionKey, value: string) {
    setContent((prev) => ({ ...prev, [key]: value }));
  }

  // Section 13: locked from further edits once no longer draft.
  const editable = canEdit && status === "draft";
  // Section 12: export/send are open to salesperson, approver, or admin —
  // if this page rendered at all, RLS already confirmed the viewer is the
  // owner, an approver, or an admin (Section 12's three allowed roles).
  const canDeliver = status === "approved" || status === "sent" || status === "failed";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {editable && <SubmitBar proposalId={proposal.id} onSubmitted={() => setStatus("pending_approval")} />}

      {canApprove && status === "pending_approval" && (
        <ApprovalBar
          proposalId={proposal.id}
          onDecided={(decision) => setStatus(decision)}
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
            setStatus("approved");
          }}
          onExportFailed={() => setStatus("failed")}
          onSent={() => setStatus("sent")}
          onSendFailed={() => setStatus("failed")}
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
            onUpdate={(value) => handleSectionUpdate(section.key, value)}
          />
        ))}
      </div>
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
        Once submitted, this proposal is locked from further edits until an approver decides.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="bg-ink px-3 py-1.5 text-paper disabled:opacity-50"
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

  async function handleDecide(decision: "approved" | "rejected") {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const data = await response.json();

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
          className="w-full border border-rule bg-paper p-2 text-sm text-ink outline-none focus:border-slate"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleDecide("approved")}
          disabled={isSubmitting}
          className="border border-brass px-3 py-1.5 text-brass disabled:opacity-50"
        >
          {isSubmitting ? "Working…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => handleDecide("rejected")}
          disabled={isSubmitting}
          className="border border-oxblood px-3 py-1.5 text-oxblood disabled:opacity-50"
        >
          {isSubmitting ? "Working…" : "Reject"}
        </button>
        {error && <p className="text-oxblood">{error}</p>}
      </div>
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
  const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string } | null>(null);

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}/export`, { method: "POST" });
      const data = await response.json();

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

    try {
      const response = await fetch(`/api/proposals/${proposalId}/send`, { method: "POST" });
      const data = await response.json();

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
          className="border border-ink px-3 py-1.5 text-ink disabled:opacity-50"
        >
          {isExporting ? "Exporting…" : proposalLink ? "Re-export" : "Export"}
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={isSending || !proposalLink || status === "sent"}
          className="bg-ink px-3 py-1.5 text-paper disabled:opacity-50"
        >
          {isSending ? "Sending…" : "Send to client"}
        </button>
        {status === "failed" && <span className="text-oxblood">A step failed — see below.</span>}
        {status === "sent" && <span className="text-brass">Sent.</span>}
      </div>

      {proposalLink && (
        <p className="text-ink/70">
          Hosted page:{" "}
          <a href={proposalLink} target="_blank" rel="noreferrer" className="underline">
            {proposalLink}
          </a>
        </p>
      )}
      {pdfUrl && (
        <p className="text-ink/70">
          PDF:{" "}
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline">
            {pdfUrl}
          </a>
        </p>
      )}

      {emailPreview && (
        <div className="flex flex-col gap-1 border-t border-rule pt-3">
          <p className="text-ink/70">
            Client email — copy this if it wasn&apos;t sent automatically (no Resend configured):
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
    </div>
  );
}

type GenerationResult =
  | { outcome: "cached" | "needs_input" | "generated"; content: string }
  | { outcome: "capped" }
  | { outcome: "in_progress" }
  | { outcome: "failed"; error: string };

function SectionBlock({
  proposalId,
  section,
  content,
  hasContent,
  editable,
  onUpdate,
}: {
  proposalId: string;
  section: SectionConfig;
  content: string;
  hasContent: boolean;
  editable: boolean;
  onUpdate: (value: string) => void;
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

      if (result.outcome === "capped") {
        setError("Regeneration limit reached for this section — edit it manually instead.");
      } else if (result.outcome === "in_progress") {
        setError("A generation request for this section is already in progress.");
      } else if (result.outcome === "failed") {
        setError(result.error);
      } else {
        onUpdate(result.content);
        setDraft(result.content);
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
      </div>

      {isEditing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={5}
          className="w-full border border-rule bg-paper p-3 font-serif text-base text-ink outline-none focus:border-slate"
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
                className="border border-rule px-3 py-1 text-ink/70"
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
                className="border border-rule px-3 py-1 text-ink/70"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleGenerate(hasContent)}
                disabled={isGenerating}
                className="border border-rule px-3 py-1 text-ink/70 disabled:opacity-50"
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
