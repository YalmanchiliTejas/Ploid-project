import { describe, expect, it } from "vitest";
import { findConsolidatablePersonEnrichments } from "./enrichment-migration";

describe("legacy person enrichment migration", () => {
  it("only groups compatible single-field Ploid functions", () => {
    const binding = (functionId: string, field: string) => ({ functionId, inputBindings: { linkedin_url: { type: "column" as const, columnId: "linkedin" } }, definition: { draftRevision: { nodes: [{ type: "ploid_enrich", config: { fields: [field] } }] } } });
    const groups = findConsolidatablePersonEnrichments({ id: "t", name: "T", rows: [], columns: [
      { id: "email", name: "Email", dataType: "email", functionBinding: binding("fn_email", "email") },
      { id: "phone", name: "Phone", dataType: "text", functionBinding: binding("fn_phone", "phone") },
      { id: "other", name: "Other", dataType: "text", functionBinding: { ...binding("fn_other", "phone"), inputBindings: { linkedin_url: { type: "column", columnId: "other_linkedin" } } } },
    ] });
    expect(groups).toEqual([{ functionIds: ["fn_email", "fn_phone"], columnIds: ["email", "phone"], fields: ["email", "phone"] }]);
  });
});
