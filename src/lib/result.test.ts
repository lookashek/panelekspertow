import { describe, expect, it } from "vitest";

import { err, ok } from "@/lib/result";

describe("Result constructors", () => {
  it("ok() produces an ok=true result carrying the value", () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("err() produces an ok=false result carrying the error", () => {
    const result = err("boom");
    expect(result).toEqual({ ok: false, error: "boom" });
  });
});
