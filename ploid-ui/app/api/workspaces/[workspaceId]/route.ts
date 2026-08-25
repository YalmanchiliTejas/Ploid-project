import { getWorkspace, selectTable } from "@/lib/workspace/store";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const workspace = getWorkspace(workspaceId);
  return workspace
    ? Response.json(workspace)
    : Response.json({ error: "Workspace not found" }, { status: 404 });
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    const body = (await request.json()) as { tableId?: unknown };
    if (typeof body.tableId !== "string")
      return Response.json(
        { error: "A table ID is required" },
        { status: 400 },
      );
    return Response.json(selectTable(workspaceId, body.tableId));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to select sheet",
      },
      { status: 404 },
    );
  }
}
