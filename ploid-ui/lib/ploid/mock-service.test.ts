import { afterEach, describe, expect, it } from "vitest";
import {
  isMockApiEnabled,
  mockAgentResponse,
  mockPeopleSearch,
} from "./mock-service";

describe("Ploid mock API", () => {
  const initialValue = process.env.MOCK_API;
  afterEach(() => {
    if (initialValue === undefined) delete process.env.MOCK_API;
    else process.env.MOCK_API = initialValue;
  });

  it("is explicitly enabled only by MOCK_API=true", () => {
    process.env.MOCK_API = "true";
    expect(isMockApiEnabled()).toBe(true);
    process.env.MOCK_API = "false";
    expect(isMockApiEnabled()).toBe(false);
  });

  it("provides deterministic people, company, and market structured rows", () => {
    expect(
      mockPeopleSearch({ query: "engineering managers", num_results: 2 }).data
        .results,
    ).toHaveLength(2);
    const company = mockAgentResponse({
      prompt:
        "Workspace context: company_name company_domain company_industry company_product_service",
    });
    const market = mockAgentResponse({
      prompt:
        "Workspace context: market_name market_segment market_description",
    });
    expect(
      (company.data.structured_output as { operations: unknown[] }).operations,
    ).toHaveLength(1);
    expect(JSON.stringify(market.data.structured_output)).toContain(
      "Commercial fleet warranty software",
    );
  });
});
