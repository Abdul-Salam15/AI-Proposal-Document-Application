-- Deliverables/Timeline/Pricing now generate structured content (a bullet
-- list, a table of phase rows, a milestone breakdown) instead of a plain
-- paragraph, so a section's content can be a string, an array, or an
-- object. proposals.content is already jsonb and needs no change; but
-- proposal_versions.content was `text not null`, which can't hold anything
-- but a scalar string.
alter table public.proposal_versions
  alter column content type jsonb using to_jsonb(content);

-- to_jsonb(text) wraps each existing row's raw text as a jsonb string
-- scalar (e.g. 'Some prose.' -> '"Some prose."'), exactly matching how
-- prose values already sit in the jsonb proposals.content column — no data
-- loss, no reinterpretation. Existing [NEEDS INPUT: field] sentinel rows
-- become the jsonb string '"[NEEDS INPUT: field]"' (see the rate-limit
-- filter change in generate-section.ts, which now matches against this
-- ::text-cast, quoted form).

-- merge_proposal_content's p_content moves from text to jsonb so a
-- structured value can be merged in without double-encoding. This is a
-- signature change, not a body-only edit — `create or replace function`
-- only replaces a function with an IDENTICAL argument-type signature, so
-- changing an argument's type creates a second, overloaded function
-- instead of replacing the old one, which breaks PostgREST RPC dispatch
-- ("Could not choose the best candidate function") the next time it's
-- called. The old (uuid, text, text) overload is dropped explicitly below.
drop function if exists public.merge_proposal_content(uuid, text, text);

create or replace function public.merge_proposal_content(
  p_proposal_id uuid,
  p_section text,
  p_content jsonb
)
returns setof public.proposals
language sql
as $$
  update public.proposals
  set content = content || jsonb_build_object(p_section, p_content),
      status = case when status = 'pending_approval' then 'draft'::public.proposal_status else status end,
      updated_at = now()
  where id = p_proposal_id
  returning *;
$$;

-- Why jsonb_build_object(p_section, p_content) still works unchanged for
-- both scalar strings and structured values: jsonb_build_object's variadic
-- arguments are each converted via to_jsonb(), and to_jsonb() on an
-- already-jsonb input is the identity function — so a string stays a
-- quoted string, an array stays an array, an object stays an object, with
-- no double-encoding. Do not "fix" this by adding a stray ::text/to_jsonb()
-- cast around p_content; it would break structured sections.
