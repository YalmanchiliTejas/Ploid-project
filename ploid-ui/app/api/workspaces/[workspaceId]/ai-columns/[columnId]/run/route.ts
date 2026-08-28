import { runBoundColumn } from "@/lib/functions/service";

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
    if (process.env.NODE_ENV !== "production")
      console.info("[Column run] received", {
        workspaceId,
        columnId,
        limit,
        rowCount: rowIds?.length,
      });
    // Keep the request alive while the column runs. A detached promise can be
    // discarded as soon as a serverless request returns its 202 response,
    // leaving the run permanently queued with no row events.
    const rows = await runBoundColumn(workspaceId, columnId, { rowIds, limit });
    if (process.env.NODE_ENV !== "production")
      console.info("[Column run] completed", { workspaceId, columnId });
    return Response.json({ status: "complete", rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI column run failed";
    return Response.json(
      {
        error: message,
      },
      { status: 400 },
    );
  }
}
