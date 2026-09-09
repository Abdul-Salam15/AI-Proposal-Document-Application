import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PROPOSAL_STATUS_META } from "@/lib/proposal-status";
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

  // Section 3: only the owning salesperson can edit, regenerate, or submit
  // content — and only while still draft (Section 13: locked once
  // submitted). An approver/admin can act only while pending_approval.
  const canEdit = profile?.role === "salesperson" && proposal.owner_id === user.id;
  const canApprove = profile?.role === "approver" || profile?.role === "admin";
  const statusMeta = PROPOSAL_STATUS_META[proposal.status as Proposal["status"]];

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
        <p className="mt-1 flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusMeta.dotClassName}`} />
          {statusMeta.label}
        </p>
      </div>

      <ProposalReview proposal={proposal as Proposal} canEdit={canEdit} canApprove={canApprove} />
    </div>
  );
}
