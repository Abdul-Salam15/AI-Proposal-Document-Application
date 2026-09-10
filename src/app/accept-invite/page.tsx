"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Landing target for the invite email's link (set as `redirectTo` in
// /api/users/invite). The Supabase browser client detects the invite's
// tokens in the URL on init (detectSessionInUrl, on by default) and signs
// the invited user in — this page just waits for that, then lets them set
// the password they'll use to sign in normally afterward.
export default function AcceptInvitePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "invalid">("loading");
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Supabase's own verify step can fail before it ever issues a session —
    // an already-used, expired, or malformed invite token — and reports why
    // via `error`/`error_description` in the query string or hash fragment
    // rather than granting a session at all. Surface that reason directly
    // instead of falling through to the generic timeout below, since it's
    // the difference between "ask for a new invite" and "this link was
    // already used" (often by an email/link-scanner opening it first).
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorDescription =
      params.get("error_description") ?? hashParams.get("error_description");
    const errorCode = params.get("error_code") ?? hashParams.get("error_code");

    if (errorDescription || errorCode) {
      setInvalidReason((errorDescription ?? errorCode)!.replace(/\+/g, " "));
      setStatus("invalid");
      return;
    }

    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION fires for a session that already existed before this
      // page loaded (e.g. someone still logged in as admin in this same
      // browser, testing an invite link) — that must never be mistaken for
      // this invite having succeeded. Only SIGNED_IN means a session was
      // just newly established from this page's own URL, which is the only
      // evidence that this specific invite token was actually valid. Getting
      // this wrong lets "set your password" apply to the WRONG account —
      // exactly what happened here: an admin's own password got silently
      // overwritten while testing someone else's invite link.
      if (event === "SIGNED_IN" && session) {
        setStatus("ready");
      }
    });

    const timeout = setTimeout(() => {
      setStatus((prev) => (prev === "loading" ? "invalid" : prev));
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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

        {status === "loading" && <p className="text-sm text-ink/60">Checking your invite…</p>}

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
              &quot;previewed&quot; it and used up the one-time link before you clicked it —
              open the original invite email directly instead.
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
