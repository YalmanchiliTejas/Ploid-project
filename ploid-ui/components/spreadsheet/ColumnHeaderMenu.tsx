"use client";

import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUpAZ,
  Braces,
  Calendar,
  CircleCheck,
  Columns3,
  Copy,
  CornerDownRight,
  Cpu,
  DollarSign,
  Hash,
  Info,
  Link,
  List,
  Mail,
  MoreHorizontal,
  Palette,
  Pencil,
  Percent,
  Settings2,
  Sigma,
  Sparkles,
  Tags,
  Trash2,
  Type,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dataTypes, type ColumnDataType } from "@/lib/spreadsheet/columns";

const typeIcons: Record<ColumnDataType, typeof Type> = {
  text: Type,
  number: Hash,
  currency: DollarSign,
  percentage: Percent,
  boolean: CircleCheck,
  date: Calendar,
  url: Link,
  email: Mail,
  select: List,
  "multi-select": Tags,
  json: Braces,
  formula: Sigma,
  ai: Sparkles,
};
const colorDots: Record<string, string> = {
  Default: "bg-muted-foreground",
  Gray: "bg-slate-400",
  Blue: "bg-blue-500",
  Green: "bg-green-500",
  Yellow: "bg-yellow-400",
  Orange: "bg-orange-500",
  Red: "bg-red-500",
  Purple: "bg-purple-500",
};

export function ColumnTypeIcon({ type }: { type: ColumnDataType }) {
  const Icon = typeIcons[type];
  return <Icon className="size-3.5 text-muted-foreground" />;
}

type Props = {
  columnName: string;
  dataType: ColumnDataType;
  onRename: () => void;
  onEdit: () => void;
  onInsert: (side: "left" | "right") => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSort: (direction: "asc" | "desc") => void;
  onDataType: (type: ColumnDataType) => void;
  onColor: (color: string) => void;
  onTextToColumns: () => void;
  onSaveFunction: () => void;
  onDependencies: () => void;
};

export function ColumnHeaderMenu({
  columnName,
  dataType,
  onRename,
  onEdit,
  onInsert,
  onDuplicate,
  onDelete,
  onSort,
  onDataType,
  onColor,
  onTextToColumns,
  onSaveFunction,
  onDependencies,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
          aria-label={`Open ${columnName} column menu`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="size-4" />
          Rename column
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Settings2 className="size-4" />
          Edit column
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowLeft className="size-4" />
            Insert 1 column left
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => onInsert("left")}>
              Insert beside {columnName}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowRight className="size-4" />
            Insert 1 column right
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => onInsert("right")}>
              Insert beside {columnName}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onEdit}>
          <Info className="size-4" />
          Edit description
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="size-4" />
            Change color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {[
              "Default",
              "Gray",
              "Blue",
              "Green",
              "Yellow",
              "Orange",
              "Red",
              "Purple",
            ].map((color) => (
              <DropdownMenuItem
                key={color}
                onSelect={() => onColor(color.toLowerCase())}
              >
                <span className={`size-3 rounded-full ${colorDots[color]}`} />
                {color}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ColumnTypeIcon type={dataType} />
            Data type
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {dataTypes.map((type) => (
              <DropdownMenuItem
                key={type.value}
                onSelect={() => onDataType(type.value)}
              >
                <ColumnTypeIcon type={type.value} />
                {type.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <CornerDownRight className="size-4" />
          Go to parent column
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDependencies}>
          <Workflow className="size-4" />
          Used in...
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy className="size-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSaveFunction}>
          <Cpu className="size-4" />
          Save as function
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTextToColumns}>
          <Columns3 className="size-4" />
          Text to columns
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSort("asc")}>
          <ArrowDownAZ className="size-4" />
          Sort A → Z
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSort("desc")}>
          <ArrowUpAZ className="size-4" />
          Sort Z → A
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-4" />
          Delete column
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
