import type { AgentResponse, PloidAgentRequest, PloidResponse } from "./types";
import { PLOID_RESEARCH_PRESETS } from "./presets";
import {
  isMockApiEnabled,
  mockAgentResponse,
  mockPersonEnrichment,
  mockSocialEnrichment,
} from "./mock-service";

const baseUrl = "https://api.ploid.com/v1";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Ploid completion events may wrap the response in data, result, or response. */
export function agentResponseFromSsePayload(
  payload: unknown,
): AgentResponse | undefined {
  if (!isRecord(payload)) return undefined;
  const nested = [
    payload,
    payload.data,
    payload.result,
    payload.response,
    isRecord(payload.data) ? payload.data.result : undefined,
    isRecord(payload.data) ? payload.data.response : undefined,
  ].filter(isRecord);
  const data = nested.find(
    (candidate) =>
      typeof candidate.output === "string" ||
      candidate.structured_output !== undefined,
  );
  if (!data) return undefined;
  const meta = isRecord(payload.meta)
    ? payload.meta
    : isRecord(data.meta)
      ? data.meta
      : {};
  return {
    data: {
      ...data,
      // The agent result type always has output, but a structured completion
      // event is still valid if the provider omits prose.
      output: typeof data.output === "string" ? data.output : "",
      artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
    },
    meta,
  } as AgentResponse;
}

export class PloidRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = "PloidRequestError";
  }
}

export async function ploidFetch<T>(
  path: string,
  body: Record<string, unknown>,
  headers?: HeadersInit,
) {
  const key = process.env.PLOID_API_KEY;
  if (!key) throw new Error("PLOID_API_KEY is not configured");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok)
    throw new PloidRequestError(
      payload?.error?.message ??
        payload?.error?.code ??
        `Ploid request failed (${response.status})`,
      response.status,
      payload,
    );
  if (!payload || typeof payload !== "object")
    throw new Error("Ploid returned an invalid JSON response");
  if ("error" in payload && payload.error)
    throw new PloidRequestError(
      payload.error.message ?? payload.error.code ?? "Ploid returned an error",
      200,
      payload,
    );
  return payload as T;
}
export async function runPloidAgent(
  request: PloidAgentRequest,
  onEvent?: (event: { type: string; text?: string }) => void,
) {
  if (isMockApiEnabled()) {
    onEvent?.({ type: "activity", text: "Using local mock Ploid data" });
    onEvent?.({
      type: "text_delta",
      text: "Preparing mock structured results",
    });
    return mockAgentResponse(request);
  }
  const preset = PLOID_RESEARCH_PRESETS.standard;
  const body = {
    operation: "ask",
    prompt: request.prompt,
    ...(request.sessionId ? { session_id: request.sessionId } : {}),
    sources: request.sources ?? preset.sources,
    max_acu: request.maxAcu ?? preset.maxAcu,
    max_output_tokens: request.maxOutputTokens ?? preset.maxOutputTokens,
    response_format: "standard",
    ...(request.outputSchema ? { output_schema: request.outputSchema } : {}),
  };

  if (!onEvent) return ploidFetch<AgentResponse>("/agent", body);

  const key = process.env.PLOID_API_KEY;
  if (!key) throw new Error("PLOID_API_KEY is not configured");

  const response = await fetch(`${baseUrl}/agent`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "text/event-stream, application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new PloidRequestError(
      (payload as { error?: { message?: string } } | null)?.error?.message ??
        `Ploid request failed (${response.status})`,
      response.status,
      payload,
    );
  }

  // Ploid may fall back to JSON; keep that path compatible with SSE callers.
  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    return (await response.json()) as AgentResponse;

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Ploid returned an empty stream");
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: AgentResponse | undefined;

  const consume = (block: string) => {
    const eventType = block.match(/^event:\s*(.+)$/m)?.[1] ?? "activity";
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data) as unknown;
      const payload = isRecord(parsed) ? parsed : {};
      const candidate = isRecord(payload.data) ? payload.data : payload;
      const text = [
        candidate.text,
        candidate.message,
        candidate.output,
        payload.text,
      ].find((value): value is string => typeof value === "string");
      onEvent({
        type: typeof payload.type === "string" ? payload.type : eventType,
        ...(text ? { text } : {}),
      });

      // Completion payloads are not guaranteed to use the same envelope as
      // progress events. Accept Ploid's data/result/response completion shapes.
      finalResponse ??= agentResponseFromSsePayload(parsed);
    } catch {
      onEvent({ type: eventType, text: data });
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary: number;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      consume(buffer.slice(0, boundary));
      const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0];
      buffer = buffer.slice(boundary + (separator?.length ?? 2));
    }
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  if (!finalResponse)
    throw new Error("Ploid stream ended without a final structured response");
  return finalResponse;
}
export async function enrichPerson(input: {
  linkedinUrl: string;
  firstName?: string;
  lastName?: string;
  enrichments: Array<"profile" | "email" | "phone">;
}) {
  const validation = validateLinkedInUrl(input.linkedinUrl);
  if (validation) throw new Error(validation);
  if (isMockApiEnabled()) return mockPersonEnrichment(input);
  return ploidFetch<PloidResponse<unknown>>("/enrich", {
    linkedin_url: input.linkedinUrl,
    ...(input.firstName ? { first_name: input.firstName } : {}),
    ...(input.lastName ? { last_name: input.lastName } : {}),
    enrichments: input.enrichments,
    response_format: "standard",
  });
}

export function validateLinkedInUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "linkedin.com" || host.endsWith(".linkedin.com"))
      return undefined;
  } catch {
    // fall through to the user-facing validation message
  }
  return "Missing LinkedIn URL";
}

export const PLOID_SOCIAL_PLATFORMS = [
  "linkedin",
  "x",
  "instagram",
  "tiktok",
  "youtube",
  "github",
  "reddit",
  "facebook",
] as const;

export type PloidSocialPlatform = (typeof PLOID_SOCIAL_PLATFORMS)[number];

const SOCIAL_URL_HOSTS: Record<PloidSocialPlatform, readonly string[]> = {
  linkedin: ["linkedin.com"],
  x: ["x.com", "twitter.com"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  github: ["github.com"],
  reddit: ["reddit.com"],
  facebook: ["facebook.com", "fb.com"],
};

/** Returns a user-facing validation error before an avoidable Social API call. */
export function validateSocialIdentifier(
  platform: PloidSocialPlatform,
  identifier: string,
) {
  const value = identifier.trim();
  if (!value) return "Missing social identifier";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      !SOCIAL_URL_HOSTS[platform].some(
        (domain) => host === domain || host.endsWith(`.${domain}`),
      )
    )
      return `This URL is not a ${platform === "x" ? "X" : platform} profile`;
  } catch {
    // Handles and vanity slugs are valid identifiers.
  }
  return undefined;
}

export async function enrichSocial(input: {
  platform: PloidSocialPlatform;
  identifier: string;
}) {
  const validation = validateSocialIdentifier(input.platform, input.identifier);
  if (validation) throw new Error(validation);
  if (isMockApiEnabled())
    return mockSocialEnrichment(input) as PloidResponse<{
      platform: PloidSocialPlatform;
      profile: Record<string, unknown>;
    }>;
  return ploidFetch<
    PloidResponse<{
      platform: PloidSocialPlatform;
      profile: Record<string, unknown>;
    }>
  >("/socials", {
    platform: input.platform,
    identifier: input.identifier.trim(),
  });
}
