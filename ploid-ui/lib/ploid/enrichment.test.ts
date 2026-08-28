import { describe, expect, it } from "vitest";
import {
  normalizePloidEnrichmentResponse,
  validateLinkedInUrl,
  validateSocialIdentifier,
} from "./client";

describe("Ploid enrichment identity validation", () => {
  it("requires a LinkedIn URL before focused enrichment", () => {
    expect(
      validateLinkedInUrl("https://www.linkedin.com/in/alice"),
    ).toBeUndefined();
    expect(validateLinkedInUrl("")).toBe("Missing LinkedIn URL");
    expect(validateLinkedInUrl("alice@example.com")).toBe(
      "Invalid LinkedIn profile URL",
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

  it("keeps unresolved fields separate from provider field failures", () => {
    const normalized = normalizePloidEnrichmentResponse(
      {
        data: { email: "alice@example.com", phone: null },
        meta: {
          request_id: "req_123",
          warnings: [{ field: "phone", code: "provider_unavailable" }],
        },
      },
      ["email", "phone"],
    );
    expect(normalized.fields.email).toMatchObject({
      status: "success",
      value: "alice@example.com",
    });
    expect(normalized.fields.phone).toMatchObject({ status: "failed" });

    const notFound = normalizePloidEnrichmentResponse(
      { data: { email: null }, meta: {} },
      ["email"],
    );
    expect(notFound.fields.email).toMatchObject({ status: "not_found" });
  });

  it("maps Ploid's linkedin_profile payload to the requested profile field", () => {
    const profile = { headline: "Founder" };
    const normalized = normalizePloidEnrichmentResponse(
      { data: { linkedin_profile: profile }, meta: {} },
      ["profile"],
    );
    expect(normalized.fields.profile).toMatchObject({
      status: "success",
      value: profile,
    });
  });

  it("unwraps the documented contact value envelope", () => {
    const normalized = normalizePloidEnrichmentResponse(
      { data: { email: { value: "alice@example.com", confidence: "verified", verification_status: "verified" } }, meta: {} },
      ["email"],
    );
    expect(normalized.fields.email).toMatchObject({ value: "alice@example.com", status: "success" });
  });
});
