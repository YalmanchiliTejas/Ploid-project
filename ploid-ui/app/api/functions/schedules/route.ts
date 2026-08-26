import { listSchedules } from "@/lib/functions/service";

export async function GET() {
  return Response.json({ data: listSchedules() });
}
