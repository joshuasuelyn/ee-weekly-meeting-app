import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { applyCarryForwardFor, loadMeetingContext } from "@/lib/queries";
import { todoDueDateFor } from "@/lib/rules";
import { buildRunnerData } from "./data";
import { Runner } from "./runner";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  // R6 runs on load rather than behind a button, so an overdue to-do has already carried
  // itself by the time anyone looks at the list. Idempotent, so a refresh is harmless.
  const first = await loadMeetingContext(id);
  await applyCarryForwardFor(first.meeting);

  const ctx = await loadMeetingContext(first.meeting.id);
  const data = buildRunnerData(ctx, user, todoDueDateFor(ctx.meeting.date));

  return <Runner data={data} />;
}
