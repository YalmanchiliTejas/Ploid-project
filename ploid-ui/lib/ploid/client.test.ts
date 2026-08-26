import { describe, expect, it } from "vitest";
import { agentResponseFromSsePayload } from "./client";

describe("agentResponseFromSsePayload", () => {
  it("accepts a nested terminal structured-response event", () => {
    expect(
      agentResponseFromSsePayload({
        type: "response.completed",
        data: {
          result: {
            output: "Done",
            structured_output: { operations: [] },
          },
        },
        meta: { request_id: "req_1" },
      }),
    ).toMatchObject({
      data: { output: "Done", structured_output: { operations: [] } },
      meta: { request_id: "req_1" },
    });
  });

  it("does not mistake an activity event for completion", () => {
    expect(agentResponseFromSsePayload({ data: { text: "Researching" } })).toBeUndefined();
  });
});
