import { listOpenRouterModels } from "@/lib/openrouter/client";

export async function GET() {
  try {
    const models = await listOpenRouterModels();
    // Return the complete catalog. The UI marks models that cannot satisfy
    // strict structured output and prevents selecting them for AI columns.
    return Response.json({ data: models });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load OpenRouter models",
      },
      { status: 502 },
    );
  }
}
