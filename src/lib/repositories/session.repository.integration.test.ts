import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { SessionRepository } from "@/lib/repositories/session.repository";

/**
 * Real-Supabase counterpart to `session.repository.test.ts` — proves the downstream reads
 * (`getOpinions`, `getSynthesis`, `getSideThreadMessagesForSession`, `getSideThreadMessages`,
 * `countSideThreadUserMessages`, `countRecentSideThreadMessagesByUser`) deny a non-owning user via
 * real Postgres RLS, not a mocked client — see research.md Risk #1. Mirrors the two-real-user
 * seeding pattern in `scripts/rls-smoke.mjs`. Inert unless a local Supabase is running and its
 * migrations are applied (same precondition as `npm run smoke:rls`).
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

/** Narrows the env vars to `string` without `!`/`as` — `skipIf` guarantees these are set whenever this runs. */
function requireSupabaseEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_KEY not set");
  }
  return { url: SUPABASE_URL, key: SUPABASE_KEY };
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)("SessionRepository — cross-user ownership (real Supabase)", () => {
  const password = "Repo-Integration-Test-Passw0rd!";
  const suffix = Date.now();
  const createdClients: SupabaseClient[] = [];

  async function makeSignedInRepository(label: string) {
    const { url, key } = requireSupabaseEnv();
    const client = createClient(url, key);
    createdClients.push(client);
    const email = `repo-integration-${label}-${suffix}@example.com`;
    const { data, error } = await client.auth.signUp({ email, password });
    if (error || !data.user) {
      throw new Error(`${label}: sign-up failed: ${error?.message ?? "no user returned"}`);
    }
    return { repository: new SessionRepository(client), userId: data.user.id };
  }

  afterAll(async () => {
    await Promise.all(createdClients.map((client) => client.auth.signOut()));
  });

  it("denies every downstream read of A's session to B, using real RLS as the oracle", async () => {
    const { repository: repoA } = await makeSignedInRepository("a");
    const { repository: repoB } = await makeSignedInRepository("b");

    const sessionResult = await repoA.createSession({ decision: "Should A take this job offer?" });
    expect(sessionResult.ok).toBe(true);
    if (!sessionResult.ok) return;
    const sessionId = sessionResult.value.id;

    const opinionsResult = await repoA.saveOpinions(sessionId, 1, [
      { personaId: "optymista", opinion: { score: 8, thesis: "Go for it", arguments: ["arg 1"] } },
      { personaId: "sceptyk", opinion: { score: 3, thesis: "Too risky", arguments: ["arg 2"] } },
    ]);
    expect(opinionsResult.ok).toBe(true);

    const synthesisResult = await repoA.saveSynthesis(sessionId, {
      content: {
        agreementPoints: ["agree"],
        disputeAxes: [{ title: "axis", positions: ["a", "b"] }],
        risks: [{ description: "risk", weight: "medium" }],
        recommendedNextStep: "next step",
      },
      narrative: "A's private synthesis narrative",
    });
    expect(synthesisResult.ok).toBe(true);

    const sideThreadResult = await repoA.saveSideThreadMessage(sessionId, {
      personaId: "optymista",
      role: "user",
      content: "A's private side-thread question",
    });
    expect(sideThreadResult.ok).toBe(true);

    // --- B reads every downstream method against A's sessionId: all must come back empty/zero,
    // proving RLS (not application code) is what denies access --------------------------------

    const bOpinions = await repoB.getOpinions(sessionId, 1);
    expect(bOpinions).toEqual({ ok: true, value: [] });

    const bSynthesis = await repoB.getSynthesis(sessionId);
    expect(bSynthesis).toEqual({ ok: true, value: null });

    const bThreadForSession = await repoB.getSideThreadMessagesForSession(sessionId);
    expect(bThreadForSession).toEqual({ ok: true, value: [] });

    const bThreadForPersona = await repoB.getSideThreadMessages(sessionId, "optymista");
    expect(bThreadForPersona).toEqual({ ok: true, value: [] });

    const bThreadCount = await repoB.countSideThreadUserMessages(sessionId, "optymista");
    expect(bThreadCount).toEqual({ ok: true, value: 0 });

    // Control: A still sees its own rows — proves the zeros above are RLS denial, not a broken
    // query that would return empty for anyone.
    const aOpinions = await repoA.getOpinions(sessionId, 1);
    expect(aOpinions.ok).toBe(true);
    if (aOpinions.ok) {
      expect(aOpinions.value).toHaveLength(2);
    }
  });

  it(
    "countRecentSideThreadMessagesByUser has no sessionId/userId filter — it depends entirely " +
      "on RLS, the weakest point research.md flagged",
    async () => {
      const { repository: repoA } = await makeSignedInRepository("c");
      const { repository: repoB } = await makeSignedInRepository("d");

      const sessionResult = await repoA.createSession({ decision: "C's private decision" });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const before = new Date(Date.now() - 1000).toISOString();
      const saveResult = await repoA.saveSideThreadMessage(sessionResult.value.id, {
        personaId: "optymista",
        role: "user",
        content: "C's private side-thread question",
      });
      expect(saveResult.ok).toBe(true);

      // B's count, scoped only by role + time window (no sessionId/userId argument exists on this
      // method), must not include A/C's message — RLS is the only thing that can prevent that.
      const bCount = await repoB.countRecentSideThreadMessagesByUser(before);
      expect(bCount).toEqual({ ok: true, value: 0 });

      // Control: the owner's own count does see it.
      const aCount = await repoA.countRecentSideThreadMessagesByUser(before);
      expect(aCount.ok).toBe(true);
      if (aCount.ok) {
        expect(aCount.value).toBeGreaterThanOrEqual(1);
      }
    },
  );
});
