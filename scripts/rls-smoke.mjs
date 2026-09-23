// RLS isolation proof (F-02): creates two real users against local Supabase and exercises the
// `sessions` / `advisor_opinions` policies with real Postgres RLS, not a mock. Proves the
// per-user isolation guardrail (PRD) — the whole point of this migration. Skips with exit 0 when
// SUPABASE_URL/SUPABASE_KEY are absent, so non-Supabase runs (and CI jobs without local Supabase)
// stay green. Run: SUPABASE_URL=... SUPABASE_KEY=... node scripts/rls-smoke.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log("SKIP  SUPABASE_URL/SUPABASE_KEY not set — skipping RLS isolation smoke test");
  process.exit(0);
}

const password = "Rls-Smoke-Test-Passw0rd!";
const suffix = Date.now();

async function makeSignedInClient(label) {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY);
  const email = `rls-smoke-${label}-${suffix}@example.com`;
  const { data, error } = await client.auth.signUp({ email, password });
  if (error || !data.user) {
    throw new Error(`${label}: sign-up failed: ${error?.message ?? "no user returned"}`);
  }
  return { client, userId: data.user.id };
}

let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? `  -> ${detail}` : ""}`);
  }
}

const { client: clientA, userId: userA } = await makeSignedInClient("a");
const { client: clientB, userId: userB } = await makeSignedInClient("b");

// --- A creates a session + round-1 opinions ---------------------------------------------------

const { data: sessionA, error: createSessionError } = await clientA
  .from("sessions")
  .insert({ decision: "Should A take this job offer?" })
  .select()
  .single();
check("A can create its own session", !createSessionError && sessionA?.user_id === userA, createSessionError?.message);

const { data: opinionsA, error: createOpinionsError } = await clientA
  .from("advisor_opinions")
  .insert([
    { session_id: sessionA.id, persona_id: "optymista", round_number: 1, score: 8, thesis: "Go for it" },
    { session_id: sessionA.id, persona_id: "sceptyk", round_number: 1, score: 3, thesis: "Too risky" },
  ])
  .select();
check(
  "A can create its own advisor opinions",
  !createOpinionsError && opinionsA?.length === 2,
  createOpinionsError?.message,
);
const opinionA = opinionsA[0];

// --- A can read/update its own rows -----------------------------------------------------------

const { data: ownSessionRead, error: ownSessionReadError } = await clientA
  .from("sessions")
  .select()
  .eq("id", sessionA.id)
  .maybeSingle();
check("A can select its own session", !ownSessionReadError && ownSessionRead?.id === sessionA.id);

const { data: ownSessionUpdate, error: ownSessionUpdateError } = await clientA
  .from("sessions")
  .update({ status: "completed" })
  .eq("id", sessionA.id)
  .select();
check("A can update its own session", !ownSessionUpdateError && ownSessionUpdate?.length === 1);

// --- A cannot reassign its own row's user_id (the WITH CHECK hole on update) -------------------

// A WITH CHECK violation can surface either as a Postgres error (RLS rejects the write outright)
// or as zero affected rows (the row silently fails the new-row check) — both mean "rejected".

const { data: reassignAttempt, error: reassignError } = await clientA
  .from("sessions")
  .update({ user_id: userB })
  .eq("id", sessionA.id)
  .select();
check(
  "A cannot reassign its own session's user_id to another user",
  !!reassignError || (reassignAttempt?.length ?? 0) === 0,
  reassignError ? undefined : "reassign unexpectedly succeeded",
);

const { data: reassignOpinionAttempt, error: reassignOpinionError } = await clientA
  .from("advisor_opinions")
  .update({ user_id: userB })
  .eq("id", opinionA.id)
  .select();
check(
  "A cannot reassign its own opinion's user_id to another user",
  !!reassignOpinionError || (reassignOpinionAttempt?.length ?? 0) === 0,
  reassignOpinionError ? undefined : "reassign unexpectedly succeeded",
);

// --- B cannot see A's rows -----------------------------------------------------------------

const { data: bSelectSession, error: bSelectSessionError } = await clientB
  .from("sessions")
  .select()
  .eq("id", sessionA.id);
check(
  "B's select of A's session returns zero rows",
  !bSelectSessionError && (bSelectSession?.length ?? 0) === 0,
  bSelectSessionError?.message,
);

const { data: bSelectOpinions, error: bSelectOpinionsError } = await clientB
  .from("advisor_opinions")
  .select()
  .eq("session_id", sessionA.id);
check(
  "B's select of A's opinions returns zero rows",
  !bSelectOpinionsError && (bSelectOpinions?.length ?? 0) === 0,
  bSelectOpinionsError?.message,
);

// --- B's update/delete of A's rows affects zero rows ------------------------------------------

const { data: bUpdateSession, error: bUpdateSessionError } = await clientB
  .from("sessions")
  .update({ decision: "hijacked" })
  .eq("id", sessionA.id)
  .select();
check(
  "B's update of A's session affects zero rows",
  !bUpdateSessionError && (bUpdateSession?.length ?? 0) === 0,
  bUpdateSessionError?.message,
);

const { data: bDeleteSession, error: bDeleteSessionError } = await clientB
  .from("sessions")
  .delete()
  .eq("id", sessionA.id)
  .select();
check(
  "B's delete of A's session affects zero rows",
  !bDeleteSessionError && (bDeleteSession?.length ?? 0) === 0,
  bDeleteSessionError?.message,
);

const { data: bUpdateOpinion, error: bUpdateOpinionError } = await clientB
  .from("advisor_opinions")
  .update({ score: 1 })
  .eq("id", opinionA.id)
  .select();
check(
  "B's update of A's opinion affects zero rows",
  !bUpdateOpinionError && (bUpdateOpinion?.length ?? 0) === 0,
  bUpdateOpinionError?.message,
);

const { data: bDeleteOpinion, error: bDeleteOpinionError } = await clientB
  .from("advisor_opinions")
  .delete()
  .eq("id", opinionA.id)
  .select();
check(
  "B's delete of A's opinion affects zero rows",
  !bDeleteOpinionError && (bDeleteOpinion?.length ?? 0) === 0,
  bDeleteOpinionError?.message,
);

// --- B cannot insert a row it attributes to A (WITH CHECK on insert) ---------------------------

const { data: bInsertSession, error: bInsertSessionError } = await clientB
  .from("sessions")
  .insert({ decision: "planted by B", user_id: userA })
  .select();
check(
  "B cannot insert a session with user_id set to A",
  !!bInsertSessionError && !bInsertSession,
  bInsertSessionError ? undefined : "insert unexpectedly succeeded",
);

const { data: bInsertOpinion, error: bInsertOpinionError } = await clientB
  .from("advisor_opinions")
  .insert({
    session_id: sessionA.id,
    persona_id: "pragmatyk",
    round_number: 1,
    score: 5,
    thesis: "planted",
    user_id: userA,
  })
  .select();
check(
  "B cannot insert an opinion with user_id set to A",
  !!bInsertOpinionError && !bInsertOpinion,
  bInsertOpinionError ? undefined : "insert unexpectedly succeeded",
);

// --- confirm A's rows survived every attack unmodified -----------------------------------------

const { data: finalSession } = await clientA.from("sessions").select().eq("id", sessionA.id).single();
check(
  "A's session is untouched after every cross-user attempt",
  finalSession?.decision === "Should A take this job offer?" && finalSession?.user_id === userA,
);

console.log(failed ? `\n${failed} assertion(s) failed` : "\nAll RLS isolation assertions passed");
process.exit(failed ? 1 : 0);
