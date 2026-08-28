"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  FunctionSquare,
  History,
  Home,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Settings,
  Table2,
  PlugZap,
} from "lucide-react";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { AddColumnDialog } from "@/components/spreadsheet/AddColumnDialog";
import { AiColumnSheet } from "@/components/spreadsheet/AiColumnSheet";
import {
  EnrichmentColumnSheet,
  type EnrichmentAction,
} from "@/components/spreadsheet/EnrichmentColumnSheet";
import { EnrichmentPickerDialog } from "@/components/spreadsheet/EnrichmentPickerDialog";
import { EnrichmentDetailsSheet } from "@/components/spreadsheet/EnrichmentDetailsSheet";
import {
  AiSpreadsheet,
  type SpreadsheetColumn,
  type SpreadsheetSnapshot,
} from "@/components/spreadsheet/AiSpreadsheet";
import { FunctionEditorSheet } from "@/components/spreadsheet/FunctionEditorSheet";
import { FunctionLibraryDialog } from "@/components/spreadsheet/FunctionLibraryDialog";
import { SpreadsheetToolbar } from "@/components/spreadsheet/SpreadsheetToolbar";
import { WorkspaceDashboard } from "@/components/workspace/WorkspaceDashboard";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSessionState } from "@/hooks/use-session-state";
import type { ColumnDataType } from "@/lib/spreadsheet/columns";
import type { CellExecutionMetadata } from "@/lib/spreadsheet/computed-columns";
import {
  defaultFunctions,
  type SavedFunction,
} from "@/lib/spreadsheet/functions";
import type {
  Workspace,
  WorkspaceEvent,
  WorkspaceMessage,
} from "@/lib/workspace/types";

type WorkspaceListItem = { id: string; name: string; sheetCount: number };
type TableHydrationState = "loading" | "ready" | "error";
const rail = [
  { label: "Home", icon: Home },
  { label: "Workspaces", icon: Table2 },
  { label: "Functions", icon: FunctionSquare },
  { label: "Schedules", icon: Clock3 },
  { label: "Runs", icon: BookOpen },
  { label: "Integrations", icon: PlugZap },
];
export default function Worksheet() {
  const [activeWorkspaceId, setActiveWorkspaceId] = useSessionState<
    string | null
  >("ploid:active-workspace", null);
  const [workspaceList, setWorkspaceList] = useState<WorkspaceListItem[]>([]);
  const [workspaceListLoading, setWorkspaceListLoading] = useState(true);
  const [workspace, setWorkspace] = useSessionState<Workspace | null>(
    "ploid:workspace:model",
    null,
  );
  const [agentOpen, setAgentOpen] = useSessionState(
    "ploid:workspace:agent-open",
    false,
  );
  const [contextOpen, setContextOpen] = useSessionState(
    "ploid:workspace:context-open-v2",
    false,
  );
  const [addColumnOpen, setAddColumnOpen] = useSessionState(
    "ploid:workspace:add-column",
    false,
  );
  const [aiColumnOpen, setAiColumnOpen] = useSessionState(
    "ploid:workspace:ai-column",
    false,
  );
  const [enrichmentAction, setEnrichmentAction] =
    useState<EnrichmentAction | null>(null);
  const [enrichmentPickerOpen, setEnrichmentPickerOpen] = useState(false);
  const [openEnrichmentId, setOpenEnrichmentId] = useState<string | null>(null);
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
    description?: string;
    token: number;
  } | null>(null);
  const [renamingSheet, setRenamingSheet] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [sidebarDialog, setSidebarDialog] = useState<
    "schedules" | "runs" | "settings" | null
  >(null);
  const [sidebarItems, setSidebarItems] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Workspaces");
  const modalCloseAtRef = useRef(0);
  const [tableHydrationState, setTableHydrationState] =
    useState<TableHydrationState>("loading");
  const [activity, setActivity] = useState<string>();
  const [newSearchOpen, setNewSearchOpen] = useSessionState(
    "ploid:workspace:new-search-open",
    false,
  );
  const [newSearchPrompt, setNewSearchPrompt] = useSessionState(
    "ploid:workspace:new-search-prompt",
    "",
  );
  const [newSearchRunning, setNewSearchRunning] = useState(false);
  const [researching, setResearching] = useState(false);
  const [functionProgress, setFunctionProgress] = useState<
    Record<string, { total: number; completed: number; failed: number }>
  >({});
  const [cellExecution, setCellExecution] = useState<
    Record<string, Record<string, CellExecutionMetadata>>
  >({});
  const workspaceRef = useRef<Workspace | null>(null);
  const [historyOpen, setHistoryOpen] = useSessionState(
    "ploid:workspace:history-open",
    false,
  );
  const refreshList = async () => {
    const response = await fetch("/api/workspaces");
    const data = (await response.json()) as { data: WorkspaceListItem[] };
    setWorkspaceList(data.data);
  };
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);
  useEffect(() => {
    void fetch("/api/workspaces")
      .then((response) => response.json())
      .then((data: { data: WorkspaceListItem[] }) =>
        setWorkspaceList(data.data),
      )
      .finally(() => setWorkspaceListLoading(false));
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let alive = true;
    setTableHydrationState("loading");
    void fetch(`/api/workspaces/${activeWorkspaceId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Workspace not found");
        return response.json() as Promise<Workspace>;
      })
      .then((data: Workspace) => {
        if (alive) {
          setWorkspace(data);
          setMessages(data.messages);
          setTableHydrationState("ready");
        }
      })
      .catch(() => {
        if (alive) {
          setWorkspace(null);
          setActiveWorkspaceId(null);
          setTableHydrationState("error");
        }
      });
    const stream = new EventSource(
      `/api/workspaces/${activeWorkspaceId}/events`,
    );
    const handle = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as WorkspaceEvent;
      if (
        payload.type === "ai-column.row.running" ||
        payload.type === "ai-column.row.completed" ||
        payload.type === "ai-column.row.not_found" ||
        payload.type === "ai-column.row.failed" ||
        payload.type === "ai-column.row.waiting" ||
        payload.type === "enrichment.row.stale"
      ) {
        const columnId = payload.data?.columnId;
        const rowId = payload.data?.rowId;
        if (typeof columnId === "string" && typeof rowId === "string") {
          const status =
            payload.type === "ai-column.row.running"
              ? "running"
              : payload.type === "enrichment.row.stale"
                ? "stale"
              : payload.type === "ai-column.row.waiting"
                ? "waiting"
                : payload.type === "ai-column.row.not_found"
                  ? "not_found"
                  : payload.type === "ai-column.row.failed"
                    ? "failed"
                    : "success";
          setCellExecution((current) => ({
            ...current,
            [columnId]: {
              ...current[columnId],
              [rowId]: {
                status,
                ...(Array.isArray(payload.data?.waitingForColumnIds)
                  ? {
                      waitingForColumnIds: payload.data.waitingForColumnIds.filter(
                        (id): id is string => typeof id === "string",
                      ),
                    }
                  : {}),
                ...(typeof payload.data?.text === "string"
                  ? { error: payload.data.text }
                  : {}),
                updatedAt: new Date().toISOString(),
              },
            },
          }));
          // Header progress is derived by AiSpreadsheet from this authoritative
          // row-state map. Do not increment a second counter here: repeated
          // events and retries would otherwise inflate completion/failure
          // totals and make a Ploid child column look permanently failed.
        }
      }
      if (payload.type === "agent.started") setResearching(true);
      if (
        payload.type === "enrichment.row.stale" &&
        payload.data?.autoUpdate === true &&
        typeof payload.data?.enrichmentId === "string" &&
        typeof payload.data?.rowId === "string"
      ) {
        void fetch(`/api/workspaces/${activeWorkspaceId}/enrichments/${payload.data.enrichmentId}/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope: "selected", rowIds: [payload.data.rowId] }),
        });
      }
      if (payload.type === "agent.activity") {
        setResearching(true);
        setActivity(payload.data?.text);
      }
      if (
        payload.type === "agent.completed" ||
        payload.type === "agent.failed"
      ) {
        setResearching(false);
        setActivity(undefined);
        void fetch(`/api/workspaces/${activeWorkspaceId}`)
          .then((response) => response.json())
          .then((latest: Workspace) => {
            if (alive) {
              setWorkspace(latest);
              setMessages(latest.messages);
            }
          });
      }
      if (payload.type === "table.operations.applied") {
        const receivedAt = performance.now();
        void fetch(`/api/workspaces/${activeWorkspaceId}`)
          .then((response) => response.json())
          .then((latest: Workspace) => {
            if (!alive) return;
            if (process.env.NODE_ENV !== "production")
              console.info(
                `[Workspace timing] WorkspaceEvent ${Math.round(performance.now() - receivedAt)}ms`,
              );
            setWorkspace(latest);
            setMessages(latest.messages);
          });
      }
    };
    [
      "agent.started",
      "agent.activity",
      "agent.completed",
      "agent.failed",
      "table.operations.applied",
      "ai-column.row.running",
      "ai-column.row.completed",
      "ai-column.row.not_found",
      "ai-column.row.failed",
      "ai-column.row.waiting",
      "enrichment.row.stale",
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
      body: JSON.stringify({ name, kind, prompt }),
    });
    const payload = (await response.json()) as {
      workspace?: Workspace;
      initialSearchComplete?: boolean;
      error?: string;
    };
    if (!response.ok || !payload.workspace)
      throw new Error(payload.error ?? "Unable to create worksheet");

    const created = payload.workspace;
    setWorkspace(created);
    setTableHydrationState("ready");
    setMessages(created.messages);
    setActiveWorkspaceId(created.id);
    await refreshList();
    if (prompt.trim() && !payload.initialSearchComplete) {
      setResearching(true);
      setAgentOpen(true);
      void fetch(`/api/workspaces/${created.id}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
    }
  };
  const exportCurrentTable = async () => {
    if (!workspace) return;

    const response = await fetch(`/api/workspaces/${workspace.id}`);
    if (!response.ok) return;
    const latest = (await response.json()) as Workspace;
    setWorkspace(latest);

    const escape = (value: unknown) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const csv = [
      latest.table.columns.map((column) => escape(column.name)).join(","),
      ...latest.table.rows.map((row) =>
        latest.table.columns
          .map((column) => escape(row.cells[column.id]))
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${latest.table.name.toLowerCase().replace(/\s+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const startNewSearch = async () => {
    if (!workspace || !newSearchPrompt.trim() || newSearchRunning) return;
    const prompt = newSearchPrompt.trim();
    setNewSearchRunning(true);
    setResearching(true);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const payload = (await response.json()) as {
        message?: string;
        structuredOutputError?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Search failed");
      setMessages((current) => [
        ...current,
        {
          id: `search_${Date.now()}`,
          role: "user",
          content: prompt,
          createdAt: new Date().toISOString(),
        },
        {
          id: `search_reply_${Date.now()}`,
          role: "assistant",
          content: payload.structuredOutputError
            ? `${payload.message ?? "Research complete."}\n\nTable changes were not applied: ${payload.structuredOutputError}. You can retry this request.`
            : (payload.message ?? "Research complete."),
          createdAt: new Date().toISOString(),
        },
      ]);
      setNewSearchPrompt("");
      setNewSearchOpen(false);
      setAgentOpen(true);
      const latestResponse = await fetch(`/api/workspaces/${workspace.id}`);
      if (latestResponse.ok)
        setWorkspace((await latestResponse.json()) as Workspace);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `search_error_${Date.now()}`,
          role: "assistant",
          content:
            error instanceof Error ? error.message : "Unable to start search",
          createdAt: new Date().toISOString(),
        },
      ]);
      setAgentOpen(true);
    } finally {
      setNewSearchRunning(false);
      setResearching(false);
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
    setTableHydrationState("ready");
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
    setTableHydrationState("ready");
  };
  const renameSheet = async () => {
    if (!workspace || !renamingSheet?.name.trim()) return;
    const response = await fetch(`/api/workspaces/${workspace.id}/tables`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tableId: renamingSheet.id,
        name: renamingSheet.name,
      }),
    });
    if (!response.ok) return;
    setWorkspace((await response.json()) as Workspace);
    setRenamingSheet(null);
  };
  const openWorkspace = (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId) return;
    // Prevent the prior workbook and its presentation snapshot from mounting
    // while the selected workspace is being fetched.
    setWorkspace(null);
    setMessages([]);
    setActivity(undefined);
    setResearching(false);
    setTableHydrationState("loading");
    setActiveWorkspaceId(workspaceId);
  };
  const openSidebarDialog = async (view: "schedules" | "runs" | "settings") => {
    // Prevent a pointer used to close another overlay from opening Help after
    // Radix restores pointer events to the sidebar beneath it.
    setSidebarDialog(view);
    if (view !== "schedules" && view !== "runs") return;
    const response = await fetch(`/api/functions/${view}`);
    const payload = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    if (response.ok) setSidebarItems(payload.data ?? []);
  };
  if (activeWorkspaceId && (!workspace || workspace.id !== activeWorkspaceId))
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading worksheet…
      </main>
    );
  if (!activeWorkspaceId || !workspace)
    return (
      <>
        <WorkspaceDashboard
          workspaces={workspaceList}
          loading={workspaceListLoading}
          onCreate={createWorkspace}
          onCreateFunction={() => {
            setEditingFunction(null);
            setFunctionEditorOpen(true);
          }}
          functions={savedFunctions}
          onOpenFunction={(functionId) => {
            const selected = savedFunctions.find(
              (item) => item.id === functionId,
            );
            if (selected) {
              setEditingFunction(selected);
              setFunctionEditorOpen(true);
            }
          }}
          onOpen={openWorkspace}
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
      </>
    );
  const tableId = workspace.tableId;
  return (
    <main className="flex h-[100dvh] min-w-[980px] flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground shadow-sm">
            P
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Button
              variant="ghost"
              size="sm"
              className="px-1.5 text-muted-foreground"
              onClick={() => setActiveWorkspaceId(null)}
            >
              Home
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="truncate font-medium tracking-tight">
              {workspace.name}
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="truncate text-muted-foreground">
              {workspace.table.name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-2 text-xs text-muted-foreground">Saved</span>
          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 gap-2 text-xs text-muted-foreground md:flex"
            onClick={() => setCommandOpen(true)}
          >
            <Search className="size-3.5" />
            Search{" "}
            <kbd className="ml-3 rounded border bg-muted px-1 text-[10px]">
              ⌘K
            </kbd>
          </Button>
          <Button variant="ghost" size="sm" onClick={exportCurrentTable}>
            <Download className="size-3.5" />
            Export
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Help"
                onClick={() =>
                  window.open(
                    "https://ploid.com",
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <CircleHelp className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Help</TooltipContent>
          </Tooltip>
          <Button
            variant="secondary"
            size="icon-sm"
            className="rounded-full text-xs font-semibold"
            aria-label="Account"
          >
            T
          </Button>
        </div>
      </header>
      {workspace.notices?.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950"
        >
          {notice.message}
        </div>
      ))}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="flex w-52 shrink-0 flex-col border-r bg-sidebar px-3 py-3">
          <div className="mb-5 flex items-center gap-2 px-2">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              P
            </span>
            <span className="font-semibold tracking-tight">Ploid</span>
          </div>
          <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Workspace
          </p>
          {rail.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`w-full justify-start gap-2 px-2 text-xs ${activeNav === item.label ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    aria-label={item.label}
                    onClick={() => {
                      setActiveNav(item.label);
                      if (item.label === "Home" || item.label === "Workspaces")
                        setActiveWorkspaceId(null);
                      if (item.label === "Functions")
                        setFunctionLibraryOpen(true);
                      if (item.label === "Schedules")
                        void openSidebarDialog("schedules");
                      if (item.label === "Runs") void openSidebarDialog("runs");
                      if (item.label === "Integrations")
                        void openSidebarDialog("settings");
                    }}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
          <div className="mt-auto grid gap-1 border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 px-2 text-xs text-muted-foreground"
              aria-label="Settings"
              onClick={() => void openSidebarDialog("settings")}
            >
              <Settings className="size-4" />
              Settings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 px-2 text-xs text-muted-foreground"
              aria-label="Help"
              onClick={() =>
                window.open(
                  "https://ploid.com",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <CircleHelp className="size-4" />
              Help
            </Button>
          </div>
        </nav>
        {contextOpen && (
          <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
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
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!contextOpen && (
            <div className="flex h-9 shrink-0 items-center border-b bg-card px-2">
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
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
            <SpreadsheetToolbar
              onAskAi={() => setAgentOpen(true)}
              onAddColumn={() => setAddColumnOpen(true)}
              onAddEnrichment={() => {
                setEnrichmentPickerOpen(true);
              }}
              onFunctionLibrary={() => setFunctionLibraryOpen(true)}
              onUndo={() =>
                setHistoryAction({ type: "undo", token: Date.now() })
              }
              onRedo={() =>
                setHistoryAction({ type: "redo", token: Date.now() })
              }
              onSearch={() => setNewSearchOpen(true)}
              rowCount={workspace.table.rows.length}
              functionColumns={workspace.table.columns
                .filter((column) => column.functionBinding)
                .map((column) => ({ id: column.id, name: column.name }))}
              onRunFunction={(columnId, limit) => {
                void fetch(
                  `/api/workspaces/${workspace.id}/ai-columns/${columnId}/run`,
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(limit === null ? {} : { limit }),
                  },
                );
              }}
            />
            {tableHydrationState !== "ready" ? (
              <div className="flex min-h-0 flex-1 items-center justify-center bg-card px-6 text-sm text-muted-foreground">
                {tableHydrationState === "error"
                  ? "Unable to load this table."
                  : "Loading table…"}
              </div>
            ) : researching && workspace.table.rows.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-card px-6 text-center">
                <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <LoaderCircle className="size-5 animate-spin" />
                </div>
                <h2 className="mt-4 text-sm font-medium">
                  Researching your workspace
                </h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {activity ??
                    "Ploid Agent is finding data and preparing your table."}
                </p>
              </div>
            ) : (
              <AiSpreadsheet
                key={`${workspace.id}:${tableId}`}
                table={workspace.table}
                functionProgress={functionProgress}
                cellExecution={cellExecution}
                runRequest={null}
                historyAction={historyAction}
                addColumnRequest={addColumnRequest}
                tableOperation={null}
                workbookSnapshot={snapshots[tableId]}
                onWorkbookSnapshot={(snapshot) =>
                  setSnapshots((current) => ({
                    ...current,
                    [tableId]: snapshot,
                  }))
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
                onRunFunctionColumn={(columnId, options) => {
                  const requestedRows = workspace.table.rows
                    .filter(
                      (row) =>
                        !options.rowIds?.length || options.rowIds.includes(row.id),
                    )
                    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
                  const total = requestedRows.length;
                  const sourceColumn = workspace.table.columns.find(
                    (column) => column.id === columnId,
                  );
                  const linkedColumnIds = sourceColumn?.functionBinding
                    ? workspace.table.columns
                        .filter(
                          (column) =>
                            column.functionBinding?.functionId ===
                            sourceColumn.functionBinding?.functionId,
                        )
                        .map((column) => column.id)
                    : [columnId];
                  // Start the visual feedback as soon as the async run is
                  // accepted, rather than waiting for the first row event. A
                  // shared Ploid function queues all of its materialized
                  // outputs together, because one request will settle them.
                  setFunctionProgress((current) => ({
                    ...current,
                    ...Object.fromEntries(
                      linkedColumnIds.map((id) => [
                        id,
                        { total, completed: 0, failed: 0 },
                      ]),
                    ),
                  }));
                  setCellExecution((current) => ({
                    ...current,
                    ...Object.fromEntries(
                      linkedColumnIds.map((id) => [
                        id,
                        Object.fromEntries(
                          requestedRows.map((row) => [
                            row.id,
                            { status: "queued" },
                          ]),
                        ),
                      ]),
                    ),
                  }));
                  if (process.env.NODE_ENV !== "production")
                    console.info("[Column run] starting", {
                      columnId,
                      total,
                      linkedOutputs: linkedColumnIds.length,
                    });
                  void fetch(
                    `/api/workspaces/${workspace.id}/ai-columns/${columnId}/run`,
                    {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      ...(options.rowIds?.length ? { rowIds: options.rowIds } : {}),
                      ...(typeof options.limit === "number"
                        ? { limit: options.limit }
                        : {}),
                    }),
                    },
                  )
                    .then(async (response) => {
                      const payload = (await response
                        .json()
                        .catch(() => null)) as {
                        error?: string;
                        rows?: Array<{
                          columnId: string;
                          rowId: string;
                          status: CellExecutionMetadata["status"];
                          error?: string;
                          waitingForColumnIds?: string[];
                        }>;
                      } | null;
                      if (!response.ok)
                        throw new Error(
                          payload?.error ?? "Unable to run column",
                        );
                      const rowStates = payload?.rows;
                      if (!rowStates) return;
                      const statesByColumn = Object.groupBy(
                        rowStates,
                        (row) => row.columnId,
                      );
                      setCellExecution((current) => ({
                        ...current,
                        ...Object.fromEntries(
                          Object.entries(statesByColumn).map(
                            ([outputColumnId, rows]) => [
                              outputColumnId,
                              Object.fromEntries(
                                (rows ?? []).map((row) => [
                                  row.rowId,
                                  {
                                    status: row.status,
                                    ...(row.error ? { error: row.error } : {}),
                                    ...(row.waitingForColumnIds
                                      ? {
                                          waitingForColumnIds:
                                            row.waitingForColumnIds,
                                        }
                                      : {}),
                                  },
                                ]),
                              ),
                            ],
                          ),
                        ),
                      }));
                      setFunctionProgress((current) => ({
                        ...current,
                        ...Object.fromEntries(
                          Object.entries(statesByColumn).map(
                            ([outputColumnId, rows]) => [
                              outputColumnId,
                              {
                                total: rows?.length ?? 0,
                                completed: (rows ?? []).filter((row) =>
                                  ["success", "not_found", "failed"].includes(
                                    row.status,
                                  ),
                                ).length,
                                failed: (rows ?? []).filter(
                                  (row) => row.status === "failed",
                                ).length,
                              },
                            ],
                          ),
                        ),
                      }));
                    })
                    .catch((error: unknown) => {
                      setFunctionProgress((current) => {
                        const next = { ...current };
                        delete next[columnId];
                        return next;
                      });
                      console.error("[Table] column run failed", error);
                    });
                }}
                onDeleteColumn={async (columnId) => {
                  const column = workspace.table.columns.find((item) => item.id === columnId);
                  const enrichmentId = column?.enrichmentBinding?.enrichmentId;
                  const enrichment = workspace.enrichments?.find((item) => item.id === enrichmentId);
                  if (enrichment && enrichment.outputs.length === 1) {
                    if (!window.confirm(`Remove the last output and delete ${enrichment.name}? This also removes its saved run metadata.`)) return;
                    const response = await fetch(`/api/workspaces/${workspace.id}/enrichments/${enrichment.id}`, { method: "DELETE" });
                    if (!response.ok) throw new Error("Unable to delete enrichment");
                    return;
                  }
                  const response = await fetch(
                    `/api/workspaces/${workspace.id}/operations`,
                    {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        operations: [{ type: "delete_column", columnId }],
                      }),
                    },
                  );
                  if (!response.ok) throw new Error("Unable to delete column");
                }}
                onOpenEnrichment={setOpenEnrichmentId}
                onRunEnrichment={async (enrichmentId, scope, rowIds) => {
                  const response = await fetch(`/api/workspaces/${workspace.id}/enrichments/${enrichmentId}/run`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ scope, rowIds }),
                  });
                  if (!response.ok) throw new Error("Unable to run enrichment");
                }}
                enrichments={workspace.enrichments}
              />
            )}
          </div>
          <footer className="flex h-10 shrink-0 items-center justify-between border-t bg-card px-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="text-xs">
                Overview
              </Button>
              <Separator orientation="vertical" className="h-4" />
              {workspace.tables.map((table) => (
                <div key={table.id} className="group flex items-center">
                  <Button
                    variant={table.id === tableId ? "secondary" : "ghost"}
                    size="sm"
                    className="max-w-48 text-xs"
                    onClick={() => void selectSheet(table.id)}
                  >
                    <span className="truncate">{table.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hidden size-6 group-hover:inline-flex"
                    aria-label={`Rename ${table.name}`}
                    onClick={() =>
                      setRenamingSheet({ id: table.id, name: table.name })
                    }
                  >
                    <Pencil className="size-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => void addSheet()}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Autosaved</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setHistoryOpen(true)}
              >
                <History className="size-3.5" />
                History
              </Button>
            </div>
          </footer>
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
      </div>
      <AddColumnDialog
        open={addColumnOpen}
        onOpenChange={setAddColumnOpen}
        onUseAi={() => setAiColumnOpen(true)}
        onCreate={(column) =>
          setAddColumnRequest({ ...column, token: Date.now() })
        }
      />
      <AiColumnSheet
        open={aiColumnOpen}
        onOpenChange={setAiColumnOpen}
        workspaceId={workspace.id}
        table={workspace.table}
        onSaved={async () => {
          const response = await fetch(`/api/workspaces/${workspace.id}`);
          if (response.ok) setWorkspace((await response.json()) as Workspace);
        }}
      />
      <EnrichmentPickerDialog
        open={enrichmentPickerOpen}
        onOpenChange={setEnrichmentPickerOpen}
        onSelect={setEnrichmentAction}
      />
      <EnrichmentDetailsSheet
        key={openEnrichmentId ?? "none"}
        open={!!openEnrichmentId}
        onOpenChange={(open) => !open && setOpenEnrichmentId(null)}
        workspaceId={workspace.id}
        table={workspace.table}
        enrichment={workspace.enrichments?.find((item) => item.id === openEnrichmentId)}
        onChanged={async () => {
          const response = await fetch(`/api/workspaces/${workspace.id}`);
          if (response.ok) setWorkspace((await response.json()) as Workspace);
        }}
      />
      {enrichmentAction && (
        <EnrichmentColumnSheet
          open={!!enrichmentAction}
          onOpenChange={(open) => !open && setEnrichmentAction(null)}
          action={enrichmentAction}
          workspaceId={workspace.id}
          table={workspace.table}
          onSaved={async (columnId, autoRun) => {
            const response = await fetch(`/api/workspaces/${workspace.id}`);
            if (response.ok) setWorkspace((await response.json()) as Workspace);
            if (columnId && autoRun) {
              const total = workspace.table.rows.length;
              setFunctionProgress((current) => ({
                ...current,
                [columnId]: { total, completed: 0, failed: 0 },
              }));
              setCellExecution((current) => ({
                ...current,
                [columnId]: Object.fromEntries(
                  workspace.table.rows.map((row) => [row.id, { status: "queued" }]),
                ),
              }));
              void fetch(
                `/api/workspaces/${workspace.id}/ai-columns/${columnId}/run`,
                {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({}),
                },
              );
            }
          }}
        />
      )}
      <Dialog
        open={!!renamingSheet}
        onOpenChange={(open) => !open && setRenamingSheet(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename sheet</DialogTitle>
            <DialogDescription>
              Choose a clear name for this worksheet tab.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="sheet-name">Sheet name</Label>
            <Input
              id="sheet-name"
              autoFocus
              value={renamingSheet?.name ?? ""}
              onChange={(event) =>
                setRenamingSheet((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") void renameSheet();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingSheet(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void renameSheet()}
              disabled={!renamingSheet?.name.trim()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!sidebarDialog}
        onOpenChange={(open) => {
          if (!open) {
            modalCloseAtRef.current = Date.now();
            setSidebarDialog(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {sidebarDialog === "runs"
                ? "Function runs"
                : sidebarDialog === "schedules"
                  ? "Schedules"
                  : "Workspace settings"}
            </DialogTitle>
            <DialogDescription>
              {sidebarDialog === "runs"
                ? "Recent Function Runner activity."
                : sidebarDialog === "schedules"
                  ? "Configured Function Runner schedules."
                  : "Workspace controls."}
            </DialogDescription>
          </DialogHeader>
          {(sidebarDialog === "runs" || sidebarDialog === "schedules") && (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {sidebarItems.length ? (
                sidebarItems.map((item) => (
                  <div
                    key={String(item.id)}
                    className="rounded-md border p-3 text-sm"
                  >
                    <p className="font-medium">
                      {String(item.functionId ?? item.id)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {String(
                        item.status ?? item.cronExpression ?? "Configured",
                      )}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No {sidebarDialog} yet.
                </p>
              )}
            </div>
          )}
          {sidebarDialog === "settings" && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{workspace.name}</p>
              <p className="mt-1 text-muted-foreground">
                {workspace.tables.length} sheets · saved automatically
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                modalCloseAtRef.current = Date.now();
                setSidebarDialog(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Workspace command menu"
      >
        <Command>
          <CommandInput placeholder="Search commands…" />
          <CommandList>
            <CommandEmpty>No matching command.</CommandEmpty>
            <CommandGroup heading="Workspace">
              <CommandItem
                onSelect={() => {
                  setCommandOpen(false);
                  setAgentOpen(true);
                }}
              >
                Ask Ploid<CommandShortcut>⌘↵</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setCommandOpen(false);
                  setAddColumnOpen(true);
                }}
              >
                Add column
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setCommandOpen(false);
                  setFunctionLibraryOpen(true);
                }}
              >
                Open Functions
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setCommandOpen(false);
                  void openSidebarDialog("runs");
                }}
              >
                Open Runs
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setCommandOpen(false);
                  void openSidebarDialog("schedules");
                }}
              >
                Open Schedules
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Navigation">
              <CommandItem
                onSelect={() => {
                  setCommandOpen(false);
                  setActiveWorkspaceId(null);
                }}
              >
                Go to Home
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-[380px] sm:max-w-[380px]">
          <SheetHeader>
            <SheetTitle>Workspace history</SheetTitle>
            <SheetDescription>
              Recent Agent and table activity for this workspace.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
            {messages.length ? (
              [...messages].reverse().map((message) => (
                <div key={message.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium capitalize">
                      {message.role === "assistant" ? "Ploid Agent" : "You"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
                    {message.content}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Activity will appear here as you run research and functions.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <FunctionLibraryDialog
        open={functionLibraryOpen}
        functions={savedFunctions}
        onOpenChange={(open) => {
          if (!open) modalCloseAtRef.current = Date.now();
          setFunctionLibraryOpen(open);
        }}
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
        onOpenChange={(open) => {
          if (!open) modalCloseAtRef.current = Date.now();
          setFunctionEditorOpen(open);
        }}
        onSave={(fn) => {
          setSavedFunctions((current) =>
            current.some((item) => item.id === fn.id)
              ? current.map((item) => (item.id === fn.id ? fn : item))
              : [...current, fn],
          );
          setFunctionEditorOpen(false);
        }}
      />
      <Dialog open={newSearchOpen} onOpenChange={setNewSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new search</DialogTitle>
            <DialogDescription>
              Ask Ploid Agent to research and add results to the current sheet.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-search-prompt">Research request</Label>
            <Input
              id="new-search-prompt"
              value={newSearchPrompt}
              onChange={(event) => setNewSearchPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void startNewSearch();
              }}
              placeholder="Find finance leaders at AI companies"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSearchOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void startNewSearch()}
              disabled={!newSearchPrompt.trim() || newSearchRunning}
            >
              {newSearchRunning ? "Searching…" : "Ask Ploid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
