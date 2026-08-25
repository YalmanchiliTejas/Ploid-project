import { deleteSchedule, updateSchedule } from "@/lib/functions/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  try {
    const { scheduleId } = await params;
    return Response.json({
      data: updateSchedule(scheduleId, await request.json()),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update schedule",
      },
      { status: 400 },
    );
  }
}
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const { scheduleId } = await params;
  return deleteSchedule(scheduleId)
    ? new Response(null, { status: 204 })
    : Response.json({ error: "Schedule not found" }, { status: 404 });
}
