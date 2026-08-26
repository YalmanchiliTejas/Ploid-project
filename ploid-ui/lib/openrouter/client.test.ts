import { describe, expect, it } from "vitest";
import { normalizeOpenRouterModels } from "./client";

describe("OpenRouter model normalization", () => {
  it("identifies models advertising the required structured-output parameter", () => {
    expect(
      normalizeOpenRouterModels([
        {
          id: "provider/structured",
          name: "Structured",
          supported_parameters: ["response_format"],
        },
        {
          id: "provider/plain",
          name: "Plain",
          supported_parameters: ["tools"],
        },
      ]),
    ).toEqual([
      {
        id: "provider/structured",
        name: "Structured",
        supportsStructuredOutput: true,
      },
      { id: "provider/plain", name: "Plain", supportsStructuredOutput: false },
    ]);
  });
});
