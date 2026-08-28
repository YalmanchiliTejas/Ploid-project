import { createFunction } from "@/lib/functions/service";
import { findConsolidatablePersonEnrichments } from "@/lib/workspace/enrichment-migration";
import { getWorkspace, saveWorkspace } from "@/lib/workspace/store";
import type { EnrichmentDefinition } from "@/lib/workspace/types";

export async function GET(_: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const workspace = getWorkspace(workspaceId);
  return workspace ? Response.json({ data: findConsolidatablePersonEnrichments(workspace.table) }) : Response.json({ error: "Workspace not found" }, { status: 404 });
}

/** Explicit migration only: values remain in place and old Function IDs stay registered. */
export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await params;
    const workspace = getWorkspace(workspaceId);
    if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });
    const body = await request.json() as { functionIds?: string[] };
    const candidate = findConsolidatablePersonEnrichments(workspace.table).find((item) => JSON.stringify(item.functionIds.slice().sort()) === JSON.stringify((body.functionIds ?? []).slice().sort()));
    if (!candidate) return Response.json({ error: "No compatible legacy enrichments selected" }, { status: 400 });
    const columns = candidate.columnIds.map((id) => workspace.table.columns.find((column) => column.id === id)).filter((column): column is NonNullable<typeof column> => !!column);
    const inputBindings = columns[0].functionBinding!.inputBindings;
    const linkedinInput = Object.keys(inputBindings)[0] ?? "linkedin_url";
    const fn = createFunction({
      name: "Person Enrichment",
      description: `Migrated Ploid person enrichment (${candidate.fields.join(", ")})`,
      inputs: Object.entries(inputBindings).map(([id]) => ({ id, name: id, dataType: "text" })),
      outputs: candidate.fields.map((field) => ({ id: field, name: field === "email" ? "Work Email" : field[0].toUpperCase() + field.slice(1), dataType: field === "email" ? "email" : "text" })),
      nodes: [{ id: `node_${crypto.randomUUID()}`, type: "ploid_enrich", config: { linkedinInput, fields: candidate.fields } }],
    });
    const createdAt = new Date().toISOString();
    const enrichment: EnrichmentDefinition = {
      id: `enr_${crypto.randomUUID()}`,
      name: "Person Enrichment",
      kind: "ploid_person",
      provider: "ploid",
      inputBindings,
      configuration: { enrichments: candidate.fields },
      steps: [{ id: `step_${crypto.randomUUID()}`, provider: "ploid", operation: "enrich" }],
      outputs: columns.map((column) => ({ id: column.functionBinding!.outputId!, label: column.name, field: column.functionBinding!.outputId!, columnId: column.id, dataType: column.dataType })),
      runSettings: { autoUpdate: columns.every((column) => column.functionBinding?.autoRun !== false), onlyRunIf: "any_missing_or_stale" },
      functionId: fn.id,
      legacyFunctionIds: candidate.functionIds,
      rowExecutions: {},
      createdAt,
      updatedAt: createdAt,
    };
    columns.forEach((column) => {
      column.functionBinding = { ...column.functionBinding!, functionId: fn.id, definition: fn, inputBindings };
      column.enrichmentBinding = { enrichmentId: enrichment.id, functionId: fn.id, outputId: column.functionBinding.outputId ?? "result" };
    });
    workspace.enrichments ??= [];
    workspace.enrichments.push(enrichment);
    saveWorkspace(workspace);
    return Response.json({ data: enrichment }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Migration failed" }, { status: 400 });
  }
}
