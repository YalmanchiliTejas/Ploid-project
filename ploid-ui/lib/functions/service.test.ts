import { describe, expect, it } from "vitest";
import { coerceFunctionValue } from "./service";

describe("coerceFunctionValue", () => {
  it("stores function output using the destination column representation", () => {
    expect(coerceFunctionValue("$1,234.50", "currency")).toBe(1234.5);
    expect(coerceFunctionValue("25%", "percentage")).toBe(0.25);
    expect(coerceFunctionValue("yes", "boolean")).toBe(true);
    expect(coerceFunctionValue("2026-08-25", "date")).toBe("2026-08-25");
    expect(coerceFunctionValue("example.com/path", "url")).toBe(
      "https://example.com/path",
    );
    expect(coerceFunctionValue(' { "score": 3 } ', "json")).toBe(
      '{"score":3}',
    );
    expect(coerceFunctionValue("View profile →", "json")).toBe(
      "View profile →",
    );
    expect(coerceFunctionValue(["new", "qualified"], "multi-select")).toBe(
      "new,qualified",
    );
  });

  it("does not persist invalid typed output", () => {
    expect(coerceFunctionValue(null, "boolean")).toBeNull();
    expect(coerceFunctionValue(null, "number")).toBeNull();
    expect(coerceFunctionValue("not a number", "number")).toBeNull();
    expect(coerceFunctionValue("maybe", "boolean")).toBeNull();
    expect(coerceFunctionValue("not-an-email", "email")).toBeNull();
    expect(coerceFunctionValue("not json", "json")).toBeNull();
  });
});
