import { createHash } from "node:crypto";
import { enrichPerson, runPloidAgent } from "@/lib/ploid/client";
import {
  getWorkspace,
  emitWorkspaceEvent,
  newEvent,
} from "@/lib/workspace/store";

export type FunctionNode = {
  id: string;
  type:
    | "template"
    | "local_formula"
    | "conditional"
    | "ploid_agent"
    | "ploid_enrich"
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
const functions = new Map<string, FunctionDefinition>();
const runs = new Map<string, FunctionRun>();
const schedules = new Map<string, FunctionSchedule>();
const cache = new Map<string, Record<string, unknown>>();
const active = new Map<string, Promise<FunctionRun>>();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
export function listFunctions() {
  return [...functions.values()];
}
export function getFunction(functionId: string) {
  return functions.get(functionId);
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
      const result = await runPloidAgent({ prompt, maxAcu: 0.8 });
      output = {
        ...output,
        [String(node.config.output ?? "result")]:
          result?.data?.output ?? `[Mock Ploid] ${prompt}`,
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
      output = {
        ...output,
        [String(node.config.output ?? "result")]: result?.data ?? null,
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
export function listRuns() {
  return [...runs.values()];
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
