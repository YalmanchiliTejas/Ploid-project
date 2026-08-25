import type { Workspace } from "./types";

export function buildWorkspaceContext(
  workspace: Workspace,
  selectedRowIds: string[] = [],
) {
  const selected = workspace.table.rows.filter((row) =>
    selectedRowIds.includes(row.id),
  );
  const rows = (
    selected.length ? selected : workspace.table.rows.slice(0, 20)
  ).map((row) => ({ id: row.id, values: row.cells }));
  return {
    workspace: { id: workspace.id, name: workspace.name },
    table: {
      id: workspace.table.id,
      columns: workspace.table.columns.map(({ id, name, dataType }) => ({
        id,
        name,
        dataType,
      })),
      rows,
      totalRows: workspace.table.rows.length,
    },
    instruction:
      "Use stable row and column IDs in operations. Never use A1 references. Destructive operations require confirmation and must not be emitted.",
  };
}
