export type ColumnDataType =
  | "text"
  | "number"
  | "currency"
  | "percentage"
  | "boolean"
  | "date"
  | "url"
  | "email"
  | "select"
  | "multi-select"
  | "json"
  | "formula"
  | "ai";

export type ColumnDefinition = {
  id: string;
  name: string;
  dataType: ColumnDataType;
  description?: string;
  color?: string;
  options?: string[];
  functionId?: string;
};

export const dataTypes: Array<{ value: ColumnDataType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "percentage", label: "Percentage" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "select", label: "Select" },
  { value: "multi-select", label: "Multi-select" },
  { value: "json", label: "JSON" },
  { value: "formula", label: "Formula" },
  { value: "ai", label: "AI / Computed" },
];
