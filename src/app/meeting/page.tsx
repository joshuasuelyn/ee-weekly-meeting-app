import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateCurrentMeeting } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** /meeting always lands on whichever meeting is currently open. */
export default async function MeetingIndex() {
  if (!(await getCurrentUser())) redirect("/login");
  const meeting = await getOrCreateCurrentMeeting();
  redirect(`/meeting/${meeting.id}`);
}
