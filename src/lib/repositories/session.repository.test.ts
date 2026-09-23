import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DbError } from "@/lib/errors";
import { SessionRepository } from "@/lib/repositories/session.repository";

interface QueryResponse {
  data: unknown;
  error: { message: string } | null;
}

/**
 * Chainable query-builder stub: every method returns `this` so any call order used by the
 * repository resolves, and the object itself is thenable so `await` (with or without a trailing
 * terminal method) resolves to the configured response — mirrors postgrest-js's builder shape.
 */
function makeQueryBuilder(response: QueryResponse) {
  const builder: Record<string, unknown> = {
    insert: vi.fn(() => builder),
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    eq: vi.fn(() => builder),
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
