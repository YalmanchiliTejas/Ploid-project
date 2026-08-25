import type { ColumnDataType } from "./columns";
import type { CellValue } from "@univerjs/core";

export type SpreadsheetValue = CellValue | null | undefined | void;
export type ConversionResult =
  { ok: true; values: CellValue[][] } | { ok: false; message: string };

const isBlank = (value: SpreadsheetValue) =>
  value === null || value === undefined || value === "";
const invalid = (
  row: number,
  value: SpreadsheetValue,
  target: string,
): ConversionResult => ({
  ok: false,
  message: `Row ${row}: “${String(value)}” cannot be converted to ${target}.`,
});
const numberValue = (value: SpreadsheetValue) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/[$,]/g, "");
  const parsed = Number(normalized);
  return normalized !== "" && Number.isFinite(parsed) ? parsed : null;
};
const booleanValue = (value: SpreadsheetValue) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return null;
};

export function convertColumnValues(
  values: SpreadsheetValue[][],
  target: ColumnDataType,
  options: string[] = [],
): ConversionResult {
  const converted: CellValue[][] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index][0];
    if (isBlank(value)) {
      converted.push([""]);
      continue;
    }
    if (target === "text" || target === "email" || target === "url") {
      const text = String(value).trim();
      if (target === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
        return invalid(index + 1, value, "an email address");
      const url =
        target === "url" && !/^https?:\/\//i.test(text)
          ? `https://${text}`
          : text;
      if (target === "url" && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(url))
        return invalid(index + 1, value, "a valid URL");
      converted.push([url]);
      continue;
    }
    if (target === "number" || target === "currency") {
      const parsed = numberValue(value);
      if (parsed === null) return invalid(index + 1, value, target);
      converted.push([parsed]);
      continue;
    }
    if (target === "percentage") {
      const raw = String(value).trim();
      const parsed = numberValue(raw.replace(/%$/, ""));
      if (parsed === null) return invalid(index + 1, value, "percentage");
      converted.push([raw.endsWith("%") ? parsed / 100 : parsed]);
      continue;
    }
    if (target === "boolean") {
      const parsed = booleanValue(value);
      if (parsed === null)
        return invalid(
          index + 1,
          value,
          "boolean (true/false, yes/no, or 1/0)",
        );
      converted.push([parsed]);
      continue;
    }
    if (target === "date") {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime()))
        return invalid(index + 1, value, "date");
      converted.push([date.toISOString().slice(0, 10)]);
      continue;
    }
    if (target === "json") {
      try {
        JSON.parse(String(value));
        converted.push([String(value)]);
      } catch {
        return invalid(index + 1, value, "valid JSON");
      }
      continue;
    }
    if (target === "select" || target === "multi-select") {
      if (!options.length)
        return {
          ok: false,
          message:
            "Add at least one option before converting this column to a selection type.",
        };
      const selected =
        target === "multi-select"
          ? String(value)
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [String(value)];
      if (!selected.every((item) => options.includes(item)))
        return {
          ok: false,
          message: `Row ${index + 1}: “${String(value)}” is not one of this column’s options.`,
        };
      converted.push([
        target === "multi-select" ? selected.join(",") : selected[0],
      ]);
      continue;
    }
    converted.push([value]);
  }
  return { ok: true, values: converted };
}
