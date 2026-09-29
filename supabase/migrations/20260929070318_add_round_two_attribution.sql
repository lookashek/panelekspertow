-- FR-004 (round-two score changes are attributed to the peer argument that caused them) —
-- additive, forward-only migration. Adds nullable attribution columns to `advisor_opinions` so a
-- round-two row can record what changed and who caused it, without touching round-one rows or the
-- existing `unique(session_id, persona_id, round_number)` key. No new RLS policies: these columns
-- are covered by the table's existing per-op policies (see the create migration).

alter table advisor_opinions
  add column previous_score integer,
  add column attributed_persona_id text check (attributed_persona_id in ('optymista', 'sceptyk', 'pragmatyk', 'analityk')),
  add column attribution_quote text;

alter table advisor_opinions
  add constraint advisor_opinions_no_self_attribution check (attributed_persona_id <> persona_id),
  add constraint advisor_opinions_attribution_co_presence check (
    (previous_score is null and attributed_persona_id is null and attribution_quote is null)
    or
    (previous_score is not null and attributed_persona_id is not null and attribution_quote is not null)
  );
