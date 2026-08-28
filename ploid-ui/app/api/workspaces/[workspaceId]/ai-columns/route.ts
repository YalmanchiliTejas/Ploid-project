import { createFunction } from "@/lib/functions/service";
import { listOpenRouterModels } from "@/lib/openrouter/client";
import { TableService } from "@/lib/table/service";
import type { ColumnDataType } from "@/lib/spreadsheet/columns";
import { getWorkspace } from "@/lib/workspace/store";

const outputTypes = new Set([
  "text",
  "number",
  "boolean",
  "url",
  "date",
  "json",
]);

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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const promptTemplate =
      typeof body.promptTemplate === "string" ? body.promptTemplate.trim() : "";
    const inputColumnIds = Array.isArray(body.inputColumnIds)
      ? body.inputColumnIds.filter(
          (id): id is string =>
            typeof id === "string" &&
            workspace.table.columns.some((column) => column.id === id),
        )
      : [];
    const outputType: Extract<
      ColumnDataType,
      "text" | "number" | "boolean" | "url" | "date" | "json"
    > =
      typeof body.outputType === "string" && outputTypes.has(body.outputType)
        ? (body.outputType as Extract<
            ColumnDataType,
            "text" | "number" | "boolean" | "url" | "date" | "json"
          >)
        : "text";
    if (!name || !promptTemplate)
      return Response.json(
        { error: "Column name and instructions are required" },
        { status: 400 },
      );
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (!model)
      return Response.json(
        { error: "Select an OpenRouter model" },
        { status: 400 },
      );
    const available = (await listOpenRouterModels()).some(
      (item) => item.id === model,
    );
    if (!available)
      return Response.json(
        {
          error:
            "Select an available OpenRouter model",
        },
        { status: 400 },
      );
    const functionDefinition = createFunction({
      name,
      description:
        typeof body.description === "string" ? body.description : undefined,
      inputs: inputColumnIds.map((id) => ({
        id,
        name:
          workspace.table.columns.find((column) => column.id === id)?.name ??
          id,
        dataType: "text",
      })),
      outputs: [{ id: "result", name: name, dataType: outputType }],
      nodes: [
        {
          id: `node_${crypto.randomUUID()}`,
          type: "openrouter_ai",
          config: {
            promptTemplate,
            output: "result",
            outputType,
            model,
            systemPrompt:
              typeof body.systemPrompt === "string"
                ? body.systemPrompt
                : undefined,
          },
        },
      ],
    });
    const columnId = `col_ai_${crypto.randomUUID()}`;
    const column = {
      id: columnId,
      name,
      dataType: outputType,
      ...(typeof body.description === "string"
        ? { description: body.description }
        : {}),
      functionBinding: {
        functionId: functionDefinition.id,
        autoRun: body.runMode === "input_change",
        definition: functionDefinition,
        inputBindings: Object.fromEntries(
          inputColumnIds.map((id) => [
            id,
            { type: "column" as const, columnId: id },
          ]),
        ),
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
          error instanceof Error ? error.message : "Unable to save AI column",
      },
      { status: 400 },
    );
  }
}
