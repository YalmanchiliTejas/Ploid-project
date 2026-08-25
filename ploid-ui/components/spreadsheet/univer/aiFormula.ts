import type { createSpreadsheet } from "./createUniver";

type Status = "pending" | "running" | "complete" | "error";
type UniverApi = ReturnType<typeof createSpreadsheet>["univerAPI"];
function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active -= 1;
    queue.shift()?.();
  };
  return async <T>(task: () => Promise<T>) => {
    if (active >= max)
      await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      next();
    }
  };
}
export function registerAiFormula(
  univerAPI: UniverApi,
  onStatus?: (status: Status) => void,
) {
  const runWithLimit = createLimiter(4);
  const disposable = univerAPI.getFormula().registerAsyncFunction(
    "AI",
    async (...args: unknown[]) => {
      const prompt = args
        .map((value) =>
          Array.isArray(value) ? value.flat().join(", ") : String(value ?? ""),
        )
        .join("");
      if (!prompt.trim()) {
        onStatus?.("error");
        return "⚠ AI request failed: missing prompt";
      }
      onStatus?.("pending");
      onStatus?.("running");
      try {
        const response = await runWithLimit(() =>
          fetch("/api/ploid/agent", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt }),
          }),
        );
        const payload = (await response.json()) as {
          result?: string;
          error?: string;
        };
        if (!response.ok || !payload.result)
          throw new Error(payload.error || "The AI request failed");
        onStatus?.("complete");
        return payload.result;
      } catch (error) {
        onStatus?.("error");
        return `⚠ AI request failed: ${error instanceof Error ? error.message : "network error"}`;
      }
    },
    "Send a prompt to the workspace AI endpoint",
  );
  return () => disposable.dispose();
}
