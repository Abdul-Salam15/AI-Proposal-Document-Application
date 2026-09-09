import { getSession } from "@/lib/auth";

export default async function DashboardPage() {
  const { profile } = await getSession();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate">Signed in</p>
      <h1 className="text-2xl font-medium">
        Welcome{profile?.name ? `, ${profile.name}` : ""}
      </h1>
      <p className="max-w-md text-sm text-ink/70">
        {profile
          ? `Role: ${profile.role}. `
          : ""}
        This confirms the authenticated shell and role lookup are working.
        The proposal dashboard itself isn&apos;t built yet.
      </p>
    </div>
  );
}
