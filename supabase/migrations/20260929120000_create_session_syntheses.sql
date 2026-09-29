-- FR-005, FR-010

create table session_syntheses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content jsonb not null,
  narrative text not null default '',
  created_at timestamptz not null default now(),
  unique (session_id)
);

alter table session_syntheses enable row level security;

-- No `anon` policies: with RLS enabled and no matching policy, the `anon` role is denied every
-- operation by default (see the create-sessions migration for the established convention).

create policy session_syntheses_select_own on session_syntheses
  for select to authenticated
  using (auth.uid() = user_id);

create policy session_syntheses_insert_own on session_syntheses
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy session_syntheses_update_own on session_syntheses
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy session_syntheses_delete_own on session_syntheses
  for delete to authenticated
  using (auth.uid() = user_id);
