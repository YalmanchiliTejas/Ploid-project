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
    const startedAt = performance.now();
    const logTiming = (label: string) => {
      if (process.env.NODE_ENV !== "production")
        console.info(`[Ploid timing] ${label} ${Math.round(performance.now() - startedAt)}ms`);
    };
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
    logTiming("request started");
    emitWorkspaceEvent(newEvent(workspaceId, "agent.activity", { text: "Researching sources and structuring the results" }));
    let sawActivity = false;
    let sawTextDelta = false;
    const result = await runWorkspaceAgent(workspace, body.prompt.trim(), {
      onEvent: (event) => {
        if (!sawActivity) {
          sawActivity = true;
          logTiming("first SSE event");
        }
        if (!sawTextDelta && /delta|text|output/i.test(event.type)) {
          sawTextDelta = true;
          logTiming("first text delta");
        }
        if (event.text)
          emitWorkspaceEvent(newEvent(workspaceId, "agent.activity", { text: event.text }));
      },
    });
    logTiming("structured output received");
    if (process.env.NODE_ENV !== "production")
      console.info(`[Ploid timing] normalize ${Math.round(result.normalizationMs ?? 0)}ms`);
    if (result.operations.length) {
      const tableStartedAt = performance.now();
      TableService.applyOperations(workspaceId, result.operations);
      if (process.env.NODE_ENV !== "production")
        console.info(`[Ploid timing] TableService ${Math.round(performance.now() - tableStartedAt)}ms`);
    }
    if (result.structuredOutputError) {
      console.error("Ploid structured-output validation failed", {
        workspaceId,
        error: result.structuredOutputError,
        requestId: result.turn.requestId,
      });
      emitWorkspaceEvent(
        newEvent(workspaceId, "agent.structured_output_failed", {
          text: result.structuredOutputError,
        }),
      );
    }
    workspace.agentTurns.push(result.turn);
    if (result.sessionId) workspace.ploidSessionId = result.sessionId;
    workspace.messages.push({
      id: `message_${crypto.randomUUID()}`,
      role: "assistant",
      content: result.turn.output,
      createdAt: new Date().toISOString(),
    });
    if (result.structuredOutputError)
      workspace.messages.push({
        id: `message_${crypto.randomUUID()}`,
        role: "assistant",
        content: `Table changes were not applied: ${result.structuredOutputError}. You can retry this request.`,
        createdAt: new Date().toISOString(),
      });
    const databaseStartedAt = performance.now();
    saveWorkspace(workspace);
    if (process.env.NODE_ENV !== "production")
      console.info(`[Ploid timing] database write ${Math.round(performance.now() - databaseStartedAt)}ms`);
    emitWorkspaceEvent(
      newEvent(workspaceId, "agent.completed", { message: result.turn.output }),
    );
    logTiming("request complete");
    return Response.json({
      message: result.turn.output,
      operations: result.operations,
      ...(result.structuredOutputError
        ? { structuredOutputError: result.structuredOutputError }
        : {}),
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
