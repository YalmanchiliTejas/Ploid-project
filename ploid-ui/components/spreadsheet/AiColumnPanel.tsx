"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LoaderCircle, Play, Sparkles } from "lucide-react";
import { useSessionState } from "@/hooks/use-session-state";
export function AiColumnPanel({
  open,
  onOpenChange,
  onRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (limit: number | null) => void;
}) {
  const [columnName, setColumnName] = useSessionState(
    "ploid:ai-column:name",
    "Company Summary",
  );
  const [prompt, setPrompt] = useSessionState(
    "ploid:ai-column:prompt",
    "Summarize {{Company}} in one sentence",
  );
  const [concurrency, setConcurrency] = useSessionState(
    "ploid:ai-column:concurrency",
    "4",
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            AI Column
          </SheetTitle>
          <SheetDescription>
            Generate a reusable AI field from your company data.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4">
          <div className="grid gap-2">
            <Label>Column name</Label>
            <Input
              value={columnName}
              onChange={(event) => setColumnName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            &#123;&#123;Company&#125;&#125; maps to the Company column.
          </p>
          <Separator />
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Label>Execution status</Label>
              <Badge variant="secondary">
                <LoaderCircle className="size-3 animate-spin" />
                Ready
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <span>1 complete</span>
              <span>0 failed</span>
              <span>4 ready</span>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="concurrency">Concurrency</Label>
              <Input
                id="concurrency"
                type="number"
                value={concurrency}
                onChange={(event) => setConcurrency(event.target.value)}
                min="1"
                max="5"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onRun(5)}>
                <Play className="size-3.5" />
                Run first 5
              </Button>
              <Button variant="outline" size="sm" onClick={() => onRun(null)}>
                Run selected
              </Button>
              <Button size="sm" onClick={() => onRun(null)}>
                Run all
              </Button>
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onRun(null)}>Create column</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
