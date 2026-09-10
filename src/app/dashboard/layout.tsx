import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signOutAction } from "./actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getSession();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen font-sans">
      <aside className="flex w-60 shrink-0 flex-col justify-between bg-ink px-6 py-8 text-paper">
        <div className="flex flex-col gap-8">
          <div>
            <p className="text-sm font-medium">AI Proposal</p>
            <p className="mt-1 text-xs text-paper/60">Generator</p>
          </div>

          <nav className="flex flex-col gap-1 text-sm">
            <Link
              href="/dashboard"
              className="px-1 py-1 text-paper/80 transition-colors hover:text-paper"
            >
              Proposals
            </Link>
            {profile?.role === "salesperson" && (
              <Link
                href="/dashboard/proposals/new"
                className="px-1 py-1 text-paper/80 transition-colors hover:text-paper"
              >
                New proposal
              </Link>
            )}
            {profile?.role === "admin" && (
              <>
                <Link
                  href="/dashboard/admin/audit-log"
                  className="px-1 py-1 text-paper/80 transition-colors hover:text-paper"
                >
                  Audit log
                </Link>
                <Link
                  href="/dashboard/admin/users"
                  className="px-1 py-1 text-paper/80 transition-colors hover:text-paper"
                >
                  Users
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-paper/20 pt-4 text-sm">
          {profile ? (
            <div>
              <p className="font-medium">{profile.name || profile.email}</p>
              <p className="text-xs text-paper/60">{profile.role}</p>
            </div>
          ) : (
            <p className="text-xs text-paper/60">
              Signed in as {user.email}. Your account has no role assigned
              yet — ask an admin to finish setting it up.
            </p>
          )}

          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full border border-paper/30 px-3 py-2 text-left text-sm text-paper transition-colors hover:border-paper/60 hover:bg-paper/10"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 bg-paper px-10 py-8 text-ink">{children}</main>
    </div>
  );
}
