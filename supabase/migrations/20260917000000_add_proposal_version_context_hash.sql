-- This column lets generate-section.ts record a hash of the intake context
-- that produced each AI version, as provenance on the row.
--
-- It was originally meant to gate a cache (skip calling Claude again when
-- regenerated with no changed inputs — see Section 11.1), but that made
-- Regenerate silently no-op whenever nothing had changed, with no visible
-- feedback that the click was even received. Per product decision,
-- Regenerate now always calls Claude again (bounded by generate-section.ts's
-- rolling rate limit instead) rather than serving a prior version. Nullable
-- since existing rows predate this column.
alter table public.proposal_versions
  add column context_hash text;
