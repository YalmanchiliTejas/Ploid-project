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
        preferredStructuredOutputMode: "strict",
        inputModalities: [],
        outputModalities: [],
        contextLength: undefined,
      },
      {
        id: "provider/plain",
        name: "Plain",
        supportsStructuredOutput: false,
        preferredStructuredOutputMode: "lenient",
        inputModalities: [],
        outputModalities: [],
        contextLength: undefined,
      },
    ]);
  });

  it("uses lenient output for models with unavailable native schema routing", () => {
    expect(
      normalizeOpenRouterModels([
        {
          id: "z-ai/glm-5.3-flash",
          name: "GLM 5.3 Flash",
          supported_parameters: ["response_format"],
        },
      ])[0],
    ).toMatchObject({
      id: "z-ai/glm-5.3-flash",
      supportsStructuredOutput: false,
      preferredStructuredOutputMode: "lenient",
    });
  });
});
