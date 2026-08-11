import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { applyCarryForwardFor, loadMeetingContext, today } from "@/lib/queries";
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
  //
  // Reloaded only when something actually carried. Carry-forward changes nothing on almost
  // every load — the same meeting is opened many times a morning — and rebuilding the whole
  // context for a no-op doubled the queries behind every click in the runner.
  const first = await loadMeetingContext(id);
  const carried = await applyCarryForwardFor(first.meeting);

  const ctx = carried ? await loadMeetingContext(first.meeting.id) : first;
  const data = buildRunnerData(ctx, user, todoDueDateFor(ctx.meeting.date), today());

  return <Runner data={data} />;
}
