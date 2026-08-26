import { addTable, renameTable } from "@/lib/workspace/store";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    const body = (await request.json()) as { name?: unknown };
    if (typeof body.name !== "string" || !body.name.trim())
      return Response.json(
        { error: "A sheet name is required" },
        { status: 400 },
      );
    return Response.json(addTable(workspaceId, body.name.trim()), {
      status: 201,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to add sheet" },
      { status: 400 },
    );
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    const body = (await request.json()) as { tableId?: unknown; name?: unknown };
    if (typeof body.tableId !== "string" || typeof body.name !== "string" || !body.name.trim())
      return Response.json({ error: "A sheet name is required" }, { status: 400 });
    return Response.json(renameTable(workspaceId, body.tableId, body.name.trim()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to rename sheet" }, { status: 400 });
  }
}
