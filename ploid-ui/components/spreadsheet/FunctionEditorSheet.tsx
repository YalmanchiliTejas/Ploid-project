"use client";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { SavedFunction } from "@/lib/spreadsheet/functions";
import { useSessionState } from "@/hooks/use-session-state";
export function FunctionEditorSheet({
  open,
  value,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  value: SavedFunction | null;
  onOpenChange: (open: boolean) => void;
  onSave: (value: SavedFunction) => void;
}) {
  const [name, setName] = useSessionState(
    "ploid:function-editor:name",
    value?.name ?? "",
  );
  const [kind, setKind] = useSessionState<SavedFunction["kind"]>(
    "ploid:function-editor:kind",
    value?.kind ?? "ai",
  );
  const [template, setTemplate] = useSessionState(
    "ploid:function-editor:template",
    value?.template ?? '=AI("Summarize " & A{row})',
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>{value ? "Edit Function" : "Create Function"}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-5 px-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Industry Classifier"
            />
          </div>
          <div className="grid gap-2">
            <Label>Function type</Label>
            <Select
              value={kind}
              onValueChange={(next) => setKind(next as SavedFunction["kind"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ai">AI</SelectItem>
                <SelectItem value="formula">Formula</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Inputs</Label>
            <div className="flex gap-2">
              <Badge variant="secondary">Company</Badge>
              <Badge variant="secondary">Website</Badge>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{kind === "ai" ? "Prompt formula" : "Formula"}</Label>
            <Textarea
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
            />
          </div>
        </div>
        <SheetFooter>
          <Button
            onClick={() => {
              if (name.trim())
                onSave({
                  id: value?.id ?? `function-${Date.now()}`,
                  name: name.trim(),
                  description: `${kind === "ai" ? "AI" : "Formula"} function`,
                  kind,
                  template,
                  output: "text",
                  inputs: ["Company", "Website"],
                });
            }}
          >
            Save function
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
