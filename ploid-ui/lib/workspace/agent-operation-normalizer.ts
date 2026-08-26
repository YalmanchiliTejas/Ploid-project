import type { TableOperation, Workspace } from "./types";
import {
  agentWorkspaceResultSchema,
  type AgentWorkspaceResult,
} from "./agent-operation-schema";

const identifier = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "column";

function nextId(prefix: "col" | "row", preferred: string, occupied: Set<string>) {
  const base = `${prefix}_${identifier(preferred)}`;
  let candidate = base;
  let suffix = 2;
  while (occupied.has(candidate)) candidate = `${base}_${suffix++}`;
  occupied.add(candidate);
  return candidate;
}

/** Validates Ploid structured output and turns it into our table-only model. */
export function normalizeAgentOperations(
  value: unknown,
  workspace: Workspace,
): { result: AgentWorkspaceResult; operations: TableOperation[] } {
  const result = agentWorkspaceResultSchema.parse(value);
  const columns = new Set(workspace.table.columns.map((column) => column.id));
  const rows = new Set(workspace.table.rows.map((row) => row.id));
  const operations: TableOperation[] = [];

  for (const operation of result.operations) {
    if (operation.type === "add_column") {
      const id = operation.column.id ?? nextId("col", operation.column.name, columns);
      if (operation.column.id) {
        if (columns.has(id)) throw new Error(`Duplicate column ID: ${id}`);
        columns.add(id);
      }
      operations.push({ type: "add_column", column: { ...operation.column, id } });
    } else if (operation.type === "update_column") {
      if (!columns.has(operation.columnId)) throw new Error(`Unknown column: ${operation.columnId}`);
      operations.push({ type: "update_column", columnId: operation.columnId, patch: operation.changes });
    } else if (operation.type === "add_rows") {
      const normalizedRows = operation.rows.map((row, index) => {
        const id = row.id ?? nextId("row", String(index + rows.size + 1), rows);
        if (row.id) {
          if (rows.has(id)) throw new Error(`Duplicate row ID: ${id}`);
          rows.add(id);
        }
        for (const columnId of Object.keys(row.values))
          if (!columns.has(columnId)) throw new Error(`Unknown column: ${columnId}`);
        return { id, cells: row.values };
      });
      operations.push({ type: "add_rows", rows: normalizedRows });
    } else if (operation.type === "update_cells") {
      for (const update of operation.updates) {
        if (!rows.has(update.rowId)) throw new Error(`Unknown row: ${update.rowId}`);
        if (!columns.has(update.columnId)) throw new Error(`Unknown column: ${update.columnId}`);
      }
      operations.push(operation);
    } else if (operation.type === "delete_rows") {
      for (const rowId of operation.rowIds) {
        if (!rows.has(rowId)) throw new Error(`Unknown row: ${rowId}`);
        rows.delete(rowId);
      }
      operations.push(operation);
    } else {
      if (!columns.has(operation.columnId)) throw new Error(`Unknown column: ${operation.columnId}`);
      operations.push(operation);
    }
  }
  return { result, operations };
}
