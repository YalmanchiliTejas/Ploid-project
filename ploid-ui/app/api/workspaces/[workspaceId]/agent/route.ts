import { runWorkspaceAgent } from "@/lib/ploid/agent";
import { TableService } from "@/lib/table/service";
import {
  emitWorkspaceEvent,
  getWorkspace,
  newEvent,
  saveWorkspace,
} from "@/lib/workspace/store";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    const body = (await request.json()) as { prompt?: unknown };
    if (typeof body.prompt !== "string" || !body.prompt.trim())
      return Response.json({ error: "A prompt is required" }, { status: 400 });
    const workspace = getWorkspace(workspaceId);
    if (!workspace)
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    workspace.messages.push({
      id: `message_${crypto.randomUUID()}`,
      role: "user",
      content: body.prompt.trim(),
      createdAt: new Date().toISOString(),
    });
    saveWorkspace(workspace);
    emitWorkspaceEvent(newEvent(workspaceId, "agent.started"));
    emitWorkspaceEvent(
      newEvent(workspaceId, "agent.activity", {
        text: "Ploid Agent is preparing workspace research",
      }),
    );
    const result = await runWorkspaceAgent(workspace, body.prompt.trim());
    if (result.operations.length)
      TableService.applyOperations(workspaceId, result.operations);
    workspace.messages.push({
      id: `message_${crypto.randomUUID()}`,
      role: "assistant",
      content: result.message,
      createdAt: new Date().toISOString(),
    });
    saveWorkspace(workspace);
    emitWorkspaceEvent(
      newEvent(workspaceId, "agent.completed", { message: result.message }),
    );
    return Response.json({
      message: result.message,
      operations: result.operations,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Agent request failed",
      },
      { status: 502 },
    );
  }
}
