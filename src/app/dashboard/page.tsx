import { getSession } from "@/lib/auth";
import ProposalTable from "./ProposalTable";

export default async function DashboardPage() {
  const { profile } = await getSession();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-slate">
          {profile?.role === "salesperson" && "Your proposals"}
          {profile?.role === "admin" && "All proposals"}
        </p>
        <h1 className="text-2xl font-medium">Proposals</h1>
      </div>

      <ProposalTable />
    </div>
  );
}
