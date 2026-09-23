import { describe, expect, it } from "vitest";

import { AdvisorOpinionRowSchema, SessionRowSchema, toAdvisorOpinion, toSession } from "@/lib/schemas/session";

const validSessionRow = {
  id: "session-1",
  user_id: "user-1",
  decision: "Should I do X?",
  context: "some context",
  status: "active" as const,
  created_at: "2026-09-23T12:00:00.000Z",
  updated_at: "2026-09-23T12:00:00.000Z",
};

const validOpinionRow = {
  id: "opinion-1",
  session_id: "session-1",
  user_id: "user-1",
  persona_id: "optymista" as const,
  round_number: 1,
  score: 8,
  thesis: "Go for it",
  arguments: ["arg 1", "arg 2"],
  created_at: "2026-09-23T12:00:00.000Z",
};

describe("SessionRowSchema", () => {
  it("accepts a valid row", () => {
    expect(SessionRowSchema.parse(validSessionRow)).toEqual(validSessionRow);
  });

  it("accepts a null context", () => {
    const row = { ...validSessionRow, context: null };
    expect(SessionRowSchema.parse(row).context).toBeNull();
  });

  it("rejects an invalid status", () => {
    const row = { ...validSessionRow, status: "archived" };
    expect(() => SessionRowSchema.parse(row)).toThrow();
  });
});

describe("AdvisorOpinionRowSchema", () => {
  it("accepts a valid row", () => {
    expect(AdvisorOpinionRowSchema.parse(validOpinionRow)).toEqual(validOpinionRow);
  });

  it("rejects a score out of range", () => {
    const row = { ...validOpinionRow, score: 11 };
    expect(() => AdvisorOpinionRowSchema.parse(row)).toThrow();
  });

  it("rejects an unknown persona_id", () => {
    const row = { ...validOpinionRow, persona_id: "unknown" };
    expect(() => AdvisorOpinionRowSchema.parse(row)).toThrow();
  });

  it("rejects a malformed arguments field", () => {
    const row = { ...validOpinionRow, arguments: [1, 2] };
    expect(() => AdvisorOpinionRowSchema.parse(row)).toThrow();
  });
});

describe("toSession", () => {
  it("maps a snake_case row to the camelCase domain object", () => {
    expect(toSession(validSessionRow)).toEqual({
      id: "session-1",
      userId: "user-1",
      decision: "Should I do X?",
      context: "some context",
      status: "active",
      createdAt: "2026-09-23T12:00:00.000Z",
      updatedAt: "2026-09-23T12:00:00.000Z",
    });
  });

  it("preserves a null context", () => {
    const row = { ...validSessionRow, context: null };
    expect(toSession(row).context).toBeNull();
  });
});

describe("toAdvisorOpinion", () => {
  it("maps a snake_case row to the camelCase domain object", () => {
    expect(toAdvisorOpinion(validOpinionRow)).toEqual({
      id: "opinion-1",
      sessionId: "session-1",
      userId: "user-1",
      personaId: "optymista",
      roundNumber: 1,
      score: 8,
      thesis: "Go for it",
      arguments: ["arg 1", "arg 2"],
      createdAt: "2026-09-23T12:00:00.000Z",
    });
  });
});
