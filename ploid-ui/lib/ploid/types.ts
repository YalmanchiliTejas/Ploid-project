/** Types mirror the public fields in Ploid's current OpenAPI schema. */
export type PloidMeta = {
  request_id?: string;
  credits_charged?: number;
  warnings?: unknown[];
  acu_limit?: number;
  acu_used?: number;
  warning?: "search_timeout";
  [key: string]: unknown;
};

export type NormalizedPersonEnrichment = {
  fields: Partial<
    Record<
      "profile" | "email" | "phone",
      { status: "success" | "not_found" | "failed"; value: unknown | null }
    >
  >;
  warnings: unknown[];
  requestId?: string;
  creditsCharged?: number;
  /** Available for run details only; never rendered into a spreadsheet cell. */
  raw: unknown;
};

export type PloidResponse<T> = { data: T; meta: PloidMeta };

export type PloidSearchRequest = {
  query: string;
  type?: "instant" | "auto" | "deep";
  category?: "people";
  num_results?: number;
  filters?: { title?: string; company?: string; location?: string };
  contents?: {
    fields?: Array<"linkedin" | "title" | "company" | "location" | "name">;
  };
};

export type PloidSearchPerson = {
  name?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
};

export type PloidSearchResult = {
  url: string | null;
  title: string | null;
  score: number | null;
  person: PloidSearchPerson;
};

export type PloidSearchResponse = PloidResponse<{
  results: PloidSearchResult[];
  search_time_ms: number;
  rows_indexed: number;
  request: Required<Pick<PloidSearchRequest, "query">> & {
    type: "instant" | "auto" | "deep";
    category: "people";
    num_results: number;
  };
}>;

export type PloidAgentRequest = {
  prompt: string;
  sessionId?: string;
  sources?: Array<"people" | "public_web" | "connected_apps">;
  maxAcu?: number;
  maxOutputTokens?: number;
  outputSchema?: Record<string, unknown>;
};

export type AgentResponse<TStructured = unknown> = PloidResponse<{
  output: string;
  artifacts: unknown[];
  input_requests?: unknown[];
  structured_output?: TStructured;
}>;

export type PersonRow = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  location?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  raw: unknown;
};
