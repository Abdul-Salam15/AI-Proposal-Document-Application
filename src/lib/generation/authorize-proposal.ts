import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Proposal } from "@/lib/types";

export type AuthorizeResult =
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>>; proposal: Proposal }
  | { ok: false; status: number; error: string };

// Both generate and regenerate-section (Section 12) require the caller to
// be the salesperson who owns the proposal.
export async function authorizeProposalOwner(proposalId: string): Promise<AuthorizeResult> {
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return { ok: false, status: 401, error: "Not signed in." };
  }

  if (profile.role !== "salesperson") {
    return { ok: false, status: 403, error: "Only a salesperson can generate proposal content." };
  }

  const supabase = await createClient();
  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .single();

  if (error || !proposal) {
    return { ok: false, status: 404, error: "Proposal not found." };
  }

  if (proposal.owner_id !== user.id) {
    return { ok: false, status: 403, error: "You do not own this proposal." };
  }

  return { ok: true, userId: user.id, supabase, proposal: proposal as Proposal };
}
