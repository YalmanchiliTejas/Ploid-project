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
import { GripVertical, LoaderCircle, Play, Sparkles } from "lucide-react";
import { ColumnHeaderMenu, ColumnTypeIcon } from "./ColumnHeaderMenu";
import type { EnrichmentAction } from "./EnrichmentColumnSheet";
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
import type {
  TableOperation,
  WorkspaceColumn,
  WorkspaceTable,
} from "@/lib/workspace/types";
import { useSessionState } from "@/hooks/use-session-state";

type RunRequest = { limit: number | null; token: number } | null;
type HistoryAction = { type: "undo" | "redo"; token: number } | null;
type UniverApi = ReturnType<typeof createSpreadsheet>["univerAPI"];
export type SpreadsheetColumn = ColumnDefinition &
  Pick<WorkspaceColumn, "functionBinding"> & { width: number };
const textWidth = (value: unknown) => String(value).length * 7.2;
const fitColumnWidth = (name: string, values: unknown[]) =>
  Math.max(
    150,
    textWidth(name) + 112,
    ...values.map((value) => textWidth(value) + 32),
  );
const fillViewportWidths = (
  columns: SpreadsheetColumn[],
  table: WorkspaceTable,
  viewportWidth: number,
) => {
  const measured = columns.map((column) => ({
    ...column,
    width: fitColumnWidth(
      column.name,
      table.rows.map((row) => row.cells[column.id] ?? ""),
    ),
  }));
  const spare = Math.max(
    0,
    viewportWidth - measured.reduce((total, column) => total + column.width, 0),
  );
  const extraPerColumn = measured.length
    ? Math.floor(spare / measured.length)
    : 0;
  return measured.map((column, index) => ({
    ...column,
    width:
      column.width +
      extraPerColumn +
      (index === measured.length - 1 ? spare % measured.length : 0),
  }));
};
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
const spreadsheetColumns = (table: WorkspaceTable): SpreadsheetColumn[] =>
  table.columns.map((column) => ({
    ...column,
    width: fitColumnWidth(
      column.name,
      table.rows.map((row) => row.cells[column.id] ?? ""),
    ),
  }));
const columnsForTable = (
  table: WorkspaceTable,
  snapshot?: SpreadsheetColumn[] | null,
) => {
  const freshColumns = spreadsheetColumns(table);
  if (!snapshot?.length) return freshColumns;

  const freshById = new Map(freshColumns.map((column) => [column.id, column]));
  const restored = snapshot.flatMap((column) => {
    const fresh = freshById.get(column.id);
    return fresh ? [{ ...fresh, ...column, width: fresh.width }] : [];
  });
  const restoredIds = new Set(restored.map((column) => column.id));
  return [
    ...restored,
    ...freshColumns.filter((column) => !restoredIds.has(column.id)),
  ];
};
const hyperlinkDestination = (value: unknown, dataType: ColumnDataType) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (dataType === "email") return `mailto:${text}`;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
};
const formulaString = (value: string) => value.replaceAll('"', '""');
const displayCellValue = (
  value: string | number | boolean | null | undefined,
): string | number | boolean => value ?? "";
function workbookData(table: WorkspaceTable) {
  const columns = table.columns;
  const rows = table.rows.map((row) =>
    columns.map((column) => displayCellValue(row.cells[column.id])),
  );
  return {
    id: table.id,
    name: table.name,
    sheetOrder: ["sheet1"],
    sheets: {
      sheet1: {
        id: "sheet1",
        name: table.name,
        cellData: Object.fromEntries(
          rows.map((row, r) => [
            r,
            Object.fromEntries(row.map((value, c) => [c, { v: value }])),
          ]),
        ),
        rowCount: Math.max(rows.length, 1),
        columnCount: Math.max(columns.length, 1),
        rowHeader: { width: 0, hidden: 1 },
        columnHeader: { height: 0, hidden: 1 },
      },
    },
  };
}

/**
 * Snapshots contain presentation state, but the workspace table is canonical.
 * A snapshot captured before Agent/Search added columns must never constrain
 * ranges created from the current table.
 */
function workbookForTable(
  table: WorkspaceTable,
  snapshot?: IWorkbookData | null,
) {
  if (!snapshot) return workbookData(table);
  const restored = structuredClone(snapshot);
  const sheet = restored.sheets?.sheet1;
  if (!sheet) return workbookData(table);
  // A presentation snapshot can be captured before an async table hydration.
  // Never let its cell matrix replace the selected table's canonical values.
  const canonical = workbookData(table).sheets.sheet1;
  sheet.name = table.name;
  sheet.cellData = canonical.cellData;
  sheet.columnCount = Math.max(sheet.columnCount ?? 1, table.columns.length, 1);
  // The workspace table is canonical: do not retain placeholder rows from a
  // presentation snapshot.
  sheet.rowCount = Math.max(table.rows.length, 1);
  return restored;
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
  onRunFunctionColumn,
  onDeleteColumn,
  onEnrichColumn,
}: {
  runRequest: RunRequest;
  historyAction: HistoryAction;
  addColumnRequest: {
    name: string;
    dataType: ColumnDataType;
    description?: string;
    token: number;
  } | null;
  tableOperation?: TableOperation | null;
  table: WorkspaceTable;
  workbookSnapshot?: SpreadsheetSnapshot | null;
  onWorkbookSnapshot?: (snapshot: SpreadsheetSnapshot) => void;
  columnSnapshot?: SpreadsheetColumn[] | null;
  onColumnSnapshot?: (columns: SpreadsheetColumn[]) => void;
  functions: SavedFunction[];
  onSaveFunction: (value: SavedFunction) => void;
  onRunFunctionColumn?: (
    columnId: string,
    limit: number | null,
  ) => Promise<void> | void;
  onDeleteColumn?: (columnId: string) => Promise<void> | void;
  onEnrichColumn?: (columnId: string, action: EnrichmentAction) => void;
}) {
  // Univer owns a viewport, so the parent cannot naturally collapse to its
  // cells. Keep large tables scrollable, but use a content-sized viewport for
  // short tables instead of presenting a misleading blank grid.
  const compactViewportHeight =
    table.rows.length < 5
      ? `${44 + Math.max(table.rows.length, 1) * 42 + 18}px`
      : undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const headerScrollerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<UniverApi | null>(null);
  const initialTableRef = useRef(table);
  const rowIdsRef = useRef<string[]>(table.rows.map((row) => row.id));
  const initialWorkbookSnapshotRef = useRef(workbookSnapshot);
  const tableRef = useRef(table);
  const workbookSnapshotCallbackRef = useRef(onWorkbookSnapshot);
  const columnSnapshotCallbackRef = useRef(onColumnSnapshot);
  const columnsRef = useRef<SpreadsheetColumn[]>(
    columnsForTable(table, columnSnapshot),
  );
  const [status, setStatus] = useState("Ready");
  const [runDialog, setRunDialog] = useState<{
    column: SpreadsheetColumn;
    limit: number | null;
  } | null>(null);
  const [queueingRun, setQueueingRun] = useState(false);
  const [columns, setColumns] = useState(() =>
    columnsForTable(table, columnSnapshot),
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
  const [univerReady, setUniverReady] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    tableRef.current = table;
  }, [table]);
  useEffect(() => {
    workbookSnapshotCallbackRef.current = onWorkbookSnapshot;
  }, [onWorkbookSnapshot]);
  useEffect(() => {
    columnSnapshotCallbackRef.current = onColumnSnapshot;
  }, [onColumnSnapshot]);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(entry.contentRect.width),
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  const activeColumn =
    activeIndex === null ? null : (columns[activeIndex] ?? null);
  const lastColumnLetter = useMemo(
    () => columnLetter(Math.max(0, columns.length - 1)),
    [columns.length],
  );
  useEffect(() => {
    columnsRef.current = columns;
    columnSnapshotCallbackRef.current?.(columns);
  }, [columns]);

  useEffect(() => {
    if (!containerRef.current) return;
    const { univerAPI } = createSpreadsheet(containerRef.current);
    apiRef.current = univerAPI;
    const initialSnapshot = initialWorkbookSnapshotRef.current;
    const initialTable = initialTableRef.current;
    univerAPI.createWorkbook(workbookForTable(initialTable, initialSnapshot));
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
    const initialLastColumn = columnLetter(
      Math.max(0, initialTable.columns.length - 1),
    );
    const initialRowCount = Math.max(initialTable.rows.length, 1);
    sheet
      ?.getRange(`A1:${initialLastColumn}${initialRowCount}`)
      .setWrapStrategy(univerAPI.Enum.WrapStrategy.CLIP);
    spreadsheetColumns(initialTable).forEach((column, index) =>
      sheet?.setColumnWidth(index, column.width),
    );
    initialTable.rows.forEach((row, rowIndex) => {
      initialTable.columns.forEach((column, columnIndex) => {
        if (column.dataType !== "url" && column.dataType !== "email") return;
        const value = row.cells[column.id];
        const destination = hyperlinkDestination(value, column.dataType);
        if (!destination) return;
        void sheet
          ?.getRange(`${columnLetter(columnIndex)}${rowIndex + 1}`)
          .setHyperLink(destination, String(value));
      });
    });
    initialTable.rows.forEach((_row, rowIndex) => sheet?.autoFitRow(rowIndex));
    const syncHeaderScroll = () => {
      const scrollState = univerAPI
        .getActiveWorkbook()
        ?.getActiveSheet()
        ?.getScrollState();
      if (!scrollState || !headerScrollerRef.current) return;
      // `Event.Scroll.scrollX` is the virtual scrollbar value, not a pixel
      // viewport position. Reconstruct Univer's viewport pixel position from
      // its current column and offset using this sheet's exact widths.
      const scrollLeft =
        columnsRef.current
          .slice(0, scrollState.sheetViewStartColumn)
          .reduce((total, column) => total + column.width, 0) +
        scrollState.offsetX;
      // Univer owns the body viewport. The header only mirrors it.
      headerScrollerRef.current.scrollLeft = scrollLeft;
    };
    const scrollDisposable = univerAPI.addEvent(
      univerAPI.Event.Scroll,
      syncHeaderScroll,
    );
    setUniverReady(true);
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
      setUniverReady(false);
    };
  }, []);
  useEffect(() => {
    if (!univerReady || !apiRef.current) return;
    const sheet = apiRef.current.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    const canonical = tableRef.current;
    // Canonical workspace schema is authoritative. Presentation snapshots may
    // not add columns, otherwise a stale snapshot can create out-of-bounds
    // ranges after a worksheet changes shape.
    const nextColumns = fillViewportWidths(
      columnsForTable(canonical, columnsRef.current),
      canonical,
      viewportWidth,
    );
    sheet.setColumnCount(Math.max(canonical.columns.length, 1));
    // Canonical state is written as one coherent range update. This runs only
    // after complete workspace state is available, never from prose deltas.
    const values = canonical.rows.map((row) =>
      nextColumns.map((column) =>
        displayCellValue(row.cells[column.id]),
      ),
    );
    // Keep the worksheet exactly as large as its canonical table. New rows
    // are added by a later table mutation, rather than preallocated blanks.
    sheet.setRowCount(Math.max(canonical.rows.length, 1));
    if (values.length && nextColumns.length)
      sheet
        .getRange(`A1:${columnLetter(nextColumns.length - 1)}${values.length}`)
        .setValues(values);
    // `setValues` replaces cell contents and clears Univer's hyperlink
    // metadata. Reapply links as part of the same canonical hydration so URL
    // and email columns are interactive as soon as their data arrives.
    canonical.rows.forEach((row, rowIndex) => {
      nextColumns.forEach((column, columnIndex) => {
        if (column.dataType !== "url" && column.dataType !== "email") return;
        const value = row.cells[column.id];
        const destination = hyperlinkDestination(value, column.dataType);
        if (!destination) return;
        void sheet
          .getRange(`${columnLetter(columnIndex)}${rowIndex + 1}`)
          .setHyperLink(destination, String(value));
      });
      sheet.autoFitRow(rowIndex);
    });
    nextColumns.forEach((column, index) => {
      const width = column.width;
      sheet.setColumnWidth(index, width);
      nextColumns[index] = { ...column, width };
    });
    rowIdsRef.current = canonical.rows.map((row) => row.id);
    columnsRef.current = nextColumns;
    setColumns(nextColumns);
    if (process.env.NODE_ENV !== "production")
      console.info("[Workspace timing] Univer apply complete");
  }, [table, univerReady, viewportWidth]);
  useEffect(() => {
    if (!runRequest || !apiRef.current) return;
    const sheet = apiRef.current.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    const aiIndex = columnsRef.current.findIndex(
      (column) => column.dataType === "ai",
    );
    if (aiIndex < 0 || !rowIdsRef.current.length) return;
    const end =
      runRequest.limit === null
        ? rowIdsRef.current.length
        : Math.min(rowIdsRef.current.length, runRequest.limit);
    const sourceColumn = columnLetter(0);
    for (let row = 1; row <= end; row += 1)
      sheet
        .getRange(`${columnLetter(aiIndex)}${row}`)
        .setFormula(`=AI("Summarize " & ${sourceColumn}${row})`);
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
    const sourceColumns = columnsRef.current;
    sheet.insertColumns(index, 1);
    sheet.setColumnWidth(index, width);
    sheet
      .getRange(
        `${columnLetter(index)}1:${columnLetter(index)}${Math.max(rowIdsRef.current.length, 1)}`,
      )
      .setWrapStrategy(apiRef.current!.Enum.WrapStrategy.CLIP);
    if (
      addColumnRequest.dataType === "ai" &&
      addColumnRequest.description?.trim()
    ) {
      const instruction = formulaString(addColumnRequest.description.trim());
      const headers = formulaString(
        sourceColumns.map((column) => column.name).join(", "),
      );
      for (let row = 1; row <= rowIdsRef.current.length; row += 1) {
        const rowValues = sourceColumns
          .map((_, sourceIndex) => columnLetter(sourceIndex) + row)
          .join(' & " | " & ');
        const prompt = headers
          ? `"${instruction}\\nColumns: ${headers}\\nRow values: " & ${rowValues || '""'}`
          : `"${instruction}"`;
        sheet
          .getRange(`${columnLetter(index)}${row}`)
          .setFormula(`=AI(${prompt})`);
      }
    }
    setColumns((current) => [
      ...current,
      {
        id: `column-${addColumnRequest.token}`,
        name: addColumnRequest.name,
        dataType: addColumnRequest.dataType,
        ...(addColumnRequest.description
          ? { description: addColumnRequest.description }
          : {}),
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
      operation.rows.forEach((row, rowOffset) => {
        columnsRef.current.forEach((column, columnIndex) => {
          if (column.dataType !== "url" && column.dataType !== "email") return;
          const value = row.cells[column.id];
          const destination = hyperlinkDestination(value, column.dataType);
          if (!destination) return;
          void sheet
            .getRange(`${columnLetter(columnIndex)}${firstRow + rowOffset + 1}`)
            .setHyperLink(destination, String(value));
        });
      });
      rowIdsRef.current.push(...operation.rows.map((row) => row.id));
      const nextColumns = columnsRef.current.map((column, columnIndex) => {
        const values = sheet
          .getRange(
            `${columnLetter(columnIndex)}1:${columnLetter(columnIndex)}${rowIdsRef.current.length}`,
          )
          .getValues()
          .map((row) => row[0] ?? "");
        const width = fitColumnWidth(column.name, values);
        sheet.setColumnWidth(columnIndex, width);
        return { ...column, width };
      });
      setColumns(nextColumns);
    }
    if (operation.type === "update_cells")
      operation.updates.forEach((update) => {
        const columnIndex = columnsRef.current.findIndex(
          (column) => column.id === update.columnId,
        );
        const rowIndex = rowIdsRef.current.indexOf(update.rowId);
        if (columnIndex >= 0 && rowIndex >= 0) {
          sheet
            .getRange(`${columnLetter(columnIndex)}${rowIndex + 1}`)
            .setValue(update.value ?? "");
          const column = columnsRef.current[columnIndex];
          const destination = hyperlinkDestination(
            update.value,
            column.dataType,
          );
          if (
            destination &&
            (column.dataType === "url" || column.dataType === "email")
          )
            void sheet
              .getRange(`${columnLetter(columnIndex)}${rowIndex + 1}`)
              .setHyperLink(destination, String(update.value));
          const values = sheet
            .getRange(
              `${columnLetter(columnIndex)}1:${columnLetter(columnIndex)}${rowIdsRef.current.length}`,
            )
            .getValues()
            .map((row) => row[0] ?? "");
          const width = fitColumnWidth(column.name, values);
          sheet.setColumnWidth(columnIndex, width);
          setColumns((current) =>
            current.map((item, index) =>
              index === columnIndex ? { ...item, width } : item,
            ),
          );
        }
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
      ?.getRange(
        `${columnLetter(index)}1:${columnLetter(index)}${Math.max(rowIdsRef.current.length, 1)}`,
      )
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
      `${columnLetter(index)}1:${columnLetter(index)}${Math.max(rowIdsRef.current.length, 1)}`,
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
        ?.getRange(
          `${columnLetter(index)}1:${columnLetter(index)}${Math.max(rowIdsRef.current.length, 1)}`,
        )
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
      sheet.getRange(
        `${columnLetter(from)}1:${columnLetter(from)}${Math.max(rowIdsRef.current.length, 1)}`,
      ),
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
    const columnId = columns[activeIndex]?.id;
    if (!columnId) return;
    void Promise.resolve(onDeleteColumn?.(columnId)).catch((error) => {
      if (process.env.NODE_ENV !== "production")
        console.error("[Table] column delete failed", error);
    });
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    sheet?.deleteColumn(activeIndex);
    sheet?.setColumnCount(Math.max(columns.length - 1, 1));
    const nextColumns = columns.filter((_, index) => index !== activeIndex);
    columnsRef.current = nextColumns;
    setColumns(nextColumns);
    setDeleteOpen(false);
    setActiveIndex(null);
  };
  const sortColumn = (column: number, direction: "asc" | "desc") => {
    const sheet = apiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    const range = `A1:${lastColumnLetter}${Math.max(1, rowIdsRef.current.length)}`;
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
    for (let row = 1; row <= rowIdsRef.current.length; row += 1)
      sheet
        .getRange(`${columnLetter(columnIndex)}${row}`)
        .setFormula(fn.template.replaceAll("{row}", String(row)));
  };
  const openAction = (index: number, action: () => void) => {
    setActiveIndex(index);
    action();
  };

  return (
    <div
      className={`univer-viewport${compactViewportHeight ? " univer-viewport--compact" : ""}`}
      style={
        compactViewportHeight ? { height: compactViewportHeight } : undefined
      }
    >
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
        <div ref={headerScrollerRef} className="custom-column-header">
          <div
            className="custom-column-track"
            style={{
              width: columns.reduce((total, column) => total + column.width, 0),
            }}
          >
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
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {column.functionBinding ? (
                    <Sparkles className="size-3.5 text-primary" />
                  ) : (
                    <ColumnTypeIcon type={column.dataType} />
                  )}
                  <span className="truncate">{column.name}</span>
                </div>
                <div className="flex shrink-0 items-center">
                  <GripVertical className="column-drag-hint size-3.5" />
                  <ColumnHeaderMenu
                    columnName={column.name}
                    dataType={column.dataType}
                    onRename={() =>
                      openAction(index, () => setRenameOpen(true))
                    }
                    onEdit={() => openAction(index, () => setEditOpen(true))}
                    onInsert={(side) => insertColumn(index, side)}
                    onDuplicate={() => duplicateColumn(index)}
                    onDelete={() =>
                      openAction(index, () => setDeleteOpen(true))
                    }
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
                    isFunctionColumn={!!column.functionBinding}
                    onRun={(limit) => setRunDialog({ column, limit })}
                    onEnrich={(action) => onEnrichColumn?.(column.id, action)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div ref={containerRef} className="univer-container" />
      </div>
      <RenameColumnDialog
        open={renameOpen}
        name={activeColumn?.name ?? ""}
        onOpenChange={setRenameOpen}
        onSave={(name) => {
          if (activeIndex !== null) resizeColumnToContent(activeIndex, name);
          setRenameOpen(false);
        }}
      />
      <Dialog
        open={!!runDialog}
        onOpenChange={(open) => !open && setRunDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run {runDialog?.column.name}</DialogTitle>
            <DialogDescription>
              {runDialog?.limit === null
                ? `Queue this Function-backed column for all ${table.rows.length} rows.`
                : `Queue this Function-backed column for the first ${Math.min(runDialog?.limit ?? 5, table.rows.length)} rows.`}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Play className="size-4 text-primary" />
              <span className="font-medium">Function Runner</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Rows run with controlled concurrency and update this table as
              results complete.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRunDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={queueingRun}
              onClick={async () => {
                if (!runDialog || !onRunFunctionColumn) return;
                setQueueingRun(true);
                try {
                  await onRunFunctionColumn(
                    runDialog.column.id,
                    runDialog.limit,
                  );
                  setRunDialog(null);
                } finally {
                  setQueueingRun(false);
                }
              }}
            >
              <Play className="size-4" />
              {queueingRun
                ? "Queueing…"
                : runDialog?.limit === null
                  ? "Run all"
                  : "Run first 5"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
            {functions.length ? (
              functions.map((fn) => <span key={fn.id}>{fn.name}</span>)
            ) : (
              <span className="text-muted-foreground">
                No saved functions use this column yet.
              </span>
            )}
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
