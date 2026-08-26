import { describe, expect, it } from "vitest";
import { TableService } from "./service";
import { createWorkspace, getWorkspace } from "@/lib/workspace/store";

describe("TableService.applyOperations", () => {
  it("applies a validated semantic Agent mutation and emits canonical table state", () => {
    const workspace = createWorkspace({ name: "Companies", kind: "companies" });
    TableService.applyOperations(workspace.id, [
      { type: "add_column", column: { id: "col_company", name: "Company", dataType: "text" } },
      { type: "add_rows", rows: [{ id: "row_openai", cells: { col_company: "OpenAI" } }] },
      { type: "add_column", column: { id: "col_founder", name: "Founder", dataType: "text" } },
      { type: "update_cells", updates: [{ rowId: "row_openai", columnId: "col_founder", value: "Sam Altman" }] },
    ]);
    expect(getWorkspace(workspace.id)?.table.rows[0].cells.col_founder).toBe("Sam Altman");
  });
});
