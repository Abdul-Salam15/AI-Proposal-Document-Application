import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import UsersTable from "./UsersTable";

export default async function UsersPage() {
  const { user, profile } = await getSession();

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-slate">Admin</p>
        <h1 className="text-2xl font-medium">Users</h1>
      </div>
      <UsersTable currentUserId={user!.id} />
    </div>
  );
}
