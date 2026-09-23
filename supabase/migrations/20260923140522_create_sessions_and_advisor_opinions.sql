-- FR-001 (user sees only their own sessions), FR-006 (session saved to account, returnable),
-- per-user isolation guardrail (context/foundation/prd.md). First migration in the repo — this
-- establishes the RLS pattern every later data slice reuses: RLS enabled, one policy per
-- operation per role, `user_id` defaulting to `auth.uid()`.

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  decision text not null,
  context text,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_user_id_created_at_idx on sessions (user_id, created_at desc);

create table advisor_opinions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  persona_id text not null check (persona_id in ('optymista', 'sceptyk', 'pragmatyk', 'analityk')),
  round_number integer not null default 1 check (round_number >= 1),
  score integer not null check (score between 1 and 10),
  thesis text not null,
  arguments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, persona_id, round_number)
);

create index advisor_opinions_session_id_idx on advisor_opinions (session_id);

alter table sessions enable row level security;
alter table advisor_opinions enable row level security;

-- No `anon` policies on either table: with RLS enabled and no matching policy, the `anon` role
-- is denied every operation by default. That absence is the intended per-role coverage for
-- `anon` (.claude/rules/backend.md §4) — do not add permissive-then-restrictive policies.

create policy sessions_select_own on sessions
  for select to authenticated
  using (auth.uid() = user_id);

create policy sessions_insert_own on sessions
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy sessions_update_own on sessions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy sessions_delete_own on sessions
  for delete to authenticated
  using (auth.uid() = user_id);

create policy advisor_opinions_select_own on advisor_opinions
  for select to authenticated
  using (auth.uid() = user_id);

create policy advisor_opinions_insert_own on advisor_opinions
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy advisor_opinions_update_own on advisor_opinions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy advisor_opinions_delete_own on advisor_opinions
  for delete to authenticated
  using (auth.uid() = user_id);
