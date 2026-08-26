import { ploidFetch } from "./client";
import { isMockApiEnabled, mockPeopleSearch } from "./mock-service";
import { normalizePeopleSearchResponse } from "./normalize-search";
import type { PloidSearchRequest, PloidSearchResponse } from "./types";

export async function searchPeople(input: PloidSearchRequest) {
  const request = {
    query: input.query,
    ...(input.type ? { type: input.type } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.num_results ? { num_results: input.num_results } : {}),
    ...(input.filters ? { filters: input.filters } : {}),
    ...(input.contents ? { contents: input.contents } : {}),
  };
  const response = isMockApiEnabled()
    ? mockPeopleSearch(input)
    : await ploidFetch<PloidSearchResponse>("/search", request);
  return normalizePeopleSearchResponse(response);
}
