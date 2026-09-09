-- Section 2 export step needs somewhere to persist the two artifacts it
-- produces: a hosted proposal link ({{proposal_link}}, Section 5) and a
-- downloadable PDF. Section 4's `proposals` schema predates the
-- export/send stage and has no columns for either, so this adds the two
-- minimal ones needed — no other schema changes.
alter table public.proposals
  add column proposal_link text,
  add column pdf_url text;

-- Storage for the rendered PDFs (Section 2: "downloadable PDF... for the
-- 'Generated proposal sample' deliverable"). Public bucket: these are
-- approved, client-facing documents — the same content already reachable,
-- unauthenticated, at the hosted proposal link itself, gated by proposal
-- status rather than storage ACLs (see /p/[id]). Uploads only ever happen
-- server-side via the service role, which bypasses storage RLS, so no
-- INSERT policy is added here.
insert into storage.buckets (id, name, public)
values ('proposal-pdfs', 'proposal-pdfs', true)
on conflict (id) do nothing;
