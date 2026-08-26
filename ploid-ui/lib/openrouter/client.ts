const baseUrl = "https://openrouter.ai/api/v1";

const AUTO_ROUTER_ID = "openrouter/auto";

/**
 * Cache the model catalog so opening multiple AI-column dialogs does not
 * repeatedly call /models/user.
 */
const USER_MODELS_CACHE_MS = Number(
  process.env.OPENROUTER_USER_MODELS_CACHE_MS ?? 60_000,
);

/**
 * Optional application allowlist.
 *
 * This affects MANUALLY selectable models.
 *
 * Auto Router remains available unless explicitly disabled.
 *
 * Example:
 *
 * OPENROUTER_ALLOWED_MODELS=
 *   openai/gpt-4o-mini,
 *   google/gemini-2.5-flash,
 *   anthropic/claude-sonnet-4
 */
const configuredAllowedModels = new Set(
  (process.env.OPENROUTER_ALLOWED_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

/**
 * Optional application denylist.
 */
const configuredBlockedModels = new Set(
  (process.env.OPENROUTER_BLOCKED_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

export type StructuredOutputMode =
  | "strict"
  | "lenient"
  | "auto";

export type OpenRouterModel = {
  id: string;
  name: string;

  supportsStructuredOutput: boolean;

  preferredStructuredOutputMode:
    | "strict"
    | "lenient";

  /**
   * True for our special Auto option.
   */
  isAutoRouter?: boolean;

  inputModalities?: string[];
  outputModalities?: string[];

  contextLength?: number;
};

type OpenRouterRawModel =
  Record<string, unknown>;

type OpenRouterModelsResponse = {
  data?: OpenRouterRawModel[];

  error?: {
    message?: string;
    code?: number | string;
  };
};

type OpenRouterResponse = {
  id?: string;

  /**
   * Concrete model that actually handled the request.
   *
   * Particularly useful when model = openrouter/auto.
   */
  model?: string;

  error?: {
    message?: string;
    code?: number | string;

    metadata?: {
      provider_name?: string;
      raw?: string;
    };
  };

  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;

  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;

    [key: string]: unknown;
  };
};

export type OpenRouterStructuredInput = {
  system: string;
  prompt: string;

  schemaName: string;
  schema: Record<string, unknown>;

  /**
   * Optional.
   *
   * If omitted:
   *
   *   openrouter/auto
   *
   * is used.
   *
   * This means the user does NOT need to choose a model.
   */
  model?: string;

  /**
   * strict
   * ------
   * Require native JSON-schema output.
   *
   * lenient
   * -------
   * Prompt for JSON and normalize locally.
   *
   * auto
   * ----
   * For manually selected models:
   *
   * - native structured output if advertised
   * - lenient otherwise
   *
   * For openrouter/auto:
   *
   * - use lenient generation by default so Auto Router has the broadest
   *   possible model pool.
   */
  mode?: StructuredOutputMode;
};

type OpenRouterRequestResult = {
  response: Response;
  payload: OpenRouterResponse | null;
};

type CachedModelCatalog = {
  expiresAt: number;
  models: OpenRouterModel[];
};

let cachedModelCatalog:
  | CachedModelCatalog
  | null = null;

/**
 * Single-flight promise.
 *
 * Prevents:
 *
 * component A -> fetch models
 * component B -> fetch models
 * component C -> fetch models
 *
 * from making 3 identical OpenRouter requests simultaneously.
 */
let modelCatalogPromise:
  | Promise<OpenRouterModel[]>
  | null = null;

/* -------------------------------------------------------------------------- */
/*                              Model utilities                               */
/* -------------------------------------------------------------------------- */

function stringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string",
  );
}

function getArchitecture(
  model: OpenRouterRawModel,
): Record<string, unknown> {
  const architecture =
    model.architecture;

  if (
    !architecture ||
    typeof architecture !== "object" ||
    Array.isArray(architecture)
  ) {
    return {};
  }

  return architecture as Record<
    string,
    unknown
  >;
}

function getInputModalities(
  model: OpenRouterRawModel,
): string[] {
  return stringArray(
    getArchitecture(model)
      .input_modalities,
  );
}

function getOutputModalities(
  model: OpenRouterRawModel,
): string[] {
  return stringArray(
    getArchitecture(model)
      .output_modalities,
  );
}

function supportsTextOutput(
  model: OpenRouterRawModel,
): boolean {
  const output =
    getOutputModalities(model);

  if (output.length > 0) {
    return output.includes("text");
  }

  const modality =
    getArchitecture(model).modality;

  if (typeof modality === "string") {
    return modality.endsWith("->text");
  }

  /**
   * Older catalog records may omit architecture information.
   *
   * Don't discard them only because the metadata is incomplete.
   */
  return true;
}

function isAllowedByApplicationPolicy(
  modelId: string,
): boolean {
  if (
    configuredBlockedModels.has(modelId)
  ) {
    return false;
  }

  if (
    configuredAllowedModels.size > 0 &&
    !configuredAllowedModels.has(modelId)
  ) {
    return false;
  }

  return true;
}

/**
 * Models that look experimental should still be usable if explicitly selected,
 * but you may choose not to highlight them in the UI.
 *
 * We do NOT use these for automatic selection ourselves because Auto Router
 * performs the actual model selection.
 */
export function isExperimentalOpenRouterModel(
  modelId: string,
): boolean {
  const id =
    modelId.toLowerCase();

  return (
    id.includes("experimental") ||
    id.includes("-exp") ||
    id.includes("/exp") ||
    id.includes("preview") ||
    id.includes("contributor") ||
    id.endsWith(":free")
  );
}

/* -------------------------------------------------------------------------- */
/*                             Model normalization                            */
/* -------------------------------------------------------------------------- */

export function normalizeOpenRouterModels(
  data: Array<Record<string, unknown>>,
): OpenRouterModel[] {
  return data
    .filter((model) =>
      supportsTextOutput(model),
    )
    .map((model) => {
      const id =
        String(model.id ?? "");

      const supported =
        stringArray(
          model.supported_parameters,
        );

      const supportsStructuredOutput =
        supported.includes(
          "structured_outputs",
        ) ||
        supported.includes(
          "response_format",
        );

      const contextLength =
        typeof model.context_length ===
        "number"
          ? model.context_length
          : undefined;

      return {
        id,

        name:
          typeof model.name ===
          "string"
            ? model.name
            : id,

        supportsStructuredOutput,

        preferredStructuredOutputMode:
          supportsStructuredOutput
            ? ("strict" as const)
            : ("lenient" as const),

        inputModalities:
          getInputModalities(model),

        outputModalities:
          getOutputModalities(model),

        contextLength,
      };
    })
    .filter((model) =>
      Boolean(model.id),
    )
    .filter((model) =>
      isAllowedByApplicationPolicy(
        model.id,
      ),
    );
}

/* -------------------------------------------------------------------------- */
/*                            Effective model catalog                         */
/* -------------------------------------------------------------------------- */

/**
 * Fetch the OpenRouter model catalog filtered for the authenticated user/key.
 *
 * IMPORTANT:
 *
 * Do NOT use /models for the application's manual model picker.
 *
 * Use /models/user.
 */
async function fetchUserModelCatalog(
  key: string,
): Promise<OpenRouterModel[]> {
  const response = await fetch(
    `${baseUrl}/models/user`,
    {
      method: "GET",

      headers: {
        authorization:
          `Bearer ${key}`,

        accept:
          "application/json",
      },

      cache: "no-store",
    },
  );

  const payload = (await response
    .json()
    .catch(() => null)) as
    | OpenRouterModelsResponse
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `OpenRouter user models could not be loaded (${response.status})`,
    );
  }

  if (
    !Array.isArray(payload?.data)
  ) {
    throw new Error(
      "OpenRouter returned an invalid /models/user response",
    );
  }

  const normalized =
    normalizeOpenRouterModels(
      payload.data,
    );

  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    console.debug(
      "[OpenRouter user model catalog]",
      {
        received:
          payload.data.length,

        usable:
          normalized.length,

        nativeStructured:
          normalized.filter(
            (model) =>
              model.supportsStructuredOutput,
          ).length,

        lenientOnly:
          normalized.filter(
            (model) =>
              !model.supportsStructuredOutput,
          ).length,
      },
    );
  }

  return normalized;
}

/**
 * Model list for UI.
 *
 * Auto Router is always the first/recommended choice.
 */
export async function listOpenRouterModels(
  options: {
    forceRefresh?: boolean;
  } = {},
): Promise<OpenRouterModel[]> {
  const key =
    process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured",
    );
  }

  const now = Date.now();

  if (
    !options.forceRefresh &&
    cachedModelCatalog &&
    cachedModelCatalog.expiresAt >
      now
  ) {
    return [
      createAutoRouterModel(),
      ...cachedModelCatalog.models,
    ];
  }

  /**
   * Avoid duplicate simultaneous fetches.
   */
  if (
    !options.forceRefresh &&
    modelCatalogPromise
  ) {
    const models =
      await modelCatalogPromise;

    return [
      createAutoRouterModel(),
      ...models,
    ];
  }

  modelCatalogPromise =
    fetchUserModelCatalog(key);

  try {
    const models =
      await modelCatalogPromise;

    cachedModelCatalog = {
      models,

      expiresAt:
        Date.now() +
        USER_MODELS_CACHE_MS,
    };

    return [
      createAutoRouterModel(),
      ...models,
    ];
  } finally {
    modelCatalogPromise = null;
  }
}

function createAutoRouterModel(): OpenRouterModel {
  return {
    id: AUTO_ROUTER_ID,

    name:
      "Auto — Recommended",

    /**
     * We intentionally don't rely on provider-native JSON schema with
     * Auto Router.
     *
     * We use lenient JSON generation + local parsing instead.
     */
    supportsStructuredOutput:
      false,

    preferredStructuredOutputMode:
      "lenient",

    isAutoRouter: true,

    inputModalities: [
      "text",
    ],

    outputModalities: [
      "text",
    ],
  };
}

function clearOpenRouterModelCache() {
  cachedModelCatalog = null;
  modelCatalogPromise = null;
}

export async function refreshOpenRouterModels(): Promise<
  OpenRouterModel[]
> {
  clearOpenRouterModelCache();

  return listOpenRouterModels({
    forceRefresh: true,
  });
}

/* -------------------------------------------------------------------------- */
/*                           Automatic model resolver                         */
/* -------------------------------------------------------------------------- */

type ResolvedModel = {
  id: string;

  modelInfo:
    | OpenRouterModel
    | null;

  source:
    | "auto-router"
    | "explicit"
    | "explicit-fallback";
};

/**
 * This is the important part.
 *
 * The user does NOT need to choose a model.
 *
 * No model specified:
 *
 *      openrouter/auto
 *
 * Explicit model specified and valid:
 *
 *      use it
 *
 * Explicit model no longer available:
 *
 *      automatically fall back to openrouter/auto
 *
 */
async function resolveExecutionModel(
  requestedModel?: string,
): Promise<ResolvedModel> {
  const requested =
    requestedModel?.trim();

  /**
   * Default behavior.
   */
  if (
    !requested ||
    requested === "auto" ||
    requested === AUTO_ROUTER_ID
  ) {
    return {
      id: AUTO_ROUTER_ID,
      modelInfo:
        createAutoRouterModel(),
      source: "auto-router",
    };
  }

  /**
   * User explicitly selected a model.
   *
   * Verify against current effective model catalog.
   */
  const models =
    await listOpenRouterModels();

  const found =
    models.find(
      (model) =>
        model.id === requested,
    ) ?? null;

  if (found) {
    return {
      id: found.id,
      modelInfo: found,
      source: "explicit",
    };
  }

  /**
   * Don't make the user fix the workflow manually because a model disappeared,
   * a provider changed, or guardrails changed.
   *
   * Fall back automatically.
   */
  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    console.warn(
      "[OpenRouter] Requested model unavailable; using Auto Router",
      {
        requestedModel:
          requested,
      },
    );
  }

  return {
    id: AUTO_ROUTER_ID,

    modelInfo:
      createAutoRouterModel(),

    source:
      "explicit-fallback",
  };
}

/* -------------------------------------------------------------------------- */
/*                              Request helpers                               */
/* -------------------------------------------------------------------------- */

async function callOpenRouter(
  key: string,
  requestBody: Record<
    string,
    unknown
  >,
): Promise<OpenRouterRequestResult> {
  const response = await fetch(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",

      headers: {
        authorization:
          `Bearer ${key}`,

        "content-type":
          "application/json",

        "x-openrouter-title":
          "Ploid Workspace",
      },

      body:
        JSON.stringify(
          requestBody,
        ),

      cache: "no-store",
    },
  );

  const payload = (await response
    .json()
    .catch(() => null)) as
    | OpenRouterResponse
    | null;

  return {
    response,
    payload,
  };
}

function getContent(
  payload:
    | OpenRouterResponse
    | null,
): string | null {
  const content =
    payload
      ?.choices?.[0]
      ?.message?.content;

  return typeof content ===
    "string"
    ? content
    : null;
}

function isParameterCompatibility404(
  response: Response,
  payload:
    | OpenRouterResponse
    | null,
): boolean {
  return (
    response.status === 404 &&
    /no endpoints found that can handle the requested parameters/i.test(
      payload?.error
        ?.message ?? "",
    )
  );
}

function isPolicyBlocked404(
  response: Response,
  payload:
    | OpenRouterResponse
    | null,
): boolean {
  return (
    response.status === 404 &&
    /no endpoints available matching your guardrail restrictions and data policy/i.test(
      payload?.error
        ?.message ?? "",
    )
  );
}

/* -------------------------------------------------------------------------- */
/*                              Lenient parsing                               */
/* -------------------------------------------------------------------------- */

function stripCodeFences(
  text: string,
): string {
  return text
    .trim()
    .replace(
      /^```(?:json)?\s*/i,
      "",
    )
    .replace(
      /\s*```$/i,
      "",
    )
    .trim();
}

function extractBalancedJson(
  text: string,
): string | null {
  let start = -1;

  for (
    let i = 0;
    i < text.length;
    i += 1
  ) {
    const char =
      text[i];

    if (
      char === "{" ||
      char === "["
    ) {
      start = i;
      break;
    }
  }

  if (start === -1) {
    return null;
  }

  const stack: string[] = [];

  let inString = false;
  let escaped = false;

  for (
    let i = start;
    i < text.length;
    i += 1
  ) {
    const char =
      text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (
      char === "{" ||
      char === "["
    ) {
      stack.push(char);
      continue;
    }

    if (
      char === "}" ||
      char === "]"
    ) {
      const expectedOpening =
        char === "}"
          ? "{"
          : "[";

      const actualOpening =
        stack.pop();

      if (
        actualOpening !==
        expectedOpening
      ) {
        return null;
      }

      if (
        stack.length === 0
      ) {
        return text.slice(
          start,
          i + 1,
        );
      }
    }
  }

  return null;
}

function schemaHasValueProperty(
  schema:
    Record<string, unknown>,
): boolean {
  if (
    schema.type !== "object"
  ) {
    return false;
  }

  const properties =
    schema.properties;

  if (
    !properties ||
    typeof properties !==
      "object" ||
    Array.isArray(properties)
  ) {
    return false;
  }

  return Object.prototype
    .hasOwnProperty.call(
      properties,
      "value",
    );
}

function getValueSchema(
  schema:
    Record<string, unknown>,
):
  | Record<string, unknown>
  | null {
  if (
    !schemaHasValueProperty(
      schema,
    )
  ) {
    return null;
  }

  const properties =
    schema.properties as Record<
      string,
      unknown
    >;

  const valueSchema =
    properties.value;

  if (
    !valueSchema ||
    typeof valueSchema !==
      "object" ||
    Array.isArray(valueSchema)
  ) {
    return null;
  }

  return valueSchema as Record<
    string,
    unknown
  >;
}

function coerceSimpleValue(
  raw: string,
  schema:
    Record<string, unknown>,
): unknown {
  const valueSchema =
    getValueSchema(schema);

  const trimmed =
    raw.trim();

  if (!valueSchema) {
    return trimmed;
  }

  const expectedType =
    valueSchema.type;

  if (
    expectedType === "number"
  ) {
    const number =
      Number(trimmed);

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  if (
    expectedType === "integer"
  ) {
    const number =
      Number(trimmed);

    if (
      Number.isInteger(number)
    ) {
      return number;
    }
  }

  if (
    expectedType === "boolean"
  ) {
    const normalized =
      trimmed.toLowerCase();

    if (
      normalized ===
        "true" ||
      normalized === "yes"
    ) {
      return true;
    }

    if (
      normalized ===
        "false" ||
      normalized === "no"
    ) {
      return false;
    }
  }

  return trimmed;
}

function plainTextValueFallback(
  text: string,
  schema:
    Record<string, unknown>,
): unknown | null {
  if (
    !schemaHasValueProperty(
      schema,
    )
  ) {
    return null;
  }

  const trimmed =
    text.trim();

  if (!trimmed) {
    return {
      value: null,
    };
  }

  return {
    value:
      coerceSimpleValue(
        trimmed,
        schema,
      ),
  };
}

function parseLenientJson<T>(
  rawContent: string,
  schema:
    Record<string, unknown>,
): T {
  const cleaned =
    stripCodeFences(
      rawContent,
    );

  /**
   * 1. Proper JSON.
   */
  try {
    return JSON.parse(
      cleaned,
    ) as T;
  } catch {
    // Continue.
  }

  /**
   * 2. JSON surrounded by prose.
   */
  const extracted =
    extractBalancedJson(
      cleaned,
    );

  if (extracted) {
    try {
      return JSON.parse(
        extracted,
      ) as T;
    } catch {
      // Continue.
    }
  }

  /**
   * 3. Simple value-only
   * AI column.
   *
   * Example:
   *
   * Automotive
   *
   * becomes:
   *
   * {
   *   value: "Automotive"
   * }
   */
  const fallback =
    plainTextValueFallback(
      cleaned,
      schema,
    );

  if (fallback !== null) {
    return fallback as T;
  }

  throw new Error(
    "OpenRouter returned output that could not be converted into the requested structured format",
  );
}

/* -------------------------------------------------------------------------- */
/*                            Request construction                            */
/* -------------------------------------------------------------------------- */

function buildStrictRequestBody(
  model: string,
  input:
    OpenRouterStructuredInput,
): Record<string, unknown> {
  return {
    model,

    messages: [
      {
        role: "system",
        content:
          input.system,
      },

      {
        role: "user",
        content:
          input.prompt,
      },
    ],

    response_format: {
      type:
        "json_schema",

      json_schema: {
        name:
          input.schemaName,

        strict: true,

        schema:
          input.schema,
      },
    },

    provider: {
      require_parameters:
        true,

      allow_fallbacks:
        true,
    },
  };
}

function buildLenientRequestBody(
  model: string,
  input:
    OpenRouterStructuredInput,
): Record<string, unknown> {
  const schemaText =
    JSON.stringify(
      input.schema,
      null,
      2,
    );

  return {
    model,

    messages: [
      {
        role: "system",

        content: [
          input.system,

          "",

          "IMPORTANT OUTPUT FORMAT:",

          "Return only valid JSON.",

          "Do not use Markdown.",

          "Do not wrap the answer in JSON code fences.",

          "Do not include commentary before or after the JSON.",

          "Follow the JSON Schema below as closely as possible:",

          "",

          schemaText,
        ].join("\n"),
      },

      {
        role: "user",

        content:
          input.prompt,
      },
    ],

    /**
     * Do NOT add require_parameters here.
     *
     * This maximizes the model/provider pool.
     */
    provider: {
      allow_fallbacks:
        true,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                Error helpers                               */
/* -------------------------------------------------------------------------- */

function createOpenRouterError(
  response: Response,
  payload:
    | OpenRouterResponse
    | null,
  model: string,
): Error {
  const message =
    payload?.error?.message;

  return new Error(
    [
      message,

      payload?.error?.code
        ? `code ${payload.error.code}`
        : undefined,

      payload?.error
        ?.metadata
        ?.provider_name
        ? `provider ${payload.error.metadata.provider_name}`
        : undefined,

      `model ${model}`,
    ]
      .filter(Boolean)
      .join(" — ") ||
      `OpenRouter request failed (${response.status})`,
  );
}

/* -------------------------------------------------------------------------- */
/*                           Auto Router fallback                             */
/* -------------------------------------------------------------------------- */

/**
 * If somebody explicitly selected a concrete model and it becomes unavailable
 * because of privacy/provider policy, retry ONCE with Auto Router.
 *
 * We only use this for routing/policy failures that occur before successful
 * generation.
 */
async function retryWithAutoRouter<T>(
  key: string,
  input:
    OpenRouterStructuredInput,
  originalModel: string,
): Promise<T> {
  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    console.warn(
      "[OpenRouter] Falling back to Auto Router",
      {
        originalModel,
      },
    );
  }

  clearOpenRouterModelCache();

  const result =
    await callOpenRouter(
      key,
      buildLenientRequestBody(
        AUTO_ROUTER_ID,
        input,
      ),
    );

  if (!result.response.ok) {
    throw createOpenRouterError(
      result.response,
      result.payload,
      AUTO_ROUTER_ID,
    );
  }

  const content =
    getContent(
      result.payload,
    );

  if (content === null) {
    throw new Error(
      "OpenRouter Auto Router returned no content",
    );
  }

  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    console.debug(
      "[OpenRouter Auto Router fallback completed]",
      {
        requestedModel:
          originalModel,

        actualModel:
          result.payload?.model,

        schemaName:
          input.schemaName,
      },
    );
  }

  return parseLenientJson<T>(
    content,
    input.schema,
  );
}

/* -------------------------------------------------------------------------- */
/*                              Main function                                 */
/* -------------------------------------------------------------------------- */

export async function openRouterStructured<T>(
  input:
    OpenRouterStructuredInput,
): Promise<T> {
  const key =
    process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured",
    );
  }

  /**
   * IMPORTANT:
   *
   * We deliberately DO NOT fall back to:
   *
   * OPENROUTER_MODEL
   * OPENROUTER_COLUMN_BUILDER_MODEL
   *
   * because an old environment variable pointing to a bad model would defeat
   * automatic routing.
   *
   * If you want to pin the entire app to a concrete model, use:
   *
   * OPENROUTER_AI_COLUMN_MODEL
   *
   * Otherwise Auto Router is used.
   */
  const requestedModel =
    input.model ??
    process.env
      .OPENROUTER_AI_COLUMN_MODEL;

  const resolved =
    await resolveExecutionModel(
      requestedModel,
    );

  const model =
    resolved.id;

  const requestedMode =
    input.mode ?? "auto";

  /**
   * AUTO ROUTER
   *
   * Use lenient output by default.
   *
   * This prevents native JSON-schema support from unnecessarily shrinking
   * Auto Router's available model/provider pool.
   */
  if (
    model ===
      AUTO_ROUTER_ID &&
    requestedMode !==
      "strict"
  ) {
    const result =
      await callOpenRouter(
        key,
        buildLenientRequestBody(
          model,
          input,
        ),
      );

    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      console.debug(
        "[OpenRouter Auto Router response]",
        {
          status:
            result.response
              .status,

          actualModel:
            result.payload
              ?.model,

          schemaName:
            input.schemaName,
        },
      );
    }

    if (!result.response.ok) {
      throw createOpenRouterError(
        result.response,
        result.payload,
        model,
      );
    }

    const content =
      getContent(
        result.payload,
      );

    if (content === null) {
      throw new Error(
        "OpenRouter Auto Router returned no content",
      );
    }

    return parseLenientJson<T>(
      content,
      input.schema,
    );
  }

  /**
   * For explicit models determine whether it is worth attempting native
   * structured output.
   */
  const supportsNative =
    resolved.modelInfo
      ?.supportsStructuredOutput ??
    false;

  const effectiveMode:
    | "strict"
    | "lenient"
    | "auto" =
    requestedMode === "auto"
      ? supportsNative
        ? "auto"
        : "lenient"
      : requestedMode;

  /* ---------------------------------------------------------------------- */
  /*                              LENIENT                                   */
  /* ---------------------------------------------------------------------- */

  if (
    effectiveMode ===
    "lenient"
  ) {
    const result =
      await callOpenRouter(
        key,
        buildLenientRequestBody(
          model,
          input,
        ),
      );

    if (!result.response.ok) {
      /**
       * If a concrete model has become invalid since /models/user was read,
       * fall back automatically instead of making the user choose again.
       */
      if (
        model !==
          AUTO_ROUTER_ID &&
        isPolicyBlocked404(
          result.response,
          result.payload,
        )
      ) {
        return retryWithAutoRouter<T>(
          key,
          input,
          model,
        );
      }

      throw createOpenRouterError(
        result.response,
        result.payload,
        model,
      );
    }

    const content =
      getContent(
        result.payload,
      );

    if (content === null) {
      throw new Error(
        "OpenRouter returned no content",
      );
    }

    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      console.debug(
        "[OpenRouter lenient response]",
        {
          requestedModel:
            model,

          actualModel:
            result.payload
              ?.model,

          schemaName:
            input.schemaName,
        },
      );
    }

    return parseLenientJson<T>(
      content,
      input.schema,
    );
  }

  /* ---------------------------------------------------------------------- */
  /*                           STRICT / AUTO                                */
  /* ---------------------------------------------------------------------- */

  const strictResult =
    await callOpenRouter(
      key,
      buildStrictRequestBody(
        model,
        input,
      ),
    );

  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    console.debug(
      "[OpenRouter structured output response]",
      {
        status:
          strictResult
            .response.status,

        requestedModel:
          model,

        actualModel:
          strictResult.payload
            ?.model,

        schemaName:
          input.schemaName,

        mode:
          effectiveMode,
      },
    );
  }

  if (
    strictResult.response.ok
  ) {
    const content =
      getContent(
        strictResult.payload,
      );

    if (content === null) {
      throw new Error(
        "OpenRouter returned no structured configuration",
      );
    }

    try {
      return JSON.parse(
        content,
      ) as T;
    } catch {
      return parseLenientJson<T>(
        content,
        input.schema,
      );
    }
  }

  /**
   * Concrete model became invalid under current privacy policy.
   *
   * Don't involve the user. Use Auto Router.
   */
  if (
    model !==
      AUTO_ROUTER_ID &&
    isPolicyBlocked404(
      strictResult.response,
      strictResult.payload,
    )
  ) {
    return retryWithAutoRouter<T>(
      key,
      input,
      model,
    );
  }

  const compatibilityFailure =
    isParameterCompatibility404(
      strictResult.response,
      strictResult.payload,
    );

  /**
   * Explicit strict mode means exactly that.
   */
  if (
    effectiveMode ===
      "strict" ||
    !compatibilityFailure
  ) {
    throw createOpenRouterError(
      strictResult.response,
      strictResult.payload,
      model,
    );
  }

  /* ---------------------------------------------------------------------- */
  /*                        STRICT -> LENIENT                               */
  /* ---------------------------------------------------------------------- */

  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    console.warn(
      "[OpenRouter] Native structured output unavailable; retrying lenient",
      {
        model,

        schemaName:
          input.schemaName,

        originalMessage:
          strictResult.payload
            ?.error?.message,
      },
    );
  }

  const lenientResult =
    await callOpenRouter(
      key,
      buildLenientRequestBody(
        model,
        input,
      ),
    );

  if (
    !lenientResult.response.ok
  ) {
    /**
     * If the concrete model itself also turns out to be blocked, finish via
     * Auto Router.
     */
    if (
      model !==
        AUTO_ROUTER_ID &&
      isPolicyBlocked404(
        lenientResult.response,
        lenientResult.payload,
      )
    ) {
      return retryWithAutoRouter<T>(
        key,
        input,
        model,
      );
    }

    throw createOpenRouterError(
      lenientResult.response,
      lenientResult.payload,
      model,
    );
  }

  const content =
    getContent(
      lenientResult.payload,
    );

  if (content === null) {
    throw new Error(
      "OpenRouter returned no content in lenient fallback mode",
    );
  }

  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    console.debug(
      "[OpenRouter lenient fallback completed]",
      {
        requestedModel:
          model,

        actualModel:
          lenientResult.payload
            ?.model,

        schemaName:
          input.schemaName,
      },
    );
  }

  return parseLenientJson<T>(
    content,
    input.schema,
  );
}