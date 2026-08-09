import { getCurrentUser } from "@/lib/auth";
import { meetingToMarkdown } from "@/lib/export";
import { loadMeetingContext } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) {
    return new Response("Not signed in", { status: 401 });
  }

  const { id } = await params;
  const ctx = await loadMeetingContext(id);

  return new Response(meetingToMarkdown(ctx), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="ee-weekly-${ctx.meeting.date}.md"`,
    },
  });
}
