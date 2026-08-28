"use client";

import { useMemo, useState } from "react";
import { AtSign, Phone, Search, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { EnrichmentAction } from "./EnrichmentColumnSheet";

const choices: Array<{ action: EnrichmentAction; title: string; description: string; group: "People" | "Social"; icon: typeof UserRound }> = [
  { action: "person", title: "Enrich person", description: "Get profile, work email and phone", group: "People", icon: UserRound },
  { action: "work_email", title: "Find work email", description: "Quick setup · Enrich Person recipe", group: "People", icon: AtSign },
  { action: "phone", title: "Find phone", description: "Quick setup · Enrich Person recipe", group: "People", icon: Phone },
  { action: "social", title: "Social profile", description: "LinkedIn, GitHub, X, Instagram and more", group: "Social", icon: UserRound },
];

export function EnrichmentPickerDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (action: EnrichmentAction) => void }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => choices.filter((choice) => `${choice.title} ${choice.description}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Add enrichment</DialogTitle></DialogHeader>
      <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search enrichments..." autoFocus /></div>
      {(["People", "Social"] as const).map((group) => {
        const items = visible.filter((choice) => choice.group === group);
        return items.length ? <section key={group}><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p><div className="grid gap-1">{items.map((choice) => { const Icon = choice.icon; return <Button key={choice.action} variant="ghost" className="h-auto justify-start px-3 py-2.5 text-left" onClick={() => { onSelect(choice.action); onOpenChange(false); }}><Icon className="mr-3 size-4 shrink-0 text-primary" /><span className="grid"><span>{choice.title}</span><span className="text-xs font-normal text-muted-foreground">{choice.description}</span></span></Button>; })}</div></section> : null;
      })}
    </DialogContent>
  </Dialog>;
}
