import { createWorkspace, listWorkspaces } from "@/lib/workspace/store";
export async function GET() {
  return Response.json({ data: listWorkspaces() });
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown; kind?: unknown };
    if (typeof body.name !== "string" || !body.name.trim())
      return Response.json(
        { error: "A worksheet name is required" },
        { status: 400 },
      );
    if (
      body.kind !== "people" &&
      body.kind !== "companies" &&
      body.kind !== "markets"
    )
      return Response.json(
        { error: "Choose people, companies, or markets" },
        { status: 400 },
      );
    return Response.json(
      createWorkspace({ name: body.name.trim(), kind: body.kind }),
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create workspace",
      },
      { status: 400 },
    );
  }
}
