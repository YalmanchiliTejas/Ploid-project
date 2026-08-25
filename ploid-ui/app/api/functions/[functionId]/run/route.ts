import { runFunction } from "@/lib/functions/service";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ functionId: string }> },
) {
  try {
    const { functionId } = await params;
    const body = (await request.json()) as {
      inputs?: Record<string, unknown>;
      workspaceId?: string;
      tableId?: string;
    };
    const run = await runFunction(functionId, body.inputs ?? {}, {
      trigger: "api",
      workspaceId: body.workspaceId,
      tableId: body.tableId,
      idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
    });
    return Response.json(
      {
        runId: run.id,
        status: run.status,
        outputs: run.outputs,
        error: run.error,
      },
      { status: run.status === "failed" ? 422 : 200 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Function run failed" },
      { status: 400 },
    );
  }
}
