import { runFunction } from "@/lib/functions/service";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ functionId: string }> },
) {
  try {
    const { functionId } = await params;
    const body = (await request.json()) as { inputs?: Record<string, unknown> };
    return Response.json({
      data: await runFunction(functionId, body.inputs ?? {}, {
        trigger: "manual",
      }),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Function test failed",
      },
      { status: 400 },
    );
  }
}
