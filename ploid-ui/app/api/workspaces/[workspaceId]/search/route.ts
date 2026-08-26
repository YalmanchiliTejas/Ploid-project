import { z } from "zod";
import { searchPeople } from "@/lib/ploid/search";
import { TableService } from "@/lib/table/service";
import { emitWorkspaceEvent, getWorkspace, newEvent, saveWorkspace } from "@/lib/workspace/store";

const searchRequestSchema = z.object({
  query: z.string().min(1).max(4000),
  type: z.enum(["instant", "auto", "deep"]).optional(),
  category: z.literal("people").optional(),
  num_results: z.number().int().min(1).max(100).optional(),
  filters: z.object({ title: z.string().optional(), company: z.string().optional(), location: z.string().optional() }).optional(),
  contents: z.object({ fields: z.array(z.enum(["linkedin", "title", "company", "location", "name"])).optional() }).optional(),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    if (!getWorkspace(workspaceId))
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    const input = searchRequestSchema.parse(await request.json());
    const normalized = await searchPeople({ ...input, category: "people" });
    TableService.addPeopleSearchRows(workspaceId, normalized.rows);
    const workspace = getWorkspace(workspaceId)!;
    workspace.peopleSearches.push({
      id: `people_search_${crypto.randomUUID()}`,
      rows: normalized.rows,
      ...(normalized.warning ? { warning: normalized.warning } : {}),
      ...(normalized.requestId ? { requestId: normalized.requestId } : {}),
      createdAt: new Date().toISOString(),
    });
    if (normalized.warning) {
      const notice = {
        id: `notice_${crypto.randomUUID()}`,
        level: "warning" as const,
        message: `Ploid returned partial people-search results: ${normalized.warning}.`,
        ...(normalized.requestId ? { requestId: normalized.requestId } : {}),
        createdAt: new Date().toISOString(),
      };
      workspace.notices.push(notice);
      emitWorkspaceEvent(newEvent(workspaceId, "search.warning", { text: notice.message }));
    }
    saveWorkspace(workspace);
    emitWorkspaceEvent(newEvent(workspaceId, "search.completed", { rows: normalized.rows.length }));
    return Response.json({ rows: normalized.rows, warning: normalized.warning, requestId: normalized.requestId });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "People search failed" },
      { status: error instanceof z.ZodError ? 400 : 502 },
    );
  }
}
