import type { AgentResponse } from "./types";
import type { AgentTurn } from "@/lib/workspace/types";

export function normalizeAgentResponse(
  prompt: string,
  response: AgentResponse,
): AgentTurn {
  return {
    id: `agent_turn_${crypto.randomUUID()}`,
    prompt,
    output: response.data.output,
    ...(response.data.structured_output !== undefined
      ? { structuredOutput: response.data.structured_output }
      : {}),
    artifacts: response.data.artifacts,
    inputRequests: response.data.input_requests ?? [],
    ...(typeof response.meta.acu_used === "number"
      ? { acuUsed: response.meta.acu_used }
      : {}),
    ...(typeof response.meta.request_id === "string"
      ? { requestId: response.meta.request_id }
      : {}),
    createdAt: new Date().toISOString(),
  };
}
