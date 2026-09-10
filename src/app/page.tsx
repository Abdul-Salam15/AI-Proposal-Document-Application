import Link from "next/link";
import { getSession } from "@/lib/auth";

const STEPS = [
  {
    title: "Capture the call",
    body: "A salesperson logs the client, company, and call details right after the conversation — needs, goals, scope, timeline, pricing.",
  },
  {
    title: "AI drafts the proposal",
    body: "Claude generates each section of the proposal from that intake — recommended approach, deliverables, pricing, and the rest — ready to review.",
  },
  {
    title: "Review, edit, approve",
    body: "The salesperson edits or regenerates any section, then submits it. An admin signs off before anything reaches a client.",
  },
  {
    title: "Export and deliver",
    body: "Once approved, the proposal exports to a hosted page and PDF, and sends straight to the client's inbox.",
  },
];

export default async function Home() {
  const { profile } = await getSession();
  const isSignedIn = Boolean(profile);

  return (
    <div className="flex flex-1 flex-col items-center bg-paper px-8 py-20 font-sans text-ink">
      <div className="flex max-w-2xl flex-col items-center gap-4 text-center">
        <p className="text-sm font-medium text-slate">Internal tool</p>
        <h1 className="text-3xl font-medium">AI Proposal Generator</h1>
        <p className="text-base text-ink/70">
          Turns a sales call into a drafted, reviewed, and approved client
          proposal — with AI writing the first pass so your team edits
          instead of starting from a blank page.
        </p>
        <Link
          href={isSignedIn ? "/dashboard" : "/login"}
          className="mt-4 bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          {isSignedIn ? "Go to dashboard" : "Sign in"}
        </Link>
      </div>

      <div className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-8 border-t border-rule pt-12 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <div key={step.title} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium tracking-wide text-slate">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="font-medium">{step.title}</p>
            <p className="text-sm text-ink/70">{step.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-16 text-sm text-ink/50">
        Accounts are set up by an admin — there&apos;s no public sign-up.
      </p>
    </div>
  );
}
