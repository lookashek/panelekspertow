import { describe, expect, it } from "vitest";

import { parseScore } from "@/lib/advisors/parse-score";
import { LlmError, ErrorCode } from "@/lib/errors";

describe("parseScore", () => {
  it("accepts a valid score and thesis", () => {
    const result = parseScore({ score: 6, thesis: "Solidna teza." });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ score: 6, thesis: "Solidna teza." });
    }
  });

  it("rejects an out-of-range score", () => {
    const result = parseScore({ score: 42, thesis: "Teza." });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(LlmError);
      expect(result.error.code).toBe(ErrorCode.LLM_INVALID_OUTPUT);
    }
  });

  it("rejects a missing thesis", () => {
    const result = parseScore({ score: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.LLM_INVALID_OUTPUT);
    }
  });

  it("rejects malformed raw input", () => {
    const result = parseScore("not an object");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(LlmError);
      expect(result.error.code).toBe(ErrorCode.LLM_INVALID_OUTPUT);
    }
  });
});
