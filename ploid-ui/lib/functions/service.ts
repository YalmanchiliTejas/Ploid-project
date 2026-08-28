import { createHash } from "node:crypto";
import {
  enrichPerson,
  enrichSocial,
  isPloidPersonEnrichment,
  runPloidAgent,
  type PloidPersonEnrichment,
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
// Bump when execution semantics change. Function results are cached by revision
// and inputs, so without this an earlier unsupported guess can be replayed
// after the grounding rules below have been deployed.
const FUNCTION_RESULT_CACHE_VERSION = "grounded-output-v1";
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
      if (
        !Array.isArray(node.config.fields) ||
        !node.config.fields.length ||
        node.config.fields.some((field) => !isPloidPersonEnrichment(field))
      )
        throw new Error("Allowed enrichments are profile, email, and phone");
      const fields = node.config.fields as PloidPersonEnrichment[];
      const firstName = String(functionRun.inputs[String(node.config.firstNameInput ?? "first_name")] ?? "");
      const lastName = String(functionRun.inputs[String(node.config.lastNameInput ?? "last_name")] ?? "");
      const result = await enrichPerson({
        linkedinUrl,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        enrichments: fields,
      });
      const outputValues = Object.fromEntries(
        fields.map((field) => {
          const resultField = result.fields[field];
          return [
            field,
            field === "profile" &&
            resultField?.value &&
            typeof resultField.value === "object"
              ? "View profile →"
              : (resultField?.value ?? null),
          ];
        }),
      );
      output = {
        ...output,
        ...outputValues,
        __fieldStatuses: Object.fromEntries(
          fields.map((field) => [field, result.fields[field]?.status]),
        ),
        __warnings: result.warnings,
        __requestId: result.requestId,
        __creditsCharged: result.creditsCharged,
        __raw: result.raw,
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
      const selectedFields = Array.isArray(node.config.outputFields)
        ? node.config.outputFields.filter((field): field is string => typeof field === "string" && field.trim().length > 0)
        : typeof node.config.outputField === "string" && node.config.outputField.trim()
          ? [node.config.outputField]
          : [];
      if (!selectedFields.length)
        throw new Error("Choose one or more documented social profile fields");
      const values = Object.fromEntries(
        selectedFields.map((field) => [field, profile[field] ?? null]),
      );
      output = {
        ...output,
        ...values,
        __fieldStatuses: Object.fromEntries(
          selectedFields.map((field) => [field, profile[field] == null ? "not_found" : "success"]),
        ),
        __warnings: Array.isArray(result.meta.warnings) ? result.meta.warnings : [],
        __requestId: result.meta.request_id,
        __creditsCharged: result.meta.credits_charged,
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
      // A LinkedIn (or other) URL is an identifier, not the contents of that
      // profile. AI columns deliberately do not browse, so treating a URL as
      // evidence makes classifications and calculated values look factual when
      // they are only guesses. Keep this policy at execution time as well as
      // in the column builder so it also protects columns created previously.
      const groundingPolicy = [
        "Use only facts explicitly present in the supplied row values.",
        "Do not browse, fetch, or infer facts from URLs, names, companies, or other identifiers.",
        "A profile URL is only a pointer; it is not evidence of a job title, employment history, or dates.",
        "For Boolean output, return true only when the row explicitly supports the claim and false only when it explicitly contradicts it; otherwise return null.",
        "For numeric output, calculate a value only from explicit numbers or dated facts. Never use 0 to represent missing or unknown information; return null instead.",
      ].join(" ");
      const result = await openRouterStructured<{
        value: unknown;
        reason?: string;
        confidence?: number;
      }>({
        model:
          typeof node.config.model === "string" ? node.config.model : undefined,
        system:
          typeof node.config.systemPrompt === "string"
            ? `${node.config.systemPrompt}\n\n${groundingPolicy}`
            : `Return only the requested value. ${groundingPolicy}`,
        prompt,
        schemaName: "ai_column_value",
        schema: {
          type: "object",
          properties: {
            // Unknown is a valid result. In particular, a URL by itself does
            // not establish a person's role or the duration of an experience.
            value: {
              anyOf: [{ type: outputType }, { type: "null" }],
            },
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
    /** Provider-backed enrichment is intentionally fresh on each column run. */
    bypassCache?: boolean;
  } = { trigger: "manual" },
) {
  const fn = getFunction(functionId);
  if (!fn) throw new Error("Function not found");
  const revision = fn.publishedRevision ?? fn.draftRevision;
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        cacheVersion: FUNCTION_RESULT_CACHE_VERSION,
        revision: revision.id,
        inputs,
      }),
    )
    .digest("hex");
  if (!options.bypassCache && cache.has(cacheKey))
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
      if (!options.bypassCache) cache.set(cacheKey, outputs);
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
  const enrichmentId = column.enrichmentBinding?.enrichmentId;
  const enrichment = enrichmentId
    ? workspace.enrichments?.find((item) => item.id === enrichmentId)
    : undefined;
  // Legacy columns retain their prior shared-Function behavior. New columns
  // resolve through the first-class enrichment, so siblings cannot accidentally
  // join merely because an unrelated column references the same Function.
  const linkedColumns = enrichment
    ? workspace.table.columns.filter(
        (item) => item.enrichmentBinding?.enrichmentId === enrichment.id,
      )
    : workspace.table.columns.filter(
        (item) => item.functionBinding?.functionId === column.functionBinding!.functionId,
      );
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
  const rowResults: Array<{
    columnId: string;
    rowId: string;
    status: "waiting" | "success" | "not_found" | "failed";
    error?: string;
    waitingForColumnIds?: string[];
  }> = [];
  const runRow = async (row: (typeof rows)[number]) => {
      const inputBindings = Object.entries(enrichment?.inputBindings ?? column.functionBinding!.inputBindings);
      const waitingForColumnIds = inputBindings.flatMap(([inputId, binding]) => {
        if (binding.type !== "column") return [];
        const value = row.cells[binding.columnId ?? ""];
        return value === null || value === undefined || value === ""
          ? [binding.columnId ?? inputId]
          : [];
      });
      if (waitingForColumnIds.length) {
        if (process.env.NODE_ENV !== "production")
          console.info("[Column run] waiting for required inputs", {
            columnId,
            rowId: row.id,
            inputColumnIds: waitingForColumnIds,
          });
        linkedColumns.forEach((linkedColumn) =>
          emitWorkspaceEvent(
            newEvent(workspaceId, "ai-column.row.waiting", {
              columnId: linkedColumn.id,
              rowId: row.id,
              waitingForColumnIds,
            }),
          ),
        );
        linkedColumns.forEach((linkedColumn) =>
          rowResults.push({
            columnId: linkedColumn.id,
            rowId: row.id,
            status: "waiting",
            waitingForColumnIds,
          }),
        );
        return;
      }
      linkedColumns.forEach((linkedColumn) =>
        emitWorkspaceEvent(
          newEvent(workspaceId, "ai-column.row.running", {
            columnId: linkedColumn.id,
            rowId: row.id,
          }),
        ),
      );
      const inputs = Object.fromEntries(
        Object.entries(enrichment?.inputBindings ?? column.functionBinding!.inputBindings).map(
          ([inputId, binding]) => [
            inputId,
            binding.type === "column"
              ? (row.cells[binding.columnId ?? ""] ?? null)
              : (binding.value ?? ""),
          ],
        ),
      );
      try {
        if (enrichment) {
          enrichment.rowExecutions ??= {};
          enrichment.rowExecutions[row.id] = {
            runId: "pending",
            rowId: row.id,
            status: "running",
            fieldStatuses: {},
            normalizedOutputs: {},
          };
        }
        const run = await runFunction(
          column.functionBinding!.functionId,
          inputs,
          {
            trigger: "api",
            workspaceId,
            tableId: workspace.tableId,
            bypassCache: Boolean(
              (column.functionBinding!.definition as {
                draftRevision?: { nodes?: Array<{ type?: string }> };
              } | undefined)?.draftRevision?.nodes?.some(
                (node) =>
                  node.type === "ploid_enrich" || node.type === "ploid_social",
              ),
            ),
          },
        );
        if (run.status !== "complete") {
          if (process.env.NODE_ENV !== "production")
            console.warn("[Column run] function failed", {
              columnId,
              rowId: row.id,
              reason: run.error ?? "Function returned a failed status",
            });
          // A Ploid person enrichment can materialize several table columns,
          // but it is still one invocation. A request-level failure therefore
          // has to settle every sibling output; otherwise child columns remain
          // visually queued forever.
          linkedColumns.forEach((linkedColumn) =>
            emitWorkspaceEvent(
              newEvent(workspaceId, "ai-column.row.failed", {
                columnId: linkedColumn.id,
                rowId: row.id,
                text: run.error,
              }),
            ),
          );
          linkedColumns.forEach((linkedColumn) =>
            rowResults.push({
              columnId: linkedColumn.id,
              rowId: row.id,
              status: "failed",
              error: run.error ?? "Function returned a failed status",
            }),
          );
          return;
        }
        const fieldStatuses = (run.outputs?.__fieldStatuses ?? {}) as Record<
          string,
          "success" | "not_found" | "failed" | undefined
        >;
        if (enrichment) {
          // Keep every field that the provider request asked for, rather than
          // only the fields that happen to have visible columns today. This is
          // what lets a later materialized output reuse the original result.
          const requestedOutputIds =
            enrichment.kind === "ploid_person"
              ? enrichment.configuration.enrichments ?? []
              : enrichment.configuration.socialFields ?? [];
          const statuses = Object.fromEntries(
            requestedOutputIds.map((outputId) => [
              outputId,
              fieldStatuses[outputId] ??
                (run.outputs?.[outputId] == null ? "not_found" : "success"),
            ]),
          ) as Record<string, "success" | "not_found" | "failed">;
          const values = Object.fromEntries(
            requestedOutputIds.map((outputId) => [
              outputId,
              run.outputs?.[outputId] ?? null,
            ]),
          );
          enrichment.rowExecutions![row.id] = {
            runId: run.id,
            rowId: row.id,
            status: Object.values(statuses).some((status) => status === "failed") || Object.values(statuses).some((status) => status === "not_found") ? "partial" : "complete",
            fieldStatuses: statuses,
            requestedOutputIds,
            normalizedOutputs: values,
            rawProviderResponse: run.outputs?.__raw,
            warnings: Array.isArray(run.outputs?.__warnings) ? run.outputs?.__warnings as unknown[] : [],
            providerRequests: 1,
            creditsCharged: typeof run.outputs?.__creditsCharged === "number" ? run.outputs.__creditsCharged : undefined,
            completedAt: now(),
          };
          enrichment.updatedAt = now();
          saveWorkspace(workspace);
        }
        TableService.applyOperations(workspaceId, [
          {
            type: "update_cells",
            updates: linkedColumns.map((linkedColumn) => ({
              rowId: row.id,
              columnId: linkedColumn.id,
              value: coerceFunctionValue(
                run.outputs?.[
                  linkedColumn.functionBinding?.outputId ?? "result"
                ],
                linkedColumn.dataType,
              ),
            })),
          },
        ]);
        linkedColumns.forEach((linkedColumn) => {
          const outputId = linkedColumn.functionBinding?.outputId ?? "result";
          const fieldStatus = fieldStatuses[outputId];
          const eventType =
            fieldStatus === "failed"
              ? "ai-column.row.failed"
              : fieldStatus === "not_found"
                ? "ai-column.row.not_found"
                : "ai-column.row.completed";
          emitWorkspaceEvent(
            newEvent(workspaceId, eventType, {
              columnId: linkedColumn.id,
              rowId: row.id,
              ...(fieldStatus === "failed"
                ? { text: "Couldn't enrich this field" }
                : {}),
            }),
          );
          rowResults.push({
              columnId: linkedColumn.id,
              rowId: row.id,
              status:
                fieldStatus === "failed"
                  ? "failed"
                  : fieldStatus === "not_found"
                    ? "not_found"
                    : "success",
              ...(fieldStatus === "failed"
                ? { error: "Couldn't enrich this field" }
                : {}),
          });
        });
      } catch (error) {
        if (process.env.NODE_ENV !== "production")
          console.warn("[Column run] row failed", {
            columnId,
            rowId: row.id,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        // Keep all materialized outputs in lockstep for a request-level
        // exception. Field-level failures are handled above per output.
        linkedColumns.forEach((linkedColumn) =>
          emitWorkspaceEvent(
            newEvent(workspaceId, "ai-column.row.failed", {
              columnId: linkedColumn.id,
              rowId: row.id,
              text: error instanceof Error ? error.message : "AI column row failed",
            }),
          ),
        );
        linkedColumns.forEach((linkedColumn) =>
          rowResults.push({
            columnId: linkedColumn.id,
            rowId: row.id,
            status: "failed",
            error: error instanceof Error ? error.message : "AI column row failed",
          }),
        );
      }
  };
  // Provider-backed enrichment has external credit and rate-limit semantics.
  // Three workers preserve responsive batch runs without an unbounded burst.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, rows.length) }, async () => {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        await runRow(row);
      }
    }),
  );
  return rowResults;
}

export type EnrichmentRunScope = "all" | "missing" | "stale" | "failed" | "test" | "selected";

/** The enrichment is the execution owner; columns are only materializations. */
export async function runEnrichment(
  workspaceId: string,
  enrichmentId: string,
  options: { scope?: EnrichmentRunScope; rowIds?: string[]; limit?: number } = {},
) {
  const workspace = getWorkspace(workspaceId);
  const enrichment = workspace?.enrichments?.find((item) => item.id === enrichmentId);
  if (!workspace || !enrichment) throw new Error("Enrichment not found");
  const outputColumn = workspace.table.columns.find(
    (column) => column.enrichmentBinding?.enrichmentId === enrichmentId,
  );
  if (!outputColumn) throw new Error("Enrichment has no materialized output column");
  const scope = options.scope ?? "all";
  const configuredOutputIds =
    enrichment.kind === "ploid_person"
      ? enrichment.configuration.enrichments ?? []
      : enrichment.configuration.socialFields ?? [];
  const candidateIds = options.rowIds ?? workspace.table.rows.map((row) => row.id);
  const rowIds = candidateIds.filter((rowId) => {
    const state = enrichment.rowExecutions?.[rowId];
    if (scope === "all" || scope === "selected" || scope === "test") return true;
    if (scope === "stale") return state?.status === "stale";
    if (scope === "failed") return state?.status === "failed";
    if (!state || state.status === "stale" || state.status === "failed")
      return true;
    // A definitive not-found result is settled and must not be retried just
    // because its materialized cell is empty. Conversely, when an output is
    // enabled later, it was never part of the old request and must be eligible
    // for one new combined request. Older saved executions did not record
    // requestedOutputIds, so infer that fact from their statuses/results.
    const requested = new Set(
      state.requestedOutputIds ?? [
        ...Object.keys(state.fieldStatuses),
        ...Object.keys(state.normalizedOutputs),
      ],
    );
    return configuredOutputIds.some((outputId) => !requested.has(outputId));
  });
  return runBoundColumn(workspaceId, outputColumn.id, {
    rowIds,
    limit: scope === "test" ? Math.min(10, options.limit ?? 10) : options.limit,
  });
}

/**
 * Function runtimes return untyped JSON values. Normalize that value at the
 * persistence boundary so cells always contain the representation expected by
 * their destination column, rather than the runtime's raw output.
 */
export function coerceFunctionValue(
  value: unknown,
  dataType: WorkspaceColumn["dataType"],
): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value.trim() : String(value).trim();
  if (!text) return null;

  if (dataType === "boolean") {
    if (typeof value === "boolean") return value;
    if (/^(true|yes|1)$/i.test(text)) return true;
    if (/^(false|no|0)$/i.test(text)) return false;
    if (typeof value === "number" && (value === 0 || value === 1))
      return value === 1;
    return null;
  }

  if (
    dataType === "number" ||
    dataType === "currency" ||
    dataType === "percentage"
  ) {
    const normalized = text.replace(/[$,]/g, "");
    const isPercent = dataType === "percentage" && normalized.endsWith("%");
    const numeric =
      typeof value === "number" ? value : Number(normalized.replace(/%$/, ""));
    if (!Number.isFinite(numeric)) return null;
    // Spreadsheet percentage cells store their fractional value: 25% is 0.25.
    return isPercent ? numeric / 100 : numeric;
  }

  if (dataType === "date") {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  if (dataType === "url") {
    const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes(".") ? url : null;
    } catch {
      return null;
    }
  }

  if (dataType === "email")
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;

  if (dataType === "json") {
    // Existing profile columns used JSON before the compact profile affordance
    // was introduced. Preserve this display value during their migration.
    if (text === "View profile →") return text;
    try {
      return typeof value === "string" ? JSON.stringify(JSON.parse(text)) : JSON.stringify(value);
    } catch {
      return null;
    }
  }

  if (dataType === "multi-select") {
    const selections = Array.isArray(value) ? value : text.split(",");
    return selections
      .map((selection) => String(selection).trim())
      .filter(Boolean)
      .join(",");
  }

  if (dataType === "select") return text;

  if (dataType === "text" || dataType === "formula" || dataType === "ai")
    return typeof value === "string" ? value : String(value);

  // Keep this exhaustive fallback for any future string-backed column type.
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
