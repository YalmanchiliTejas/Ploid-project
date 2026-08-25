import { generateWithPloid } from "@/lib/ploid/generate";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: unknown };
    if (typeof body.prompt !== "string" || !body.prompt.trim())
      return Response.json({ error: "A prompt is required" }, { status: 400 });
    const result = await generateWithPloid(body.prompt.trim());
    return Response.json({
      result: result,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Ploid request failed",
      },
      { status: 502 },
    );
  }
}
