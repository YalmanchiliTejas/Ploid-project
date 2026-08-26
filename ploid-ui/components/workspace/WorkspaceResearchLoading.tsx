"use client";

import { Check, LoaderCircle, Sparkles } from "lucide-react";

export function WorkspaceResearchLoading({
  workspaceName,
  activity,
}: {
  workspaceName: string;
  activity?: string;
}) {
  const steps = [
    "Understanding your research request",
    "Finding and evaluating relevant sources",
    "Designing the table and validating results",
  ];

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <section className="w-full max-w-lg rounded-xl border bg-card p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">Ploid Agent is researching</p>
            <p className="text-xs text-muted-foreground">{workspaceName}</p>
          </div>
        </div>
        <div className="mt-8 flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
          <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium">
              {activity ?? "Preparing your workspace"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The table will appear after Ploid returns a usable schema and its
              first results.
            </p>
          </div>
        </div>
        <ol className="mt-6 space-y-3">
          {steps.map((step, index) => (
            <li
              key={step}
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              <span
                className={
                  index === 1
                    ? "grid size-5 place-items-center rounded-full border border-primary text-primary"
                    : "grid size-5 place-items-center rounded-full bg-muted"
                }
              >
                {index === 1 ? (
                  <LoaderCircle className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
