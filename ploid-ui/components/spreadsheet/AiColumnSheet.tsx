"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceTable } from "@/lib/workspace/types";

type OutputType = "text" | "number" | "boolean" | "url" | "date" | "json";
type Config = {
  name: string;
  description?: string;
  promptTemplate: string;
  inputColumnIds: string[];
  outputType: OutputType;
  model?: string;
  systemPrompt?: string;
  runMode?: "manual" | "input_change" | "scheduled";
};
type RunProgress = {
  total: number;
  completed: number;
  failed: number;
};
const initialConfig: Config = {
  name: "",
  promptTemplate: "",
  inputColumnIds: [],
  outputType: "text",
  model: "openrouter/auto",
  runMode: "manual",
};

export function AiColumnSheet({
  open,
  onOpenChange,
  workspaceId,
  table,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  table: WorkspaceTable;
  onSaved: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState("generate");
  const [instruction, setInstruction] = useState("");
  const [config, setConfig] = useState<Config>(initialConfig);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedColumnId, setSavedColumnId] = useState<string>();
  const [runProgress, setRunProgress] = useState<RunProgress>();
  const [models, setModels] = useState<
    Array<{ id: string; name: string; supportsStructuredOutput: boolean }>
  >([]);
  const resetForm = () => {
    setTab("generate");
    setInstruction("");
    setConfig({ ...initialConfig, inputColumnIds: [] });
    setGenerating(false);
    setSaving(false);
    setError(undefined);
    setPickerOpen(false);
    setSavedColumnId(undefined);
    setRunProgress(undefined);
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputColumns = useMemo(
    () =>
      table.columns.filter((column) =>
        config.inputColumnIds.includes(column.id),
      ),
    [config.inputColumnIds, table.columns],
  );
  const insertColumn = (column: WorkspaceTable["columns"][number]) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? instruction.length;
    const end = textarea?.selectionEnd ?? start;
    const token = `{{${column.id}}}`;
    setInstruction(
      (value) => `${value.slice(0, start)}${token}${value.slice(end)}`,
    );
    setConfig((value) => ({
      ...value,
      inputColumnIds: [...new Set([...value.inputColumnIds, column.id])],
    }));
    setPickerOpen(false);
    requestAnimationFrame(() => textarea?.focus());
  };
  const generate = async () => {
    if (!instruction.trim() || generating) return;
    setGenerating(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/ai-columns/generate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ instruction }),
        },
      );
      const payload = (await response.json()) as {
        data?: Config;
        error?: string;
      };
      if (!response.ok || !payload.data)
        throw new Error(
          payload.error ?? "AI could not generate a column configuration",
        );
      setConfig({ ...initialConfig, ...payload.data, runMode: "manual" });
      void loadModels();
      setTab("configure");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to generate configuration",
      );
    } finally {
      setGenerating(false);
    }
  };
  const loadModels = async () => {
    if (models.length) return;
    const response = await fetch("/api/openrouter/models");
    const payload = (await response.json().catch(() => null)) as {
      data?: Array<{
        id: string;
        name: string;
        supportsStructuredOutput: boolean;
      }>;
    } | null;
    if (response.ok && payload?.data) {
      setModels(payload.data);
    }
  };
  useEffect(() => {
    if (!savedColumnId) return;
    const stream = new EventSource(`/api/workspaces/${workspaceId}/events`);
    const updateProgress = (failed: boolean) => (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as {
        data?: { columnId?: string };
      };
      if (payload.data?.columnId !== savedColumnId) return;
      setRunProgress((current) =>
        current
          ? {
              ...current,
              completed: Math.min(current.total, current.completed + 1),
              failed: current.failed + Number(failed),
            }
          : current,
      );
    };
    stream.addEventListener("ai-column.row.completed", updateProgress(false));
    stream.addEventListener("ai-column.row.failed", updateProgress(true));
    return () => stream.close();
  }, [savedColumnId, workspaceId]);
  const save = async () => {
    if (!config.name.trim() || !config.promptTemplate.trim() || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/ai-columns`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(config),
        },
      );
      const payload = (await response.json()) as {
        data?: { column?: { id: string } };
        error?: string;
      };
      if (!response.ok || !payload.data?.column)
        throw new Error(payload.error ?? "Unable to save AI column");
      setSavedColumnId(payload.data.column.id);
      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save AI column",
      );
    } finally {
      setSaving(false);
    }
  };
  const run = async (limit?: number) => {
    if (!savedColumnId) return;
    const total = Math.min(limit ?? table.rows.length, table.rows.length);
    setRunProgress({ total, completed: 0, failed: 0 });
    const response = await fetch(
      `/api/workspaces/${workspaceId}/ai-columns/${savedColumnId}/run`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit }),
      },
    );
    if (!response.ok) {
      setRunProgress(undefined);
      throw new Error("Unable to start AI column run");
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetForm();
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Use AI
          </SheetTitle>
          <SheetDescription>
            Create a Function-backed column without running research yet.
          </SheetDescription>
        </SheetHeader>
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-5 mt-4 grid grid-cols-2">
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="configure" disabled={!config.promptTemplate}>
              Configure
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="generate"
            className="m-0 flex min-h-0 flex-1 flex-col gap-4 px-5 py-5"
          >
            <div>
              <Label>What would you like AI to do?</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Describe what data to research, generate, classify, or extract.
              </p>
            </div>
            <Textarea
              ref={textareaRef}
              value={instruction}
              rows={9}
              onChange={(event) => {
                setInstruction(event.target.value);
                if (event.target.value.endsWith("/")) setPickerOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "/") setPickerOpen(true);
              }}
              placeholder="Find the current CEO of {{col_company}} and return their LinkedIn."
            />
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-fit">
                  / Insert column
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Find a column…" />
                  <CommandList>
                    <CommandEmpty>No columns found.</CommandEmpty>
                    <CommandGroup heading="Insert column">
                      {table.columns.map((column) => (
                        <CommandItem
                          key={column.id}
                          value={`${column.name} ${column.id}`}
                          onSelect={() => insertColumn(column)}
                        >
                          {column.name}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {column.dataType}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              className="ml-auto"
              onClick={generate}
              disabled={!instruction.trim() || generating}
            >
              {generating && <LoaderCircle className="size-4 animate-spin" />}
              Generate
            </Button>
          </TabsContent>
          <TabsContent
            value="configure"
            className="m-0 min-h-0 flex-1 overflow-y-auto px-5 py-5"
          >
            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label>Column name</Label>
                <Input
                  value={config.name}
                  onChange={(event) =>
                    setConfig({ ...config, name: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={config.description ?? ""}
                  onChange={(event) =>
                    setConfig({ ...config, description: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Model</Label>
                <Select
                  value={config.model ?? ""}
                  onOpenChange={(open) => open && void loadModels()}
                  onValueChange={(model) => setConfig({ ...config, model })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                      >
                        <span className="flex items-center gap-2">
                          {model.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Auto is recommended.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Output type</Label>
                <Select
                  value={config.outputType}
                  onValueChange={(value) =>
                    setConfig({ ...config, outputType: value as OutputType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "text",
                        "number",
                        "boolean",
                        "url",
                        "date",
                        "json",
                      ] as OutputType[]
                    ).map((value) => (
                      <SelectItem key={value} value={value}>
                        {value[0].toUpperCase() + value.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Instructions</Label>
                <Textarea
                  value={config.promptTemplate}
                  rows={7}
                  onChange={(event) =>
                    setConfig({ ...config, promptTemplate: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Inputs</Label>
                <div className="flex flex-wrap gap-1">
                  {inputColumns.length ? (
                    inputColumns.map((column) => (
                      <Badge key={column.id} variant="secondary">
                        {column.name}
                        <button
                          className="ml-1"
                          onClick={() =>
                            setConfig((value) => ({
                              ...value,
                              inputColumnIds: value.inputColumnIds.filter(
                                (id) => id !== column.id,
                              ),
                            }))
                          }
                        >
                          ×
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No referenced columns
                    </span>
                  )}
                </div>
              </div>
              {!config.inputColumnIds.length && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  ⚠ This column doesn’t reference other columns, so it will not
                  automatically rerun when table data changes. Run it manually
                  or configure a schedule.
                </div>
              )}
              <Separator />
              <div className="grid gap-2">
                <Label>
                  System guidance{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  value={config.systemPrompt ?? ""}
                  rows={3}
                  onChange={(event) =>
                    setConfig({ ...config, systemPrompt: event.target.value })
                  }
                  placeholder="Keep the output concise and grounded in the row inputs."
                />
              </div>
              <div className="grid gap-2">
                <Label>Run settings</Label>
                <RadioGroup
                  value={config.runMode}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      runMode: value as Config["runMode"],
                    })
                  }
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="manual" id="manual" />
                    <Label htmlFor="manual">Manual</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="input_change" id="input-change" />
                    <Label htmlFor="input-change">When inputs change</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="scheduled" id="scheduled" />
                    <Label htmlFor="scheduled">Scheduled</Label>
                  </div>
                </RadioGroup>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {savedColumnId && (
                <div className="grid gap-3 rounded-md bg-muted p-3">
                  {runProgress ? (
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {runProgress.completed < runProgress.total
                            ? "Running"
                            : "Complete"}
                        </span>
                        <span>
                          {runProgress.completed} / {runProgress.total}
                          {runProgress.failed ? ` (${runProgress.failed} failed)` : ""}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{
                            width: `${runProgress.total ? (runProgress.completed / runProgress.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Badge variant="secondary">Not run</Badge>
                  )}
                  <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => run(5)}>
                    <Play className="size-3.5" />
                    Run first 5
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => run()}>
                    <Play className="size-3.5" />
                    Run all
                  </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <SheetFooter className="border-t px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={save}
            disabled={
              !!savedColumnId ||
              !config.name.trim() ||
              !config.promptTemplate.trim() ||
              !config.model ||
              saving
            }
          >
            {saving && <LoaderCircle className="size-4 animate-spin" />}
            <Sparkles className="size-4" />
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
