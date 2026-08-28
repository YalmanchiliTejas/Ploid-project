import type { ColumnDataType } from "@/lib/spreadsheet/columns";
import type { PersonRow } from "@/lib/ploid/types";
import type { WorkspaceKind } from "./default-table-schema";

export type WorkspaceColumn = {
  id: string;
  name: string;
  dataType: ColumnDataType;
  description?: string;
  color?: string;
  functionBinding?: FunctionBinding;
  /** Present only for a materialized output of a first-class enrichment. */
  enrichmentBinding?: EnrichmentOutputBinding;
};
export type WorkspaceRow = {
  id: string;
  cells: Record<string, string | number | boolean | null>;
};
export type WorkspaceTable = {
  id: string;
  name: string;
  columns: WorkspaceColumn[];
  rows: WorkspaceRow[];
};
export type FunctionBinding = {
  functionId: string;
  /** Named output materialized by this column when a Function has many outputs. */
  outputId?: string;
  /** UI execution preference; the runner remains the source of truth. */
  autoRun?: boolean;
  inputBindings: Record<
    string,
    { type: "column" | "static"; columnId?: string; value?: unknown }
  >;
  /** Embedded revision lets a Function-backed column hydrate across API route
   * bundles/process restarts instead of relying only on an in-memory registry. */
  definition?: unknown;
};
export type EnrichmentOutputBinding = {
  enrichmentId: string;
  functionId: string;
  outputId: string;
};
export type EnrichmentDefinition = {
  id: string;
  name: string;
  kind: "ploid_person" | "ploid_social";
  provider: "ploid";
  inputBindings: Record<string, { type: "column" | "static"; columnId?: string; value?: unknown }>;
  configuration: {
    enrichments?: Array<"profile" | "email" | "phone">;
    socialPlatform?: string;
    /** OpenAPI deliberately leaves social profile keys platform-dependent. */
    socialFields?: string[];
  };
  /** A single step today; retained for future provider waterfalls. */
  steps: Array<{ id: string; provider: "ploid"; operation: "enrich" | "socials" }>;
  outputs: Array<{ id: string; label: string; field: string; columnId: string; dataType: ColumnDataType }>;
  runSettings: {
    autoUpdate: boolean;
    /** Defaults to any selected output missing or stale. */
    onlyRunIf?: unknown;
    scheduleId?: string;
  };
  functionId: string;
  /** Old Functions are retained for external references and historical runs. */
  legacyFunctionIds?: string[];
  /** Hidden run metadata allows later output materialization without a re-fetch. */
  rowExecutions?: Record<string, EnrichmentRowExecution>;
  createdAt: string;
  updatedAt: string;
};
export type EnrichmentRowExecution = {
  runId: string;
  rowId: string;
  status: "running" | "complete" | "partial" | "failed" | "stale";
  fieldStatuses: Record<string, "success" | "not_found" | "failed">;
  /**
   * Fields included in the actual provider request. This is deliberately
   * separate from currently materialized columns: an output can be enabled
   * later without a repeat request when it was already retrieved.
   */
  requestedOutputIds?: string[];
  normalizedOutputs: Record<string, unknown>;
  rawProviderResponse?: unknown;
  warnings?: unknown[];
  providerRequests?: number;
  creditsCharged?: number;
  completedAt?: string;
};
export type WorkspaceMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
export type AgentTurn = {
  id: string;
  prompt: string;
  output: string;
  structuredOutput?: unknown;
  artifacts: unknown[];
  inputRequests: unknown[];
  acuUsed?: number;
  requestId?: string;
  createdAt: string;
};
export type WorkspaceNotice = {
  id: string;
  level: "warning";
  message: string;
  requestId?: string;
  createdAt: string;
};
export type PeopleSearch = {
  id: string;
  rows: PersonRow[];
  warning?: string;
  requestId?: string;
  createdAt: string;
};
export type Workspace = {
  id: string;
  name: string;
  /** Undefined only for workspaces created before starter schemas existed. */
  kind?: WorkspaceKind;
  tableId: string;
  ploidSessionId?: string;
  table: WorkspaceTable;
  tables: WorkspaceTable[];
  messages: WorkspaceMessage[];
  agentTurns: AgentTurn[];
  notices: WorkspaceNotice[];
  peopleSearches: PeopleSearch[];
  enrichments?: EnrichmentDefinition[];
  createdAt: string;
  updatedAt: string;
};

export type TableOperation =
  | { type: "add_column"; column: WorkspaceColumn }
  | { type: "update_column"; columnId: string; patch: Partial<WorkspaceColumn> }
  | { type: "delete_column"; columnId: string }
  | { type: "add_rows"; rows: WorkspaceRow[] }
  | {
      type: "update_cells";
      updates: Array<{
        rowId: string;
        columnId: string;
        value: string | number | boolean | null;
      }>;
    }
  | { type: "delete_rows"; rowIds: string[] }
  | { type: "sort_rows"; columnId: string; direction: "asc" | "desc" }
  | {
      type: "filter_rows";
      columnId: string;
      operator: "equals" | "empty";
      value?: string;
    }
  | { type: "invoke_function"; functionId: string; rowIds?: string[] };

export type WorkspaceEvent = {
  id: string;
  type: string;
  workspaceId: string;
  data?: {
    text?: string;
    operation?: TableOperation;
    operations?: TableOperation[];
    [key: string]: unknown;
  };
};
