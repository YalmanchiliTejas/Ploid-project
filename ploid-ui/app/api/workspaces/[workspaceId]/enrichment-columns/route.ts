import { createFunction } from "@/lib/functions/service";
import {
  PLOID_SOCIAL_PLATFORMS,
  PLOID_PERSON_ENRICHMENTS,
  type PloidSocialPlatform,
} from "@/lib/ploid/client";
import { TableService } from "@/lib/table/service";
import type { ColumnDataType } from "@/lib/spreadsheet/columns";
import type { EnrichmentDefinition } from "@/lib/workspace/types";
import { getWorkspace } from "@/lib/workspace/store";

const personFields = new Set<string>(PLOID_PERSON_ENRICHMENTS);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    const workspace = getWorkspace(workspaceId);
    if (!workspace)
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    const kind = body.kind === "social" ? "social" : "person";
    const inputColumnId = typeof body.inputColumnId === "string" ? body.inputColumnId : "";
    const inputColumn = workspace.table.columns.find(
      (column) => column.id === inputColumnId,
    );
    if (!inputColumn)
      return Response.json(
        { error: "Select a valid input column" },
        { status: 400 },
      );

    const outputField =
      typeof body.outputField === "string" ? body.outputField : "";
    const selectedSocialFields = Array.isArray(body.socialFields)
      ? body.socialFields.filter((field): field is string =>
          typeof field === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(field),
        )
      : outputField && /^[A-Za-z][A-Za-z0-9_]*$/.test(outputField)
        ? [outputField]
        : [];
    const outputFields = Array.isArray(body.outputFields)
      ? body.outputFields.filter(
          (field): field is "profile" | "email" | "phone" =>
            typeof field === "string" && personFields.has(field),
        )
      : [];
    const selectedPersonFields =
      outputFields.length
        ? outputFields
        : personFields.has(outputField)
          ? [outputField as "profile" | "email" | "phone"]
          : [];
    const socialPlatform = body.platform as PloidSocialPlatform;
    if (kind === "person" && !selectedPersonFields.length)
      return Response.json(
        { error: "Select an enrichment output" },
        { status: 400 },
      );
    if (kind === "social" && !PLOID_SOCIAL_PLATFORMS.includes(socialPlatform))
      return Response.json(
        { error: "Select a supported social platform" },
        { status: 400 },
      );
    if (kind === "social" && !selectedSocialFields.length)
      return Response.json(
        { error: "Choose one or more social profile fields" },
        { status: 400 },
      );

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : kind === "person"
          ? selectedPersonFields.length > 1
            ? "Person Enrichment"
            : ({ email: "Work Email", phone: "Phone", profile: "Person Profile" }[
                selectedPersonFields[0]
              ] ?? "Person Enrichment")
          : `${socialPlatform[0].toUpperCase()}${socialPlatform.slice(1)} Profile`;
    const firstNameColumnId = typeof body.firstNameColumnId === "string" ? body.firstNameColumnId : "";
    const lastNameColumnId = typeof body.lastNameColumnId === "string" ? body.lastNameColumnId : "";
    const inputBindings: EnrichmentDefinition["inputBindings"] = {
      [kind === "person" ? "linkedin_url" : "identifier"]: { type: "column", columnId: inputColumnId },
      ...(kind === "person" && firstNameColumnId ? { first_name: { type: "column", columnId: firstNameColumnId } } : {}),
      ...(kind === "person" && lastNameColumnId ? { last_name: { type: "column", columnId: lastNameColumnId } } : {}),
    };
    const node =
      kind === "person"
        ? {
            id: `node_${crypto.randomUUID()}`,
            type: "ploid_enrich" as const,
            config: {
              linkedinInput: "linkedin_url",
              firstNameInput: "first_name",
              lastNameInput: "last_name",
              fields: selectedPersonFields,
              output: "result",
            },
          }
        : {
            id: `node_${crypto.randomUUID()}`,
            type: "ploid_social" as const,
            config: {
              identifierInput: "identifier",
              platform: socialPlatform,
              outputFields: selectedSocialFields,
              output: "result",
            },
          };
    const functionDefinition = createFunction({
      name,
      description:
        kind === "person"
          ? `Ploid person enrichment (${selectedPersonFields.join(", ")})`
          : `Ploid ${socialPlatform} social enrichment`,
      inputs: Object.entries(inputBindings).map(([id, binding]) => ({
        id,
        name: workspace.table.columns.find((column) => column.id === binding.columnId)?.name ?? id,
        dataType: workspace.table.columns.find((column) => column.id === binding.columnId)?.dataType ?? "text",
      })),
      outputs:
        kind === "person"
          ? selectedPersonFields.map((field) => ({
              id: field,
              name: { email: "Work Email", phone: "Phone", profile: "Profile" }[
                field
              ],
              dataType: "text",
            }))
          : selectedSocialFields.map((field) => ({
              id: field,
              name: field,
              dataType: "text",
            })),
      nodes: [node],
    });
    const enrichmentId = `enr_${crypto.randomUUID()}`;
    const columns =
      kind === "person"
        ? selectedPersonFields.map((field) => ({
            id: `col_person_${field}_${crypto.randomUUID()}`,
            name:
              selectedPersonFields.length === 1 && name !== "Person Enrichment"
                ? name
                : { email: "Work Email", phone: "Phone", profile: "Profile" }[
                    field
                  ],
            dataType: (field === "email" ? "email" : "text") as ColumnDataType,
            functionBinding: {
              functionId: functionDefinition.id,
              outputId: field,
              autoRun: body.autoUpdate !== false,
              definition: functionDefinition,
              inputBindings,
            },
            enrichmentBinding: { enrichmentId, functionId: functionDefinition.id, outputId: field },
          }))
        : selectedSocialFields.map((field) => ({
              id: `col_social_${field}_${crypto.randomUUID()}`,
              name: selectedSocialFields.length === 1 ? name : field,
              dataType: "text" as ColumnDataType,
              functionBinding: {
                functionId: functionDefinition.id,
                outputId: field,
                autoRun: body.autoUpdate !== false,
                definition: functionDefinition,
                inputBindings,
              },
              enrichmentBinding: { enrichmentId, functionId: functionDefinition.id, outputId: field },
            }));
    const createdAt = new Date().toISOString();
    const enrichment: EnrichmentDefinition = {
      id: enrichmentId,
      name,
      kind: kind === "person" ? "ploid_person" : "ploid_social",
      provider: "ploid",
      inputBindings,
      configuration: kind === "person"
        ? { enrichments: selectedPersonFields }
        : { socialPlatform, socialFields: selectedSocialFields },
      steps: [{ id: `step_${crypto.randomUUID()}`, provider: "ploid", operation: kind === "person" ? "enrich" : "socials" }],
      outputs: columns.map((column) => ({
        id: column.enrichmentBinding!.outputId,
        label: column.name,
        field: column.enrichmentBinding!.outputId,
        columnId: column.id,
        dataType: column.dataType,
      })),
      runSettings: { autoUpdate: body.autoUpdate !== false, onlyRunIf: body.onlyRunIf ?? "any_missing_or_stale" },
      functionId: functionDefinition.id,
      rowExecutions: {},
      createdAt,
      updatedAt: createdAt,
    };
    workspace.enrichments ??= [];
    workspace.enrichments.push(enrichment);
    TableService.applyOperations(
      workspaceId,
      columns.map((column) => ({ type: "add_column" as const, column })),
    );
    return Response.json(
      { data: { column: columns[0], columns, function: functionDefinition, enrichment } },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save enrichment",
      },
      { status: 400 },
    );
  }
}
