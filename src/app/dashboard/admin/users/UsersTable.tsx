"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@/lib/types";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  created_at: string;
};

const ROLES: UserRole[] = ["salesperson", "approver", "admin"];

export default function UsersTable() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/users");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load users.");
        }

        if (!cancelled) {
          setUsers(data.users as UserRow[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load users.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRoleChange(id: string, role: UserRole) {
    if (savingId) return;
    setSavingId(id);
    setRowErrors((prev) => ({ ...prev, [id]: "" }));

    try {
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await response.json();

      if (!response.ok) {
        setRowErrors((prev) => ({ ...prev, [id]: data.error ?? "Update failed." }));
        return;
      }

      setUsers((prev) =>
        prev ? prev.map((u) => (u.id === id ? { ...u, role: data.user.role } : u)) : prev
      );
    } catch {
      setRowErrors((prev) => ({ ...prev, [id]: "Unable to reach the server." }));
    } finally {
      setSavingId(null);
    }
  }

  if (error) {
    return <p className="text-sm text-oxblood">{error}</p>;
  }

  if (users === null) {
    return <p className="text-sm text-ink/60">Loading…</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-rule text-xs tracking-wide text-ink/50">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Role</th>
            <th className="py-2 pr-4 font-medium">Joined</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-rule">
              <td className="py-2 pr-4">{user.name || "—"}</td>
              <td className="py-2 pr-4">{user.email}</td>
              <td className="py-2 pr-4">
                <select
                  value={user.role}
                  disabled={savingId === user.id}
                  onChange={(event) => handleRoleChange(user.id, event.target.value as UserRole)}
                  className="border border-rule bg-paper px-2 py-1 text-sm text-ink disabled:opacity-50"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {rowErrors[user.id] && (
                  <p className="mt-1 text-xs text-oxblood">{rowErrors[user.id]}</p>
                )}
              </td>
              <td className="py-2 pr-4">{new Date(user.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
