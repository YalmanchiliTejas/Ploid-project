"use client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataTypes, type ColumnDataType } from "@/lib/spreadsheet/columns";
import { useSessionState } from "@/hooks/use-session-state";
export function AddColumnDialog({
  open,
  onOpenChange,
  onCreate,
  onUseAi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (column: { name: string; dataType: ColumnDataType }) => void;
  onUseAi: () => void;
}) {
  const [name, setName] = useSessionState("ploid:add-column:name", "");
  const [dataType, setDataType] = useSessionState<ColumnDataType>(
    "ploid:add-column:data-type",
    "text",
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add column</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-column-name">Column name</Label>
            <Input
              id="new-column-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Primary industry"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label>Data type</Label>
            <Select
              value={dataType}
              onValueChange={(value) => setDataType(value as ColumnDataType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dataTypes
                  .filter((type) => type.value !== "ai")
                  .map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="border-t pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">AI</p>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                onOpenChange(false);
                onUseAi();
              }}
            >
              ✨ Use AI
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (name.trim()) {
                onCreate({ name: name.trim(), dataType });
                setName("");
                onOpenChange(false);
              }
            }}
          >
            Create column
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
