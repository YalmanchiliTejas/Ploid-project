import { openRouterStructured } from "@/lib/openrouter/client";
import { getWorkspace } from "@/lib/workspace/store";

const outputTypes = [
  "text",
  "number",
  "boolean",
  "url",
  "date",
  "json",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    const workspace = getWorkspace(workspaceId);
    if (!workspace)
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    const body = (await request.json()) as { instruction?: unknown };
    if (typeof body.instruction !== "string" || !body.instruction.trim())
      return Response.json(
        { error: "Describe what this column should do" },
        { status: 400 },
      );
    const columns = workspace.table.columns.map((column) => ({
      id: column.id,
      name: column.name,
      dataType: column.dataType,
      description: column.description,
    }));
    const schema = {
      type: "object",
      additionalProperties: false,
      // OpenRouter strict JSON schemas require every declared object property
      // to be required. Optional UI fields are represented by an empty string
      // or empty array instead of optional schema properties.
      required: [
        "name",
        "description",
        "promptTemplate",
        "inputColumnIds",
        "outputType",
        "systemPrompt",
      ],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        promptTemplate: { type: "string" },
        inputColumnIds: {
          type: "array",
          items: { type: "string", enum: columns.map((column) => column.id) },
        },
        outputType: { type: "string", enum: outputTypes },
        systemPrompt: { type: "string" },
      },
    };
    const config = await openRouterStructured<Record<string, unknown>>({
      system:
        "You configure AI-powered spreadsheet columns. Return only the requested JSON. Do not perform the research. Infer Boolean when the user asks whether something is true/false, is a fit, or asks a yes/no question.",
      prompt: [
        "Create a lightweight reusable AI-column configuration.",
        `User instruction: ${body.instruction.trim()}`,
        `Available columns: ${JSON.stringify(columns)}`,
        `One sample row: ${JSON.stringify(workspace.table.rows[0]?.cells ?? {})}`,
        "promptTemplate must reference values only as {{stable_column_id}}. inputColumnIds must contain only available stable IDs.",
      ].join("\n\n"),
      schemaName: "ai_column_configuration",
      schema,
    });
    const booleanIntent =
      /\b(true|false|boolean|whether|is\s+.+\s+(a\s+)?fit|yes\s+or\s+no)\b/i.test(
        body.instruction,
      );
    if (booleanIntent) config.outputType = "boolean";
    return Response.json({ data: config });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate AI column",
      },
      { status: 502 },
    );
  }
}
