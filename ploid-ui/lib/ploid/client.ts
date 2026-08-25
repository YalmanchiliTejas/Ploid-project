const baseUrl = "https://api.ploid.com/v1";
export type PloidAgentRequest = {
  prompt: string;
  sessionId?: string;
  sources?: Array<"people" | "public_web" | "connected_apps">;
  maxAcu?: number;
  outputSchema?: Record<string, unknown>;
};
export async function ploidFetch(path: string, body: Record<string, unknown>) {
  const key = process.env.PLOID_API_KEY;
  if (!key) return null;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok)
    throw new Error(
      payload?.error?.message ??
        payload?.error?.code ??
        `Ploid request failed (${response.status})`,
    );
  if (!payload || typeof payload !== "object")
    throw new Error("Ploid returned an invalid JSON response");
  return payload;
}
export async function runPloidAgent(request: PloidAgentRequest) {
  return ploidFetch("/agent", {
    operation: "ask",
    prompt: request.prompt,
    session_id: request.sessionId,
    sources: request.sources ?? ["people", "public_web"],
    max_acu: request.maxAcu ?? 0.8,
    max_output_tokens: 4000,
    response_format: "standard",
    ...(request.outputSchema ? { output_schema: request.outputSchema } : {}),
  });
}
export async function enrichPerson(input: {
  linkedinUrl: string;
  firstName?: string;
  lastName?: string;
  enrichments: Array<"profile" | "email" | "phone">;
}) {
  return ploidFetch("/enrich", {
    linkedin_url: input.linkedinUrl,
    first_name: input.firstName,
    last_name: input.lastName,
    enrichments: input.enrichments,
    response_format: "standard",
  });
}
