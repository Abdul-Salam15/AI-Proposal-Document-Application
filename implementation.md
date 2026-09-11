# Implementation Plan: AI Proposal / Document Application

## 1. Project Summary

This system replaces the manual, inconsistent process of writing client proposals after
discovery calls. It takes structured client/project inputs, uses the Claude API to generate
proposal content, allows a salesperson to review and revise that content, requires internal
approval before anything reaches the client, then delivers the final proposal and logs the
record centrally.

Core principle from the PRD: **a human stays in control before anything goes to the client.**

---

## 2. Tech Stack (Locked In)

| Layer | Choice | Why |
|---|---|---|
| **Frontend + Backend** | Next.js (App Router) | Single framework for UI and API routes — no separate backend service to deploy. API routes host the role-check logic and Claude API calls server-side. Deploys free on Vercel, giving a live application link with minimal setup. |
| **Database + Auth** | Supabase (Postgres) | Maps directly onto the schema in Section 4 (`users`, `proposals`, `proposal_versions`, `approvals`, `audit_log`). Built-in email/password auth. Row Level Security (RLS) enforces role-based access (e.g. salesperson sees only own proposals, admin sees all) at the database level, not just in the UI. Free tier is sufficient for this project. |
| **AI** | Claude API, called only from Next.js API routes (never client-side) | Keeps the API key server-side. Centralizes all cost-control logic (caching, regeneration limits, mock mode — see Section 11) in one place. |
| **Document Export** | HTML rendered to PDF server-side | Produces both a hosted proposal link (for `{{proposal_link}}` in the client email) and a downloadable PDF (for the "Generated proposal sample" deliverable). |
| **Email Delivery** | Resend (or manual copy-paste fallback) | Simple API with a generous free tier for sending the client email once approved. If avoiding another account, the email can instead be generated in-app for the salesperson to copy-paste and send manually — still satisfies Testing Scenario 6. |

**Rationale:** every component above has a free tier, minimizing infrastructure cost so the
limited budget can be reserved for the Claude API itself. This pairing (Next.js + Supabase) is
also common enough that AI coding assistance (Claude Code) has strong, current familiarity
with it, reducing time lost to framework-specific debugging within the one-week timeline.

---

## 3. Roles & Authorization

The application is a single dashboard whose available actions change based on the logged-in
user's role. Role checks are enforced on the backend, not just hidden in the UI.

| Role | Permissions |
|---|---|
| **Salesperson** | Create proposals, edit/regenerate individual sections, submit for approval, view own proposals |
| **Admin** | View all proposals regardless of owner, approve or reject a proposal pending approval with a comment (cannot edit proposal content), view the full audit log, manage user roles, view failure/error events, and override a stuck status if needed |

---

## 4. Data Model

### `users`
```
id, email, password_hash, name, role (salesperson | admin), created_at
```

### `proposals`
Fields map directly to the intake form fields provided in the project assets:

```
id
owner_id            (FK -> users)
client_name
client_email
company_name
date_of_call
salesperson_name
client_needs_summary
project_scope
goals_and_objectives
recommended_services
proposed_timeline
estimated_pricing
supporting_material   (optional file/notes, used for Testing Scenario 3)
status               (draft | pending_approval | approved | rejected | sent | failed)
content              (JSON, one key per proposal section)
created_at
updated_at
```

### `proposal_versions`
Preserves history so a single section can be regenerated without losing the rest of the
document (Testing Scenario 4).

```
id, proposal_id, section_name, content, generated_by (ai | human), created_at
```

### `approvals`
```
id, proposal_id, approver_id, decision (approved | rejected), comment, created_at
```

### `audit_log`
Central record of every meaningful action, so failures are debuggable (Testing Scenario 7)
and admins have full oversight.

```
id
actor_id
action        (e.g. proposal_created, section_regenerated, approved,
               rejected, email_sent, email_failed, export_failed)
target_id
metadata      (JSON)
created_at
```

---

## 5. Field Mapping (Intake -> Proposal -> Email)

Based on the intake fields, proposal template, and client email template provided.

| Proposal Template Placeholder | Source |
|---|---|
| `{{client_name}}` | Intake: `client_name` |
| `{{salesperson_name}}` | Intake: `salesperson_name` |
| `{{date_of_call}}` | Intake: `date_of_call` |
| `{{company_name}}` | Intake: `company_name` |
| `{{client_needs_summary}}` | Intake: `client_needs_summary` |
| `{{goals_and_objectives}}` | Intake: `goals_and_objectives` |
| `{{project_scope}}` | Intake: `project_scope` (direct) |
| `{{recommended_approach}}` | Derived by Claude from `recommended_services` + `project_scope` + `client_needs_summary` |
| `{{deliverables}}` | Derived by Claude from `recommended_services` + context |
| `{{proposed_timeline}}` | Intake: `proposed_timeline` (direct) |
| `{{estimated_pricing}}` | Intake: `estimated_pricing` (direct) |

| Client Email Placeholder | Source |
|---|---|
| `{{company_name}}` | Intake |
| `{{client_name}}` | Intake |
| `{{proposal_link}}` | Generated after export (hosted link or attached document reference) |
| `{{salesperson_name}}` | Intake |

**Note:** `{{recommended_approach}}` and `{{deliverables}}` are not explicit intake fields — they
are AI-derived. These two fields should be visually flagged in the review UI as
"AI-inferred" so the salesperson knows to verify them specifically before approving,
directly supporting Testing Scenario 2 (no unsupported assumptions going unnoticed).

---

## 6. Application Flow

```
1. Intake        -> Salesperson fills the intake form (fields above)
2. Generation    -> Claude API generates content per section, stored in `content` (JSON)
                     and versioned in `proposal_versions`
3. Review        -> Salesperson reviews, edits, or regenerates individual sections
                     (regeneration only replaces the targeted section)
4. Submission    -> Salesperson submits proposal; status -> pending_approval
5. Approval      -> Admin reviews and approves or rejects with comment;
                     recorded in `approvals` and `audit_log`
                     status -> approved or rejected
                     (No client delivery occurs before this step)
6. Delivery      -> On approval: proposal exported to a document, and the client
                     email is generated using the client email template;
                     status -> sent or failed
7. Logging       -> Every step above writes an `audit_log` entry, viewable in
                     full by Admin, and filtered to "own proposals" for Salesperson
```

---

## 7. Section-Level Generation Strategy

Rather than generating the whole proposal as a single block of text, each section is
generated (and regenerated) independently, keyed to match the `content` JSON structure:

- `introduction`
- `project_scope`
- `recommended_approach`
- `deliverables`
- `timeline`
- `pricing`
- `next_steps`

This allows Testing Scenario 4 (regenerate one section without affecting the rest) to be
handled by re-requesting a single key and writing a new `proposal_versions` row, rather than
re-running the entire generation and risking drift in unrelated sections.

---

## 8. Missing Information Handling (Testing Scenario 2)

If a required intake field is missing or too vague to generate a section confidently
(most likely `estimated_pricing`, `proposed_timeline`, or `project_scope`):

- Claude marks the affected section with a visible placeholder (e.g. `[NEEDS INPUT: pricing]`)
  rather than inventing a number, date, or scope detail.
- The review UI highlights any section containing this marker so the salesperson cannot
  miss it before submitting for approval.

---

## 9. Supporting Material Handling (Testing Scenario 3)

If supporting material (notes, prior proposals, reference documents) is attached to a
proposal, it is passed into the generation step as additional context so Claude can
incorporate it into the relevant section(s) rather than ignoring it.

---

## 10. Failure Handling (Testing Scenario 7)

Each of the following failure points writes a distinct `audit_log` action so failures are
debuggable rather than silent:

- Document/export generation failure -> `export_failed`
- Approval step failure -> logged with existing `approvals` + `audit_log` entry
- Email delivery failure -> `email_failed`
- Logging failure itself should surface as a visible error state in the dashboard,
  not fail silently

The proposal's `status` field reflects failure (`failed`) so it is visible on the dashboard,
not just buried in logs.

---

## 11. Edge Cases & Non-Functional Considerations

### 11.1 API Cost Control (priority — limited Claude API budget)

Since token budget is constrained, the build should minimize unnecessary API calls by design,
not as an afterthought:

- **Disable the trigger button while a request is in flight.** A section's "Regenerate"
  button must be disabled (not just visually, but functionally — ignore duplicate clicks)
  until the previous call resolves, to prevent accidental duplicate spend from double-clicks.
- **Cap regenerations per section.** Track a `regeneration_count` per section on each
  proposal. After a small fixed limit (e.g. 3 per section), require the salesperson to edit
  manually instead of calling the API again.
- **Cache identical requests.** If the same section is "regenerated" with no changed inputs,
  return the last cached version from `proposal_versions` instead of calling the API again.
- **Generate sections lazily, not all at once by default where avoidable.** If the UI allows
  it, only call the API for a section when it is first viewed or explicitly requested, rather
  than generating all seven sections for every proposal up front, especially during
  development/testing when proposals are created and discarded repeatedly.
- **Use a local mock mode during development.** While building and testing the UI/flow
  (forms, approval, logging, delivery), stub out the Claude API response with static sample
  text. Only switch to real API calls when specifically testing generation quality — this
  preserves the token budget for scenarios that actually need it (Testing Scenarios 1–3).
- **Truncate/summarize long supporting material before sending it as context** (Testing
  Scenario 3), since larger prompts cost more per call regardless of output length.
- **Log token usage per call in `audit_log` metadata.** Even a rough count lets you see which
  actions are consuming the most budget if costs run high unexpectedly.

### 11.2 Data & Correctness

- Placeholder/junk intake values (e.g. "TBD", "n/a", "-") should be treated as missing
  information and trigger the same `[NEEDS INPUT]` flagging as a blank field, not passed to
  Claude as if they were real content.
- Malformed or missing `client_email` should be validated before the delivery step is
  attempted (Testing Scenario 6), rather than relying on the email provider to reject it.
- Once a proposal reaches `pending_approval`, it should be locked from further edits until an
  approval decision is made, to avoid two people editing the same proposal at once.
- Approval succeeding and delivery succeeding are separate outcomes. A failed export or email
  send after approval should not force a full re-approval — status should distinguish
  `approved` (decision made) from `failed` (a downstream step broke), so retries are possible
  without re-doing the human review step.

### 11.3 Readability & Maintainability

- Keep all Claude prompt templates in one dedicated location (e.g. one file per proposal
  section), separate from application logic, so wording can be adjusted without touching
  generation code.
- Separate concerns into distinct modules: generation, review/approval, delivery, and
  auth/roles — even at small scale, this keeps the one-page documentation easy to write
  accurately.

### 11.4 Reusability

- Define proposal sections (name, prompt, required inputs) as a single config list rather
  than hardcoding each section separately, so adding, removing, or reordering a section later
  is a one-line change.
- Write one shared templating helper for filling placeholders (`{{field}}` -> value), and
  reuse it for both the proposal document and the client email, since both are the same
  underlying operation.

## 12. API Routes

All routes live under Next.js API routes (server-side), so the Claude API key never reaches
the browser and role checks happen before any database write. Role required is noted per
route; Supabase RLS provides a second layer of enforcement at the database level.

| Method & Path | Role Required | Purpose |
|---|---|---|
| `POST /api/auth/login` | Any | Authenticate via Supabase Auth |
| `POST /api/proposals` | Salesperson | Create a new proposal from intake fields; status set to `draft` |
| `GET /api/proposals` | Any (filtered) | List proposals — salesperson sees own only, admin sees all |
| `GET /api/proposals/[id]` | Owner or Admin | Fetch a single proposal's full content and version history |
| `PATCH /api/proposals/[id]` | Salesperson (owner) | Manually edit a section's content directly (no API call) |
| `POST /api/proposals/[id]/generate` | Salesperson (owner) | First-time generation of all sections (or a single section, via a `section` param) — writes to `content` and `proposal_versions` |
| `POST /api/proposals/[id]/regenerate-section` | Salesperson (owner) | Regenerate one section only; enforces the regeneration cap (Section 11.1) and writes a new `proposal_versions` row |
| `POST /api/proposals/[id]/submit` | Salesperson (owner) | Locks the proposal from further edits; status -> `pending_approval` |
| `POST /api/proposals/[id]/approve` | Admin | Records decision in `approvals`; status -> `approved` or `rejected` |
| `POST /api/proposals/[id]/export` | Salesperson or Admin (only after `approved`) | Renders the proposal to a hosted page + PDF; produces the `{{proposal_link}}` value |
| `POST /api/proposals/[id]/send` | Salesperson or Admin (only after `export` succeeds) | Sends the client email using the client email template; status -> `sent` or `failed` |
| `GET /api/audit-log` | Admin only | Full audit trail across all proposals and users |
| `GET /api/users` | Admin only | List users and their roles (for role management) |
| `PATCH /api/users/[id]` | Admin only | Change a user's role |

**Notes:**
- Every route above writes a corresponding `audit_log` entry on success *and* on failure
  (Section 10), using the `action` values already defined in the schema (e.g.
  `section_regenerated`, `approved`, `email_failed`).
- `export` and `send` are kept as separate routes (rather than one "deliver" step) so a failed
  email send can be retried without re-generating the document, and so `status` can
  distinguish `failed` at the export stage from `failed` at the send stage if finer-grained
  tracking is wanted later.
- `generate` and `regenerate-section` are the only two routes that call the Claude API —
  keeping this narrow makes the cost-control measures in Section 11.1 easy to apply
  consistently in one place.

---

## 13. Supabase Row Level Security (RLS) Policies

RLS enforces the same access rules from Section 12 at the database level, so a bug or bypass
in the Next.js API layer cannot expose data the user's role shouldn't see. `auth.uid()` refers
to the logged-in Supabase user; `role` is read from the `users` table via a helper function
`current_user_role()` for readability below.

### `proposals` table

| Operation | Policy |
|---|---|
| `SELECT` | Allowed if `owner_id = auth.uid()` **OR** `current_user_role() = 'admin'`. |
| `INSERT` | Allowed if `current_user_role() = 'salesperson'` **AND** `owner_id = auth.uid()` |
| `UPDATE` | Allowed if `owner_id = auth.uid()` **AND** `status IN ('draft')` — enforces the "locked once submitted" rule from Section 11.2 at the DB level, not just in application code. Admins get a separate `UPDATE` policy with no status restriction, to support the "override a stuck status" capability from Section 3. |
| `DELETE` | Not permitted for any role in production. Proposals are retained for audit purposes; a `status` change (e.g. to a `cancelled` state) is used instead of deletion if needed. |

### `proposal_versions` table

| Operation | Policy |
|---|---|
| `SELECT` | Allowed if the parent proposal's owner is `auth.uid()`, or `current_user_role() = 'admin'` |
| `INSERT` | Allowed only via the server-side `generate` / `regenerate-section` routes (service role), never directly from the client |
| `UPDATE` / `DELETE` | Not permitted — versions are append-only, preserving full history |

### `approvals` table

| Operation | Policy |
|---|---|
| `SELECT` | Allowed if the parent proposal's owner is `auth.uid()`, or `current_user_role() = 'admin'` |
| `INSERT` | Allowed only if `current_user_role() = 'admin'` **AND** `approver_id = auth.uid()` |
| `UPDATE` / `DELETE` | Not permitted — an approval decision is a permanent record; a reversal is a new row, not an edit |

### `audit_log` table

| Operation | Policy |
|---|---|
| `SELECT` | `current_user_role() = 'admin'` only, matching Section 3 |
| `INSERT` | Server-side only (service role) — every API route writes here directly, never via client-side calls |
| `UPDATE` / `DELETE` | Not permitted for any role — an audit log must be immutable to be trustworthy |

### `users` table

| Operation | Policy |
|---|---|
| `SELECT` | A user can read their own row; `current_user_role() = 'admin'` can read all rows |
| `UPDATE` | A user can update their own non-role fields (e.g. name); only `admin` can change the `role` column |
| `INSERT` / `DELETE` | Handled by Supabase Auth signup flow / admin user management, not exposed as a general policy |

**Why this matters:** the Next.js API routes in Section 12 are the primary place role logic
lives for good error messages and UX, but RLS is the actual security boundary. Even if an API
route had a bug, a salesperson's Supabase session key could never be used to directly query
another user's `draft` proposals or the `audit_log` table.

---

## 14. Design Brief

### Design rationale

This is an internal workflow tool where salespeople review and send real client-facing
documents, not a marketing site. The design leans into that: the proposal itself is treated
as the star and rendered like an actual letter, while the surrounding dashboard chrome stays
plain, dense, and administrative. Color is used only to carry proposal status — nothing else
competes with it for attention.

### Color palette — "Ledger"

| Token | Hex | Role |
|---|---|---|
| Ink | `#1B2430` | Primary text, sidebar/dashboard chrome |
| Paper | `#EFEBE1` | Main background, document background |
| Brass | `#A67C3A` | Status: Approved |
| Oxblood | `#7A2E2E` | Status: Rejected / Failed |
| Slate | `#5B7B96` | Status: Pending / In review |
| Rule | `#D6D0C0` | Hairline borders and dividers only — never a shadow |

Additional neutral used for the Draft status only: `#8B8879` (muted grey-brown, distinct from
the four semantic status colors above).

### Typography

| Role | Typeface | Notes |
|---|---|---|
| Dashboard chrome (nav, tables, labels, status text) | Public Sans | Plain, administrative register — deliberately not a startup/marketing sans |
| Proposal document content | Source Serif 4 | Used only inside the document/review panel, so the proposal reads like an actual letter, not a form |

Two weights only: 400 regular, 500 medium. No bold/700 anywhere in the interface.

### Layout

- **Proposal list view:** left sidebar (fixed width, Ink background) for navigation, dense
  left-aligned table for the main list. Rows separated by hairlines only — no cards, no drop
  shadows, no rounded-corner sameness. Each row shows a small colored status dot (see palette)
  next to the status label.
- **Proposal review view:** the document itself is centered and narrower than the surrounding
  frame, set in the serif typeface, sitting on a slightly darker paper backdrop so it visually
  separates from the flat dashboard chrome — the one deliberate contrast point in the whole
  design.
- **AI-inferred fields** (`recommended_approach`, `deliverables` — see Section 5) are marked
  with a small outlined "AI-inferred" tag in Brass, directly in the document view, so the
  salesperson knows exactly which sections to double-check before approving.

### Principles

1. The proposal review screen should look like the actual paper being sent, not a form.
2. Color encodes status, and status only — it is never used decoratively.
3. Lists are dense tables, not card grids — this is a workflow tool, not a portfolio.
4. One moment of contrast carries the design: the document panel against the plain dashboard
   chrome around it. Everything else stays quiet and disciplined.
5. Motion, where used at all, is limited to a single moment (e.g. a status change highlight)
   — no hover-lift effects scattered across every row or card.

### What this deliberately avoids

No cream-and-terracotta or dark-and-neon "AI-generated" defaults, no SaaS card grid with
uniform shadows, no ALL-CAPS eyebrow labels, no numbered 01/02/03 badges (status is shown as
color, not sequence, since the pipeline isn't always linear — a proposal can be rejected and
re-drafted).

---

## 15. Deliverables Checklist (from PRD)

- [x] Application link: https://ai-proposal-generator-iota.vercel.app
- [x] Generated proposal sample: https://kbckcoqfnxqohzgfzmvc.supabase.co/storage/v1/object/public/proposal-pdfs/1c707521-edfa-47a1-a80a-3cc8c474b097.pdf
- [x] Testing evidence table (all 7 scenarios)
- [ ] Video walkthrough (Loom)
- [x] Reflection sheet
- [x] One-page documentation
