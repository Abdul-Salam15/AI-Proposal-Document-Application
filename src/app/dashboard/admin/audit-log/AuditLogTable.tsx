"use client";

import { useEffect, useState } from "react";

type AuditLogEntry = {
  id: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: { name: string | null; email: string } | null;
};

export default function AuditLogTable() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/audit-log");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load the audit log.");
        }

        if (!cancelled) {
          setEntries(data.entries as AuditLogEntry[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load the audit log.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-oxblood">{error}</p>;
  }

  if (entries === null) {
    return <p className="text-sm text-ink/60">Loading…</p>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-ink/60">No audit log entries yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-rule text-xs tracking-wide text-ink/50">
            <th className="py-2 pr-4 font-medium">Time</th>
            <th className="py-2 pr-4 font-medium">Actor</th>
            <th className="py-2 pr-4 font-medium">Action</th>
            <th className="py-2 pr-4 font-medium">Target</th>
            <th className="py-2 pr-4 font-medium">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-rule align-top">
              <td className="whitespace-nowrap py-2 pr-4">
                {new Date(entry.created_at).toLocaleString()}
              </td>
              <td className="py-2 pr-4">
                {entry.actor?.name || entry.actor?.email || entry.actor_id}
              </td>
              <td className="py-2 pr-4">{entry.action}</td>
              <td className="py-2 pr-4 font-mono text-xs text-ink/60">
                {entry.target_id ?? "—"}
              </td>
              <td className="py-2 pr-4 font-mono text-xs text-ink/60">
                {Object.keys(entry.metadata ?? {}).length > 0
                  ? JSON.stringify(entry.metadata)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
