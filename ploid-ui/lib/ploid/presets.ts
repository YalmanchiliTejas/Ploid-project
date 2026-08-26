import type { PloidAgentRequest } from "./types";

/**
 * These values are deliberately conservative for structured workspace output.
 * `max_acu` is the Ploid API's research budget; callers opt into deep work.
 */
export const PLOID_RESEARCH_PRESETS = {
  quick: {
    sources: ["people"] as const,
    maxAcu: 0.2,
    maxOutputTokens: 800,
  },
  standard: {
    sources: ["public_web"] as const,
    maxAcu: 0.4,
    maxOutputTokens: 1200,
  },
  deep: {
    sources: ["people", "public_web"] as const,
    maxAcu: 1,
    maxOutputTokens: 3000,
  },
} satisfies Record<string, Pick<PloidAgentRequest, "sources" | "maxAcu" | "maxOutputTokens">>;

export type PloidResearchPreset = keyof typeof PLOID_RESEARCH_PRESETS;
