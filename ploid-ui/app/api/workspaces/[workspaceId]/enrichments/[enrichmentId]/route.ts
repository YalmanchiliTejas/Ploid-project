import { coerceFunctionValue, updateFunction } from "@/lib/functions/service";
import { TableService } from "@/lib/table/service";
import { getWorkspace, saveWorkspace } from "@/lib/workspace/store";
import type { EnrichmentDefinition, WorkspaceColumn } from "@/lib/workspace/types";

const personLabels = { email: "Work Email", phone: "Phone", profile: "Profile" } as const;
const validPersonField = (field: string): field is keyof typeof personLabels =>
  field === "email" || field === "phone" || field === "profile";

function outputColumn(
  enrichment: EnrichmentDefinition,
  field: string,
): WorkspaceColumn {
  const id = `col_enrichment_${field}_${crypto.randomUUID()}`;
  return {
    id,
    name: enrichment.kind === "ploid_person" && validPersonField(field)
      ? personLabels[field]
      : field,
    dataType: field === "email" ? "email" : "text",
    functionBinding: {
      functionId: enrichment.functionId,
      outputId: field,
      inputBindings: enrichment.inputBindings,
    },
    enrichmentBinding: {
      enrichmentId: enrichment.id,
      functionId: enrichment.functionId,
      outputId: field,
    },
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ workspaceId: string; enrichmentId: string }> }) {
  const { workspaceId, enrichmentId } = await params;
  const enrichment = getWorkspace(workspaceId)?.enrichments?.find((item) => item.id === enrichmentId);
  return enrichment
    ? Response.json({ data: enrichment })
    : Response.json({ error: "Enrichment not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string; enrichmentId: string }> }) {
  try {
    const { workspaceId, enrichmentId } = await params;
    const workspace = getWorkspace(workspaceId);
    const enrichment = workspace?.enrichments?.find((item) => item.id === enrichmentId);
    if (!workspace || !enrichment) return Response.json({ error: "Enrichment not found" }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const requested = enrichment.kind === "ploid_person"
      ? (Array.isArray(body.outputs) ? body.outputs.filter((field): field is keyof typeof personLabels => typeof field === "string" && validPersonField(field)) : enrichment.configuration.enrichments ?? [])
      : (Array.isArray(body.outputs) ? body.outputs.filter((field): field is string => typeof field === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(field)) : enrichment.configuration.socialFields ?? []);
    if (!requested.length) return Response.json({ error: "Keep at least one output or delete the enrichment" }, { status: 400 });
    if (body.inputBindings && typeof body.inputBindings === "object") enrichment.inputBindings = body.inputBindings as EnrichmentDefinition["inputBindings"];
    if (body.runSettings && typeof body.runSettings === "object") enrichment.runSettings = { ...enrichment.runSettings, ...(body.runSettings as Partial<EnrichmentDefinition["runSettings"]>) };
    const oldFields = new Set(enrichment.outputs.map((output) => output.id));
    const requestedSet = new Set(requested);
    const removed = enrichment.outputs.filter((output) => !requestedSet.has(output.id));
    if (removed.length) TableService.applyOperations(workspaceId, removed.map((output) => ({ type: "delete_column" as const, columnId: output.columnId })));
    const additions = requested.filter((field) => !oldFields.has(field)).map((field) => outputColumn(enrichment, field));
    if (additions.length) TableService.applyOperations(workspaceId, additions.map((column) => ({ type: "add_column" as const, column })));
    enrichment.outputs = [
      ...enrichment.outputs.filter((output) => requestedSet.has(output.id)),
      ...additions.map((column) => ({ id: column.enrichmentBinding!.outputId, label: column.name, field: column.enrichmentBinding!.outputId, columnId: column.id, dataType: column.dataType })),
    ];
    if (enrichment.kind === "ploid_person") enrichment.configuration.enrichments = requested as Array<keyof typeof personLabels>;
    else enrichment.configuration.socialFields = requested;
    updateFunction(enrichment.functionId, {
      inputs: Object.entries(enrichment.inputBindings).map(([id]) => ({ id, name: id, dataType: "text" })),
      outputs: enrichment.outputs.map((output) => ({ id: output.id, name: output.label, dataType: output.dataType })),
      nodes: [{
        id: `node_${crypto.randomUUID()}`,
        type: enrichment.kind === "ploid_person" ? "ploid_enrich" : "ploid_social",
        config: enrichment.kind === "ploid_person"
          ? { linkedinInput: "linkedin_url", firstNameInput: "first_name", lastNameInput: "last_name", fields: enrichment.configuration.enrichments }
          : { identifierInput: "identifier", platform: enrichment.configuration.socialPlatform, outputFields: enrichment.configuration.socialFields },
      }],
    });
    // Materialize any previously requested field from the shared result; no
    // provider call is made here.
    const updates = additions.flatMap((column) => Object.values(enrichment.rowExecutions ?? {}).map((execution) => ({ rowId: execution.rowId, columnId: column.id, value: coerceFunctionValue(execution.normalizedOutputs[column.enrichmentBinding!.outputId] ?? null, column.dataType) })));
    if (updates.length) TableService.applyOperations(workspaceId, [{ type: "update_cells", updates }]);
    enrichment.updatedAt = new Date().toISOString();
    saveWorkspace(workspace);
    return Response.json({ data: enrichment });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update enrichment" }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ workspaceId: string; enrichmentId: string }> }) {
  const { workspaceId, enrichmentId } = await params;
  const workspace = getWorkspace(workspaceId);
  const enrichment = workspace?.enrichments?.find((item) => item.id === enrichmentId);
  if (!workspace || !enrichment) return Response.json({ error: "Enrichment not found" }, { status: 404 });
  if (enrichment.outputs.length) TableService.applyOperations(workspaceId, enrichment.outputs.map((output) => ({ type: "delete_column" as const, columnId: output.columnId })));
  workspace.enrichments = workspace.enrichments?.filter((item) => item.id !== enrichmentId);
  saveWorkspace(workspace);
  return Response.json({ data: { deleted: enrichmentId } });
}
