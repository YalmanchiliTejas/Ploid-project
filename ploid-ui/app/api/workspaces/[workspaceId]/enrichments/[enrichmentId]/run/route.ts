import { runEnrichment, type EnrichmentRunScope } from "@/lib/functions/service";

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string; enrichmentId: string }> }) {
  try {
    const { workspaceId, enrichmentId } = await params;
    const body = await request.json().catch(() => ({})) as { scope?: EnrichmentRunScope; rowIds?: string[] };
    const scope: EnrichmentRunScope = ["all", "missing", "stale", "failed", "test", "selected"].includes(body.scope ?? "") ? body.scope! : "all";
    const rows = await runEnrichment(workspaceId, enrichmentId, { scope, rowIds: Array.isArray(body.rowIds) ? body.rowIds : undefined });
    return Response.json({ data: { rows } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to run enrichment" }, { status: 400 });
  }
}
