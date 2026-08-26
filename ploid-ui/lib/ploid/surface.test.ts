import { describe, expect, it } from "vitest";
import { choosePloidSurface } from "./surface";

describe("choosePloidSurface", () => {
  it("uses Search for representable people retrieval", () => {
    expect(choosePloidSurface("Find 25 engineering managers in San Francisco")).toBe("search");
  });

  it("keeps open-ended company-fit research on Agent", () => {
    expect(choosePloidSurface("Find companies responsible for cross-OEM warranty management and explain fit")).toBe("agent");
  });

  it("recognizes known-person enrichment", () => {
    expect(choosePloidSurface("Enrich https://linkedin.com/in/ada with email")).toBe("enrich");
  });
});
