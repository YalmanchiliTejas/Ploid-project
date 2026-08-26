import type { TableOperation } from "./types";

export function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true; // preserve 0 and false
}

/**
 * Only newly materialized Agent columns are pruned. Existing user columns are
 * never removed merely because one response could not populate them.
 */
export function normalizeStructuredTable(
  operations: TableOperation[],
): TableOperation[] {
  const candidateIds = new Set(
    operations
      .filter((operation) => operation.type === "add_column")
      .map((operation) => operation.column.id),
  );
  const materialized = new Set<string>();
  for (const operation of operations) {
    if (operation.type !== "add_rows") continue;
    for (const row of operation.rows)
      for (const [columnId, value] of Object.entries(row.cells))
        if (candidateIds.has(columnId) && isMeaningfulValue(value))
          materialized.add(columnId);
  }
  const pruned = new Set(
    [...candidateIds].filter((columnId) => !materialized.has(columnId)),
  );
  if (!pruned.size) return operations;

  const normalized: TableOperation[] = [];
  for (const operation of operations) {
    if (operation.type === "add_column" && pruned.has(operation.column.id))
      continue;
    if (operation.type === "add_rows") {
      normalized.push({
        ...operation,
        rows: operation.rows.map((row) => ({
          ...row,
          cells: Object.fromEntries(
            Object.entries(row.cells).filter(([columnId]) => !pruned.has(columnId)),
          ),
        })),
      });
      continue;
    }
    normalized.push(operation);
  }
  return normalized;
}
