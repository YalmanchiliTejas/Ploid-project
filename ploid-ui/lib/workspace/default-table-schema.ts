import type { WorkspaceColumn } from "./types";

export type WorkspaceKind = "people" | "companies" | "markets";

/** Fixed starter schemas. Agent runs populate these; users may add columns later. */
export const DEFAULT_TABLE_COLUMNS: Record<WorkspaceKind, WorkspaceColumn[]> = {
  people: [
    { id: "person_name", name: "Name", dataType: "text" },
    { id: "person_contact", name: "Contact", dataType: "text" },
    { id: "person_linkedin", name: "LinkedIn", dataType: "url" },
  ],
  companies: [
    { id: "company_name", name: "Name", dataType: "text" },
    { id: "company_domain", name: "Domain", dataType: "url" },
    { id: "company_industry", name: "Industry", dataType: "text" },
    {
      id: "company_product_service",
      name: "Product or Service",
      dataType: "text",
    },
  ],
  markets: [
    { id: "market_name", name: "Market", dataType: "text" },
    { id: "market_segment", name: "Segment", dataType: "text" },
    { id: "market_description", name: "Description", dataType: "text" },
  ],
};

export function defaultTableColumns(kind: WorkspaceKind) {
  return structuredClone(DEFAULT_TABLE_COLUMNS[kind]);
}
