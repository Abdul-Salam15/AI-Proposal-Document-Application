import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getSession } from "@/lib/auth";
import { renderProposalPdf } from "@/lib/delivery/render-pdf";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Export is allowed once approved, and again on retry after a prior export
// failure (Section 11.2: a failed downstream step shouldn't force
// re-approval — "approved" stays the decision of record, "failed" just
// marks that a later step broke and can be retried).
const EXPORTABLE_STATUSES = ["approved", "failed"];

// POST /api/proposals/[id]/export — Section 12: renders the proposal to a
// hosted page + PDF; produces the {{proposal_link}} value. Salesperson,
// approver, or admin — only after approved.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, profile } = await getSession();

  if (!user || !profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: proposal, error: fetchError } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  if (!EXPORTABLE_STATUSES.includes(proposal.status)) {
    return NextResponse.json(
      { error: "Only an approved proposal can be exported." },
      { status: 409 }
    );
  }

  const origin = new URL(request.url).origin;
  const proposalLink = `${origin}/p/${id}`;
  const service = createServiceClient();

  try {
    const pdfBuffer = await renderProposalPdf(proposalLink);

    const { error: uploadError } = await service.storage
      .from("proposal-pdfs")
      .upload(`${id}.pdf`, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrlData } = service.storage.from("proposal-pdfs").getPublicUrl(`${id}.pdf`);

    const { data: updated, error: updateError } = await service
      .from("proposals")
      .update({
        proposal_link: proposalLink,
        pdf_url: publicUrlData.publicUrl,
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    const logged = await writeAuditLog({
      actorId: user.id,
      action: "proposal_exported",
      targetId: id,
      metadata: { proposalLink, pdfUrl: publicUrlData.publicUrl },
    });

    return NextResponse.json({
      proposal: updated,
      ...(logged ? {} : { auditLogWarning: "Export succeeded, but the audit log entry failed to record. Contact an admin." }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed.";

    // Section 10: export failure -> status reflects it, not just the log.
    await service
      .from("proposals")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", id);

    const logged = await writeAuditLog({
      actorId: user.id,
      action: "export_failed",
      targetId: id,
      metadata: { error: message },
    });

    return NextResponse.json(
      {
        error: message,
        ...(logged ? {} : { auditLogWarning: "This failure could not be recorded in the audit log. Contact an admin." }),
      },
      { status: 500 }
    );
  }
}
