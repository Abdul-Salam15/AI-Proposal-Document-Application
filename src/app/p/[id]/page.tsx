import { notFound } from "next/navigation";
import {
  SECTIONS,
  type DeliverablesContent,
  type PricingContent,
  type SectionConfig,
  type SectionContent,
  type TimelineContent,
} from "@/lib/generation/sections";
import { createServiceClient } from "@/lib/supabase/service";
import type { Proposal } from "@/lib/types";

// Deliverables/Timeline/Pricing render as a bulleted list / a phase table /
// a milestone table instead of a plain paragraph. A section's stored value
// can still be a plain string even for these formats — the
// [NEEDS INPUT: ...] sentinel, or a proposal generated before structured
// content existed — so this always falls back to a plain paragraph
// whenever the value isn't (yet) the structured shape.
function renderSectionBody(section: SectionConfig, content: SectionContent) {
  if (typeof content === "string") {
    return <p className="text-justify text-base leading-relaxed">{content}</p>;
  }

  if (section.format === "list" && Array.isArray(content)) {
    return (
      <ul className="flex flex-col gap-2 text-base leading-relaxed">
        {(content as DeliverablesContent).map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="text-oxblood">—</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (section.format === "timeline_table" && !Array.isArray(content) && "phases" in content) {
    const timeline = content as TimelineContent;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-justify text-base leading-relaxed">{timeline.intro}</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-paper-shade text-left">
              <th className="border border-rule px-3 py-2 font-sans font-medium">Phase</th>
              <th className="border border-rule px-3 py-2 font-sans font-medium">Focus</th>
              <th className="border border-rule px-3 py-2 font-sans font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {timeline.phases.map((row, index) => (
              <tr key={index}>
                <td className="border border-rule px-3 py-2 align-top font-medium text-oxblood">{row.phase}</td>
                <td className="border border-rule px-3 py-2 align-top italic">{row.focus}</td>
                <td className="border border-rule px-3 py-2 align-top">{row.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (section.format === "pricing_table" && !Array.isArray(content) && "milestones" in content) {
    const pricing = content as PricingContent;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-justify text-base leading-relaxed">{pricing.summary}</p>
        <p className="text-center font-serif text-lg font-medium italic text-brass">
          Total Investment — {pricing.totalInvestmentLabel}
        </p>
        <ul className="flex flex-col">
          {pricing.milestones.map((milestone, index) => (
            <li key={index} className="flex items-center justify-between border-b border-rule py-2">
              <span className="italic">{milestone.label}</span>
              <span className="font-medium text-oxblood">{milestone.percent}%</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return null;
}

// The {{proposal_link}} target from Section 5 — public, unauthenticated
// (the client receiving the email isn't a user of this app), so this reads
// via the service client rather than the session-bound one, which would
// see nothing under RLS with no auth.uid(). Visibility is instead gated
// directly on proposal status: never draft/pending_approval/rejected,
// matching the app's core principle that nothing reaches the client before
// approval. This is also the exact page Puppeteer renders to produce the
// PDF (Section 2), so the two artifacts always match.
export default async function HostedProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const service = createServiceClient();
  const { data: proposal, error } = await service
    .from("proposals")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !proposal || !["approved", "sent"].includes(proposal.status)) {
    notFound();
  }

  const typed = proposal as Proposal;
  const content = (typed.content as Record<string, SectionContent>) ?? {};

  return (
    <div className="min-h-screen bg-paper-shade px-6 py-16 print:min-h-0 print:bg-paper print:p-0">
      <div className="mx-auto flex max-w-2xl flex-col gap-16 border border-rule bg-paper p-10 font-serif text-ink print:max-w-none print:gap-10 print:border-0 print:p-0">
        {/* On print, the same running company-name header repeats on every
            page via Puppeteer's own header template (render-pdf.ts) — shown
            here only for the on-screen view, which has no page boundaries
            to repeat across. */}
        <p className="text-center font-sans text-xs uppercase tracking-[0.2em] text-ink/50 print:hidden">
          {typed.company_name}
        </p>

        <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center break-after-page">
          <p className="font-sans text-xs uppercase tracking-[0.2em] text-ink/50">A Proposal Prepared For</p>
          <h1 className="font-serif text-4xl font-medium text-brass">{typed.company_name}</h1>
          <p className="tracking-[0.4em] text-brass/60">· · ·</p>
          <div className="mt-6 flex flex-col gap-1 text-sm text-ink/70">
            <p>Prepared for {typed.client_name}</p>
            <p>by {typed.salesperson_name}</p>
          </div>
          <p className="text-sm italic text-ink/50">{typed.date_of_call}</p>
        </section>

        <div className="flex flex-col gap-12 print:gap-8">
          {SECTIONS.map((section) => (
            <section key={section.key} className="flex flex-col gap-4 break-inside-avoid-page">
              <div className="flex flex-col items-center gap-1 text-center break-after-avoid-page">
                <h2 className="font-serif text-lg text-oxblood">{section.title}</h2>
                <p className="tracking-[0.4em] text-rule">· · ·</p>
              </div>
              {renderSectionBody(section, content[section.key] ?? "")}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
