import { createHash } from "node:crypto";
import { runPloidAgent } from "./client";

type CachedResult = { result: string; expiresAt: number };
const cache = new Map<string, CachedResult>();
const inFlight = new Map<string, Promise<string>>();
const cacheTtlMs = 10 * 60 * 1000;

async function execute(prompt: string) {
  if (!process.env.PLOID_API_KEY)
    return `[Mock Ploid] Research result for: ${prompt}`;
  const response = await runPloidAgent({ prompt, maxAcu: 0.4 });
  const output = response?.data?.output;
  if (typeof output !== "string" || !output.trim())
    throw new Error("Ploid returned an invalid research result");
  return output.trim();
}

export function generateWithPloid(prompt: string) {
  const key = createHash("sha256").update(prompt).digest("hex");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now())
    return Promise.resolve(cached.result);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = execute(prompt)
    .then((result) => {
      cache.set(key, { result, expiresAt: Date.now() + cacheTtlMs });
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
