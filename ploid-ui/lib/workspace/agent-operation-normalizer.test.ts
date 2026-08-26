import { describe, expect, it } from "vitest";
import { normalizeAgentOperations } from "./agent-operation-normalizer";
import type { Workspace } from "./types";

const workspace = (): Workspace => ({
  id: "workspace_1", name: "Test", tableId: "table_1", ploidSessionId: undefined,
  table: { id: "table_1", name: "Test", columns: [{ id: "col_company", name: "Company", dataType: "text" }], rows: [{ id: "row_openai", cells: { col_company: "OpenAI" } }] },
  tables: [], messages: [], agentTurns: [], notices: [], peopleSearches: [], createdAt: "now", updatedAt: "now",
});

describe("normalizeAgentOperations", () => {
  it("uses semantic IDs and accepts a column added before its cell updates", () => {
    const result = normalizeAgentOperations({ operations: [
      { type: "add_column", column: { name: "Founder", dataType: "text" } },
      { type: "update_cells", updates: [{ rowId: "row_openai", columnId: "col_founder", value: "Sam" }] },
    ] }, workspace());
    expect(result.operations[0]).toMatchObject({ type: "add_column", column: { id: "col_founder" } });
    expect(result.operations).toHaveLength(2);
  });

  it("rejects malformed operations before TableService sees them", () => {
    expect(() => normalizeAgentOperations({ operations: [{ type: "update_cells", updates: [{ rowId: "row_openai", columnId: "A1", value: "bad" }] }] }, workspace())).toThrow("Unknown column");
    expect(() => normalizeAgentOperations({ operations: [{ type: "drop_everything" }] }, workspace())).toThrow();
  });
});
