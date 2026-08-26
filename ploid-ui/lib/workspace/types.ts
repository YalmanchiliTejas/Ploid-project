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
  inputBindings: Record<
    string,
    { type: "column" | "static"; columnId?: string; value?: string }
  >;
  /** Embedded revision lets a Function-backed column hydrate across API route
   * bundles/process restarts instead of relying only on an in-memory registry. */
  definition?: unknown;
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
