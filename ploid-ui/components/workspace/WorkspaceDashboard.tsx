"use client";

import { useState } from "react";
import { Building2, Globe2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionState } from "@/hooks/use-session-state";

type Kind = "people" | "companies" | "markets";
const options: Array<{
  kind: Kind;
  title: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    kind: "people",
    title: "Find people",
    description: "Build a list of people, roles, and contact data.",
    icon: Users,
  },
  {
    kind: "companies",
    title: "Find companies",
    description: "Research companies, markets, and firmographic data.",
    icon: Building2,
  },
  {
    kind: "markets",
    title: "Research markets",
    description: "Map segments, regions, and market opportunities.",
    icon: Globe2,
  },
];
export function WorkspaceDashboard({
  workspaces,
  onCreate,
  onOpen,
}: {
  workspaces: Array<{ id: string; name: string; sheetCount: number }>;
  onCreate: (input: {
    name: string;
    kind: Kind;
    prompt: string;
  }) => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const [kind, setKind] = useSessionState<Kind>(
    "ploid:dashboard:kind",
    "companies",
  );
  const [name, setName] = useSessionState("ploid:dashboard:name", "");
  const [prompt, setPrompt] = useSessionState("ploid:dashboard:prompt", "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-4xl">
        <div className="mb-10">
          <p className="text-sm font-medium text-primary">Ploid workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            What would you like to research?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Start with a focused worksheet. Ploid will create a matching table
            and you can ask it to fill it in.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.kind}
                onClick={() => setKind(option.kind)}
                className={`rounded-lg border p-5 text-left transition-colors ${kind === option.kind ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-muted/50"}`}
              >
                <Icon className="mb-5 size-5 text-primary" />
                <h2 className="font-semibold">{option.title}</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
        <div className="mt-6 grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-[1fr_1fr_auto]">
          <div className="grid gap-2">
            <Label>Worksheet name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                kind === "people"
                  ? "Prospects"
                  : kind === "companies"
                    ? "Target companies"
                    : "Market map"
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>What should Ploid find?</Label>
            <Input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. Series A AI infrastructure startups"
            />
          </div>
          <Button
            className="self-end"
            disabled={creating}
            onClick={async () => {
              setCreating(true);
              setCreateError(null);
              try {
                await new Promise<void>((resolve, reject) => {
                  const timeout = window.setTimeout(
                    () =>
                      reject(
                        new Error(
                          "Creating the worksheet timed out. Please try again.",
                        ),
                      ),
                    100_000,
                  );
                  void onCreate({
                    name:
                      name.trim() ||
                      (kind === "people"
                        ? "People"
                        : kind === "companies"
                          ? "Companies"
                          : "Markets"),
                    kind,
                    prompt,
                  }).then(
                    () => {
                      window.clearTimeout(timeout);
                      resolve();
                    },
                    (error) => {
                      window.clearTimeout(timeout);
                      reject(error);
                    },
                  );
                });
              } catch (error) {
                setCreateError(
                  error instanceof Error
                    ? error.message
                    : "Unable to create the worksheet.",
                );
              } finally {
                setCreating(false);
              }
            }}
          >
            <Plus className="size-4" />
            Create worksheet
          </Button>
        </div>
        {createError && (
          <p className="mt-3 text-sm text-destructive">{createError}</p>
        )}
        {workspaces.length > 0 && (
          <div className="mt-10">
            <h2 className="text-sm font-semibold">Your worksheets</h2>
            <div className="mt-3 grid gap-2">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => onOpen(workspace.id)}
                  className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-left hover:bg-muted/50"
                >
                  <span className="font-medium">{workspace.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {workspace.sheetCount} sheet
                    {workspace.sheetCount === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
