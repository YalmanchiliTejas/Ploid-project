import { describe, expect, it } from "vitest";
import { normalizePeopleSearchResponse } from "./normalize-search";
import type { PloidSearchResponse } from "./types";

describe("normalizePeopleSearchResponse", () => {
  it("maps documented person fields and retains each raw result", () => {
    const response: PloidSearchResponse = {
      data: {
        results: [{ url: "https://linkedin.com/in/ada", title: "Engineer", score: 0.9, person: { name: "Ada Lovelace", title: "Engineer", company: "Ploid", location: "London", linkedin_url: "https://linkedin.com/in/ada" } }],
        search_time_ms: 4, rows_indexed: 1,
        request: { query: "Ada", type: "auto", category: "people", num_results: 1 },
      },
      meta: { request_id: "req_search" },
    };
    const normalized = normalizePeopleSearchResponse(response);
    expect(normalized.requestId).toBe("req_search");
    expect(normalized.rows[0]).toMatchObject({ name: "Ada Lovelace", firstName: "Ada", lastName: "Lovelace", linkedinUrl: "https://linkedin.com/in/ada", company: "Ploid" });
    expect(normalized.rows[0].raw).toBe(response.data.results[0]);
  });

  it("preserves partial rows when Ploid returns a search-timeout warning", () => {
    const response = {
      data: { results: [{ url: null, title: null, score: null, person: { name: "Ada" } }], search_time_ms: 1, rows_indexed: 1, request: { query: "Ada", type: "auto", category: "people", num_results: 1 } },
      meta: { warning: "search_timeout", request_id: "req_partial" },
    } satisfies PloidSearchResponse;
    const normalized = normalizePeopleSearchResponse(response);
    expect(normalized.warning).toBe("search_timeout");
    expect(normalized.rows).toHaveLength(1);
  });
});
