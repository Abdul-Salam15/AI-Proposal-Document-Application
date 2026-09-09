import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AuditLogTable from "./AuditLogTable";

export default async function AuditLogPage() {
  const { profile } = await getSession();

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-slate">Admin</p>
        <h1 className="text-2xl font-medium">Audit log</h1>
      </div>
      <AuditLogTable />
    </div>
  );
}
