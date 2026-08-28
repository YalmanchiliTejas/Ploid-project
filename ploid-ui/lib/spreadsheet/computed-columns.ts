import type { ColumnDataType } from "./columns";
import type { FunctionBinding } from "@/lib/workspace/types";

export type ColumnExecutionKind =
  | "static"
  | "formula"
  | "function"
  | "ploid_enrichment"
  | "ploid_social"
  | "ploid_agent"
  | "openrouter_ai";

export type ComputedCellState =
  | "idle"
  | "waiting"
  | "queued"
  | "running"
  | "success"
  | "not_found"
  | "failed"
  | "stale"
  | "skipped";

export type CellExecutionMetadata = {
  status: ComputedCellState;
  phase?: string;
  waitingForColumnIds?: string[];
  error?: string;
  updatedAt?: string;
};

type FunctionDefinitionShape = {
  draftRevision?: { nodes?: Array<{ type?: unknown }> };
  nodes?: Array<{ type?: unknown }>;
};

export const functionNodes = (binding?: FunctionBinding) => {
  const definition = binding?.definition as FunctionDefinitionShape | undefined;
  return definition?.draftRevision?.nodes ?? definition?.nodes ?? [];
};

export const columnExecutionKind = (
  dataType: ColumnDataType,
  binding?: FunctionBinding,
): ColumnExecutionKind => {
  if (!binding) return dataType === "formula" ? "formula" : "static";
  const types = new Set(functionNodes(binding).map((node) => node.type));
  if (types.has("ploid_enrich")) return "ploid_enrichment";
  if (types.has("ploid_social")) return "ploid_social";
  if (types.has("ploid_agent")) return "ploid_agent";
  if (types.has("openrouter_ai")) return "openrouter_ai";
  return "function";
};

export const executionPhase = (kind: ColumnExecutionKind) => {
  const phases: Partial<Record<ColumnExecutionKind, string>> = {
    ploid_enrichment: "Enriching…",
    ploid_social: "Fetching profile…",
    ploid_agent: "Researching…",
    openrouter_ai: "Generating…",
    formula: "Calculating…",
    function: "Running workflow…",
  };
  return phases[kind] ?? "Running…";
};
