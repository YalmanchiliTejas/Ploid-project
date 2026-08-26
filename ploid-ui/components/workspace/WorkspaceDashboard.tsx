"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  BarChart3,
  Bot,
  Boxes,
  ChevronDown,
  Clock3,
  CircleCheck,
  CircleX,
  FileUp,
  FolderKanban,
  FunctionSquare,
  HelpCircle,
  Import,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Table2,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  QuickActionCard,
  type QuickActionCardVariant,
} from "@/components/dashboard/QuickActionCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Kind = "people" | "companies" | "markets";
type WorkspaceItem = { id: string; name: string; sheetCount: number };
type FunctionItem = {
  id: string;
  name: string;
  description: string;
  kind: "ai" | "formula";
};
type NavItem = { label: string; icon: LucideIcon };
type DashboardView =
  | "Home"
  | "Tables"
  | "Functions"
  | "Workflows"
  | "Schedules"
  | "Runs"
  | "Exports"
  | "Settings";

const primaryNav: NavItem[] = [
  { label: "Home", icon: Boxes },
  { label: "Tables", icon: Table2 },
];
const automationNav: NavItem[] = [
  { label: "Functions", icon: FunctionSquare },
  { label: "Workflows", icon: Workflow },
  { label: "Schedules", icon: Clock3 },
  { label: "Runs", icon: Bot },
];

/** Deterministic routing preserves the existing three starter schemas without an LLM call. */
export function workspaceKindForPrompt(prompt: string): Kind {
  const value = prompt.toLowerCase();
  if (
    /\b(people|person|buyer|buyers|founder|ceo|manager|contact|lead|candidate|linkedin)\b/.test(
      value,
    )
  )
    return "people";
  if (/\b(market|tam|sector|landscape|trend|category)\b/.test(value))
    return "markets";
  return "companies";
}

export function WorkspaceDashboard({
  workspaces,
  loading = false,
  onCreate,
  onCreateFunction,
  functions = [],
  onOpenFunction,
  onOpen,
}: {
  workspaces: WorkspaceItem[];
  loading?: boolean;
  onCreate: (input: {
    name: string;
    kind: Kind;
    prompt: string;
  }) => Promise<void>;
  onCreateFunction?: () => void;
  functions?: FunctionItem[];
  onOpenFunction?: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [view, setView] = useState<DashboardView>("Home");
  const [automationItems, setAutomationItems] = useState<
    Array<Record<string, unknown>>
  >([]);
  const focusPrompt = () =>
    document.getElementById("dashboard-agent-input")?.focus();
  const scrollToDashboardStart = () =>
    document
      .getElementById("dashboard-start")
      ?.scrollIntoView({ behavior: "smooth" });
  const preparePrompt = (value: string) => {
    setPrompt(value);
    requestAnimationFrame(focusPrompt);
  };
  const submit = async () => {
    const request = prompt.trim();
    if (!request || creating) return;
    setCreating(true);
    try {
      await onCreate({
        name: "Untitled research",
        kind: workspaceKindForPrompt(request),
        prompt: request,
      });
    } finally {
      setCreating(false);
    }
  };
  useEffect(() => {
    if (!["Functions", "Workflows", "Runs", "Schedules"].includes(view)) return;
    let cancelled = false;
    const endpoint =
      view === "Functions" || view === "Workflows"
        ? "/api/functions"
        : `/api/functions/${view.toLowerCase()}`;
    void fetch(endpoint)
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((payload: { data?: Array<Record<string, unknown>> }) => {
        if (!cancelled) setAutomationItems(payload.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setAutomationItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);
  const rows = useMemo(() => {
    // Favorites and timestamps are not persisted by the current workspace model.
    // Keep the UI truthful: Recent reflects the API ordering and favorites are empty.
    if (tab === "favorites") return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return normalizedQuery
      ? workspaces.filter((workspace) =>
          workspace.name.toLocaleLowerCase().includes(normalizedQuery),
        )
      : workspaces;
  }, [query, tab, workspaces]);
  const quickActions: Array<{
    icon: LucideIcon;
    title: string;
    description: string;
    ctaLabel: string;
    variant: QuickActionCardVariant;
    onClick: () => void;
  }> = [
    {
      icon: Sparkles,
      title: "Research",
      description: "Discover companies, people, and markets using Ploid.",
      ctaLabel: "Explore",
      variant: "research",
      onClick: () => preparePrompt("Find "),
    },
    {
      icon: Import,
      title: "Import data",
      description: "Bring existing datasets into your workspace.",
      ctaLabel: "Import",
      variant: "import",
      onClick: () => setImportOpen(true),
    },
    {
      icon: Table2,
      title: "Create table",
      description: "Create a structured research workspace.",
      ctaLabel: "Create",
      variant: "table",
      onClick: () => preparePrompt("Create a table for "),
    },
    {
      icon: FunctionSquare,
      title: "Create Function",
      description: "Build a reusable automated research workflow.",
      ctaLabel: "Build",
      variant: "function",
      onClick:
        onCreateFunction ?? (() => preparePrompt("Create a function that ")),
    },
  ];

  return (
    <main className="flex h-[100dvh] overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar px-3 py-4 lg:flex">
        <div className="mb-7 flex items-center gap-2 px-2">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            P
          </span>
          <span className="font-semibold tracking-tight">Ploid</span>
        </div>
        <nav className="grid gap-1" aria-label="Primary navigation">
          {primaryNav.map(({ label, icon: Icon }) => (
            <Button
              key={label}
              variant="ghost"
              size="sm"
              onClick={() => {
                setView(label as DashboardView);
                if (label === "Home") scrollToDashboardStart();
              }}
              className={`justify-start gap-2 px-2 text-sm ${view === label ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="size-4" />
              {label}
            </Button>
          ))}
        </nav>
        <p className="mb-2 mt-7 px-2 text-[10px] font-medium tracking-[.14em] text-muted-foreground">
          AUTOMATION
        </p>
        <nav className="grid gap-1" aria-label="Automation navigation">
          {automationNav.map(({ label, icon: Icon }) => (
            <Button
              key={label}
              variant="ghost"
              size="sm"
              onClick={() => setView(label as DashboardView)}
              className={`justify-start gap-2 px-2 text-sm ${view === label ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="size-4" />
              {label}
            </Button>
          ))}
        </nav>
        <div className="mt-auto grid gap-1 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("Exports")}
            className={`justify-start gap-2 px-2 text-sm ${view === "Exports" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <FileUp className="size-4" />
            Exports
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("Settings")}
            className={`justify-start gap-2 px-2 text-sm ${view === "Settings" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Settings className="size-4" />
            Settings
          </Button>
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-end gap-2 border-b bg-card px-5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ploid help"
            onClick={() =>
              window.open("https://ploid.com", "_blank", "noopener,noreferrer")
            }
          >
            <HelpCircle className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Settings"
            onClick={() =>
              window.open("https://ploid.com", "_blank", "noopener,noreferrer")
            }
          >
            <Settings className="size-4" />
          </Button>
          <span className="mx-1 h-5 border-l" />
          <button
            type="button"
            onClick={() => preparePrompt("Show my account settings")}
            className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-semibold transition-colors hover:bg-accent"
            aria-label="Open account settings"
          >
            T
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            id="dashboard-start"
            className="mx-auto w-full max-w-[1560px] px-6 py-8 lg:px-10"
          >
            {view === "Home" ? (
              <>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Hello — what would you like to research?
                </h1>
                <div className="mt-6 flex items-center rounded-xl border bg-card p-1.5 shadow-sm shadow-black/[.02] transition focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5">
                  <Sparkles className="ml-2 size-4 text-primary" />
                  <Input
                    id="dashboard-agent-input"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submit();
                    }}
                    className="h-10 flex-1 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                    placeholder="Ask Ploid anything or describe what to do…"
                  />
                  <Button
                    size="icon-sm"
                    className="size-9 rounded-lg"
                    disabled={creating || !prompt.trim()}
                    onClick={() => void submit()}
                    aria-label="Send request"
                  >
                    {creating ? (
                      <Clock3 className="size-4 animate-spin" />
                    ) : (
                      <ArrowUp className="size-4" />
                    )}
                  </Button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {quickActions.map(
                    ({
                      icon,
                      title,
                      description,
                      ctaLabel,
                      variant,
                      onClick,
                    }) => (
                      <QuickActionCard
                        key={title}
                        icon={icon}
                        title={title}
                        description={description}
                        ctaLabel={ctaLabel}
                        variant={variant}
                        onClick={onClick}
                      />
                    ),
                  )}
                </div>
                <div
                  id="workspaces"
                  className="mt-10 flex items-center justify-between gap-4 scroll-mt-4"
                >
                  <div className="flex items-center gap-2">
                    <FolderKanban className="size-5 text-primary" />
                    <h2 className="text-xl font-semibold tracking-tight">
                      Workspaces
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative hidden md:block">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <Input
                        className="h-8 w-52 pl-8 text-xs"
                        placeholder="Search workspaces"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm">
                          <Plus className="size-3.5" />
                          New
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            preparePrompt("Create a new workspace for ")
                          }
                        >
                          New workspace
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => preparePrompt("Create a table for ")}
                        >
                          New table
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            onCreateFunction?.() ??
                            preparePrompt("Create a function that ")
                          }
                        >
                          New function
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                          Import CSV
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <Tabs value={tab} onValueChange={setTab} className="mt-5">
                  <TabsList className="h-8 bg-muted/70">
                    <TabsTrigger value="all" className="text-xs">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="recent" className="text-xs">
                      Recent
                    </TabsTrigger>
                    <TabsTrigger value="favorites" className="text-xs">
                      Favorites
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="mt-3 overflow-hidden rounded-xl border bg-card">
                  <div className="grid grid-cols-[minmax(0,1fr)_100px_100px_32px] border-b bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Name</span>
                    <span>Type</span>
                    <span>Sheets</span>
                    <span />
                  </div>
                  {loading ? (
                    <div className="grid gap-0">
                      {[0, 1, 2].map((index) => (
                        <div
                          key={index}
                          className="grid grid-cols-[minmax(0,1fr)_100px_100px_32px] items-center border-b px-4 py-3 last:border-0"
                        >
                          <span className="h-4 w-44 animate-pulse rounded bg-muted" />
                          <span className="h-5 w-12 animate-pulse rounded bg-muted" />
                          <span className="h-4 w-8 animate-pulse rounded bg-muted" />
                        </div>
                      ))}
                    </div>
                  ) : rows.length ? (
                    rows.map((workspace) => (
                      <div
                        key={workspace.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(workspace.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ")
                            onOpen(workspace.id);
                        }}
                        className="grid cursor-pointer grid-cols-[minmax(0,1fr)_100px_100px_32px] items-center px-4 py-3 text-sm hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Table2 className="size-4 shrink-0 text-primary" />
                          <span className="truncate font-medium">
                            {workspace.name}
                          </span>
                        </div>
                        <Badge
                          variant="secondary"
                          className="w-fit text-[11px]"
                        >
                          Table
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {workspace.sheetCount}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-7"
                              aria-label={`Actions for ${workspace.name}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MoreHorizontal className="size-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => onOpen(workspace.id)}
                            >
                              Open workspace
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center px-4 py-14 text-center">
                      <FolderKanban className="size-5 text-muted-foreground" />
                      <p className="mt-3 text-sm font-medium">
                        {tab === "favorites"
                          ? "No favorite workspaces"
                          : "No workspaces yet"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tab === "favorites"
                          ? "Favorites will appear here when workspace favorites are available."
                          : "Ask Ploid to research something or create your first table."}
                      </p>
                      {tab !== "favorites" && (
                        <Button
                          size="sm"
                          className="mt-4"
                          onClick={focusPrompt}
                        >
                          Ask Ploid
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <DashboardPage
                view={view}
                workspaces={rows}
                functions={functions}
                loading={loading}
                automationItems={automationItems}
                onOpenWorkspace={onOpen}
                onCreateFunction={onCreateFunction}
                onOpenFunction={onOpenFunction}
                onGoHome={() => setView("Home")}
              />
            )}
          </div>
        </div>
      </section>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import data</DialogTitle>
            <DialogDescription>
              Describe the data you want to bring into a new workspace.
            </DialogDescription>
          </DialogHeader>
          <Button
            onClick={() => {
              setImportOpen(false);
              preparePrompt("Import data for ");
            }}
          >
            Continue
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function DashboardPage({
  view,
  workspaces,
  functions,
  loading,
  automationItems,
  onOpenWorkspace,
  onCreateFunction,
  onOpenFunction,
  onGoHome,
}: {
  view: Exclude<DashboardView, "Home">;
  workspaces: WorkspaceItem[];
  functions: FunctionItem[];
  loading: boolean;
  automationItems: Array<Record<string, unknown>>;
  onOpenWorkspace: (id: string) => void;
  onCreateFunction?: () => void;
  onOpenFunction?: (id: string) => void;
  onGoHome: () => void;
}) {
  const labels: Record<
    Exclude<DashboardView, "Home">,
    { title: string; description: string }
  > = {
    Tables: {
      title: "Tables",
      description: "Research workspaces and structured datasets.",
    },
    Functions: {
      title: "Functions",
      description: "Reusable automations available across your tables.",
    },
    Workflows: {
      title: "Workflows",
      description: "Compose reusable automation steps.",
    },
    Schedules: {
      title: "Schedules",
      description: "Function Runner schedules and their next runs.",
    },
    Runs: {
      title: "Runs",
      description: "Recent execution activity from Function Runner.",
    },
    Exports: {
      title: "Exports",
      description: "Exported workspace data and delivery history.",
    },
    Settings: {
      title: "Settings",
      description: "Configure the Ploid workspace experience.",
    },
  };
  const meta = labels[view];
  const functionRecords = automationItems.length
    ? automationItems.map((item, index): FunctionItem => ({
        id: String(item.id ?? `function_${index}`),
        name: String(item.name ?? "Untitled Function"),
        description:
          typeof item.description === "string"
            ? item.description
            : "Function Runner workflow",
        kind:
          Array.isArray(item.nodes) &&
          item.nodes.some(
            (node) =>
              typeof node === "object" &&
              node !== null &&
              (node as { type?: unknown }).type === "local_formula",
          )
            ? "formula"
            : "ai",
      }))
    : functions;
  const isAutomationView =
    view === "Functions" ||
    view === "Workflows" ||
    view === "Runs" ||
    view === "Schedules";
  const cards =
    view === "Tables"
      ? [
          { label: "Workspaces", value: workspaces.length },
          {
            label: "Sheets",
            value: workspaces.reduce(
              (total, workspace) => total + workspace.sheetCount,
              0,
            ),
          },
        ]
      : view === "Functions" || view === "Workflows"
        ? [
            {
              label: view === "Functions" ? "Functions" : "Workflows",
              value: functionRecords.length,
            },
            {
              label: "AI functions",
              value: functionRecords.filter((item) => item.kind === "ai")
                .length,
            },
          ]
        : view === "Runs" || view === "Schedules"
          ? [
              {
                label: view === "Runs" ? "Runs" : "Schedules",
                value: automationItems.length,
              },
              {
                label: "Active",
                value: automationItems.filter(
                  (item) => item.status === "running" || item.enabled === true,
                ).length,
              },
            ]
          : [];
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {meta.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.description}
          </p>
        </div>
        {view === "Functions" && (
          <Button size="sm" onClick={onCreateFunction}>
            <Plus className="size-3.5" />
            Create Function
          </Button>
        )}
        {view === "Tables" && (
          <Button size="sm" onClick={onGoHome}>
            <Sparkles className="size-3.5" />
            Ask Ploid
          </Button>
        )}
      </div>
      {cards.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:max-w-2xl">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      )}
      {isAutomationView && (
        <AutomationAnalytics
          view={view}
          functions={functionRecords}
          items={automationItems}
        />
      )}
      <section className="overflow-hidden rounded-xl border bg-card">
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-10 animate-pulse rounded bg-muted"
              />
            ))}
          </div>
        ) : view === "Tables" ? (
          <DashboardTable workspaces={workspaces} onOpen={onOpenWorkspace} />
        ) : view === "Functions" || view === "Workflows" ? (
          <FunctionTable
            functions={functionRecords}
            onCreate={onCreateFunction}
            onOpen={onOpenFunction}
          />
        ) : view === "Runs" || view === "Schedules" ? (
          <AutomationTable title={view} items={automationItems} />
        ) : (
          <EmptyDashboardPage
            title={`No ${meta.title.toLowerCase()} yet`}
            description={`${meta.description} This page will show real data as it becomes available.`}
          />
        )}
      </section>
    </div>
  );
}

function AutomationAnalytics({
  view,
  functions,
  items,
}: {
  view: "Functions" | "Workflows" | "Runs" | "Schedules";
  functions: FunctionItem[];
  items: Array<Record<string, unknown>>;
}) {
  const runStates = {
    complete: items.filter((item) => item.status === "complete").length,
    running: items.filter((item) => item.status === "running").length,
    failed: items.filter((item) => item.status === "failed").length,
  };
  const scheduled = items.filter((item) => item.enabled === true).length;
  const totalRuns = runStates.complete + runStates.running + runStates.failed;
  const metrics =
    view === "Runs"
      ? [
          { label: "Completed", value: runStates.complete, icon: CircleCheck },
          { label: "Running", value: runStates.running, icon: Clock3 },
          { label: "Failed", value: runStates.failed, icon: CircleX },
          {
            label: "Completion rate",
            value: totalRuns
              ? `${Math.round((runStates.complete / totalRuns) * 100)}%`
              : "—",
            icon: BarChart3,
          },
        ]
      : view === "Schedules"
        ? [
            { label: "Enabled", value: scheduled, icon: CircleCheck },
            {
              label: "Paused",
              value: items.filter((item) => item.enabled === false).length,
              icon: Clock3,
            },
            {
              label: "Scheduled functions",
              value: new Set(
                items.map((item) => item.functionId).filter(Boolean),
              ).size,
              icon: FunctionSquare,
            },
            { label: "Total schedules", value: items.length, icon: BarChart3 },
          ]
        : [
            {
              label: "Active functions",
              value: functions.length,
              icon: FunctionSquare,
            },
            {
              label: "AI workflows",
              value: functions.filter((item) => item.kind === "ai").length,
              icon: Sparkles,
            },
            {
              label: "Formula workflows",
              value: functions.filter((item) => item.kind === "formula").length,
              icon: Workflow,
            },
            {
              label: "Published",
              value: items.filter((item) => item.publishedRevision).length,
              icon: CircleCheck,
            },
          ];
  const distribution =
    view === "Runs"
      ? [
          { label: "Complete", value: runStates.complete },
          { label: "Running", value: runStates.running },
          { label: "Failed", value: runStates.failed },
        ]
      : view === "Schedules"
        ? [
            { label: "Enabled", value: scheduled },
            {
              label: "Paused",
              value: items.filter((item) => item.enabled === false).length,
            },
          ]
        : [
            {
              label: "AI",
              value: functions.filter((item) => item.kind === "ai").length,
            },
            {
              label: "Formula",
              value: functions.filter((item) => item.kind === "formula").length,
            },
          ];
  const max = Math.max(1, ...distribution.map((item) => item.value));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Automation analytics
          </h2>
          <p className="text-xs text-muted-foreground">
            Live totals from the Function Runner.
          </p>
        </div>
        <Tabs defaultValue="overview">
          <TabsList className="h-8">
            <TabsTrigger value="overview" className="text-xs">
              Overview
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">
              Activity
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {label}
              </p>
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
              {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Current workspace data
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                {view === "Runs"
                  ? "Run status"
                  : view === "Schedules"
                    ? "Schedule status"
                    : "Workflow composition"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                A compact view of currently available records.
              </p>
            </div>
            <BarChart3 className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-6 flex h-28 items-end gap-3">
            {distribution.map((item) => (
              <div
                key={item.label}
                className="flex min-w-0 flex-1 flex-col justify-end"
              >
                <div
                  className="rounded-t bg-primary/80 transition-[height]"
                  style={{
                    height: `${Math.max(item.value ? 12 : 4, (item.value / max) * 100)}%`,
                  }}
                />
                <div className="mt-2 flex justify-between gap-2 text-[11px]">
                  <span className="truncate text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="font-medium tabular-nums">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">At a glance</h3>
          <div className="mt-4 space-y-3 text-sm">
            {distribution.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between"
              >
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardTable({
  workspaces,
  onOpen,
}: {
  workspaces: WorkspaceItem[];
  onOpen: (id: string) => void;
}) {
  return workspaces.length ? (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_100px_100px] border-b bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Name</span>
        <span>Type</span>
        <span>Sheets</span>
      </div>
      {workspaces.map((workspace) => (
        <button
          key={workspace.id}
          onClick={() => onOpen(workspace.id)}
          className="grid w-full grid-cols-[minmax(0,1fr)_100px_100px] items-center border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/35"
        >
          <span className="truncate font-medium">{workspace.name}</span>
          <Badge variant="secondary" className="w-fit text-[11px]">
            Table
          </Badge>
          <span className="text-xs text-muted-foreground">
            {workspace.sheetCount}
          </span>
        </button>
      ))}
    </div>
  ) : (
    <EmptyDashboardPage
      title="No tables yet"
      description="Ask Ploid to research something or create a structured table."
    />
  );
}

function FunctionTable({
  functions,
  onCreate,
  onOpen,
}: {
  functions: FunctionItem[];
  onCreate?: () => void;
  onOpen?: (id: string) => void;
}) {
  return functions.length ? (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_120px_120px] border-b bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Function</span>
        <span>Type</span>
        <span>Status</span>
      </div>
      {functions.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen?.(item.id)}
          className="grid w-full grid-cols-[minmax(0,1fr)_120px_120px] items-center border-b px-4 py-3 text-left last:border-0 hover:bg-muted/35"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {item.name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {item.description}
            </span>
          </span>
          <Badge variant="secondary" className="w-fit text-[11px]">
            {item.kind === "ai" ? "AI" : "Formula"}
          </Badge>
          <Badge variant="outline" className="w-fit text-[11px]">
            Ready
          </Badge>
        </button>
      ))}
    </div>
  ) : (
    <EmptyDashboardPage
      title="No functions yet"
      description="Create reusable workflows powered by Ploid and your table data."
      action="Create Function"
      onAction={onCreate}
    />
  );
}

function AutomationTable({
  title,
  items,
}: {
  title: "Runs" | "Schedules";
  items: Array<Record<string, unknown>>;
}) {
  return items.length ? (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_160px_120px] border-b bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Function</span>
        <span>{title === "Runs" ? "Trigger" : "Frequency"}</span>
        <span>Status</span>
      </div>
      {items.map((item, index) => (
        <div
          key={String(item.id ?? index)}
          className="grid grid-cols-[minmax(0,1fr)_160px_120px] items-center border-b px-4 py-3 text-sm last:border-0"
        >
          <span className="truncate font-medium">
            {String(item.functionId ?? item.id ?? "Function")}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {String(
              title === "Runs"
                ? (item.trigger ?? "manual")
                : (item.cronExpression ?? "Not configured"),
            )}
          </span>
          <Badge variant="outline" className="w-fit text-[11px]">
            {String(
              item.status ?? (item.enabled === false ? "Disabled" : "Enabled"),
            )}
          </Badge>
        </div>
      ))}
    </div>
  ) : (
    <EmptyDashboardPage
      title={`No ${title.toLowerCase()} yet`}
      description={
        title === "Runs"
          ? "Run a Function from a table to see its activity here."
          : "Create a schedule from a Function-backed column to automate it."
      }
    />
  );
}

function EmptyDashboardPage({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
      <Boxes className="size-5 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {description}
      </p>
      {action && (
        <Button className="mt-4" size="sm" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
