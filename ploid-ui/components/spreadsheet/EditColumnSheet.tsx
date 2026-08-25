"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { dataTypes, type ColumnDefinition } from "@/lib/spreadsheet/columns";
import type { SavedFunction } from "@/lib/spreadsheet/functions";
import { useSessionState } from "@/hooks/use-session-state";

const defaultOptions = ["Option 1", "Option 2"];

export function EditColumnSheet({
  open,
  column,
  functions,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  column: ColumnDefinition | null;
  functions: SavedFunction[];
  onOpenChange: (open: boolean) => void;
  onSave: (column: ColumnDefinition) => void;
}) {
  const [draft, setDraft] = useSessionState<ColumnDefinition | null>(
    `ploid:edit-column:${column?.id ?? "none"}:draft`,
    column,
  );
  const [newOption, setNewOption] = useSessionState(
    `ploid:edit-column:${column?.id ?? "none"}:new-option`,
    "",
  );
  const current = draft ?? column;
  if (!current) return null;
  const patch = (value: Partial<ColumnDefinition>) =>
    setDraft({ ...current, ...value });
  const hasOptions =
    current.dataType === "select" || current.dataType === "multi-select";
  const addOption = () => {
    const option = newOption.trim();
    if (!option || current.options?.includes(option)) return;
    patch({ options: [...(current.options ?? []), option] });
    setNewOption("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>Edit column</SheetTitle>
          <SheetDescription>
            Configure the field and how values are entered in the spreadsheet.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={current.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Data type</Label>
            <Select
              value={current.dataType}
              onValueChange={(value) => {
                const dataType = value as ColumnDefinition["dataType"];
                patch({
                  dataType,
                  options:
                    dataType === "select" || dataType === "multi-select"
                      ? current.options?.length
                        ? current.options
                        : defaultOptions
                      : current.options,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dataTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasOptions && (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label>Options</Label>
                <p className="text-xs text-muted-foreground">
                  These choices appear as a dropdown in every cell in this
                  column.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(current.options ?? []).map((option) => (
                  <Badge
                    key={option}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {option}
                    <button
                      type="button"
                      className="rounded-sm p-0.5 hover:bg-foreground/10"
                      aria-label={`Remove ${option}`}
                      onClick={() =>
                        patch({
                          options: (current.options ?? []).filter(
                            (item) => item !== option,
                          ),
                        })
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newOption}
                  onChange={(event) => setNewOption(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="Add an option"
                />
                <Button type="button" variant="outline" onClick={addOption}>
                  Add
                </Button>
              </div>
            </div>
          )}
          {(current.dataType === "ai" || current.dataType === "formula") && (
            <>
              <div className="grid gap-2">
                <Label>Function</Label>
                <Select
                  value={current.functionId ?? ""}
                  onValueChange={(functionId) => patch({ functionId })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a saved function" />
                  </SelectTrigger>
                  <SelectContent>
                    {functions
                      .filter((fn) =>
                        current.dataType === "ai"
                          ? fn.kind === "ai"
                          : fn.kind === "formula",
                      )
                      .map((fn) => (
                        <SelectItem key={fn.id} value={fn.id}>
                          {fn.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Inputs</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    functions.find((fn) => fn.id === current.functionId)
                      ?.inputs ?? ["Company", "Website"]
                  ).map((input) => (
                    <Badge key={input} variant="secondary">
                      {input}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={current.description ?? ""}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder="What does this column represent?"
            />
          </div>
          <Separator />
          <Button type="button" variant="outline">
            Test first row
          </Button>
        </div>
        <SheetFooter>
          <Button onClick={() => onSave(current)}>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
