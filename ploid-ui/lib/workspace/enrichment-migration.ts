import type { EnrichmentDefinition, WorkspaceTable } from "./types";

/**
 * Identifies safe legacy candidates without mutating them. A caller may present
 * the consolidation to the user, preserving historical function IDs and runs.
 */
export function findConsolidatablePersonEnrichments(
  table: WorkspaceTable,
): Array<{ functionIds: string[]; columnIds: string[]; fields: Array<"profile" | "email" | "phone"> }> {
  const stable = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object")
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
        .join(",")}}`;
    return JSON.stringify(value);
  };
  const groups = new Map<string, { functionIds: string[]; columnIds: string[]; fields: Array<"profile" | "email" | "phone"> }>();
  for (const column of table.columns) {
    const binding = column.functionBinding;
    const definition = binding?.definition as { draftRevision?: { nodes?: Array<{ type?: string; config?: Record<string, unknown> }> } } | undefined;
    const node = definition?.draftRevision?.nodes?.find((item) => item.type === "ploid_enrich");
    const fields = Array.isArray(node?.config?.fields) ? node.config.fields.filter((field): field is "profile" | "email" | "phone" => field === "profile" || field === "email" || field === "phone") : [];
    if (!binding || fields.length !== 1) continue;
    // A shared Function can only replace the legacy functions if their input
    // bindings *and* their automatic-run policy agree. Keep distinct groups
    // rather than silently changing when existing columns refresh.
    const inputs = `${stable(binding.inputBindings)}|auto:${binding.autoRun !== false}`;
    const group = groups.get(inputs) ?? { functionIds: [], columnIds: [], fields: [] };
    group.functionIds.push(binding.functionId);
    group.columnIds.push(column.id);
    group.fields.push(fields[0]);
    groups.set(inputs, group);
  }
  return [...groups.values()].filter((group) => new Set(group.fields).size > 1);
}

/** Existing values and Function history are intentionally never deleted. */
export function migrationKeepsLegacyCompatibility(
  enrichment: EnrichmentDefinition,
  legacyFunctionIds: string[],
) {
  return enrichment.functionId !== "" && legacyFunctionIds.every(Boolean);
}
