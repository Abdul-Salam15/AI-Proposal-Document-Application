import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Proposal } from "@/lib/types";
import ProposalReview from "./ProposalReview";

export default async function ProposalReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, profile } = await getSession();

  if (!user) {
    notFound();
  }

  const supabase = await createClient();
  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !proposal) {
    notFound();
  }

  // Section 3: only the owning salesperson can edit or regenerate content;
  // an approver/admin viewing this (e.g. via the all-proposals list) gets a
  // read-only render. Submit/approval isn't built yet, so this mostly
  // covers admin browsing another salesperson's draft.
  const canEdit = profile?.role === "salesperson" && proposal.owner_id === user.id;

  return (
    <div className="-mx-10 -my-8 min-h-[calc(100%+4rem)] bg-paper-shade px-10 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-1 pb-8 font-sans">
        <Link href="/dashboard" className="text-sm text-slate">
          ← Proposals
        </Link>
        <h1 className="mt-1 text-2xl font-medium text-ink">{proposal.company_name}</h1>
        <p className="text-sm text-ink/60">
          {proposal.client_name} · {proposal.date_of_call}
        </p>
      </div>

      <ProposalReview proposal={proposal as Proposal} canEdit={canEdit} />
    </div>
  );
}
