import { describe, expect, it } from "vitest";
import { normalizeAgentResponse } from "./normalize-agent";

describe("normalizeAgentResponse", () => {
  it("keeps output, artifacts, input requests, and usage on the Agent turn", () => {
    const turn = normalizeAgentResponse("research", {
      data: { output: "Done", artifacts: [{ url: "https://example.com" }], input_requests: [{ question: "Continue?" }], structured_output: { operations: [] } },
      meta: { acu_used: 0.4, request_id: "req_agent" },
    });
    expect(turn).toMatchObject({ prompt: "research", output: "Done", acuUsed: 0.4, requestId: "req_agent", artifacts: [{ url: "https://example.com" }], inputRequests: [{ question: "Continue?" }] });
  });
});
