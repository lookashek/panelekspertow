import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DbError } from "@/lib/errors";
import { SessionRepository } from "@/lib/repositories/session.repository";

interface QueryResponse {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

/**
 * Chainable query-builder stub: every method returns `this` so any call order used by the
 * repository resolves, and the object itself is thenable so `await` (with or without a trailing
 * terminal method) resolves to the configured response — mirrors postgrest-js's builder shape.
 */
function makeQueryBuilder(response: QueryResponse) {
  const builder: Record<string, unknown> = {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    then: (resolve: (value: QueryResponse) => unknown) => resolve(response),
  };
  return builder;
}

function makeClient(response: QueryResponse) {
  const builder = makeQueryBuilder(response);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient, from, builder };
}

const sessionRow = {
  id: "session-1",
  user_id: "user-1",
  decision: "Should I do X?",
  context: null,
  status: "active",
  created_at: "2026-09-23T12:00:00.000Z",
  updated_at: "2026-09-23T12:00:00.000Z",
};

const synthesisContent = {
  agreementPoints: ["Both agree on timing"],
  disputeAxes: [{ title: "Risk tolerance", positions: ["Cautious", "Aggressive"] }],
  risks: [{ description: "Market downturn", weight: "medium" as const }],
  recommendedNextStep: "Run a pilot",
};

const synthesisRow = {
  id: "synthesis-1",
  session_id: "session-1",
  user_id: "user-1",
  content: synthesisContent,
  narrative: "The panel converged on timing but diverged on risk tolerance.",
  created_at: "2026-09-29T12:00:00.000Z",
};

const opinionRow = {
  id: "opinion-1",
  session_id: "session-1",
  user_id: "user-1",
  persona_id: "optymista",
  round_number: 1,
  score: 8,
  thesis: "Go for it",
  arguments: ["arg 1"],
  created_at: "2026-09-23T12:00:00.000Z",
  previous_score: null,
  attributed_persona_id: null,
  attribution_quote: null,
};

const sideThreadMessageRow = {
  id: "message-1",
  session_id: "session-1",
  user_id: "user-1",
  persona_id: "optymista",
  role: "user" as const,
  content: "Can you elaborate?",
  created_at: "2026-09-29T12:00:00.000Z",
};

describe("SessionRepository.createSession", () => {
  it("returns the mapped session on success", async () => {
    const { client, from } = makeClient({ data: sessionRow, error: null });
    const repo = new SessionRepository(client);

    const result = await repo.createSession({ decision: "Should I do X?" });

    expect(from).toHaveBeenCalledWith("sessions");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(expect.objectContaining({ id: "session-1", decision: "Should I do X?" }));
    }
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "insert failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.createSession({ decision: "Should I do X?" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});

describe("SessionRepository.saveOpinions", () => {
  it("returns mapped opinion records on success", async () => {
    const { client } = makeClient({ data: [opinionRow], error: null });
    const repo = new SessionRepository(client);

    const result = await repo.saveOpinions("session-1", 1, [
      { personaId: "optymista", opinion: { score: 8, thesis: "Go for it", arguments: ["arg 1"] } },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        expect.objectContaining({ id: "opinion-1", personaId: "optymista", roundNumber: 1 }),
      ]);
    }
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "insert failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.saveOpinions("session-1", 1, [
      { personaId: "optymista", opinion: { score: 8, thesis: "Go for it", arguments: ["arg 1"] } },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });

  it("round two: writes attribution columns to the inserted row and reads them back", async () => {
    const roundTwoRow = {
      ...opinionRow,
      id: "opinion-2",
      round_number: 2,
      score: 9,
      previous_score: 8,
      attributed_persona_id: "sceptyk",
      attribution_quote: "the exact peer argument",
    };
    const { client, builder } = makeClient({ data: [roundTwoRow], error: null });
    const repo = new SessionRepository(client);

    const result = await repo.saveOpinions("session-1", 2, [
      {
        personaId: "optymista",
        opinion: { score: 9, thesis: "Reconsidered", arguments: ["arg 1"] },
        previousScore: 8,
        attributedPersonaId: "sceptyk",
        attributionQuote: "the exact peer argument",
      },
    ]);

    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        previous_score: 8,
        attributed_persona_id: "sceptyk",
        attribution_quote: "the exact peer argument",
      }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        expect.objectContaining({
          previousScore: 8,
          attributedPersonaId: "sceptyk",
          attributionQuote: "the exact peer argument",
        }),
      ]);
    }
  });

  it("round one: omitted attribution fields insert as null", async () => {
    const { client, builder } = makeClient({ data: [opinionRow], error: null });
    const repo = new SessionRepository(client);

    await repo.saveOpinions("session-1", 1, [
      { personaId: "optymista", opinion: { score: 8, thesis: "Go for it", arguments: ["arg 1"] } },
    ]);

    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        previous_score: null,
        attributed_persona_id: null,
        attribution_quote: null,
      }),
    ]);
  });
});

describe("SessionRepository.listSessions", () => {
  it("returns mapped sessions ordered by the client", async () => {
    const { client, builder } = makeClient({ data: [sessionRow], error: null });
    const repo = new SessionRepository(client);

    const result = await repo.listSessions();

    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(50);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
    }
  });

  it("passes a custom limit through", async () => {
    const { client, builder } = makeClient({ data: [], error: null });
    const repo = new SessionRepository(client);

    await repo.listSessions({ limit: 5 });

    expect(builder.limit).toHaveBeenCalledWith(5);
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "select failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.listSessions();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});

describe("SessionRepository.getOpinions", () => {
  it("returns mapped opinion records ordered by persona_id", async () => {
    const { client, builder } = makeClient({ data: [opinionRow], error: null });
    const repo = new SessionRepository(client);

    const result = await repo.getOpinions("session-1", 1);

    expect(builder.eq).toHaveBeenCalledWith("session_id", "session-1");
    expect(builder.eq).toHaveBeenCalledWith("round_number", 1);
    expect(builder.order).toHaveBeenCalledWith("persona_id", { ascending: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([expect.objectContaining({ id: "opinion-1", personaId: "optymista" })]);
    }
  });

  it("returns ok([]) when no opinions exist for the round", async () => {
    const { client } = makeClient({ data: [], error: null });
    const repo = new SessionRepository(client);

    const result = await repo.getOpinions("session-1", 1);

    expect(result).toEqual({ ok: true, value: [] });
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "select failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.getOpinions("session-1", 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});

describe("SessionRepository.getSession", () => {
  it("returns the mapped session when found", async () => {
    const { client } = makeClient({ data: sessionRow, error: null });
    const repo = new SessionRepository(client);

    const result = await repo.getSession("session-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(expect.objectContaining({ id: "session-1" }));
    }
  });

  it("returns ok(null) for an absent or other-user session (RLS-hidden)", async () => {
    const { client } = makeClient({ data: null, error: null });
    const repo = new SessionRepository(client);

    const result = await repo.getSession("someone-elses-session");

    expect(result).toEqual({ ok: true, value: null });
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "select failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.getSession("session-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});

describe("SessionRepository.getSynthesis", () => {
  it("returns the mapped synthesis when found", async () => {
    const { client, builder } = makeClient({ data: synthesisRow, error: null });
    const repo = new SessionRepository(client);

    const result = await repo.getSynthesis("session-1");

    expect(builder.eq).toHaveBeenCalledWith("session_id", "session-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(
        expect.objectContaining({ id: "synthesis-1", sessionId: "session-1", narrative: synthesisRow.narrative }),
      );
    }
  });

  it("returns ok(null) when no synthesis exists yet", async () => {
    const { client } = makeClient({ data: null, error: null });
    const repo = new SessionRepository(client);

    const result = await repo.getSynthesis("session-1");

    expect(result).toEqual({ ok: true, value: null });
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "select failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.getSynthesis("session-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});

describe("SessionRepository.saveSynthesis", () => {
  it("returns the mapped synthesis on success", async () => {
    const { client, from, builder } = makeClient({ data: synthesisRow, error: null });
    const repo = new SessionRepository(client);

    const result = await repo.saveSynthesis("session-1", {
      content: synthesisContent,
      narrative: synthesisRow.narrative,
    });

    expect(from).toHaveBeenCalledWith("session_syntheses");
    expect(builder.insert).toHaveBeenCalledWith({
      session_id: "session-1",
      content: synthesisContent,
      narrative: synthesisRow.narrative,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(expect.objectContaining({ id: "synthesis-1", sessionId: "session-1" }));
    }
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "insert failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.saveSynthesis("session-1", { content: synthesisContent, narrative: "narrative" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});

describe("SessionRepository.completeSession", () => {
  it("updates the session status to completed", async () => {
    const { client, from, builder } = makeClient({ data: null, error: null });
    const repo = new SessionRepository(client);

    const result = await repo.completeSession("session-1");

    expect(from).toHaveBeenCalledWith("sessions");
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(builder.eq).toHaveBeenCalledWith("id", "session-1");
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "update failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.completeSession("session-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});

describe("SessionRepository.saveSideThreadMessage", () => {
  it("round-trips a saved row", async () => {
    const { client, from, builder } = makeClient({ data: sideThreadMessageRow, error: null });
    const repo = new SessionRepository(client);

    const result = await repo.saveSideThreadMessage("session-1", {
      personaId: "optymista",
      role: "user",
      content: "Can you elaborate?",
    });

    expect(from).toHaveBeenCalledWith("advisor_side_thread_messages");
    expect(builder.insert).toHaveBeenCalledWith({
      session_id: "session-1",
      persona_id: "optymista",
      role: "user",
      content: "Can you elaborate?",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(
        expect.objectContaining({ id: "message-1", sessionId: "session-1", personaId: "optymista", role: "user" }),
      );
    }
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "insert failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.saveSideThreadMessage("session-1", {
      personaId: "optymista",
      role: "user",
      content: "Can you elaborate?",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});

describe("SessionRepository.getSideThreadMessagesForSession", () => {
  it("returns messages ordered persona_id, created_at, id", async () => {
    const { client, builder } = makeClient({ data: [sideThreadMessageRow], error: null });
    const repo = new SessionRepository(client);

    const result = await repo.getSideThreadMessagesForSession("session-1");

    expect(builder.eq).toHaveBeenCalledWith("session_id", "session-1");
    expect(builder.order).toHaveBeenCalledWith("persona_id", { ascending: true });
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(builder.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([expect.objectContaining({ id: "message-1", personaId: "optymista" })]);
    }
  });
});

describe("SessionRepository.getSideThreadMessages", () => {
  it("returns one thread's messages ordered created_at, id", async () => {
    const { client, builder } = makeClient({ data: [sideThreadMessageRow], error: null });
    const repo = new SessionRepository(client);

    const result = await repo.getSideThreadMessages("session-1", "optymista");

    expect(builder.eq).toHaveBeenCalledWith("session_id", "session-1");
    expect(builder.eq).toHaveBeenCalledWith("persona_id", "optymista");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(builder.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([expect.objectContaining({ id: "message-1", personaId: "optymista" })]);
    }
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "select failed" } });
    const repo = new SessionRepository(client);

    const result = await repo.getSideThreadMessages("session-1", "optymista");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});

describe("SessionRepository.countSideThreadUserMessages", () => {
  it("returns the exact count", async () => {
    const { client, builder } = makeClient({ data: null, error: null, count: 3 });
    const repo = new SessionRepository(client);

    const result = await repo.countSideThreadUserMessages("session-1", "optymista");

    expect(builder.select).toHaveBeenCalledWith("*", { count: "exact", head: true });
    expect(builder.eq).toHaveBeenCalledWith("session_id", "session-1");
    expect(builder.eq).toHaveBeenCalledWith("persona_id", "optymista");
    expect(builder.eq).toHaveBeenCalledWith("role", "user");
    expect(result).toEqual({ ok: true, value: 3 });
  });
});

describe("SessionRepository.countRecentSideThreadMessagesByUser", () => {
  it("returns the exact count within the window", async () => {
    const { client, builder } = makeClient({ data: null, error: null, count: 5 });
    const repo = new SessionRepository(client);

    const result = await repo.countRecentSideThreadMessagesByUser("2026-09-29T11:59:00.000Z");

    expect(builder.select).toHaveBeenCalledWith("*", { count: "exact", head: true });
    expect(builder.eq).toHaveBeenCalledWith("role", "user");
    expect(builder.gte).toHaveBeenCalledWith("created_at", "2026-09-29T11:59:00.000Z");
    expect(result).toEqual({ ok: true, value: 5 });
  });

  it("maps a Supabase error to Result.err(DbError)", async () => {
    const { client } = makeClient({ data: null, error: { message: "count failed" }, count: null });
    const repo = new SessionRepository(client);

    const result = await repo.countRecentSideThreadMessagesByUser("2026-09-29T11:59:00.000Z");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(DbError);
    }
  });
});
