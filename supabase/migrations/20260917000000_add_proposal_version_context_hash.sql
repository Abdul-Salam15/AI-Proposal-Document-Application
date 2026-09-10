-- Section 11.1 literally conditions caching on "no changed inputs": "If the
-- same section is 'regenerated' with no changed inputs, return the last
-- cached version ... instead of calling the API again." The cache check
-- never actually verified that — it served the latest 'ai' version
-- unconditionally, so editing any intake field (e.g. pricing to "TBD") and
-- clicking Regenerate silently returned the old cached text for every
-- section, not just the one whose required field changed (every section's
-- prompt is built from the *same* full intake context, not just its own
-- required field).
--
-- This column lets generate-section.ts record a hash of the context used to
-- produce each AI version, and compare it against the current context
-- before deciding to serve the cache. Nullable: existing rows predate this
-- and are treated as a cache miss (safe default — one extra regenerate
-- rather than silently trusting an unverifiable cache).
alter table public.proposal_versions
  add column context_hash text;
