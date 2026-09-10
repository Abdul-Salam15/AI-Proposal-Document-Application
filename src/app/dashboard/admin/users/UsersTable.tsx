"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { UserRole } from "@/lib/types";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  created_at: string;
};

const ROLES: UserRole[] = ["salesperson", "admin"];

export default function UsersTable({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  async function handleDelete(id: string, email: string) {
    if (deletingId) return;
    if (!window.confirm(`Delete ${email}? They will no longer be able to sign in. This cannot be undone.`)) {
      return;
    }

    setDeletingId(id);
    setRowErrors((prev) => ({ ...prev, [id]: "" }));

    try {
      const response = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) {
        setRowErrors((prev) => ({ ...prev, [id]: data.error ?? "Delete failed." }));
        return;
      }

      setUsers((prev) => (prev ? prev.filter((u) => u.id !== id) : prev));
    } catch {
      setRowErrors((prev) => ({ ...prev, [id]: "Unable to reach the server." }));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <InviteUserForm onInvited={(invited) => setUsers((prev) => (prev ? [...prev, invited] : [invited]))} />

      {error && <p className="text-sm text-oxblood">{error}</p>}
      {!error && users === null && <p className="text-sm text-ink/60">Loading…</p>}
      {!error && users !== null && users.length === 0 && (
        <p className="text-sm text-ink/60">No users yet.</p>
      )}
      {!error && users !== null && users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-xs tracking-wide text-ink/50">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Joined</th>
                <th className="py-2 pr-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-rule transition-colors hover:bg-paper-shade"
                >
                  <td className="py-2 pr-4">{user.name || "—"}</td>
                  <td className="py-2 pr-4">{user.email}</td>
                  <td className="py-2 pr-4">
                    <select
                      value={user.role}
                      disabled={savingId === user.id}
                      onChange={(event) => handleRoleChange(user.id, event.target.value as UserRole)}
                      className="border border-rule bg-paper px-2 py-1 text-sm text-ink transition-colors hover:border-ink/40 focus:border-slate disabled:pointer-events-none disabled:opacity-50"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">
                    {user.id !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => handleDelete(user.id, user.email)}
                        disabled={deletingId === user.id}
                        className="border border-oxblood px-2 py-1 text-xs text-oxblood transition-colors hover:bg-oxblood hover:text-paper disabled:pointer-events-none disabled:opacity-50"
                      >
                        {deletingId === user.id ? "Deleting…" : "Delete"}
                      </button>
                    )}
                    {rowErrors[user.id] && (
                      <p className="mt-1 text-xs text-oxblood">{rowErrors[user.id]}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InviteUserForm({ onInvited }: { onInvited: (user: UserRow) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>(ROLES[0]);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isInviting) return;

    setIsInviting(true);
    setError(null);
    setAuditWarning(null);
    setSuccessEmail(null);

    try {
      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, role }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Invite failed.");
        return;
      }

      if (data.auditLogWarning) {
        setAuditWarning(data.auditLogWarning);
      }

      onInvited(data.user as UserRow);
      setSuccessEmail(email);
      setEmail("");
      setName("");
      setRole(ROLES[0]);
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setIsInviting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3 border border-rule bg-paper-shade p-4 font-sans text-sm"
    >
      <p className="text-ink/70">
        Invite a new user by email — they&apos;ll get a link to set their password and sign in.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="border border-rule bg-paper px-2 py-1.5 text-sm text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
          />
        </label>
        <label className="flex flex-col gap-1">
          Name (optional)
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="border border-rule bg-paper px-2 py-1.5 text-sm text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
          />
        </label>
        <label className="flex flex-col gap-1">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            className="border border-rule bg-paper px-2 py-1.5 text-sm text-ink transition-colors hover:border-ink/40 focus:border-slate"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={isInviting}
          className="bg-ink px-3 py-1.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isInviting ? "Sending…" : "Send invite"}
        </button>
      </div>
      {error && <p className="text-oxblood">{error}</p>}
      {auditWarning && <p className="text-oxblood">{auditWarning}</p>}
      {successEmail && <p className="text-slate">Invite sent to {successEmail}.</p>}
    </form>
  );
}
