"use client";

import { useState } from "react";
import { Check, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import type { EnrichmentDefinition, WorkspaceTable } from "@/lib/workspace/types";

export function EnrichmentDetailsSheet({ open, onOpenChange, workspaceId, table, enrichment, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string; table: WorkspaceTable; enrichment?: EnrichmentDefinition; onChanged: () => Promise<void> | void }) {
  const allFields = enrichment?.kind === "ploid_person" ? ["email", "phone", "profile"] : enrichment?.configuration.socialFields ?? [];
  const [outputs, setOutputs] = useState<string[]>(enrichment?.outputs.map((output) => output.id) ?? []);
  const [autoUpdate, setAutoUpdate] = useState(enrichment?.runSettings.autoUpdate ?? true);
  const [onlyRunIf, setOnlyRunIf] = useState(String(enrichment?.runSettings.onlyRunIf ?? "any_missing_or_stale"));
  const [schedule, setSchedule] = useState("");
  if (!enrichment) return null;
  const save = async () => {
    let scheduleId = enrichment.runSettings.scheduleId;
    if (schedule.trim()) {
      const scheduled = await fetch(`/api/functions/${enrichment.functionId}/schedules`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cronExpression: schedule.trim(), workspaceId, scope: "missing" }) });
      const schedulePayload = await scheduled.json() as { data?: { id?: string } };
      if (!scheduled.ok || !schedulePayload.data?.id) return;
      scheduleId = schedulePayload.data.id;
    }
    const response = await fetch(`/api/workspaces/${workspaceId}/enrichments/${enrichment.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ outputs, runSettings: { autoUpdate, onlyRunIf, scheduleId } }) });
    if (response.ok) { await onChanged(); onOpenChange(false); }
  };
  const run = async (scope: "missing" | "stale" | "test" | "all") => {
    await fetch(`/api/workspaces/${workspaceId}/enrichments/${enrichment.id}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope }) });
    await onChanged();
  };
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="flex w-full flex-col p-0 sm:max-w-[480px]">
    <SheetHeader className="border-b px-5 py-4"><SheetTitle>{enrichment.name}</SheetTitle><SheetDescription>One Ploid action per eligible row; outputs are materialized columns.</SheetDescription></SheetHeader>
    <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
      <section className="space-y-2"><Label>Inputs</Label>{Object.entries(enrichment.inputBindings).map(([input, binding]) => <p key={input} className="text-sm"><span className="text-muted-foreground">{input}</span> ← {binding.type === "column" ? table.columns.find((column) => column.id === binding.columnId)?.name ?? "Removed column" : String(binding.value)}</p>)}</section>
      <section className="space-y-2"><Label>Outputs</Label><div className="grid gap-2 rounded-md border p-3">{allFields.map((field) => <label className="flex items-center gap-2 text-sm" key={field}><Checkbox checked={outputs.includes(field)} onCheckedChange={(checked) => setOutputs((current) => checked ? [...new Set([...current, field])] : current.filter((item) => item !== field))} />{enrichment.outputs.find((output) => output.id === field)?.label ?? field}{enrichment.outputs.find((output) => output.id === field) ? <span className="ml-auto text-xs text-muted-foreground">→ column</span> : null}</label>)}</div></section>
      <section className="flex items-center justify-between rounded-md border p-3"><div><Label>Auto-update</Label><p className="text-xs text-muted-foreground">Shared by every output.</p></div><Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} /></section>
      <section className="grid gap-2"><Label>Only run if</Label><Input value={onlyRunIf} onChange={(event) => setOnlyRunIf(event.target.value)} placeholder="any_missing_or_stale" /><p className="text-xs text-muted-foreground">Default: any selected output is missing or stale.</p></section>
      <section className="grid gap-2"><Label>Schedule</Label><Input value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder={enrichment.runSettings.scheduleId ? "Scheduled (enter a cron expression to replace)" : "Cron, e.g. 0 9 * * 1-5"} /><p className="text-xs text-muted-foreground">Schedules run the shared Function, never individual output columns.</p></section>
      <section className="space-y-2"><Label>Run enrichment</Label><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => void run("missing")}><Play />Run missing</Button><Button variant="outline" onClick={() => void run("stale")}><Play />Run stale</Button><Button variant="outline" onClick={() => void run("test")}><Play />Test 10 rows</Button><Button variant="outline" onClick={() => void run("all")}><Play />Run all</Button></div></section>
      <section className="rounded-md border p-3 text-sm"><p className="font-medium">Run status</p><p className="text-muted-foreground">{Object.values(enrichment.rowExecutions ?? {}).filter((row) => row.status === "complete").length} complete · {Object.values(enrichment.rowExecutions ?? {}).filter((row) => row.status === "partial").length} partial · {Object.values(enrichment.rowExecutions ?? {}).filter((row) => row.status === "failed").length} failed</p><p className="mt-1 text-xs text-muted-foreground">Raw provider responses and warnings remain attached to row executions.</p></section>
      <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">View runs and source results</summary><div className="mt-3 grid gap-3">{Object.values(enrichment.rowExecutions ?? {}).map((execution) => <div key={execution.rowId} className="rounded border p-2"><p>Row {execution.rowId} · {execution.status} · 1 provider request</p><p className="text-xs text-muted-foreground">{Object.entries(execution.fieldStatuses).map(([field, status]) => `${field}: ${status}`).join(" · ")}</p><pre className="mt-2 max-h-32 overflow-auto text-xs">{JSON.stringify({ warnings: execution.warnings, rawProviderResponse: execution.rawProviderResponse }, null, 2)}</pre></div>)}</div></details>
      <Button variant="destructive" className="w-full" onClick={async () => { if (window.confirm(`Delete ${enrichment.name} and its output columns?`)) { await fetch(`/api/workspaces/${workspaceId}/enrichments/${enrichment.id}`, { method: "DELETE" }); await onChanged(); onOpenChange(false); } }}><Trash2 />Delete enrichment</Button>
    </div>
    <SheetFooter className="border-t px-5 py-4"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void save()}><Check />Save</Button></SheetFooter>
  </SheetContent></Sheet>;
}
