import { createFunction } from "@/lib/functions/service";
import {
  PLOID_SOCIAL_PLATFORMS,
  type PloidSocialPlatform,
} from "@/lib/ploid/client";
import { TableService } from "@/lib/table/service";
import type { ColumnDataType } from "@/lib/spreadsheet/columns";
import { getWorkspace } from "@/lib/workspace/store";

const personFields = new Set(["profile", "email", "phone"]);

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
    const inputColumnId =
      typeof body.inputColumnId === "string" ? body.inputColumnId : "";
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
    const socialPlatform = body.platform as PloidSocialPlatform;
    if (kind === "person" && !personFields.has(outputField))
      return Response.json(
        { error: "Select an enrichment output" },
        { status: 400 },
      );
    if (kind === "social" && !PLOID_SOCIAL_PLATFORMS.includes(socialPlatform))
      return Response.json(
        { error: "Select a supported social platform" },
        { status: 400 },
      );

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : kind === "person"
          ? ({ email: "Work Email", phone: "Phone", profile: "Person Profile" }[
              outputField
            ] ?? "Person enrichment")
          : `${socialPlatform[0].toUpperCase()}${socialPlatform.slice(1)} Profile`;
    const columnId = `col_${kind}_${crypto.randomUUID()}`;
    const node =
      kind === "person"
        ? {
            id: `node_${crypto.randomUUID()}`,
            type: "ploid_enrich" as const,
            config: {
              linkedinInput: inputColumnId,
              fields: [outputField],
              outputField,
              output: "result",
            },
          }
        : {
            id: `node_${crypto.randomUUID()}`,
            type: "ploid_social" as const,
            config: {
              identifierInput: inputColumnId,
              platform: socialPlatform,
              outputField,
              output: "result",
            },
          };
    const functionDefinition = createFunction({
      name,
      description:
        kind === "person"
          ? `Ploid ${outputField} enrichment`
          : `Ploid ${socialPlatform} social enrichment`,
      inputs: [
        {
          id: inputColumnId,
          name: inputColumn.name,
          dataType: inputColumn.dataType,
        },
      ],
      outputs: [
        {
          id: "result",
          name,
          dataType:
            outputField === "phone" || outputField === "email"
              ? "text"
              : "text",
        },
      ],
      nodes: [node],
    });
    const column = {
      id: columnId,
      name,
      dataType: (outputField === "email"
        ? "email"
        : outputField === "profile"
          ? "json"
          : "text") as ColumnDataType,
      functionBinding: {
        functionId: functionDefinition.id,
        definition: functionDefinition,
        inputBindings: {
          [inputColumnId]: { type: "column" as const, columnId: inputColumnId },
        },
      },
    };
    TableService.addColumn(workspaceId, column);
    return Response.json(
      { data: { column, function: functionDefinition } },
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
