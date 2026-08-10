import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { renderDefinition } from "@/lib/db/seed-data";
import { formatDate } from "@/lib/dates";
import { loadPrep } from "@/lib/queries";
import { SaveStatusBanner, UnsavedGuard } from "@/components/autosave";
import { PrepForm } from "./prep-form";

export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const prep = await loadPrep(user);

  return (
    <div className="max-w-3xl mx-auto">
      <UnsavedGuard />
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.name}&rsquo;s prep for {formatDate(prep.meeting.date)}
        </h1>
        <p className="text-(--color-muted) mt-1">
          Week {prep.week} · five minutes, then close the tab.
        </p>
        <p className="text-(--color-muted) text-[0.9rem] mt-1">
          No Save button — what you type is stored as you go. The buttons below only add new
          lines.
        </p>
        <div className="mt-2">
          <SaveStatusBanner />
        </div>
      </header>

      <PrepForm
        meetingId={prep.meeting.id}
        meetingDate={prep.meeting.date}
        ownerId={user.id}
        department={user.department}
        metrics={prep.myMetrics.map((row) => ({
          metric: row.metric,
          value: row.value ?? "",
          lastValue: row.lastValue,
          definition: renderDefinition(row.metric.definition, prep.settings),
        }))}
        grouped={prep.grouped}
        checks={prep.checks}
        needsMonthlySetup={prep.needsMonthlySetup}
        monthDueDate={prep.monthDueDate}
        submitted={prep.submitted}
        people={prep.people}
        parentTextById={prep.parentTextById}
        alignment={prep.myAlignment}
        closed={prep.myClosed}
        issues={prep.myIssues.map((i) => ({ id: i.id, text: i.text, raisedDate: i.raised_date }))}
        segue={prep.mySegue}
        segueQuestion={prep.segueQuestion}
      />
    </div>
  );
}
