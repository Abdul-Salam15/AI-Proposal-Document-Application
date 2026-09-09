"use client";

import { useState } from "react";
import { SECTIONS, type SectionConfig, type SectionKey } from "@/lib/generation/sections";
import type { Proposal } from "@/lib/types";

// Section 5's note: recommended_approach and deliverables are AI-derived,
// not direct intake fields — flagged so the salesperson double-checks them.
const AI_INFERRED_SECTIONS: SectionKey[] = ["recommended_approach", "deliverables"];

export default function ProposalReview({
  proposal,
  canEdit,
}: {
  proposal: Proposal;
  canEdit: boolean;
}) {
  const [content, setContent] = useState<Record<string, string>>(
    (proposal.content as Record<string, string>) ?? {}
  );

  function handleSectionUpdate(key: SectionKey, value: string) {
    setContent((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 border border-rule bg-paper p-10 font-serif text-ink">
      {SECTIONS.map((section) => (
        <SectionBlock
          key={section.key}
          proposalId={proposal.id}
          section={section}
          content={content[section.key] ?? ""}
          hasContent={content[section.key] !== undefined}
          canEdit={canEdit}
          onUpdate={(value) => handleSectionUpdate(section.key, value)}
        />
      ))}
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
  canEdit,
  onUpdate,
}: {
  proposalId: string;
  section: SectionConfig;
  content: string;
  hasContent: boolean;
  canEdit: boolean;
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

      {canEdit && (
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
