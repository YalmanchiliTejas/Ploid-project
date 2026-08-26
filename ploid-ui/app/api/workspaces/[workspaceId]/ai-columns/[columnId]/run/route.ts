import { runBoundColumn } from "@/lib/functions/service";
import { emitWorkspaceEvent, newEvent } from "@/lib/workspace/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; columnId: string }> },
) {
  try {
    const { workspaceId, columnId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      rowIds?: unknown;
      limit?: unknown;
    };
    const rowIds = Array.isArray(body.rowIds)
      ? body.rowIds.filter((id): id is string => typeof id === "string")
      : undefined;
    const limit =
      typeof body.limit === "number" && body.limit > 0 ? body.limit : undefined;
    // This endpoint intentionally queues work and returns 202. Always handle
    // the detached promise: otherwise a provider/TableService failure becomes
    // an uncaught Next.js exception and masks the real error with a dev-overlay
    // CodeFrameColorMode message.
    void runBoundColumn(workspaceId, columnId, { rowIds, limit }).catch(
      (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "AI column run failed";
        if (process.env.NODE_ENV !== "production")
          console.error("[AI column run failed]", {
            workspaceId,
            columnId,
            message,
          });
        emitWorkspaceEvent(
          newEvent(workspaceId, "ai-column.run.failed", {
            columnId,
            text: message,
          }),
        );
      },
    );
    return Response.json({ status: "queued" }, { status: 202 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to run AI column",
      },
      { status: 400 },
    );
  }
}
