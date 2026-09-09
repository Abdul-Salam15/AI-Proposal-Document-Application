import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import IntakeForm from "./IntakeForm";

export default async function NewProposalPage() {
  const { profile } = await getSession();

  if (profile?.role !== "salesperson") {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-slate">
          ← Proposals
        </Link>
        <h1 className="mt-1 text-2xl font-medium">New proposal</h1>
      </div>
      <IntakeForm />
    </div>
  );
}
