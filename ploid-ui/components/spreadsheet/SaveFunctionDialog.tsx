"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import type { ColumnDefinition } from "@/lib/spreadsheet/columns";
import type { SavedFunction } from "@/lib/spreadsheet/functions";
import { useSessionState } from "@/hooks/use-session-state";

export function SaveFunctionDialog({
  open,
  column,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  column: ColumnDefinition | null;
  onOpenChange: (open: boolean) => void;
  onSave: (value: SavedFunction) => void;
}) {
  const [name, setName] = useSessionState(
    "ploid:save-function:name",
    column?.name ?? "",
  );
  const [description, setDescription] = useSessionState(
    "ploid:save-function:description",
    column?.description ??
      (column ? `Reusable ${column.name} column function` : ""),
  );
  const kind = column?.dataType === "ai" ? "ai" : "formula";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as Function</DialogTitle>
          <DialogDescription>
            Save this column configuration for reuse in another column.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="function-name">Name</Label>
            <Input
              id="function-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="function-description">Description</Label>
            <Textarea
              id="function-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Inputs</Label>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Company</Badge>
              <Badge variant="secondary">Website</Badge>
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Output</Label>
            <span className="text-sm text-muted-foreground">
              {kind === "ai" ? "AI text" : "Formula result"}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !column}
            onClick={() => {
              if (!column || !name.trim()) return;
              onSave({
                id: `function-${Date.now()}`,
                name: name.trim(),
                description: description.trim(),
                kind,
                template:
                  kind === "ai"
                    ? '=AI("Summarize this company: " & A{row})'
                    : "=A{row}",
                output: "text",
                inputs: ["Company", "Website"],
              });
              onOpenChange(false);
            }}
          >
            Save Function
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
