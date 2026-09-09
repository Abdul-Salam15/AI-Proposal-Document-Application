import { notFound } from "next/navigation";
import { SECTIONS } from "@/lib/generation/sections";
import { createServiceClient } from "@/lib/supabase/service";
import type { Proposal } from "@/lib/types";

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
  const content = (typed.content as Record<string, string>) ?? {};

  return (
    <div className="min-h-screen bg-paper-shade px-6 py-16">
      <div className="mx-auto flex max-w-2xl flex-col gap-10 border border-rule bg-paper p-10 font-serif text-ink">
        <header className="flex flex-col gap-1 border-b border-rule pb-6 font-sans">
          <p className="text-sm text-ink/60">Proposal for {typed.company_name}</p>
          <h1 className="font-serif text-2xl font-medium">{typed.company_name}</h1>
          <p className="text-sm text-ink/60">
            Prepared for {typed.client_name} by {typed.salesperson_name} · {typed.date_of_call}
          </p>
        </header>

        {SECTIONS.map((section) => (
          <section key={section.key}>
            <h2 className="mb-2 font-sans text-base font-medium text-ink">{section.title}</h2>
            <p className="whitespace-pre-wrap text-base leading-relaxed">
              {content[section.key] ?? ""}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
