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
import type { PersonRow } from "@/lib/ploid/types";

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
  const columnIds = new Set(workspace.table.columns.map((column) => column.id));
  const rowIds = new Set(workspace.table.rows.map((row) => row.id));
  for (const operation of operations) {
    if (
      operation.type === "add_column" &&
      (!operation.column.id ||
        !operation.column.name ||
        !allowedTypes.has(operation.column.dataType) ||
        columnIds.has(operation.column.id))
    )
      throw new Error("Invalid column operation");
    if (operation.type === "add_column") columnIds.add(operation.column.id);
    if ("columnId" in operation && !columnIds.has(operation.columnId))
      throw new Error(`Unknown column: ${operation.columnId}`);
    if (operation.type === "add_rows")
      for (const row of operation.rows) {
        if (!row.id || rowIds.has(row.id)) throw new Error("Invalid row operation");
        for (const columnId of Object.keys(row.cells))
          if (!columnIds.has(columnId)) throw new Error(`Unknown column: ${columnId}`);
        rowIds.add(row.id);
      }
    if (operation.type === "update_cells")
      for (const update of operation.updates)
        if (
          !rowIds.has(update.rowId) ||
          !columnIds.has(update.columnId)
        )
          throw new Error("Update references an unknown row or column");
    if (operation.type === "delete_rows")
      for (const rowId of operation.rowIds) {
        if (!rowIds.has(rowId)) throw new Error(`Unknown row: ${rowId}`);
        rowIds.delete(rowId);
      }
  }
}
export const TableService = {
  applyOperations(workspaceId: string, operations: TableOperation[]) {
    const workspace = getWorkspace(workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    validateOperations(workspace, operations);
    const eventQueue = [] as ReturnType<typeof newEvent>[];
    for (const operation of operations) {
      const table = workspace.table;
      if (operation.type === "add_column") {
        table.columns.push(operation.column);
        table.rows.forEach((row) => {
          row.cells[operation.column.id] = null;
        });
        eventQueue.push(
          newEvent(workspaceId, "table.column.added", { operation }),
        );
      }
      if (operation.type === "update_column") {
        const column = table.columns.find(
          (item) => item.id === operation.columnId,
        );
        if (column) Object.assign(column, operation.patch);
        eventQueue.push(
          newEvent(workspaceId, "table.column.updated", { operation }),
        );
      }
      if (operation.type === "delete_column") {
        table.columns = table.columns.filter(
          (column) => column.id !== operation.columnId,
        );
        table.rows.forEach((row) => delete row.cells[operation.columnId]);
        // Remove bindings to deleted inputs so dependency views and later
        // Function runs never retain a dangling column reference.
        table.columns.forEach((column) => {
          if (!column.functionBinding) return;
          const inputBindings = Object.fromEntries(
            Object.entries(column.functionBinding.inputBindings).filter(
              ([, binding]) =>
                binding.type !== "column" ||
                binding.columnId !== operation.columnId,
            ),
          );
          column.functionBinding = {
            ...column.functionBinding,
            inputBindings,
          };
        });
        // Removing an output intentionally does not delete its enrichment.
        // The last-output confirmation belongs to the enrichment UI/API.
        workspace.enrichments ??= [];
        workspace.enrichments.forEach((enrichment) => {
          enrichment.outputs = enrichment.outputs.filter(
            (output) => output.columnId !== operation.columnId,
          );
          enrichment.updatedAt = new Date().toISOString();
        });
        eventQueue.push(
          newEvent(workspaceId, "table.column.deleted", { operation }),
        );
      }
      if (operation.type === "add_rows") {
        table.rows.push(...operation.rows);
        eventQueue.push(
          newEvent(workspaceId, "table.rows.added", { operation }),
        );
      }
      if (operation.type === "update_cells") {
        operation.updates.forEach((update) => {
          const row = table.rows.find((item) => item.id === update.rowId);
          if (row) row.cells[update.columnId] = update.value;
        });
        // Input changes invalidate the shared enrichment execution exactly
        // once; output columns merely project that state.
        for (const update of operation.updates) {
          workspace.enrichments?.forEach((enrichment) => {
            const isInput = Object.values(enrichment.inputBindings).some(
              (binding) => binding.type === "column" && binding.columnId === update.columnId,
            );
            if (!isInput) return;
            const execution = enrichment.rowExecutions?.[update.rowId];
            if (execution) {
              execution.status = "stale";
              enrichment.updatedAt = new Date().toISOString();
              enrichment.outputs.forEach((output) => eventQueue.push(newEvent(workspaceId, "enrichment.row.stale", { enrichmentId: enrichment.id, columnId: output.columnId, rowId: update.rowId, autoUpdate: enrichment.runSettings.autoUpdate })));
            }
          });
        }
        eventQueue.push(
          newEvent(workspaceId, "table.cells.updated", { operation }),
        );
      }
      if (operation.type === "delete_rows") {
        table.rows = table.rows.filter(
          (row) => !operation.rowIds.includes(row.id),
        );
        eventQueue.push(
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
    const saved = saveWorkspace(workspace);
    eventQueue.forEach(emitWorkspaceEvent);
    // Consumers that hydrate a mounted workbook use this atomic notification,
    // rather than racing individual column/row notifications.
    emitWorkspaceEvent(
      newEvent(workspaceId, "table.operations.applied", { operations }),
    );
    return saved;
  },
  addColumn(workspaceId: string, column: WorkspaceColumn) {
    return this.applyOperations(workspaceId, [{ type: "add_column", column }]);
  },
  addPeopleSearchRows(workspaceId: string, people: PersonRow[]) {
    const workspace = getWorkspace(workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    const operations = peopleSearchOperations(workspace, people);
    if (operations.some((operation) => operation.type === "add_rows" && operation.rows.length))
      return this.applyOperations(workspaceId, operations);
    return workspace;
  },
};

export function peopleSearchOperations(
  workspace: Workspace,
  people: PersonRow[],
): TableOperation[] {
    const columns: Array<[string, string, WorkspaceColumn["dataType"]]> = [
      ["person_name", "Name", "text"],
      ["person_contact", "Contact", "text"],
      ["person_linkedin", "LinkedIn", "url"],
    ];
    const existing = new Set(workspace.table.columns.map((column) => column.id));
    const existingRows = new Set(workspace.table.rows.map((row) => row.id));
    const newPeople = people.filter((person) => !existingRows.has(person.id));
    return [
      ...columns
        .filter(([id]) => !existing.has(id))
        .map(([id, name, dataType]) => ({ type: "add_column" as const, column: { id, name, dataType } })),
      {
        type: "add_rows" as const,
        rows: newPeople.map((person) => ({
          id: person.id,
          cells: {
            person_name: person.name ?? null,
            person_contact: person.email ?? null,
            person_linkedin: person.linkedinUrl ?? null,
          },
        })),
      },
    ];
}
