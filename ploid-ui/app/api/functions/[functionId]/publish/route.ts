import { publishFunction } from "@/lib/functions/service";
export async function POST(
  _: Request,
  { params }: { params: Promise<{ functionId: string }> },
) {
  try {
    const { functionId } = await params;
    return Response.json({ data: publishFunction(functionId) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to publish function",
      },
      { status: 404 },
    );
  }
}
