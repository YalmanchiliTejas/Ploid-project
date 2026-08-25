import type { Workspace, WorkspaceEvent, WorkspaceTable } from "./types";

const now = () => new Date().toISOString();
type WorkspaceRuntime = {
  workspaces: Map<string, Workspace>;
  listeners: Map<string, Set<(event: WorkspaceEvent) => void>>;
};
const runtime = globalThis as typeof globalThis & {
  __ploidWorkspaceRuntime?: WorkspaceRuntime;
};
const sharedRuntime = runtime.__ploidWorkspaceRuntime ?? {
  workspaces: new Map<string, Workspace>(),
  listeners: new Map<string, Set<(event: WorkspaceEvent) => void>>(),
};
runtime.__ploidWorkspaceRuntime = sharedRuntime;
const { workspaces, listeners } = sharedRuntime;
const tableTemplates: Record<
  "people" | "companies" | "markets",
  Array<[string, "text" | "url" | "email"]>
> = {
  people: [
    ["Name", "text"],
    ["LinkedIn", "url"],
    ["Company", "text"],
    ["Work Email", "email"],
  ],
  companies: [
    ["Company", "text"],
    ["Website", "url"],
    ["Industry", "text"],
    ["Employees", "text"],
  ],
  markets: [
    ["Market", "text"],
    ["Region", "text"],
    ["Segment", "text"],
    ["Notes", "text"],
  ],
};

export function listWorkspaces() {
  return [...workspaces.values()].map(
    ({ id, name, tableId, tables, createdAt, updatedAt }) => ({
      id,
      name,
      tableId,
      sheetCount: tables.length,
      createdAt,
      updatedAt,
    }),
  );
}
export function getWorkspace(id: string) {
  return workspaces.get(id);
}
export function saveWorkspace(workspace: Workspace) {
  workspace.updatedAt = now();
  workspaces.set(workspace.id, workspace);
  return workspace;
}
export function createWorkspace(input: {
  name: string;
  kind: "people" | "companies" | "markets";
}) {
  const id = `workspace_${crypto.randomUUID()}`;
  const table: WorkspaceTable = {
    id: `table_${crypto.randomUUID()}`,
    name: input.name,
    columns: tableTemplates[input.kind].map(([name, dataType]) => ({
      id: `col_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      name,
      dataType,
    })),
    rows: [],
  };
  return saveWorkspace({
    id,
    name: input.name,
    tableId: table.id,
    table,
    tables: [table],
    createdAt: now(),
    updatedAt: now(),
    messages: [
      {
        id: `message_${crypto.randomUUID()}`,
        role: "assistant",
        content: `Your ${input.kind} worksheet is ready. Ask Ploid Agent to research and populate it.`,
        createdAt: now(),
      },
    ],
  });
}
export function addTable(workspaceId: string, name: string) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  const table: WorkspaceTable = {
    id: `table_${crypto.randomUUID()}`,
    name,
    columns: [],
    rows: [],
  };
  workspace.tables.push(table);
  workspace.tableId = table.id;
  workspace.table = table;
  return saveWorkspace(workspace);
}
export function selectTable(workspaceId: string, tableId: string) {
  const workspace = getWorkspace(workspaceId);
  const table = workspace?.tables.find((item) => item.id === tableId);
  if (!workspace || !table) throw new Error("Table not found");
  workspace.tableId = tableId;
  workspace.table = table;
  return saveWorkspace(workspace);
}
export function emitWorkspaceEvent(event: WorkspaceEvent) {
  listeners.get(event.workspaceId)?.forEach((listener) => listener(event));
}
export function subscribeWorkspaceEvents(
  workspaceId: string,
  listener: (event: WorkspaceEvent) => void,
) {
  const group = listeners.get(workspaceId) ?? new Set();
  group.add(listener);
  listeners.set(workspaceId, group);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(workspaceId);
  };
}
export const newEvent = (
  workspaceId: string,
  type: string,
  data?: WorkspaceEvent["data"],
) => ({
  id: `event_${crypto.randomUUID()}`,
  workspaceId,
  type,
  ...(data ? { data } : {}),
});
