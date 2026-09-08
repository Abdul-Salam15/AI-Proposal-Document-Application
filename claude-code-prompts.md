# Claude Code Build Prompts — Staged

How to use this file: paste **one stage at a time** into Claude Code. Validate the result
before moving to the next stage. Every prompt below is scoped strictly to what's written in
`implementation.md` (place that file in your repo root before starting — reference it in
each prompt). None of these prompts introduce features, pages, tables, or tools beyond what
`implementation.md` already specifies.

Each prompt ends with an instruction to stop and wait for your review — do not let Claude
Code continue to the next stage on its own.

Every prompt also tells Claude Code not to run any git commands itself. Instead, at the end
of each stage, Claude Code will give you the exact `git add`, `git commit`, and `git push`
commands to paste into your terminal yourself. You stay in full control of what gets
committed and pushed, and when.

---

## Stage 1 — Project scaffold

```
Read implementation.md in this repo before doing anything else. It is the single source of
truth for this project — do not add any feature, page, table, route, or tool that isn't
described in it.

Set up the project scaffold using exactly the stack in Section 2 (Tech Stack):
- Next.js with the App Router
- Supabase client configured for both database and auth (do not write any schema yet —
  that's the next stage)
- Tailwind for styling, with the color tokens from Section 14 (Design Brief) added as CSS
  variables: Ink #1B2430, Paper #EFEBE1, Brass #A67C3A, Oxblood #7A2E2E, Slate #5B7B96,
  Rule #D6D0C0, plus the muted grey-brown #8B8879 used only for the Draft status
- Load Public Sans (dashboard chrome) and Source Serif 4 (proposal document content) as
  described in Section 14

Do not build any pages, forms, or database tables yet. Just get the project running locally
with the design tokens and fonts wired up and confirmed visible on a blank placeholder page.

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review before continuing to the next stage.
```

---

## Stage 2 — Database schema + RLS

```
Read implementation.md again before this stage.

Using Section 4 (Data Model) exactly as written, create the Supabase Postgres schema for:
- users
- proposals
- proposal_versions
- approvals
- audit_log

Use the exact fields and types implied in Section 4 — do not add extra columns, tables, or
indexes beyond what's listed there.

Then apply the Row Level Security policies exactly as described in Section 13 (Supabase Row
Level Security Policies), for all five tables and all operations (SELECT, INSERT, UPDATE,
DELETE) listed there. Do not add any policy or exception that isn't described in Section 13.

Do not build any UI or API routes yet.

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review the schema and policies before continuing.
```

---

## Stage 3 — Auth and roles

```
Read implementation.md again before this stage.

Implement authentication using Supabase Auth (email/password), and wire up the three roles
from Section 3 (Roles & Authorization): salesperson, approver, admin. A user's role lives on
the users table created in Stage 2 — do not invent a separate roles table or permission
system beyond what Section 3 and Section 13 describe.

Build only:
- A login page
- A basic authenticated shell/layout that reads the current user's role and will later be
  used to conditionally show/hide actions (per Section 3's permissions table) — but do not
  build the dashboard content itself yet

Do not build the proposal list, intake form, or any other page yet.

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review before continuing.
```

---

## Stage 4 — Intake form, proposal creation, and list view

```
Read implementation.md again before this stage.

Build exactly these two things, using Section 5 (Field Mapping) for the intake fields and
Section 12 (API Routes) for the endpoints:

1. An intake form for the salesperson role containing exactly the fields listed as "Intake"
   sources in Section 5's field mapping tables: client_name, client_email, company_name,
   date_of_call, salesperson_name, client_needs_summary, project_scope,
   goals_and_objectives, recommended_services, proposed_timeline, estimated_pricing, plus
   the supporting_material field from Section 4's proposals table (Section 9 describes its
   purpose — do not build the AI usage of it yet, just the input field and storage).

   Submitting this form should call POST /api/proposals exactly as described in Section 12,
   creating a proposal row with status "draft". Do not call the Claude API in this stage.

2. A proposal list view matching Section 14's layout description (left sidebar, dense
   left-aligned table, hairline row dividers, small colored status dot per row using the
   palette from Section 14: Slate for pending, Brass for approved, Oxblood for
   rejected/failed, the muted grey-brown for draft). Use GET /api/proposals from Section 12,
   filtered by role exactly as that table describes (salesperson sees own only, approver
   sees pending_approval, admin sees all).

Do not build the review/document screen, generation, approval, export, or delivery yet.

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review before continuing.
```

---

## Stage 5 — Claude API generation

```
Read implementation.md again before this stage.

Implement proposal generation using only what's described in Section 6 (Section-Level
Generation Strategy), Section 7 (Missing Information Handling), Section 9 (Supporting
Material Handling), Section 11.1 (API Cost Control), and Section 12's generate and
regenerate-section routes. Do not add any capability beyond what these sections describe.

Specifically:
- Generate each of the seven sections independently (introduction, project_scope,
  recommended_approach, deliverables, timeline, pricing, next_steps), writing to the
  proposal's content JSON and creating a row in proposal_versions per Section 4's schema.
- If a required intake field is missing or too vague (per Section 7), the generated section
  must contain a visible marker like [NEEDS INPUT: pricing] instead of an invented value.
- If supporting_material is present on the proposal, include it as context in the
  generation call per Section 9.
- Implement every cost control listed in Section 11.1: disable the trigger while a request
  is in flight, cap regenerations per section with a stored count, cache and reuse
  identical repeated requests instead of re-calling the API, and support a local mock mode
  that returns static placeholder text instead of calling the real Claude API (default to
  mock mode; real API calls should require an explicit flag/env setting).
- Log a rough token count per call into audit_log metadata, as described in Section 11.1.

Do not build the review/document UI in this stage — just the generation logic and routes.

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review before continuing.
```

---

## Stage 6 — Review / document screen

```
Read implementation.md again before this stage.

Build the proposal review screen exactly as described in Section 14 (Design Brief): the
document is centered, narrower than the surrounding frame, set in Source Serif 4, sitting on
a slightly darker paper backdrop than the dashboard chrome around it. The dashboard chrome
(sidebar, labels) stays in Public Sans per the same section.

The screen must show the seven sections from Section 6, allow inline editing of any
section's content directly (PATCH /api/proposals/[id] from Section 12), and allow
regenerating a single section via the regenerate-section route from Stage 5 without
affecting the other sections.

Per Section 5's note, the recommended_approach and deliverables sections (since they are
AI-derived rather than direct intake fields) must show a small outlined "AI-inferred" tag in
Brass, exactly as described in Section 14.

Any section containing a [NEEDS INPUT: ...] marker (Section 7) must be visibly highlighted
so it can't be missed before submission.

Do not build the submit/approval/export/send functionality yet — only review and edit.

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review before continuing.
```

---

## Stage 7 — Submission and approval

```
Read implementation.md again before this stage.

Implement exactly the submission and approval steps from Section 6 (Application Flow, steps
4–5), Section 12's submit and approve routes, and Section 13's RLS rule that a proposal is
locked from further edits once status is not "draft".

- A "Submit for approval" action for the salesperson (owner) that moves status to
  pending_approval and locks editing, per Section 13.
- An approval view for the approver/admin role showing proposals with status
  pending_approval (per Section 12's GET /api/proposals filtering), where they can approve
  or reject with a comment, writing to the approvals table (Section 4) and audit_log.
  Do not add any additional approval states beyond approved/rejected described in Section 4.

Do not build export or delivery yet.

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review before continuing.
```

---

## Stage 8 — Export and delivery

```
Read implementation.md again before this stage.

Implement only what Section 6 (steps 6), Section 12 (export and send routes), and Section 5
(Field Mapping — Client Email Placeholder table) describe:

- An export step, available only once a proposal's status is "approved", that renders the
  proposal to a hosted page and a PDF, per Section 2's Tech Stack choice (HTML rendered to
  PDF server-side). This produces the proposal_link value.
- A send step that fills the client email template exactly as mapped in Section 5
  (subject "Proposal for {{company_name}}", using client_name, proposal_link, and
  salesperson_name), and sends it using the email approach from Section 2 (Resend, or the
  manual copy-paste fallback if Resend isn't configured).
- Both steps must update proposal status to sent or failed as described in Section 6, and
  write distinct audit_log actions (export_failed, email_sent, email_failed) as described in
  Section 10 (Failure Handling) and Section 12's notes on why export and send are kept as
  separate routes.

Do not build the admin audit log view yet.

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review before continuing.
```

---

## Stage 9 — Admin oversight

```
Read implementation.md again before this stage.

Build only the admin-facing views described in Section 3 (Roles & Authorization) and
Section 12's audit-log and users routes:
- A full audit log view (GET /api/audit-log), visible only to the admin role per Section 13.
- A view of all proposals regardless of owner, already supported by the filtering described
  in Section 12's GET /api/proposals for the admin role — surface this in a dedicated admin
  view if it isn't already reachable from the existing list view.
- A basic user/role management view (GET and PATCH /api/users) limited to changing a user's
  role, per Section 12 and Section 13's users table policy.

Do not add any admin capability beyond what these sections describe (e.g. do not add
analytics, exports, or settings screens not mentioned in implementation.md).

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review before continuing.
```

---

## Stage 10 — Failure handling pass and PRD testing scenarios

```
Read implementation.md again before this stage, along with the "Testing" section of PRD.md.

Do not add new features. This stage is a review and hardening pass only, checking the
already-built application against Section 10 (Failure Handling) and the seven testing
scenarios in PRD.md:

1. Normal Proposal Generation
2. Missing Information
3. Supporting Material
4. Section Regeneration
5. Human Approval
6. Final Delivery and Logging
7. Failure Handling

For each scenario, confirm the existing implementation already satisfies it per the relevant
section of implementation.md (referenced in Stages 1–9 above). Where a gap exists, fix it
using only the behavior already specified in implementation.md — do not introduce new
behavior to patch a gap. Flag anything that would require a new decision not covered in
implementation.md instead of inventing one.

Do not run any git commands yourself (no add, commit, or push) — I will commit and push
manually. Once this stage is done, give me the exact git commands to run in my terminal,
with a concise, descriptive commit message for this stage.

Stop here and let me review before we prepare the deliverables from Section 15.
```
