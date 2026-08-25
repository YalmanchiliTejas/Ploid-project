"use client";
import {
  Filter,
  Plus,
  Redo2,
  SlidersHorizontal,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export function SpreadsheetToolbar({
  onAskAi,
  onAddColumn,
  onFunctionLibrary,
  onUndo,
  onRedo,
}: {
  onAskAi: () => void;
  onAddColumn: () => void;
  onFunctionLibrary: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="flex h-14 items-center justify-between border-b bg-card px-3">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onUndo}
              aria-label="Undo"
            >
              <Undo2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (⌘Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRedo}
              aria-label="Redo"
            >
              <Redo2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (⇧⌘Z)</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button variant="outline" size="sm">
          <Filter className="size-3.5" />
          Filter
        </Button>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="size-3.5" />
          Sort
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onFunctionLibrary}>
              <Sparkles className="size-3.5" />
              Functions
            </Button>
          </TooltipTrigger>
          <TooltipContent>Browse saved functions</TooltipContent>
        </Tooltip>
        <Button size="sm" onClick={onAskAi}>
          <Sparkles className="size-3.5" />
          Ask AI
        </Button>
        <Button variant="outline" size="sm" onClick={onAddColumn}>
          <Plus className="size-3.5" />
          Add column
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">Autosaved</span>
    </div>
  );
}
