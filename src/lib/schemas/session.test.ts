import { describe, expect, it } from "vitest";

import {
  AdvisorOpinionRowSchema,
  SessionRowSchema,
  SessionSynthesisRowSchema,
  toAdvisorOpinion,
  toSession,
  toSessionSynthesis,
} from "@/lib/schemas/session";

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
  previous_score: null,
  attributed_persona_id: null,
  attribution_quote: null,
};

const validRoundTwoOpinionRow = {
  ...validOpinionRow,
  id: "opinion-2",
  round_number: 2,
  score: 9,
  previous_score: 6,
  attributed_persona_id: "sceptyk" as const,
  attribution_quote: "Ten argument mnie przekonał.",
};

const validSynthesisContent = {
  agreementPoints: ["Both agree on timing"],
  disputeAxes: [{ title: "Risk tolerance", positions: ["Cautious", "Aggressive"] }],
  risks: [{ description: "Market downturn", weight: "medium" as const }],
  recommendedNextStep: "Run a pilot",
};

const validSynthesisRow = {
  id: "synthesis-1",
  session_id: "session-1",
  user_id: "user-1",
  content: validSynthesisContent,
  narrative: "The panel converged on timing but diverged on risk tolerance.",
  created_at: "2026-09-29T12:00:00.000Z",
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

  it("accepts a valid round-two row with attribution", () => {
    expect(AdvisorOpinionRowSchema.parse(validRoundTwoOpinionRow)).toEqual(validRoundTwoOpinionRow);
  });

  it("rejects an unknown attributed_persona_id", () => {
    const row = { ...validRoundTwoOpinionRow, attributed_persona_id: "unknown" };
    expect(() => AdvisorOpinionRowSchema.parse(row)).toThrow();
  });

  it("rejects an out-of-range previous_score", () => {
    const row = { ...validRoundTwoOpinionRow, previous_score: 11 };
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
      previousScore: null,
      attributedPersonaId: null,
      attributionQuote: null,
    });
  });

  it("maps round-two attribution columns to camelCase", () => {
    expect(toAdvisorOpinion(validRoundTwoOpinionRow)).toEqual({
      id: "opinion-2",
      sessionId: "session-1",
      userId: "user-1",
      personaId: "optymista",
      roundNumber: 2,
      score: 9,
      thesis: "Go for it",
      arguments: ["arg 1", "arg 2"],
      createdAt: "2026-09-23T12:00:00.000Z",
      previousScore: 6,
      attributedPersonaId: "sceptyk",
      attributionQuote: "Ten argument mnie przekonał.",
    });
  });
});

describe("SessionSynthesisRowSchema", () => {
  it("accepts a valid row", () => {
    expect(SessionSynthesisRowSchema.parse(validSynthesisRow)).toEqual(validSynthesisRow);
  });

  it("rejects a row with invalid content (missing disputeAxes)", () => {
    const row = { ...validSynthesisRow, content: { ...validSynthesisContent, disputeAxes: [] } };
    expect(() => SessionSynthesisRowSchema.parse(row)).toThrow();
  });

  it("rejects a row with malformed content shape", () => {
    const row = { ...validSynthesisRow, content: { foo: "bar" } };
    expect(() => SessionSynthesisRowSchema.parse(row)).toThrow();
  });
});

describe("toSessionSynthesis", () => {
  it("maps a snake_case row to the camelCase domain object", () => {
    expect(toSessionSynthesis(validSynthesisRow)).toEqual({
      id: "synthesis-1",
      sessionId: "session-1",
      userId: "user-1",
      content: validSynthesisContent,
      narrative: "The panel converged on timing but diverged on risk tolerance.",
      createdAt: "2026-09-29T12:00:00.000Z",
    });
  });
});
