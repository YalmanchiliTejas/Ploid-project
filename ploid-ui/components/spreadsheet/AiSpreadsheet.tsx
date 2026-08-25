"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IWorkbookData } from "@univerjs/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GripVertical, LoaderCircle } from "lucide-react";
import { ColumnHeaderMenu, ColumnTypeIcon } from "./ColumnHeaderMenu";
import { DeleteColumnDialog } from "./DeleteColumnDialog";
import { EditColumnSheet } from "./EditColumnSheet";
import { RenameColumnDialog } from "./RenameColumnDialog";
import { SaveFunctionDialog } from "./SaveFunctionDialog";
import { TextToColumnsDialog } from "./TextToColumnsDialog";
import { createSpreadsheet } from "./univer/createUniver";
import { registerAiFormula } from "./univer/aiFormula";
import type {
  ColumnDataType,
  ColumnDefinition,
} from "@/lib/spreadsheet/columns";
import type { SavedFunction } from "@/lib/spreadsheet/functions";
import { convertColumnValues } from "@/lib/spreadsheet/typeConversion";
import type { TableOperation, WorkspaceTable } from "@/lib/workspace/types";
import { useSessionState } from "@/hooks/use-session-state";

type RunRequest = { limit: number | null; token: number } | null;
type HistoryAction = { type: "undo" | "redo"; token: number } | null;
type UniverApi = ReturnType<typeof createSpreadsheet>["univerAPI"];
export type SpreadsheetColumn = ColumnDefinition & { width: number };
const seedRows = [
  ["OpenAI", "https://openai.com", 4000, "Ready"],
  ["Stripe", "https://stripe.com", 8000, "Ready"],
  ["Ramp", "https://ramp.com", 1200, "Ready"],
  ["Anthropic", "https://anthropic.com", "", "Ready"],
  ["Linear", "https://linear.app", "", "Ready"],
];
const textWidth = (value: unknown) => String(value).length * 7.2;
const fitColumnWidth = (name: string, values: unknown[]) =>
  Math.min(
    420,
    Math.max(
      96,
      textWidth(name) + 76,
      ...values.map((value) => textWidth(value) + 32),
    ),
  );
const initialColumns: SpreadsheetColumn[] = [
  {
    id: "company",
    name: "Company",
    dataType: "text",
    description: "Company name",
    width: fitColumnWidth(
      "Company",
      seedRows.map((row) => row[0]),
    ),
  },
  {
    id: "website",
    name: "Website",
    dataType: "url",
    width: fitColumnWidth(
      "Website",
      seedRows.map((row) => row[1]),
    ),
  },
  {
    id: "employees",
    name: "Employees",
    dataType: "number",
    width: fitColumnWidth(
      "Employees",
      seedRows.map((row) => row[2]),
    ),
  },
  {
    id: "ai-research",
    name: "AI Research",
    dataType: "ai",
    description: "AI-generated company summary",
    width: fitColumnWidth(
      "AI Research",
      seedRows.map((row) => row[3]),
    ),
  },
];
const columnLetter = (index: number) => {
  let result = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
};
const columnColors: Record<string, { header: string; cell: string }> = {
  default: { header: "#fbfcfd", cell: "#ffffff" },
  gray: { header: "#f1f5f9", cell: "#f8fafc" },
  blue: { header: "#eaf3ff", cell: "#f6faff" },
  green: { header: "#eaf8ef", cell: "#f5fcf7" },
  yellow: { header: "#fff8db", cell: "#fffcf0" },
  orange: { header: "#fff0e5", cell: "#fff8f2" },
  red: { header: "#ffebeb", cell: "#fff6f6" },
  purple: { header: "#f3edff", cell: "#faf7ff" },
};
const spreadsheetColumns = (table?: WorkspaceTable): SpreadsheetColumn[] =>
  table
    ? table.columns.map((column) => ({
        ...column,
        width: fitColumnWidth(
          column.name,
          table.rows.map((row) => row.cells[column.id] ?? ""),
        ),
      }))
    : initialColumns;
function workbookData(table?: WorkspaceTable) {
  const columns = table?.columns ?? initialColumns;
  const rows =
    table?.rows.map((row) =>
      columns.map((column) => row.cells[column.id] ?? ""),
    ) ?? seedRows;
  return {
    id: "companies",
    name: "Companies",
    sheetOrder: ["sheet1"],
    sheets: {
      sheet1: {
        id: "sheet1",
        name: "Companies",
        cellData: Object.fromEntries(
          rows.map((row, r) => [
            r,
            Object.fromEntries(row.map((value, c) => [c, { v: value }])),
          ]),
        ),
        rowCount: 100,
        columnCount: 24,
        rowHeader: { width: 0, hidden: 1 },
        columnHeader: { height: 0, hidden: 1 },
      },
    },
  };
}
export type SpreadsheetSnapshot = IWorkbookData;

export function AiSpreadsheet({
  runRequest,
  historyAction,
  addColumnRequest,
  tableOperation,
  table,
  workbookSnapshot,
  onWorkbookSnapshot,
  columnSnapshot,
  onColumnSnapshot,
  functions,
  onSaveFunction,
}: {
  runRequest: RunRequest;
  historyAction: HistoryAction;
  addColumnRequest: {
    name: string;
    dataType: ColumnDataType;
    token: number;
  } | null;
  tableOperation?: TableOperation | null;
  table?: WorkspaceTable;
  workbookSnapshot?: SpreadsheetSnapshot | null;
  onWorkbookSnapshot?: (snapshot: SpreadsheetSnapshot) => void;
  columnSnapshot?: SpreadsheetColumn[] | null;
  onColumnSnapshot?: (columns: SpreadsheetColumn[]) => void;
  functions: SavedFunction[];
  onSaveFunction: (value: SavedFunction) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerTrackRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<UniverApi | null>(null);
  const scrollXRef = useRef(0);
  const initialTableRef = useRef(table);
  const rowIdsRef = useRef<string[]>(
    table?.rows.map((row) => row.id) ??
      seedRows.map((_, index) => `row_${index + 1}`),
  );
  const initialWorkbookSnapshotRef = useRef(workbookSnapshot);
  const workbookSnapshotCallbackRef = useRef(onWorkbookSnapshot);
  const columnSnapshotCallbackRef = useRef(onColumnSnapshot);
  const columnsRef = useRef<SpreadsheetColumn[]>(
    columnSnapshot ?? spreadsheetColumns(table),
  );
  const [status, setStatus] = useState("Ready");
  const [columns, setColumns] = useState(
    columnSnapshot ?? spreadsheetColumns(table),
  );
  const [draggedColumn, setDraggedColumn] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useSessionState<number | null>(
    "ploid:table:active-column",
    null,
  );
  const [renameOpen, setRenameOpen] = useSessionState(
    "ploid:table:rename-open",
    false,
  );
  const [editOpen, setEditOpen] = useSessionState(
    "ploid:table:edit-column-open",
    false,
  );
  const [deleteOpen, setDeleteOpen] = useSessionState(
    "ploid:table:delete-column-open",
    false,
  );
  const [textSplitOpen, setTextSplitOpen] = useSessionState(
    "ploid:table:text-to-columns-open",
    false,
  );
  const [dependenciesOpen, setDependenciesOpen] = useSessionState(
    "ploid:table:dependencies-open",
    false,
  );
  const [saveFunctionOpen, setSaveFunctionOpen] = useSessionState(
    "ploid:table:save-function-open",
    false,
  );
  const [conversionError, setConversionError] = useState<string | null>(null);
  useEffect(() => {
    workbookSnapshotCallbackRef.current = onWorkbookSnapshot;
  }, [onWorkbookSnapshot]);
  useEffect(() => {
    columnSnapshotCallbackRef.current = onColumnSnapshot;
  }, [onColumnSnapshot]);
  const activeColumn =
    activeIndex === null ? null : (columns[activeIndex] ?? null);
  const lastColumnLetter = useMemo(
    () => columnLetter(Math.max(0, columns.length - 1)),
    [columns.length],
  );
  useEffect(() => {
    columnsRef.current = columns;
    columnSnapshotCallbackRef.current?.(columns);
    if (headerTrackRef.current)
      headerTrackRef.current.style.transform = `translateX(${-scrollXRef.current}px)`;
  }, [columns]);

  useEffect(() => {
    if (!containerRef.current) return;
    const { univerAPI } = createSpreadsheet(containerRef.current);
    apiRef.current = univerAPI;
    const initialSnapshot = initialWorkbookSnapshotRef.current;
    const initialTable = initialTableRef.current;
    univerAPI.createWorkbook(initialSnapshot ?? workbookData(initialTable));
    const unregister = registerAiFormula(univerAPI, (state) =>
      setStatus(
        state === "running"
          ? "Running"
          : state === "complete"
            ? "Complete"
            : state === "error"
              ? "Failed"
              : "Ready",
      ),
    );
    const sheet = univerAPI.getActiveWorkbook()?.getActiveSheet();
    sheet
      ?.getRange("A1:X100")
      .setWrapStrategy(univerAPI.Enum.WrapStrategy.CLIP);
    if (!initialSnapshot && !initialTable)
      sheet?.getRange("D1").setFormula('=AI("Summarize this company: " & A1)');
    spreadsheetColumns(initialTable).forEach((column, index) =>
      sheet?.setColumnWidth(index, column.width),
    );
    if (!initialSnapshot && !initialTable)
      seedRows.forEach((row, index) => {
        void sheet
          ?.getRange(`B${index + 1}`)
          .setHyperLink(
            String(row[1]),
            String(row[1]).replace(/^https?:\/\//, ""),
          );
      });
    const syncHeaderScroll = ({ scrollX }: { scrollX: number }) => {
      scrollXRef.current = scrollX;
      if (!headerTrackRef.current) return;
      headerTrackRef.current.style.transform = `translateX(${-scrollX}px)`;
    };
    const scrollDisposable = univerAPI.addEvent(
      univerAPI.Event.Scroll,
      syncHeaderScroll,
    );
    let snapshotTimer: number | undefined;
    const snapshotDisposable = univerAPI.addEvent(
      univerAPI.Event.CommandExecuted,
      () => {
        window.clearTimeout(snapshotTimer);
        snapshotTimer = window.setTimeout(() => {
          const snapshot = univerAPI.getActiveWorkbook()?.save();
          if (snapshot) workbookSnapshotCallbackRef.current?.(snapshot);
        }, 100);
      },
    );
    return () => {
      window.clearTimeout(snapshotTimer);
      const snapshot = univerAPI.getActiveWorkbook()?.save();
      if (snapshot) workbookSnapshotCallbackRef.current?.(snapshot);
      snapshotDisposable.dispose();
      scrollDisposable.dispose();
      unregister();
      univerAPI.dispose();
      apiRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!runRequest || !apiRef.current) return;
    const sheet = apiRef.current.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    const end = runRequest.limit === null ? 5 : Math.min(5, runRequest.limit);
    for (let row = 1; row <= end; row += 1)
      sheet
        .getRange(`D${row}`)
        .setFormula(`=AI("Summarize this company: " & A${row})`);
  }, [runRequest]);
  useEffect(() => {
    if (!historyAction || !apiRef.current) return;
    void (historyAction.type === "undo"
      ? apiRef.current.undo()
      : apiRef.current.redo());
  }, [historyAction]);
  useEffect(() => {
    if (!addColumnRequest) return;
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    const width = fitColumnWidth(addColumnRequest.name, []);
    const index = columnsRef.current.length;
    sheet.insertColumns(index, 1);
    sheet.setColumnWidth(index, width);
    sheet
      .getRange(`${columnLetter(index)}1:${columnLetter(index)}100`)
      .setWrapStrategy(apiRef.current!.Enum.WrapStrategy.CLIP);
    setColumns((current) => [
      ...current,
      {
        id: `column-${addColumnRequest.token}`,
        name: addColumnRequest.name,
        dataType: addColumnRequest.dataType,
        width,
      },
    ]);
  }, [addColumnRequest]);
  useEffect(() => {
    if (!tableOperation || !apiRef.current) return;
    const sheet = apiRef.current.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    const operation = tableOperation;
    if (
      operation.type === "add_column" &&
      !columnsRef.current.some((column) => column.id === operation.column.id)
    ) {
      const index = columnsRef.current.length;
      const width = fitColumnWidth(operation.column.name, []);
      sheet.insertColumns(index, 1);
      sheet.setColumnWidth(index, width);
      setColumns((current) => [...current, { ...operation.column, width }]);
    }
    if (operation.type === "update_column") {
      const index = columnsRef.current.findIndex(
        (column) => column.id === operation.columnId,
      );
      if (index >= 0) {
        setColumns((current) =>
          current.map((column, itemIndex) =>
            itemIndex === index ? { ...column, ...operation.patch } : column,
          ),
        );
        if (operation.patch.name) {
          const values = sheet
            .getRange(`${columnLetter(index)}1:${columnLetter(index)}5`)
            .getValues()
            .map((row) => row[0] ?? "");
          const width = fitColumnWidth(operation.patch.name, values);
          sheet.setColumnWidth(index, width);
          setColumns((current) =>
            current.map((column, itemIndex) =>
              itemIndex === index ? { ...column, width } : column,
            ),
          );
        }
      }
    }
    if (operation.type === "add_rows") {
      const firstRow = rowIdsRef.current.length;
      const values = operation.rows.map((row) =>
        columnsRef.current.map((column) => row.cells[column.id] ?? ""),
      );
      if (values.length)
        sheet
          .getRange(
            `A${firstRow + 1}:${columnLetter(Math.max(0, columnsRef.current.length - 1))}${firstRow + values.length}`,
          )
          .setValues(values);
      rowIdsRef.current.push(...operation.rows.map((row) => row.id));
    }
    if (operation.type === "update_cells")
      operation.updates.forEach((update) => {
        const columnIndex = columnsRef.current.findIndex(
          (column) => column.id === update.columnId,
        );
        const rowIndex = rowIdsRef.current.indexOf(update.rowId);
        if (columnIndex >= 0 && rowIndex >= 0)
          sheet
            .getRange(`${columnLetter(columnIndex)}${rowIndex + 1}`)
            .setValue(update.value ?? "");
      });
  }, [tableOperation]);

  const updateColumn = (index: number, patch: Partial<ColumnDefinition>) =>
    setColumns((current) =>
      current.map((column, columnIndex) =>
        columnIndex === index ? { ...column, ...patch } : column,
      ),
    );
  const applyColumnColor = (index: number, color: string) => {
    const palette = columnColors[color] ?? columnColors.default;
    apiRef.current
      ?.getActiveWorkbook()
      ?.getActiveSheet()
      ?.getRange(`${columnLetter(index)}1:${columnLetter(index)}100`)
      .setBackgroundColor(palette.cell);
    updateColumn(index, { color });
  };
  const configureColumnType = (index: number, nextColumn: ColumnDefinition) => {
    const api = apiRef.current;
    const sheet = api?.getActiveWorkbook()?.getActiveSheet();
    if (!api || !sheet) {
      updateColumn(index, nextColumn);
      return true;
    }
    const range = sheet.getRange(
      `${columnLetter(index)}1:${columnLetter(index)}100`,
    );
    const converted = convertColumnValues(
      range.getValues(),
      nextColumn.dataType,
      nextColumn.options,
    );
    if (!converted.ok) {
      setConversionError(converted.message);
      return false;
    }
    range.setDataValidation(null);
    range.cancelHyperLink();
    range.setValues(converted.values);
    const numberFormat =
      nextColumn.dataType === "text"
        ? "@"
        : nextColumn.dataType === "number"
          ? "0.########"
          : nextColumn.dataType === "currency"
            ? "$#,##0.00"
            : nextColumn.dataType === "percentage"
              ? "0.00%"
              : undefined;
    range.setNumberFormat(numberFormat ?? "General");
    if (nextColumn.dataType === "url" || nextColumn.dataType === "email") {
      converted.values.forEach((row, rowIndex) => {
        const value = row[0];
        if (!value) return;
        const destination =
          nextColumn.dataType === "email"
            ? `mailto:${String(value)}`
            : String(value);
        void sheet
          .getRange(`${columnLetter(index)}${rowIndex + 1}`)
          .setHyperLink(destination, String(value))
          .catch(() =>
            setConversionError(
              `Row ${rowIndex + 1}: the ${nextColumn.dataType} value could not be formatted as a link.`,
            ),
          );
      });
    }
    if (nextColumn.dataType === "boolean") {
      range.setDataValidation(
        api.newDataValidation().requireCheckbox("true", "false").build(),
      );
    }
    if (
      nextColumn.dataType === "select" ||
      nextColumn.dataType === "multi-select"
    ) {
      const options = nextColumn.options?.filter(Boolean) ?? [];
      if (options.length) {
        range.setDataValidation(
          api
            .newDataValidation()
            .requireValueInList(
              options,
              nextColumn.dataType === "multi-select",
              true,
            )
            .setOptions({
              showDropDown: true,
              showErrorMessage: true,
              error: "Choose an option from this column's list.",
            })
            .build(),
        );
      }
    }
    updateColumn(index, nextColumn);
    return true;
  };
  const selectDataType = (index: number, dataType: ColumnDataType) => {
    const current = columnsRef.current[index];
    if (!current) return;
    const next = {
      ...current,
      dataType,
      options:
        dataType === "select" || dataType === "multi-select"
          ? current.options?.length
            ? current.options
            : ["Option 1", "Option 2"]
          : current.options,
    };
    if (
      configureColumnType(index, next) &&
      (dataType === "select" || dataType === "multi-select")
    )
      openAction(index, () => setEditOpen(true));
  };
  const resizeColumnToContent = (index: number, name: string) => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    const values =
      sheet
        ?.getRange(`${columnLetter(index)}1:${columnLetter(index)}5`)
        .getValues()
        .map((row) => row[0] ?? "") ?? [];
    const width = fitColumnWidth(name, values);
    sheet?.setColumnWidth(index, width);
    setColumns((current) =>
      current.map((column, columnIndex) =>
        columnIndex === index ? { ...column, name, width } : column,
      ),
    );
  };
  const moveColumn = (from: number, to: number) => {
    if (from === to || !apiRef.current) return;
    const sheet = apiRef.current.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    sheet.moveColumns(
      sheet.getRange(`${columnLetter(from)}1:${columnLetter(from)}100`),
      to,
    );
    setColumns((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const insertColumn = (index: number, side: "left" | "right") => {
    const target = side === "left" ? index : index + 1;
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    sheet?.insertColumns(target, 1);
    sheet?.setColumnWidth(target, 160);
    setColumns((current) => {
      const next = [...current];
      next.splice(target, 0, {
        id: `column-${Date.now()}`,
        name: "New column",
        dataType: "text",
        width: 160,
      });
      return next;
    });
  };
  const duplicateColumn = (index: number) => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    sheet.insertColumnsAfter(index, 1);
    const values = sheet
      .getRange(`${columnLetter(index)}1:${columnLetter(index)}5`)
      .getValues()
      .map((row) => [row[0] ?? ""]);
    sheet
      .getRange(`${columnLetter(index + 1)}1:${columnLetter(index + 1)}5`)
      .setValues(values);
    sheet.setColumnWidth(index + 1, columns[index].width);
    setColumns((current) => {
      const next = [...current];
      next.splice(index + 1, 0, {
        ...current[index],
        id: `${current[index].id}-${Date.now()}`,
        name: `${current[index].name} copy`,
      });
      return next;
    });
  };
  const deleteColumn = () => {
    if (activeIndex === null || columns.length <= 1) return;
    apiRef.current
      ?.getActiveWorkbook()
      ?.getActiveSheet()
      ?.deleteColumn(activeIndex);
    setColumns((current) =>
      current.filter((_, index) => index !== activeIndex),
    );
    setDeleteOpen(false);
    setActiveIndex(null);
  };
  const sortColumn = (column: number, direction: "asc" | "desc") => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    const range = `A1:${lastColumnLetter}5`;
    const values = sheet
      .getRange(range)
      .getValues()
      .map((row) => row.map((value) => value ?? ""));
    values.sort((left, right) => {
      const result = String(left[column]).localeCompare(
        String(right[column]),
        undefined,
        { numeric: true, sensitivity: "base" },
      );
      return direction === "asc" ? result : -result;
    });
    sheet.getRange(range).setValues(values);
  };
  const applyFunction = (columnIndex: number, functionId?: string) => {
    const fn = functions.find((item) => item.id === functionId);
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!fn || !sheet) return;
    for (let row = 1; row <= 5; row += 1)
      sheet
        .getRange(`${columnLetter(columnIndex)}${row}`)
        .setFormula(fn.template.replaceAll("{row}", String(row)));
  };
  const openAction = (index: number, action: () => void) => {
    setActiveIndex(index);
    action();
  };

  return (
    <div className="univer-shell">
      <div className="univer-status">
        <Badge
          variant={status === "Failed" ? "destructive" : "secondary"}
          className="gap-1 text-[10px]"
        >
          {status === "Running" && (
            <LoaderCircle className="size-3 animate-spin" />
          )}
          {status}
        </Badge>
      </div>
      <div className="custom-column-header">
        <div ref={headerTrackRef} className="custom-column-track">
          {columns.map((column, index) => (
            <div
              key={column.id}
              className="custom-column"
              style={{
                width: column.width,
                backgroundColor: (
                  columnColors[column.color ?? "default"] ??
                  columnColors.default
                ).header,
              }}
              draggable
              onDragStart={() => setDraggedColumn(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedColumn !== null) moveColumn(draggedColumn, index);
                setDraggedColumn(null);
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <ColumnTypeIcon type={column.dataType} />
                <span className="truncate">{column.name}</span>
              </div>
              <div className="flex items-center">
                <GripVertical className="column-drag-hint size-3.5" />
                <ColumnHeaderMenu
                  columnName={column.name}
                  dataType={column.dataType}
                  onRename={() => openAction(index, () => setRenameOpen(true))}
                  onEdit={() => openAction(index, () => setEditOpen(true))}
                  onInsert={(side) => insertColumn(index, side)}
                  onDuplicate={() => duplicateColumn(index)}
                  onDelete={() => openAction(index, () => setDeleteOpen(true))}
                  onSort={(direction) => sortColumn(index, direction)}
                  onDataType={(dataType) => selectDataType(index, dataType)}
                  onColor={(color) => applyColumnColor(index, color)}
                  onTextToColumns={() =>
                    openAction(index, () => setTextSplitOpen(true))
                  }
                  onSaveFunction={() =>
                    openAction(index, () => setSaveFunctionOpen(true))
                  }
                  onDependencies={() =>
                    openAction(index, () => setDependenciesOpen(true))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="univer-container" />
      <RenameColumnDialog
        open={renameOpen}
        name={activeColumn?.name ?? ""}
        onOpenChange={setRenameOpen}
        onSave={(name) => {
          if (activeIndex !== null) resizeColumnToContent(activeIndex, name);
          setRenameOpen(false);
        }}
      />
      {editOpen && (
        <EditColumnSheet
          open={editOpen}
          column={activeColumn}
          functions={functions}
          onOpenChange={setEditOpen}
          onSave={(column) => {
            if (
              activeIndex !== null &&
              configureColumnType(activeIndex, column)
            ) {
              resizeColumnToContent(activeIndex, column.name);
              applyFunction(activeIndex, column.functionId);
              setEditOpen(false);
            }
          }}
        />
      )}
      <DeleteColumnDialog
        open={deleteOpen}
        name={activeColumn?.name ?? "column"}
        onOpenChange={setDeleteOpen}
        onDelete={deleteColumn}
      />
      <TextToColumnsDialog
        open={textSplitOpen}
        onOpenChange={setTextSplitOpen}
      />
      <Dialog open={dependenciesOpen} onOpenChange={setDependenciesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Used in</DialogTitle>
            <DialogDescription>
              {activeColumn?.name} is available to these saved functions.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            <span>AI Research</span>
            <span>Company Summary</span>
            <span>Personalized Email</span>
          </div>
          <Button onClick={() => setDependenciesOpen(false)}>Done</Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(conversionError)}
        onOpenChange={(open) => {
          if (!open) setConversionError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Can’t convert column values</DialogTitle>
            <DialogDescription>{conversionError}</DialogDescription>
          </DialogHeader>
          <Button onClick={() => setConversionError(null)}>
            Review column
          </Button>
        </DialogContent>
      </Dialog>
      {saveFunctionOpen && (
        <SaveFunctionDialog
          open={saveFunctionOpen}
          column={activeColumn}
          onOpenChange={setSaveFunctionOpen}
          onSave={onSaveFunction}
        />
      )}
    </div>
  );
}
