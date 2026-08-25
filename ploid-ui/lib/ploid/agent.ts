import { runPloidAgent } from "./client";
import type { TableOperation, Workspace } from "@/lib/workspace/types";

export type AgentResult = {
  message: string;
  operations: TableOperation[];
  sessionId?: string;
};
const scalarValueSchema = { type: "string" };
const dataTypeSchema = {
  type: "string",
  enum: [
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
  ],
};
const columnSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "dataType"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    dataType: dataTypeSchema,
    description: { type: "string" },
    color: { type: "string" },
  },
};
const rowSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "cells"],
  properties: {
    id: { type: "string" },
    cells: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["columnId", "value"],
        properties: { columnId: { type: "string" }, value: scalarValueSchema },
      },
    },
  },
};
const cellUpdateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rowId", "columnId", "value"],
  properties: {
    rowId: { type: "string" },
    columnId: { type: "string" },
    value: scalarValueSchema,
  },
};
const operationsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message", "add_columns", "add_rows", "cell_updates"],
  properties: {
    message: { type: "string", minLength: 1 },
    add_columns: { type: "array", items: columnSchema },
    add_rows: { type: "array", items: rowSchema },
    cell_updates: { type: "array", items: cellUpdateSchema },
  },
};
type StructuredWorkspaceResult = {
  message: string;
  add_columns: Array<{
    id: string;
    name: string;
    dataType:
      | "text"
      | "number"
      | "currency"
      | "percentage"
      | "boolean"
      | "date"
      | "url"
      | "email"
      | "select"
      | "multi-select"
      | "json"
      | "formula"
      | "ai";
    description?: string;
    color?: string;
  }>;
  add_rows: Array<{
    id: string;
    cells: Array<{ columnId: string; value: string }>;
  }>;
  cell_updates: Array<{ rowId: string; columnId: string; value: string }>;
};
const toOperations = (result: StructuredWorkspaceResult): TableOperation[] => [
  ...result.add_columns.map((column) => ({
    type: "add_column" as const,
    column,
  })),
  ...(result.add_rows.length
    ? [
        {
          type: "add_rows" as const,
          rows: result.add_rows.map((row) => ({
            id: row.id,
            cells: Object.fromEntries(
              row.cells.map((cell) => [cell.columnId, cell.value]),
            ),
          })),
        },
      ]
    : []),
  ...(result.cell_updates.length
    ? [{ type: "update_cells" as const, updates: result.cell_updates }]
    : []),
];
function mockResult(workspace: Workspace, prompt: string): AgentResult {
  const lower = prompt.toLowerCase();
  const company =
    workspace.table.columns.find((column) => column.id === "col_company")?.id ??
    workspace.table.columns[0]?.id;
  const operationFor = (name: string, suffix: string): TableOperation[] => {
    const id = `col_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const column = { id, name, dataType: "text" as const };
    const rows = workspace.table.rows.length
      ? workspace.table.rows
      : Array.from({ length: 5 }, (_, index) => ({
          id: `row_mock_${index + 1}`,
          cells: Object.fromEntries(
            workspace.table.columns.map((column) => [
              column.id,
              column.name === "Company" || column.name === "Name"
                ? `[Mock] ${column.name} ${index + 1}`
                : "",
            ]),
          ),
        }));
    return [
      ...(workspace.table.rows.length
        ? []
        : [{ type: "add_rows" as const, rows }]),
      { type: "add_column", column },
      {
        type: "update_cells",
        updates: rows.map((row) => ({
          rowId: row.id,
          columnId: id,
          value: `[Mock Ploid] ${String(row.cells[company] ?? "Company")} ${suffix}`,
        })),
      },
    ];
  };
  if (lower.includes("founder"))
    return {
      message:
        "I added a Founder column. Configure PLOID_API_KEY to replace mock results with evidence-backed research.",
      operations: operationFor("Founder", "founder research pending"),
    };
  if (lower.includes("headcount") || lower.includes("employee"))
    return {
      message: "I added a Headcount column with mock research results.",
      operations: operationFor("Headcount", "headcount research pending"),
    };
  if (lower.includes("funding"))
    return {
      message: "I added a Latest Funding column with mock research results.",
      operations: operationFor("Latest Funding", "funding research pending"),
    };
  if (!workspace.table.rows.length)
    return {
      message:
        "I created five clearly marked mock rows so you can test the table flow. Add PLOID_API_KEY for evidence-backed research.",
      operations: [
        {
          type: "add_rows",
          rows: Array.from({ length: 5 }, (_, index) => ({
            id: `row_mock_${index + 1}`,
            cells: Object.fromEntries(
              workspace.table.columns.map((column) => [
                column.id,
                column.name === "Company" || column.name === "Name"
                  ? `[Mock] ${column.name} ${index + 1}`
                  : "",
              ]),
            ),
          })),
        },
      ],
    };
  return {
    message:
      "I understood the workspace request. Add PLOID_API_KEY to enable evidence-backed Agent research; this safe mock mode does not invent external facts.",
    operations: [],
  };
}
export async function runWorkspaceAgent(
  workspace: Workspace,
  prompt: string,
): Promise<AgentResult> {
  if (!process.env.PLOID_API_KEY) return mockResult(workspace, prompt);
  const response = await runPloidAgent({
    prompt: `${prompt}\n\nReturn the requested structured result. Put new semantic columns in add_columns, new rows in add_rows, and changes to existing cells in cell_updates. Use the stable column and row IDs from this workspace. Workspace context:\n${JSON.stringify({ columns: workspace.table.columns, rows: workspace.table.rows.slice(0, 20) })}`,
    sessionId: workspace.ploidSessionId,
    outputSchema: operationsSchema,
  });
  const output = response?.data?.structured_output;
  if (typeof output !== "string" && (!output || typeof output !== "object"))
    return {
      message:
        "Ploid completed the research but returned no structured workspace result.",
      operations: [],
    };
  try {
    const parsed = (
      typeof output === "string" ? JSON.parse(output) : output
    ) as StructuredWorkspaceResult;
    if (
      !parsed ||
      typeof parsed.message !== "string" ||
      !Array.isArray(parsed.add_columns) ||
      !Array.isArray(parsed.add_rows) ||
      !Array.isArray(parsed.cell_updates)
    )
      throw new Error("invalid");
    return { message: parsed.message, operations: toOperations(parsed) };
  } catch {
    return {
      message:
        typeof output === "string"
          ? output
          : "Ploid returned an invalid structured workspace result.",
      operations: [],
    };
  }
}
