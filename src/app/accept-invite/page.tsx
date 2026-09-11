"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Landing target for the invite email's link (built in /api/users/invite from
// admin.generateLink's hashed_token, not Supabase's own mailer). Deliberately
// does NOT verify the token on page load — Supabase's own invite links used
// to die on any HTTP GET (including an email/chat link-scanner prefetching
// the URL before the recipient ever opened it), because that consumed the
// one-time token via Supabase's /verify endpoint with no user action
// involved. Here the token is only spent inside handleSubmit, in response to
// the user actually setting a password — a bare pageview (bot or human) is
// inert.
export default function AcceptInvitePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"ready" | "invalid">("ready");
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenHash, setTokenHash] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get("token_hash");
    const type = params.get("type");

    if (!hash || type !== "invite") {
      setStatus("invalid");
      return;
    }

    setTokenHash(hash);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const supabase = createClient();

    // Checking for an existing session first means a retry after a
    // validation error above doesn't try to spend the (already one-time)
    // token a second time.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      if (!tokenHash) {
        setStatus("invalid");
        setIsSubmitting(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "invite",
      });

      if (verifyError) {
        setInvalidReason(verifyError.message);
        setStatus("invalid");
        setIsSubmitting(false);
        return;
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-paper px-4 font-sans text-ink">
      <div className="w-full max-w-sm border border-rule px-8 py-10">
        <h1 className="mb-1 text-xl font-medium">Set your password</h1>
        <p className="mb-8 text-sm text-ink/60">AI Proposal Generator</p>

        {status === "invalid" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-oxblood">
              This invite link is invalid or has expired. Ask an admin to send you a new one.
            </p>
            {invalidReason && (
              <p className="text-xs text-ink/50">Reason from Supabase: {invalidReason}</p>
            )}
            <p className="text-xs text-ink/50">
              If you opened this link from a forwarded message or a chat app, that app may have
              &quot;previewed&quot; it — try opening the original invite email directly instead.
            </p>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Confirm password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors hover:border-ink/30 focus:border-slate"
              />
            </label>

            {error && <p className="text-sm text-oxblood">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Set password and continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
