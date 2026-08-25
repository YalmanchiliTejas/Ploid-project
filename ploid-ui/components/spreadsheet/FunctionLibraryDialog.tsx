"use client";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Pencil, Plus, Sigma, Sparkles } from "lucide-react";
import type { SavedFunction } from "@/lib/spreadsheet/functions";
export function FunctionLibraryDialog({
  open,
  functions,
  onOpenChange,
  onCreate,
  onEdit,
}: {
  open: boolean;
  functions: SavedFunction[];
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onEdit: (fn: SavedFunction) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-lg">
        <DialogHeader className="p-5 pb-2">
          <DialogTitle>Function Library</DialogTitle>
          <DialogDescription>
            Create and reuse AI or local formula functions.
          </DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Search functions..." />
          <CommandList>
            <CommandEmpty>No functions found.</CommandEmpty>
            <CommandGroup heading="Saved Functions">
              <ScrollArea className="h-60">
                {functions.map((functionItem) => (
                  <CommandItem
                    key={functionItem.id}
                    className="gap-3 py-3"
                    onSelect={() => onEdit(functionItem)}
                  >
                    <div className="rounded-md bg-muted p-2">
                      {functionItem.kind === "ai" ? (
                        <Sparkles className="size-4" />
                      ) : (
                        <Sigma className="size-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{functionItem.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {functionItem.inputs.join(" + ")} →{" "}
                        {functionItem.output}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {functionItem.kind === "ai" ? "AI" : "Formula"}
                    </Badge>
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </CommandItem>
                ))}
              </ScrollArea>
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-3">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={onCreate}
          >
            <Plus className="size-4" />
            Create new function
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
