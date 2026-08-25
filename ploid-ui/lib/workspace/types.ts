import type { ColumnDataType } from "@/lib/spreadsheet/columns";

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
};
export type WorkspaceMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
export type Workspace = {
  id: string;
  name: string;
  tableId: string;
  ploidSessionId?: string;
  table: WorkspaceTable;
  tables: WorkspaceTable[];
  messages: WorkspaceMessage[];
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
  data?: { text?: string; operation?: TableOperation; [key: string]: unknown };
};
