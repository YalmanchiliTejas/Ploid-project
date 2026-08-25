import { createSchedule } from "@/lib/functions/service";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ functionId: string }> },
) {
  try {
    const { functionId } = await params;
    const body = (await request.json()) as {
      cronExpression?: string;
      timezone?: string;
      workspaceId?: string;
      tableId?: string;
      enabled?: boolean;
      scope?: "all" | "missing" | "stale";
    };
    return Response.json(
      {
        data: createSchedule({
          functionId,
          cronExpression: body.cronExpression ?? "0 9 * * 1-5",
          timezone: body.timezone ?? "America/Los_Angeles",
          workspaceId: body.workspaceId,
          tableId: body.tableId,
          enabled: body.enabled ?? true,
          scope: body.scope ?? "missing",
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to schedule function",
      },
      { status: 400 },
    );
  }
}
