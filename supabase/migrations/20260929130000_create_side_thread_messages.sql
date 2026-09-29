-- FR-007

create table advisor_side_thread_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  persona_id text not null check (persona_id in ('optymista', 'sceptyk', 'pragmatyk', 'analityk')),
  role text not null check (role in ('user', 'advisor')),
  content text not null,
  created_at timestamptz not null default now()
);

create index advisor_side_thread_messages_session_persona_created_idx
  on advisor_side_thread_messages (session_id, persona_id, created_at);

alter table advisor_side_thread_messages enable row level security;

-- No `anon` policies: with RLS enabled and no matching policy, the `anon` role is denied every
-- operation by default (see the create-sessions migration for the established convention).
-- No update/delete policies either: this table is append-only, so both operations are denied by
-- default for every role, including `authenticated`.

create policy advisor_side_thread_messages_select_own on advisor_side_thread_messages
  for select to authenticated
  using (auth.uid() = user_id);

create policy advisor_side_thread_messages_insert_own on advisor_side_thread_messages
  for insert to authenticated
  with check (auth.uid() = user_id);
