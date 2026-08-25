import { getRun } from "@/lib/functions/service";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = getRun(runId);
  return run
    ? Response.json({ data: run })
    : Response.json({ error: "Run not found" }, { status: 404 });
}
