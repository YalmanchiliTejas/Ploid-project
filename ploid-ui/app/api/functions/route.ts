import { createFunction, listFunctions } from "@/lib/functions/service";
export async function GET() {
  return Response.json({ data: listFunctions() });
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: unknown;
      description?: unknown;
      inputs?: unknown;
      outputs?: unknown;
      nodes?: unknown;
    };
    if (typeof body.name !== "string" || !body.name.trim())
      return Response.json(
        { error: "Function name is required" },
        { status: 400 },
      );
    return Response.json(
      {
        data: createFunction({
          name: body.name.trim(),
          description:
            typeof body.description === "string" ? body.description : undefined,
          inputs: Array.isArray(body.inputs) ? (body.inputs as never[]) : [],
          outputs: Array.isArray(body.outputs) ? (body.outputs as never[]) : [],
          nodes: Array.isArray(body.nodes) ? (body.nodes as never[]) : [],
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create function",
      },
      { status: 400 },
    );
  }
}
