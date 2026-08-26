import {
  enrichPerson,
  enrichSocial,
  type PloidSocialPlatform,
} from "@/lib/ploid/client";
import { getWorkspace } from "@/lib/workspace/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    const workspace = getWorkspace(workspaceId);
    if (!workspace)
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    const inputColumnId =
      typeof body.inputColumnId === "string" ? body.inputColumnId : "";
    const kind = body.kind === "social" ? "social" : "person";
    const platform = body.platform as PloidSocialPlatform;
    const field =
      typeof body.outputField === "string" ? body.outputField : "profile";
    if (!workspace.table.columns.some((column) => column.id === inputColumnId))
      return Response.json(
        { error: "Select a valid input column" },
        { status: 400 },
      );
    const rows = workspace.table.rows.slice(0, 10);
    let enriched = 0,
      notFound = 0,
      failed = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        const identity = String(row.cells[inputColumnId] ?? "").trim();
        if (!identity) {
          notFound++;
          continue;
        }
        try {
          const response =
            kind === "social"
              ? await enrichSocial({ platform, identifier: identity })
              : await enrichPerson({
                  linkedinUrl: identity,
                  enrichments: [
                    field === "email" || field === "phone" ? field : "profile",
                  ],
                });
          const resolved = response as {
            data:
              { profile?: Record<string, unknown> } | Record<string, unknown>;
          };
          const value =
            kind === "social"
              ? field
                ? (resolved.data as { profile?: Record<string, unknown> })
                    .profile?.[field]
                : (resolved.data as { profile?: Record<string, unknown> })
                    .profile
              : (resolved.data as Record<string, unknown>)[field];
          if (value === null || value === undefined || value === "") notFound++;
          else enriched++;
        } catch {
          failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, rows.length) }, worker));
    return Response.json({ data: { enriched, notFound, failed } });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Test could not be run",
      },
      { status: 400 },
    );
  }
}
