import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { renderDefinition } from "@/lib/db/seed-data";
import { formatDate } from "@/lib/dates";
import { loadPrep } from "@/lib/queries";
import { todoDueDateFor } from "@/lib/rules";
import { Card, SectionTitle } from "@/components/ui";
import { createPriority } from "@/app/actions";
import { PrepForm } from "./prep-form";

export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const prep = await loadPrep(user);

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.name}&rsquo;s prep for {formatDate(prep.meeting.date)}
        </h1>
        <p className="text-(--color-muted) mt-1">
          Week {prep.week} · five minutes, then close the tab.
        </p>
      </header>

      <PrepForm
        meetingId={prep.meeting.id}
        meetingDate={prep.meeting.date}
        metrics={prep.myMetrics.map((row) => ({
          metric: row.metric,
          value: row.value ?? "",
          lastValue: row.lastValue,
          definition: renderDefinition(row.metric.definition, prep.settings),
        }))}
        priorities={prep.myPriorities.map((p) => ({
          priority: p,
          onTrack: prep.checks.get(p.id) ?? null,
        }))}
        checks={prep.myPriorities.filter((p) => prep.checks.get(p.id) != null).length}
        submitted={prep.submitted}
      />

      <Card className="p-5 mt-6">
        <SectionTitle
          title="Declare a priority"
          hint="Weekly or monthly. It carries itself forward until you close it."
        />
        <form action={createPriority} className="flex flex-wrap gap-3 items-end">
          <input type="hidden" name="owner_id" value={user.id} />
          <div className="flex-1 min-w-[16rem]">
            <label htmlFor="p-text" className="text-[0.85rem] font-medium block mb-1">
              What
            </label>
            <input
              id="p-text"
              name="text"
              required
              placeholder="Sign the Rome hotel contract"
              className="w-full px-3 py-2 rounded-xl border border-(--color-line)"
            />
          </div>
          <div>
            <label htmlFor="p-horizon" className="text-[0.85rem] font-medium block mb-1">
              Horizon
            </label>
            <select
              id="p-horizon"
              name="horizon"
              defaultValue="week"
              className="px-3 py-2 rounded-xl border border-(--color-line) bg-(--color-panel)"
            >
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </div>
          <div>
            <label htmlFor="p-due" className="text-[0.85rem] font-medium block mb-1">
              Due
            </label>
            <input
              id="p-due"
              type="date"
              name="due_date"
              defaultValue={todoDueDateFor(prep.meeting.date)}
              className="px-3 py-2 rounded-xl border border-(--color-line)"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl border border-(--color-line) font-medium hover:bg-(--color-grey-bg)"
          >
            Add
          </button>
        </form>
      </Card>
    </div>
  );
}
