import { createHash } from "node:crypto";
import {
  enrichPerson,
  enrichSocial,
  runPloidAgent,
  type PloidSocialPlatform,
} from "@/lib/ploid/client";
import { openRouterStructured } from "@/lib/openrouter/client";
import {
  getWorkspace,
  saveWorkspace,
  emitWorkspaceEvent,
  newEvent,
} from "@/lib/workspace/store";
import { TableService } from "@/lib/table/service";
import type { WorkspaceColumn } from "@/lib/workspace/types";

export type FunctionNode = {
  id: string;
  type:
    | "template"
    | "local_formula"
    | "conditional"
    | "ploid_agent"
    | "ploid_enrich"
    | "ploid_social"
    | "openrouter_ai"
    | "nested_function";
  config: Record<string, unknown>;
};
export type FunctionDefinition = {
  id: string;
  name: string;
  description?: string;
  inputs: Array<{ id: string; name: string; dataType: string }>;
  outputs: Array<{ id: string; name: string; dataType: string }>;
  draftRevision: FunctionRevision;
  publishedRevision?: FunctionRevision;
  createdAt: string;
  updatedAt: string;
};
export type FunctionRevision = {
  id: string;
  functionId: string;
  nodes: FunctionNode[];
  createdAt: string;
};
export type FunctionRun = {
  id: string;
  functionId: string;
  revisionId: string;
  workspaceId?: string;
  tableId?: string;
  trigger: "manual" | "chat" | "schedule" | "api";
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};
export type FunctionSchedule = {
  id: string;
  functionId: string;
  workspaceId?: string;
  tableId?: string;
  enabled: boolean;
  cronExpression: string;
  timezone: string;
  scope: "all" | "missing" | "stale";
  nextRunAt?: string;
  lastRunAt?: string;
};
type FunctionRuntime = {
  functions: Map<string, FunctionDefinition>;
  runs: Map<string, FunctionRun>;
  schedules: Map<string, FunctionSchedule>;
  cache: Map<string, Record<string, unknown>>;
  active: Map<string, Promise<FunctionRun>>;
};

// Next can evaluate API route modules in separate bundles. A module-local
// Map makes a function created by one route invisible to the run route. Keep
// the registry on globalThis, like the Workspace store, so all route handlers
// in the current server process share the same Function definitions.
const runtime = globalThis as typeof globalThis & {
  __ploidFunctionRuntime?: FunctionRuntime;
};
const sharedRuntime = runtime.__ploidFunctionRuntime ?? {
  functions: new Map<string, FunctionDefinition>(),
  runs: new Map<string, FunctionRun>(),
  schedules: new Map<string, FunctionSchedule>(),
  cache: new Map<string, Record<string, unknown>>(),
  active: new Map<string, Promise<FunctionRun>>(),
};
runtime.__ploidFunctionRuntime = sharedRuntime;
const { functions, runs, schedules, cache, active } = sharedRuntime;
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
export function listFunctions() {
  return [...functions.values()];
}
export function getFunction(functionId: string) {
  return functions.get(functionId);
}
export function registerFunction(definition: FunctionDefinition) {
  functions.set(definition.id, definition);
  return definition;
}
export function createFunction(
  input: Omit<
    FunctionDefinition,
    "id" | "createdAt" | "updatedAt" | "draftRevision"
  > & { nodes?: FunctionNode[] },
) {
  const functionId = id("fn");
  const revision: FunctionRevision = {
    id: id("rev"),
    functionId,
    nodes: input.nodes ?? [],
    createdAt: now(),
  };
  const definition: FunctionDefinition = {
    ...input,
    id: functionId,
    draftRevision: revision,
    createdAt: now(),
    updatedAt: now(),
  };
  functions.set(functionId, definition);
  return definition;
}
export function updateFunction(
  functionId: string,
  patch: Partial<
    Pick<FunctionDefinition, "name" | "description" | "inputs" | "outputs">
  > & { nodes?: FunctionNode[] },
) {
  const fn = functions.get(functionId);
  if (!fn) throw new Error("Function not found");
  Object.assign(fn, patch, { updatedAt: now() });
  if (patch.nodes)
    fn.draftRevision = {
      id: id("rev"),
      functionId,
      nodes: patch.nodes,
      createdAt: now(),
    };
  return fn;
}
export function publishFunction(functionId: string) {
  const fn = functions.get(functionId);
  if (!fn) throw new Error("Function not found");
  fn.publishedRevision = fn.draftRevision;
  fn.updatedAt = now();
  return fn;
}
function interpolate(template: string, values: Record<string, unknown>) {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_, key) =>
    String(values[key] ?? ""),
  );
}
async function execute(functionRun: FunctionRun) {
  const fn = getFunction(functionRun.functionId);
  if (!fn) throw new Error("Function not found");
  const revision = fn.publishedRevision ?? fn.draftRevision;
  let output: Record<string, unknown> = {};
  for (const node of revision.nodes) {
    if (node.type === "template")
      output = {
        ...output,
        [String(node.config.output ?? "result")]: interpolate(
          String(node.config.template ?? ""),
          { ...functionRun.inputs, ...output },
        ),
      };
    if (node.type === "local_formula") {
      const expression = String(node.config.expression ?? "");
      if (!/^[\d\s+\-*/().]+$/.test(expression))
        throw new Error("Unsafe local formula");
      output = {
        ...output,
        [String(node.config.output ?? "result")]: Function(
          `return (${expression})`,
        )() as number,
      };
    }
    if (node.type === "conditional") {
      const input = functionRun.inputs[String(node.config.input ?? "")];
      output = {
        ...output,
        [String(node.config.output ?? "result")]: input
          ? node.config.whenTrue
          : node.config.whenFalse,
      };
    }
    if (node.type === "ploid_agent") {
      const prompt = interpolate(String(node.config.prompt ?? ""), {
        ...functionRun.inputs,
        ...output,
      });
      if (!prompt.trim()) throw new Error("Ploid Agent node needs a prompt");
      const result = await runPloidAgent({
        prompt,
        ...(Array.isArray(node.config.sources)
          ? {
              sources: node.config.sources as Array<
                "people" | "public_web" | "connected_apps"
              >,
            }
          : {}),
        ...(typeof node.config.maxAcu === "number"
          ? { maxAcu: node.config.maxAcu }
          : {}),
        ...(node.config.outputSchema &&
        typeof node.config.outputSchema === "object"
          ? {
              outputSchema: node.config.outputSchema as Record<string, unknown>,
            }
          : {}),
      });
      const structured = result.data.structured_output;
      const value =
        structured && typeof structured === "object" && "value" in structured
          ? (structured as { value?: unknown }).value
          : result.data.output;
      output = {
        ...output,
        [String(node.config.output ?? "result")]:
          value ?? `[Mock Ploid] ${prompt}`,
      };
    }
    if (node.type === "ploid_enrich") {
      const linkedinUrl = String(
        functionRun.inputs[
          String(node.config.linkedinInput ?? "linkedin_url")
        ] ?? "",
      );
      if (!linkedinUrl)
        throw new Error("Ploid enrichment needs a LinkedIn URL");
      const fields: Array<"profile" | "email" | "phone"> = Array.isArray(
        node.config.fields,
      )
        ? node.config.fields.filter(
            (field): field is "profile" | "email" | "phone" =>
              field === "profile" || field === "email" || field === "phone",
          )
        : ["profile"];
      const result = await enrichPerson({ linkedinUrl, enrichments: fields });
      const selected = String(node.config.outputField ?? "");
      const data = result.data as Record<string, unknown>;
      output = {
        ...output,
        [String(node.config.output ?? "result")]: selected
          ? (data[selected] ?? null)
          : data,
        __raw: result,
        __warnings: Array.isArray(
          (result.meta as Record<string, unknown>).warnings,
        )
          ? (result.meta as Record<string, unknown>).warnings
          : [],
      };
    }
    if (node.type === "ploid_social") {
      const identifier = String(
        functionRun.inputs[
          String(node.config.identifierInput ?? "identifier")
        ] ?? "",
      );
      const platform = node.config.platform as PloidSocialPlatform;
      if (!identifier.trim()) throw new Error("Missing social identifier");
      const result = await enrichSocial({ platform, identifier });
      const profile = result.data.profile;
      const selected = String(node.config.outputField ?? "");
      output = {
        ...output,
        [String(node.config.output ?? "result")]: selected
          ? (profile[selected] ?? null)
          : profile,
        __raw: result,
      };
    }
    if (node.type === "openrouter_ai") {
      const prompt = interpolate(String(node.config.promptTemplate ?? ""), {
        ...functionRun.inputs,
        ...output,
      });
      if (!prompt.trim())
        throw new Error("OpenRouter AI node needs instructions");
      const outputType =
        node.config.outputType === "number" ||
        node.config.outputType === "boolean"
          ? node.config.outputType
          : node.config.outputType === "json"
            ? "string"
            : "string";
      const result = await openRouterStructured<{
        value: unknown;
        reason?: string;
        confidence?: number;
      }>({
        model:
          typeof node.config.model === "string" ? node.config.model : undefined,
        system:
          typeof node.config.systemPrompt === "string"
            ? node.config.systemPrompt
            : "Return only the requested value. Use only supplied row context; do not claim external research.",
        prompt,
        schemaName: "ai_column_value",
        schema: {
          type: "object",
          properties: {
            value: { type: outputType },
            // Strict structured output requires every declared property to be
            // required. Nullable fields preserve optional metadata without
            // making the schema invalid for OpenAI-compatible providers.
            reason: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            confidence: {
              anyOf: [
                { type: "number", minimum: 0, maximum: 1 },
                { type: "null" },
              ],
            },
          },
          required: ["value", "reason", "confidence"],
          additionalProperties: false,
        },
      });
      const value =
        node.config.outputType === "json" && typeof result.value === "string"
          ? (() => {
              try {
                return JSON.parse(result.value);
              } catch {
                return result.value;
              }
            })()
          : result.value;
      output = {
        ...output,
        [String(node.config.output ?? "result")]: value ?? null,
        __raw: result,
      };
    }
  }
  return output;
}
export async function runFunction(
  functionId: string,
  inputs: Record<string, unknown>,
  options: {
    trigger: FunctionRun["trigger"];
    workspaceId?: string;
    tableId?: string;
    idempotencyKey?: string;
  } = { trigger: "manual" },
) {
  const fn = getFunction(functionId);
  if (!fn) throw new Error("Function not found");
  const revision = fn.publishedRevision ?? fn.draftRevision;
  const cacheKey = createHash("sha256")
    .update(JSON.stringify({ revision: revision.id, inputs }))
    .digest("hex");
  if (cache.has(cacheKey))
    return {
      id: id("run"),
      functionId,
      revisionId: revision.id,
      trigger: options.trigger,
      workspaceId: options.workspaceId,
      tableId: options.tableId,
      status: "complete" as const,
      inputs,
      outputs: cache.get(cacheKey),
      startedAt: now(),
      completedAt: now(),
    };
  const existing = active.get(cacheKey);
  if (existing) return existing;
  const run: FunctionRun = {
    id: id("run"),
    functionId,
    revisionId: revision.id,
    trigger: options.trigger,
    workspaceId: options.workspaceId,
    tableId: options.tableId,
    status: "running",
    inputs,
    startedAt: now(),
  };
  runs.set(run.id, run);
  if (options.workspaceId)
    emitWorkspaceEvent(
      newEvent(options.workspaceId, "function.run.started", {
        runId: run.id,
        functionId,
      }),
    );
  const promise = execute(run)
    .then((outputs) => {
      run.status = "complete";
      run.outputs = outputs;
      run.completedAt = now();
      cache.set(cacheKey, outputs);
      if (options.workspaceId)
        emitWorkspaceEvent(
          newEvent(options.workspaceId, "function.run.completed", {
            runId: run.id,
            functionId,
            outputs,
          }),
        );
      return run;
    })
    .catch((error) => {
      run.status = "failed";
      run.error = error instanceof Error ? error.message : "Function failed";
      run.completedAt = now();
      if (options.workspaceId)
        emitWorkspaceEvent(
          newEvent(options.workspaceId, "function.run.failed", {
            runId: run.id,
            error: run.error,
          }),
        );
      return run;
    })
    .finally(() => active.delete(cacheKey));
  active.set(cacheKey, promise);
  return promise;
}
export function runFunctionOnRows(
  functionId: string,
  workspaceId: string,
  rowIds?: string[],
) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const rows = workspace.table.rows.filter(
    (row) => !rowIds?.length || rowIds.includes(row.id),
  );
  return Promise.all(
    rows.slice(0, 5).map(async (row) =>
      runFunction(functionId, row.cells, {
        trigger: "manual",
        workspaceId,
        tableId: workspace.tableId,
      }),
    ),
  );
}

/** Execute a Function-backed workspace column and persist each completed row. */
export async function runBoundColumn(
  workspaceId: string,
  columnId: string,
  options: { rowIds?: string[]; limit?: number } = {},
) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const column = workspace.table.columns.find((item) => item.id === columnId);
  if (!column?.functionBinding)
    throw new Error("Column is not bound to a function");
  if (
    !getFunction(column.functionBinding.functionId) &&
    column.functionBinding.definition
  ) {
    const definition = column.functionBinding.definition as FunctionDefinition;
    if (
      definition.id === column.functionBinding.functionId &&
      definition.draftRevision
    )
      registerFunction(definition);
  }
  // Older AI columns persisted only a function id. Since the function runtime
  // is intentionally in-memory, those columns can outlive the definition
  // after a restart or when created by a different route bundle. Repair the
  // binding from the column metadata on first execution so the user does not
  // have to delete and recreate the column.
  if (!getFunction(column.functionBinding.functionId)) {
    const inputIds = Object.values(column.functionBinding.inputBindings)
      .filter((binding) => binding.type === "column" && binding.columnId)
      .map((binding) => binding.columnId as string);
    const outputType = ["number", "boolean", "json"].includes(column.dataType)
      ? column.dataType
      : "text";
    const inputNames = inputIds.map(
      (inputId) =>
        workspace.table.columns.find((item) => item.id === inputId)?.name ??
        inputId,
    );
    const repaired = createFunction({
      name: column.name,
      description:
        column.description ?? `Repaired OpenRouter AI column: ${column.name}`,
      inputs: inputIds.map((inputId) => ({
        id: inputId,
        name:
          workspace.table.columns.find((item) => item.id === inputId)?.name ??
          inputId,
        dataType:
          workspace.table.columns.find((item) => item.id === inputId)
            ?.dataType ?? "text",
      })),
      outputs: [{ id: "result", name: column.name, dataType: outputType }],
      nodes: [
        {
          id: `node_${crypto.randomUUID()}`,
          type: "openrouter_ai",
          config: {
            promptTemplate: `Generate the ${column.name} value from ${inputIds.map((inputId, index) => `${inputNames[index]}: {{${inputId}}}`).join(", ") || "the supplied row"}. Return only the value appropriate for the configured output type.`,
            output: "result",
            outputType,
            model:
              process.env.OPENROUTER_COLUMN_BUILDER_MODEL ??
              process.env.OPENROUTER_MODEL,
            systemPrompt:
              "Return only a value based on the supplied row inputs. Do not perform external research.",
          },
        },
      ],
    });
    column.functionBinding = {
      ...column.functionBinding,
      functionId: repaired.id,
      definition: repaired,
    };
    saveWorkspace(workspace);
  }
  const rows = workspace.table.rows
    .filter((row) => !options.rowIds?.length || options.rowIds.includes(row.id))
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  // Keeps Ploid social calls comfortably inside their documented route limit
  // and avoids unbounded OpenRouter/Ploid fan-out.
  const concurrency = 3;
  let cursor = 0;
  const runNext = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      emitWorkspaceEvent(
        newEvent(workspaceId, "ai-column.row.running", {
          columnId,
          rowId: row.id,
        }),
      );
      const inputs = Object.fromEntries(
        Object.entries(column.functionBinding!.inputBindings).map(
          ([inputId, binding]) => [
            inputId,
            binding.type === "column"
              ? (row.cells[binding.columnId ?? ""] ?? null)
              : (binding.value ?? ""),
          ],
        ),
      );
      const run = await runFunction(
        column.functionBinding!.functionId,
        inputs,
        {
          trigger: "api",
          workspaceId,
          tableId: workspace.tableId,
        },
      );
      if (run.status === "complete") {
        const value = run.outputs?.result;
        const typedValue = coerceFunctionValue(value, column.dataType);
        TableService.applyOperations(workspaceId, [
          {
            type: "update_cells",
            updates: [
              {
                rowId: row.id,
                columnId,
                value: typedValue,
              },
            ],
          },
        ]);
      } else {
        emitWorkspaceEvent(
          newEvent(workspaceId, "ai-column.row.failed", {
            columnId,
            rowId: row.id,
            text: run.error,
          }),
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, runNext),
  );
}

function coerceFunctionValue(
  value: unknown,
  dataType: WorkspaceColumn["dataType"],
): string | number | boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (dataType === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (/^(true|yes|1)$/i.test(value.trim())) return true;
      if (/^(false|no|0)$/i.test(value.trim())) return false;
    }
    if (typeof value === "number" && (value === 0 || value === 1))
      return value === 1;
    return null;
  }
  if (dataType === "number" || dataType === "currency" || dataType === "percentage") {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (dataType === "json")
    return typeof value === "string" ? value : JSON.stringify(value);
  return String(value);
}
export function listRuns() {
  return [...runs.values()];
}
export function listSchedules() {
  return [...schedules.values()];
}
export function getRun(runId: string) {
  return runs.get(runId);
}
export function createSchedule(input: Omit<FunctionSchedule, "id">) {
  if (!/^([*0-9/,\-]+\s+){4}[*0-9/,\-]+$/.test(input.cronExpression))
    throw new Error("Invalid cron expression");
  const schedule = { ...input, id: id("schedule") };
  schedules.set(schedule.id, schedule);
  return schedule;
}
export function updateSchedule(
  scheduleId: string,
  patch: Partial<FunctionSchedule>,
) {
  const schedule = schedules.get(scheduleId);
  if (!schedule) throw new Error("Schedule not found");
  if (
    patch.cronExpression &&
    !/^([*0-9/,\-]+\s+){4}[*0-9/,\-]+$/.test(patch.cronExpression)
  )
    throw new Error("Invalid cron expression");
  Object.assign(schedule, patch);
  return schedule;
}
export function deleteSchedule(scheduleId: string) {
  return schedules.delete(scheduleId);
}
