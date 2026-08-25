"use client";
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
export function RenameColumnDialog({
  open,
  name,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  name: string;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("column-name");
            if (typeof value === "string" && value.trim()) onSave(value.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename column</DialogTitle>
            <DialogDescription>
              Use a concise, recognizable name for this field.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-2">
            <Label htmlFor="column-name">Column name</Label>
            <Input
              key={name}
              id="column-name"
              name="column-name"
              defaultValue={name}
              autoFocus
            />
          </div>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
