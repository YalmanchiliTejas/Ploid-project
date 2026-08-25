import { getFunction, updateFunction } from "@/lib/functions/service";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ functionId: string }> },
) {
  const { functionId } = await params;
  const fn = getFunction(functionId);
  return fn
    ? Response.json({ data: fn })
    : Response.json({ error: "Function not found" }, { status: 404 });
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ functionId: string }> },
) {
  try {
    const { functionId } = await params;
    return Response.json({
      data: updateFunction(functionId, await request.json()),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update function",
      },
      { status: 400 },
    );
  }
}
