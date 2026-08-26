import { describe, expect, it } from "vitest";
import { isMeaningfulValue, normalizeStructuredTable } from "./normalize-structured-table";

describe("normalizeStructuredTable", () => {
  it("removes new columns that are null-like in every result row", () => {
    const operations = normalizeStructuredTable([
      { type: "add_column", column: { id: "company", name: "Company", dataType: "text" } },
      { type: "add_column", column: { id: "domain", name: "Domain", dataType: "url" } },
      { type: "add_column", column: { id: "industry", name: "Industry", dataType: "text" } },
      { type: "add_rows", rows: [
        { id: "1", cells: { company: null, domain: "fixyee.com", industry: "  " } },
        { id: "2", cells: { company: null, domain: "fleet.com", industry: null } },
      ] },
    ]);
    expect(operations).toEqual([
      { type: "add_column", column: { id: "domain", name: "Domain", dataType: "url" } },
      { type: "add_rows", rows: [
        { id: "1", cells: { domain: "fixyee.com" } },
        { id: "2", cells: { domain: "fleet.com" } },
      ] },
    ]);
  });

  it("keeps partially populated fields and meaningful false/zero values", () => {
    expect(isMeaningfulValue(0)).toBe(true);
    expect(isMeaningfulValue(false)).toBe(true);
    expect(isMeaningfulValue([])).toBe(false);
    expect(isMeaningfulValue({})).toBe(false);
    expect(normalizeStructuredTable([
      { type: "add_column", column: { id: "email", name: "Email", dataType: "email" } },
      { type: "add_rows", rows: [
        { id: "1", cells: { email: null } },
        { id: "2", cells: { email: "hello@example.com" } },
      ] },
    ])).toHaveLength(2);
  });
});
