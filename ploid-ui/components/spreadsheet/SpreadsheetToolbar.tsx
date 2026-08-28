"use client";
import {
  Filter,
  Plus,
  Play,
  Redo2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export function SpreadsheetToolbar({
  onAskAi,
  onAddColumn,
  onAddEnrichment,
  onFunctionLibrary,
  onUndo,
  onRedo,
  onSearch,
  rowCount,
  functionColumns,
  onRunFunction,
}: {
  onAskAi: () => void;
  onAddColumn: () => void;
  onAddEnrichment: () => void;
  onFunctionLibrary: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSearch: () => void;
  rowCount: number;
  functionColumns: Array<{ id: string; name: string }>;
  onRunFunction: (columnId: string, limit: number | null) => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b bg-card px-2.5">
      <div className="flex min-w-0 items-center gap-1">
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
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Play className="size-3.5" />
              Run functions
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Select a function column
            </p>
            {functionColumns.length ? (
              functionColumns.map((column) => (
                <div key={column.id} className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate px-2 text-sm">
                    {column.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRunFunction(column.id, 5)}
                  >
                    First 5
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRunFunction(column.id, null)}
                  >
                    All
                  </Button>
                </div>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No function-backed columns yet.
              </p>
            )}
          </PopoverContent>
        </Popover>
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
        <Separator orientation="vertical" className="mx-1.5 h-4" />
        <span className="hidden whitespace-nowrap px-1 text-xs text-muted-foreground sm:inline">
          {rowCount} {rowCount === 1 ? "row" : "rows"}
        </span>
        <Separator orientation="vertical" className="mx-1.5 h-4" />
        <Button variant="ghost" size="sm">
          <Filter className="size-3.5" />
          Filter
        </Button>
        <Button variant="ghost" size="sm">
          <SlidersHorizontal className="size-3.5" />
          Sort
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onSearch}
          aria-label="Search this table"
        >
          <Search className="size-3.5" />
        </Button>
        <Input
          className="hidden h-7 w-36 border-0 bg-muted/60 text-xs md:block"
          placeholder="Search"
          readOnly
          onFocus={onSearch}
        />
        <Separator orientation="vertical" className="mx-1.5 h-4" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onFunctionLibrary}>
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
        <Button variant="ghost" size="sm" onClick={onAddColumn}>
          <Plus className="size-3.5" />
          Add column
        </Button>
        <Button variant="ghost" size="sm" onClick={onAddEnrichment}>
          <Sparkles className="size-3.5" />
          Add enrichment
        </Button>
      </div>
      <span className="hidden whitespace-nowrap text-xs text-muted-foreground lg:inline">
        Saved
      </span>
    </div>
  );
}
