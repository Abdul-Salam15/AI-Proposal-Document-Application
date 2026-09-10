"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PROPOSAL_STATUS_META } from "@/lib/proposal-status";
import type { Proposal } from "@/lib/types";

export default function ProposalTable() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/proposals");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load proposals.");
        }

        if (!cancelled) {
          setProposals(data.proposals as Proposal[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load proposals.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-oxblood">{error}</p>;
  }

  if (proposals === null) {
    return <p className="text-sm text-ink/60">Loading…</p>;
  }

  if (proposals.length === 0) {
    return <p className="text-sm text-ink/60">No proposals yet.</p>;
  }

  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-rule text-xs tracking-wide text-ink/50">
          <th className="py-2 pr-4 font-medium">Status</th>
          <th className="py-2 pr-4 font-medium">Client</th>
          <th className="py-2 pr-4 font-medium">Company</th>
          <th className="py-2 pr-4 font-medium">Salesperson</th>
          <th className="py-2 pr-4 font-medium">Date of call</th>
          <th className="py-2 pr-4 font-medium">Created</th>
        </tr>
      </thead>
      <tbody>
        {proposals.map((proposal) => {
          const statusMeta = PROPOSAL_STATUS_META[proposal.status];
          return (
            <tr
              key={proposal.id}
              className="border-b border-rule transition-colors hover:bg-paper-shade"
            >
              <td className="py-2 pr-4">
                <Link
                  href={`/dashboard/proposals/${proposal.id}`}
                  className="flex items-center gap-2"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${statusMeta.dotClassName}`}
                  />
                  {statusMeta.label}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <Link
                  href={`/dashboard/proposals/${proposal.id}`}
                  className="hover:underline"
                >
                  {proposal.client_name}
                </Link>
              </td>
              <td className="py-2 pr-4">{proposal.company_name}</td>
              <td className="py-2 pr-4">{proposal.salesperson_name}</td>
              <td className="py-2 pr-4">{proposal.date_of_call}</td>
              <td className="py-2 pr-4">
                {new Date(proposal.created_at).toLocaleDateString()}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
