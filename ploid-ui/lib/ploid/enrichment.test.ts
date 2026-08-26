import { describe, expect, it } from "vitest";
import { validateLinkedInUrl, validateSocialIdentifier } from "./client";

describe("Ploid enrichment identity validation", () => {
  it("requires a LinkedIn URL before focused enrichment", () => {
    expect(
      validateLinkedInUrl("https://www.linkedin.com/in/alice"),
    ).toBeUndefined();
    expect(validateLinkedInUrl("alice@example.com")).toBe(
      "Missing LinkedIn URL",
    );
  });

  it("rejects social URLs whose platform does not match", () => {
    expect(
      validateSocialIdentifier("github", "https://github.com/octocat"),
    ).toBeUndefined();
    expect(
      validateSocialIdentifier("github", "https://www.linkedin.com/in/octocat"),
    ).toContain("github");
  });
});
