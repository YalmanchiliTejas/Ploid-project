import type { Workspace, WorkspaceEvent, WorkspaceTable } from "./types";
import { defaultTableColumns, type WorkspaceKind } from "./default-table-schema";

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
  kind: WorkspaceKind;
}) {
  const id = `workspace_${crypto.randomUUID()}`;
  const table: WorkspaceTable = {
    id: `table_${crypto.randomUUID()}`,
    name: input.name,
    columns: defaultTableColumns(input.kind),
    rows: [],
  };
  return saveWorkspace({
    id,
    name: input.name,
    kind: input.kind,
    tableId: table.id,
    table,
    tables: [table],
    createdAt: now(),
    updatedAt: now(),
    messages: [
      {
        id: `message_${crypto.randomUUID()}`,
        role: "assistant",
        content: `Ploid Agent will design and populate this ${input.kind} table from your research request.`,
        createdAt: now(),
      },
    ],
    agentTurns: [],
    notices: [],
    peopleSearches: [],
    enrichments: [],
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
export function renameTable(workspaceId: string, tableId: string, name: string) {
  const workspace = getWorkspace(workspaceId);
  const table = workspace?.tables.find((item) => item.id === tableId);
  if (!workspace || !table) throw new Error("Table not found");
  table.name = name;
  if (workspace.tableId === tableId) workspace.table = table;
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
