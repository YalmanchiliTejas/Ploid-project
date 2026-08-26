import { TableService } from "@/lib/table/service";
import type { TableOperation } from "@/lib/workspace/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    const body = (await request.json()) as { operations?: unknown };
    if (!Array.isArray(body.operations))
      return Response.json({ error: "operations must be an array" }, { status: 400 });
    return Response.json(
      TableService.applyOperations(workspaceId, body.operations as TableOperation[]),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to apply operations" },
      { status: 400 },
    );
  }
}
