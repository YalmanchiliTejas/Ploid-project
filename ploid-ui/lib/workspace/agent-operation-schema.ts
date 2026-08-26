import { z } from "zod";

const cellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const dataType = z.enum([
  "text", "number", "currency", "percentage", "boolean", "date", "url",
  "email", "select", "multi-select", "json", "formula", "ai",
]);

export const agentOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add_column"),
    column: z.object({
      id: z.string().min(1).optional(),
      name: z.string().min(1),
      dataType,
      description: z.string().optional(),
      color: z.string().optional(),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal("update_column"),
    columnId: z.string().min(1),
    changes: z.object({
      name: z.string().min(1).optional(),
      dataType: dataType.optional(),
      description: z.string().optional(),
      color: z.string().optional(),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal("add_rows"),
    rows: z.array(z.object({
      id: z.string().min(1).optional(),
      values: z.record(z.string(), cellValue),
    }).strict()),
  }).strict(),
  z.object({
    type: z.literal("update_cells"),
    updates: z.array(z.object({
      rowId: z.string().min(1), columnId: z.string().min(1), value: cellValue,
    }).strict()),
  }).strict(),
  z.object({ type: z.literal("delete_rows"), rowIds: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({
    type: z.literal("sort_rows"), columnId: z.string().min(1), direction: z.enum(["asc", "desc"]),
  }).strict(),
]);

export const agentWorkspaceResultSchema = z.object({
  message: z.string().optional(),
  operations: z.array(agentOperationSchema),
}).strict();

export type AgentWorkspaceResult = z.infer<typeof agentWorkspaceResultSchema>;
