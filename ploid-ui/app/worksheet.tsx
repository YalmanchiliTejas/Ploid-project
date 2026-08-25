"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FunctionSquare,
  Home,
  Plus,
  Settings,
  Table2,
} from "lucide-react";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { AddColumnDialog } from "@/components/spreadsheet/AddColumnDialog";
import {
  AiSpreadsheet,
  type SpreadsheetColumn,
  type SpreadsheetSnapshot,
} from "@/components/spreadsheet/AiSpreadsheet";
import { FunctionEditorSheet } from "@/components/spreadsheet/FunctionEditorSheet";
import { FunctionLibraryDialog } from "@/components/spreadsheet/FunctionLibraryDialog";
import { SpreadsheetToolbar } from "@/components/spreadsheet/SpreadsheetToolbar";
import { WorkspaceDashboard } from "@/components/workspace/WorkspaceDashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSessionState } from "@/hooks/use-session-state";
import type { ColumnDataType } from "@/lib/spreadsheet/columns";
import {
  defaultFunctions,
  type SavedFunction,
} from "@/lib/spreadsheet/functions";
import type {
  TableOperation,
  Workspace,
  WorkspaceEvent,
  WorkspaceMessage,
} from "@/lib/workspace/types";

type WorkspaceListItem = { id: string; name: string; sheetCount: number };
const rail = [
  { label: "Home", icon: Home },
  { label: "Worksheets", icon: Table2, active: true },
  { label: "Functions", icon: FunctionSquare },
  { label: "Schedules", icon: Clock3 },
  { label: "Runs", icon: BookOpen },
];
export default function Worksheet() {
  const [activeWorkspaceId, setActiveWorkspaceId] = useSessionState<
    string | null
  >("ploid:active-workspace", null);
  const [workspaceList, setWorkspaceList] = useState<WorkspaceListItem[]>([]);
  const [workspace, setWorkspace] = useSessionState<Workspace | null>(
    "ploid:workspace:model",
    null,
  );
  const [agentOpen, setAgentOpen] = useSessionState(
    "ploid:workspace:agent-open",
    false,
  );
  const [contextOpen, setContextOpen] = useSessionState(
    "ploid:workspace:context-open",
    true,
  );
  const [addColumnOpen, setAddColumnOpen] = useSessionState(
    "ploid:workspace:add-column",
    false,
  );
  const [functionLibraryOpen, setFunctionLibraryOpen] = useSessionState(
    "ploid:workspace:function-library",
    false,
  );
  const [functionEditorOpen, setFunctionEditorOpen] = useSessionState(
    "ploid:workspace:function-editor",
    false,
  );
  const [editingFunction, setEditingFunction] =
    useSessionState<SavedFunction | null>(
      "ploid:workspace:editing-function",
      null,
    );
  const [savedFunctions, setSavedFunctions] = useSessionState<SavedFunction[]>(
    "ploid:workspace:saved-functions",
    defaultFunctions,
  );
  const [messages, setMessages] = useSessionState<WorkspaceMessage[]>(
    "ploid:workspace:messages",
    [],
  );
  const [snapshots, setSnapshots] = useSessionState<
    Record<string, SpreadsheetSnapshot>
  >("ploid:workbook-snapshots", {});
  const [columnSnapshots, setColumnSnapshots] = useSessionState<
    Record<string, SpreadsheetColumn[]>
  >("ploid:column-snapshots", {});
  const [historyAction, setHistoryAction] = useState<{
    type: "undo" | "redo";
    token: number;
  } | null>(null);
  const [addColumnRequest, setAddColumnRequest] = useState<{
    name: string;
    dataType: ColumnDataType;
    token: number;
  } | null>(null);
  const [tableOperation, setTableOperation] = useState<TableOperation | null>(
    null,
  );
  const [activity, setActivity] = useState<string>();
  const refreshList = async () => {
    const response = await fetch("/api/workspaces");
    const data = (await response.json()) as { data: WorkspaceListItem[] };
    setWorkspaceList(data.data);
  };
  useEffect(() => {
    void fetch("/api/workspaces")
      .then((response) => response.json())
      .then((data: { data: WorkspaceListItem[] }) =>
        setWorkspaceList(data.data),
      );
  }, []);
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let alive = true;
    void fetch(`/api/workspaces/${activeWorkspaceId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Workspace not found");
        return response.json() as Promise<Workspace>;
      })
      .then((data: Workspace) => {
        if (alive) {
          setWorkspace(data);
          setMessages((current) => (current.length ? current : data.messages));
        }
      })
      .catch(() => {
        if (alive) {
          setWorkspace(null);
          setActiveWorkspaceId(null);
        }
      });
    const stream = new EventSource(
      `/api/workspaces/${activeWorkspaceId}/events`,
    );
    const handle = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as WorkspaceEvent;
      if (payload.type === "agent.activity") setActivity(payload.data?.text);
      if (payload.type === "agent.completed" || payload.type === "agent.failed")
        setActivity(undefined);
      if (payload.type.startsWith("table.") && payload.data?.operation)
        setTableOperation(payload.data.operation);
    };
    [
      "agent.activity",
      "agent.completed",
      "agent.failed",
      "table.column.added",
      "table.column.updated",
      "table.rows.added",
      "table.cells.updated",
    ].forEach((type) => stream.addEventListener(type, handle));
    return () => {
      alive = false;
      stream.close();
    };
  }, [activeWorkspaceId, setActiveWorkspaceId, setMessages, setWorkspace]);
  const createWorkspace = async ({
    name,
    kind,
    prompt,
  }: {
    name: string;
    kind: "people" | "companies" | "markets";
    prompt: string;
  }) => {
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, kind }),
    });
    const created = (await response.json()) as Workspace;
    setWorkspace(created);
    setMessages(created.messages);
    setActiveWorkspaceId(created.id);
    await refreshList();
    if (prompt.trim()) {
      setAgentOpen(true);
      void fetch(`/api/workspaces/${created.id}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
    }
  };
  const addSheet = async () => {
    if (!workspace) return;
    const name = `Sheet ${workspace.tables.length + 1}`;
    const response = await fetch(`/api/workspaces/${workspace.id}/tables`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const updated = (await response.json()) as Workspace;
    setWorkspace(updated);
    setSnapshots((current) => ({
      ...current,
      [updated.tableId]: undefined as never,
    }));
    setColumnSnapshots((current) => ({
      ...current,
      [updated.tableId]: undefined as never,
    }));
  };
  const selectSheet = async (tableId: string) => {
    if (!workspace || tableId === workspace.tableId) return;
    const response = await fetch(`/api/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId }),
    });
    setWorkspace((await response.json()) as Workspace);
  };
  if (!activeWorkspaceId || !workspace)
    return (
      <WorkspaceDashboard
        workspaces={workspaceList}
        onCreate={createWorkspace}
        onOpen={setActiveWorkspaceId}
      />
    );
  const tableId = workspace.tableId;
  return (
    <main className="flex h-screen min-w-[980px] overflow-hidden bg-background">
      <nav className="flex w-16 flex-col items-center gap-2 border-r bg-card py-3">
        <div className="mb-5 grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          P
        </div>
        {rail.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <Button
                  variant={item.active ? "secondary" : "ghost"}
                  size="icon"
                  aria-label={item.label}
                  onClick={() =>
                    item.label === "Worksheets" && setActiveWorkspaceId(null)
                  }
                >
                  <Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
        <div className="mt-auto grid gap-2">
          <Button variant="ghost" size="icon" aria-label="Settings">
            <Settings className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Help">
            <CircleHelp className="size-4" />
          </Button>
        </div>
      </nav>
      {contextOpen && (
        <aside className="flex w-80 flex-col border-r bg-card">
          <div className="flex h-14 items-center justify-between border-b px-4">
            <span className="font-medium">Workspace</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setContextOpen(false)}
              aria-label="Collapse workspace"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>
          <div className="space-y-5 p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                RESEARCH CONFIGURATION
              </p>
              <h2 className="mt-2 font-semibold">{workspace.name}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {workspace.tables.length} sheets · {savedFunctions.length}{" "}
                functions available
              </p>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                FUNCTIONS IN THIS WORKSHEET
              </p>
              <div className="mt-3 grid gap-2">
                {savedFunctions.map((fn) => (
                  <div key={fn.id} className="rounded-md border p-2">
                    <p className="text-sm font-medium">{fn.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Last run: not yet run
                    </p>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setFunctionLibraryOpen(true)}
              >
                Manage functions
              </Button>
            </div>
          </div>
        </aside>
      )}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {!contextOpen && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setContextOpen(true)}
                aria-label="Expand workspace"
              >
                <ChevronRight className="size-4" />
              </Button>
            )}
            <span>Worksheets</span>
            <span>/</span>
            <strong className="text-foreground">{workspace.name}</strong>
          </div>
          <Badge variant="secondary">
            {process.env.NODE_ENV === "development" ? "Mock-safe mode" : "Live"}
          </Badge>
        </header>
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h1 className="text-xl font-semibold">{workspace.table.name}</h1>
              <p className="text-xs text-muted-foreground">
                {workspace.table.rows.length} records · Univer spreadsheet
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveWorkspaceId(null)}
            >
              All worksheets
            </Button>
          </div>
          <div className="flex items-center gap-1 border-x border-t bg-muted/30 px-2 pt-2">
            {workspace.tables.map((table) => (
              <Button
                key={table.id}
                variant={table.id === tableId ? "secondary" : "ghost"}
                size="sm"
                onClick={() => void selectSheet(table.id)}
              >
                {table.name}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void addSheet()}
              aria-label="Add sheet"
            >
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-b-lg border bg-card shadow-sm">
            <SpreadsheetToolbar
              onAskAi={() => setAgentOpen(true)}
              onAddColumn={() => setAddColumnOpen(true)}
              onFunctionLibrary={() => setFunctionLibraryOpen(true)}
              onUndo={() =>
                setHistoryAction({ type: "undo", token: Date.now() })
              }
              onRedo={() =>
                setHistoryAction({ type: "redo", token: Date.now() })
              }
            />
            <AiSpreadsheet
              key={`${workspace.id}:${tableId}`}
              table={workspace.table}
              runRequest={null}
              historyAction={historyAction}
              addColumnRequest={addColumnRequest}
              tableOperation={tableOperation}
              workbookSnapshot={snapshots[tableId]}
              onWorkbookSnapshot={(snapshot) =>
                setSnapshots((current) => ({ ...current, [tableId]: snapshot }))
              }
              columnSnapshot={columnSnapshots[tableId]}
              onColumnSnapshot={(columns) =>
                setColumnSnapshots((current) => ({
                  ...current,
                  [tableId]: columns,
                }))
              }
              functions={savedFunctions}
              onSaveFunction={(fn) =>
                setSavedFunctions((current) => [...current, fn])
              }
            />
          </div>
        </div>
      </section>
      {agentOpen && (
        <AgentPanel
          workspaceId={workspace.id}
          messages={messages}
          activity={activity}
          onMessages={setMessages}
          onClose={() => setAgentOpen(false)}
        />
      )}
      <AddColumnDialog
        open={addColumnOpen}
        onOpenChange={setAddColumnOpen}
        onCreate={(column) =>
          setAddColumnRequest({ ...column, token: Date.now() })
        }
      />
      <FunctionLibraryDialog
        open={functionLibraryOpen}
        functions={savedFunctions}
        onOpenChange={setFunctionLibraryOpen}
        onCreate={() => {
          setEditingFunction(null);
          setFunctionEditorOpen(true);
        }}
        onEdit={(fn) => {
          setEditingFunction(fn);
          setFunctionEditorOpen(true);
        }}
      />
      <FunctionEditorSheet
        open={functionEditorOpen}
        value={editingFunction}
        onOpenChange={setFunctionEditorOpen}
        onSave={(fn) => {
          setSavedFunctions((current) =>
            current.some((item) => item.id === fn.id)
              ? current.map((item) => (item.id === fn.id ? fn : item))
              : [...current, fn],
          );
          setFunctionEditorOpen(false);
        }}
      />
    </main>
  );
}
