import {
  emitWorkspaceEvent,
  getWorkspace,
  newEvent,
  saveWorkspace,
} from "@/lib/workspace/store";
import type {
  TableOperation,
  Workspace,
  WorkspaceColumn,
} from "@/lib/workspace/types";

const allowedTypes = new Set([
  "text",
  "number",
  "currency",
  "percentage",
  "boolean",
  "date",
  "url",
  "email",
  "select",
  "multi-select",
  "json",
  "formula",
  "ai",
]);
export function validateOperations(
  workspace: Workspace,
  operations: TableOperation[],
) {
  for (const operation of operations) {
    if (
      operation.type === "add_column" &&
      (!operation.column.id ||
        !operation.column.name ||
        !allowedTypes.has(operation.column.dataType))
    )
      throw new Error("Invalid column operation");
    if (
      "columnId" in operation &&
      !workspace.table.columns.some(
        (column) => column.id === operation.columnId,
      )
    )
      throw new Error(`Unknown column: ${operation.columnId}`);
    if (operation.type === "update_cells")
      for (const update of operation.updates)
        if (
          !workspace.table.rows.some((row) => row.id === update.rowId) ||
          !workspace.table.columns.some(
            (column) => column.id === update.columnId,
          )
        )
          throw new Error("Update references an unknown row or column");
  }
}
export const TableService = {
  applyOperations(workspaceId: string, operations: TableOperation[]) {
    const workspace = getWorkspace(workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    validateOperations(workspace, operations);
    for (const operation of operations) {
      const table = workspace.table;
      if (operation.type === "add_column") {
        table.columns.push(operation.column);
        table.rows.forEach((row) => {
          row.cells[operation.column.id] = null;
        });
        emitWorkspaceEvent(
          newEvent(workspaceId, "table.column.added", { operation }),
        );
      }
      if (operation.type === "update_column") {
        const column = table.columns.find(
          (item) => item.id === operation.columnId,
        );
        if (column) Object.assign(column, operation.patch);
        emitWorkspaceEvent(
          newEvent(workspaceId, "table.column.updated", { operation }),
        );
      }
      if (operation.type === "delete_column") {
        table.columns = table.columns.filter(
          (column) => column.id !== operation.columnId,
        );
        table.rows.forEach((row) => delete row.cells[operation.columnId]);
        emitWorkspaceEvent(
          newEvent(workspaceId, "table.column.deleted", { operation }),
        );
      }
      if (operation.type === "add_rows") {
        table.rows.push(...operation.rows);
        emitWorkspaceEvent(
          newEvent(workspaceId, "table.rows.added", { operation }),
        );
      }
      if (operation.type === "update_cells") {
        operation.updates.forEach((update) => {
          const row = table.rows.find((item) => item.id === update.rowId);
          if (row) row.cells[update.columnId] = update.value;
        });
        emitWorkspaceEvent(
          newEvent(workspaceId, "table.cells.updated", { operation }),
        );
      }
      if (operation.type === "delete_rows") {
        table.rows = table.rows.filter(
          (row) => !operation.rowIds.includes(row.id),
        );
        emitWorkspaceEvent(
          newEvent(workspaceId, "table.rows.deleted", { operation }),
        );
      }
      if (operation.type === "sort_rows") {
        table.rows.sort(
          (a, b) =>
            String(a.cells[operation.columnId] ?? "").localeCompare(
              String(b.cells[operation.columnId] ?? ""),
              undefined,
              { numeric: true },
            ) * (operation.direction === "asc" ? 1 : -1),
        );
        emitWorkspaceEvent(
          newEvent(workspaceId, "table.cells.updated", { operation }),
        );
      }
    }
    return saveWorkspace(workspace);
  },
  addColumn(workspaceId: string, column: WorkspaceColumn) {
    return this.applyOperations(workspaceId, [{ type: "add_column", column }]);
  },
};
