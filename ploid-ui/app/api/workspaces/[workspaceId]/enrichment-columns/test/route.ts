import {
  enrichPerson,
  enrichSocial,
  isPloidPersonEnrichment,
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
    const field = typeof body.outputField === "string" ? body.outputField : "profile";
    const fields = Array.isArray(body.outputFields)
      ? body.outputFields.filter(isPloidPersonEnrichment)
      : isPloidPersonEnrichment(field) ? [field] : [];
    if (kind === "person" && !fields.length)
      return Response.json(
        { error: "Allowed enrichments are profile, email, and phone" },
        { status: 400 },
      );
    if (!workspace.table.columns.some((column) => column.id === inputColumnId))
      return Response.json(
        { error: "Select a valid input column" },
        { status: 400 },
      );
    const rows = workspace.table.rows.slice(0, 10);
    let enriched = 0, notFound = 0, failed = 0, providerRequests = 0;
    const outputs: Record<string, { found: number; notFound: number; failed: number }> =
      Object.fromEntries(fields.map((item) => [item, { found: 0, notFound: 0, failed: 0 }]));
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
                  enrichments: fields,
                });
          providerRequests++;
          const value =
            kind === "social"
              ? field
                ? (response as { data: { profile?: Record<string, unknown> } }).data
                    .profile?.[field]
                : (response as { data: { profile?: Record<string, unknown> } }).data.profile
              : (response as { fields: Record<string, { value: unknown | null }> }).fields[fields[0]]?.value;
          if (value === null || value === undefined || value === "") notFound++;
          else enriched++;
          if (kind === "person")
            fields.forEach((item) => {
              const result = (response as { fields: Record<string, { value: unknown | null; status: "success" | "not_found" | "failed" }> }).fields[item];
              if (result?.status === "success") outputs[item].found++;
              else if (result?.status === "failed") outputs[item].failed++;
              else outputs[item].notFound++;
            });
        } catch {
          failed++;
          if (kind === "person") fields.forEach((item) => outputs[item].failed++);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, rows.length) }, worker));
    return Response.json({ data: { enriched, notFound, failed, providerRequests, outputs } });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Test could not be run",
      },
      { status: 400 },
    );
  }
}
