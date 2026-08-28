import { enrichPerson, runPloidAgent } from "./client";
import { PLOID_RESEARCH_PRESETS, type PloidResearchPreset } from "./presets";
import { normalizeAgentResponse } from "./normalize-agent";
import { normalizeAgentOperations } from "@/lib/workspace/agent-operation-normalizer";
import type { TableOperation, Workspace, AgentTurn } from "@/lib/workspace/types";
import { normalizeStructuredTable } from "@/lib/workspace/normalize-structured-table";
import { choosePloidSurface } from "./surface";
import { searchPeople } from "./search";
import { peopleSearchOperations } from "@/lib/table/service";

export type AgentResult = {
  turn: AgentTurn;
  operations: TableOperation[];
  structuredOutputError?: string;
  sessionId?: string;
  normalizationMs?: number;
};

// This is sent to Ploid as output_schema. It intentionally models only the
// table protocol accepted by our application, not our internal Workspace type.
export const workspaceOperationsOutputSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["operations"],
  properties: {
    message: { type: "string" },
    operations: {
      type: "array",
      items: {
        oneOf: [
          { type: "object", additionalProperties: false, required: ["type", "rows"], properties: { type: { const: "add_rows" }, rows: { type: "array", items: { type: "object", additionalProperties: false, required: ["values"], properties: { id: { type: "string" }, values: { type: "object", additionalProperties: { type: ["string", "number", "boolean", "null"] } } } } } } },
          { type: "object", additionalProperties: false, required: ["type", "updates"], properties: { type: { const: "update_cells" }, updates: { type: "array", items: { type: "object", additionalProperties: false, required: ["rowId", "columnId", "value"], properties: { rowId: { type: "string" }, columnId: { type: "string" }, value: { type: ["string", "number", "boolean", "null"] } } } } } },
          { type: "object", additionalProperties: false, required: ["type", "rowIds"], properties: { type: { const: "delete_rows" }, rowIds: { type: "array", items: { type: "string" } } } },
          { type: "object", additionalProperties: false, required: ["type", "columnId", "direction"], properties: { type: { const: "sort_rows" }, columnId: { type: "string" }, direction: { type: "string", enum: ["asc", "desc"] } } },
        ],
      },
    },
  },
};

export async function runWorkspaceAgent(
  workspace: Workspace,
  prompt: string,
  options?: { preset?: PloidResearchPreset; onEvent?: (event: { type: string; text?: string }) => void },
): Promise<AgentResult> {
  const surface = choosePloidSurface(prompt);
  if (surface === "search") {
    const search = await searchPeople({
      query: prompt,
      type: "instant",
      category: "people",
      num_results: 25,
      contents: { fields: ["name", "linkedin", "title", "company", "location"] },
    });
    return {
      turn: {
        id: `agent_turn_${crypto.randomUUID()}`,
        prompt,
        output: `Found ${search.rows.length} people with Ploid Search.`,
        artifacts: [],
        inputRequests: [],
        ...(search.requestId ? { requestId: search.requestId } : {}),
        createdAt: new Date().toISOString(),
      },
      operations: peopleSearchOperations(workspace, search.rows),
    };
  }
  if (surface === "enrich") {
    const linkedinUrl = prompt.match(/https?:\/\/[^\s]*linkedin\.com\/in\/[^\s,.)]+/i)?.[0];
    if (!linkedinUrl) throw new Error("A LinkedIn profile URL is required for enrichment");
    const enriched = await enrichPerson({
      linkedinUrl,
      enrichments: ["profile", "email", "phone"],
    });
    return {
      turn: {
        id: `agent_turn_${crypto.randomUUID()}`,
        prompt,
        output: "Ploid enrichment completed for the supplied profile.",
        artifacts: [enriched.raw],
        inputRequests: [],
        ...(enriched.requestId ? { requestId: enriched.requestId } : {}),
        createdAt: new Date().toISOString(),
      },
      operations: [],
    };
  }
  const preset = PLOID_RESEARCH_PRESETS[options?.preset ?? "standard"];
  const response = await runPloidAgent({
    prompt: `${prompt}\n\nReturn table mutations only through the supplied output_schema. Populate only the existing stable column IDs from this workspace. Do not create, delete, rename, or infer columns; users add their own columns manually. Workspace context:\n${JSON.stringify({ columns: workspace.table.columns, rows: workspace.table.rows.slice(0, 100) })}`,
    sessionId: workspace.ploidSessionId,
    outputSchema: workspaceOperationsOutputSchema,
    ...preset,
  }, options?.onEvent);
  const turn = normalizeAgentResponse(prompt, response);
  if (turn.structuredOutput === undefined) {
    return {
      turn,
      operations: [],
      structuredOutputError: "Ploid returned no structured workspace result.",
    };
  }
  try {
    const normalizedAt = performance.now();
    const { operations } = normalizeAgentOperations(turn.structuredOutput, workspace);
    return {
      turn,
      operations: normalizeStructuredTable(operations),
      normalizationMs: performance.now() - normalizedAt,
      ...(typeof response.meta.session_id === "string"
        ? { sessionId: response.meta.session_id }
        : {}),
    };
  } catch (error) {
    return {
      turn,
      operations: [],
      structuredOutputError: error instanceof Error ? error.message : "Invalid structured workspace result.",
    };
  }
}
