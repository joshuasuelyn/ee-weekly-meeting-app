import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { formatDate, rolloutWeek } from "@/lib/dates";
import { metricsMissingTargets } from "@/lib/rules";
import { today } from "@/lib/queries";
import { Card, SectionTitle } from "@/components/ui";
import { SaveStatusBanner, UnsavedGuard } from "@/components/autosave";
import { MetricRow, PersonRow, SettingsRow } from "./rows";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "facilitator") redirect("/");

  const store = getStore();
  const [settings, metrics, users, meetings] = await Promise.all([
    store.getSettings(),
    store.listMetrics(),
    store.listUsers({ includeInactive: true }),
    store.listMeetings(),
  ]);

  const missingTargets = metricsMissingTargets(metrics);
  const currentWeek = rolloutWeek(today(), settings.rollout_start_date);

  return (
    <div className="grid gap-6">
      <UnsavedGuard />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-(--color-muted) mt-1">
          No Save button. Each field saves itself a moment after you stop typing, and shows
          &ldquo;Saved&rdquo; only once the database has confirmed it.
        </p>
        <div className="mt-2">
          <SaveStatusBanner />
        </div>
      </div>

      {/* R2: grey lines belong on a to-do list until a target is agreed. */}
      {missingTargets.length > 0 || settings.tour_window_weeks === null ? (
        <Card className="p-5 border-(--color-amber)">
          <SectionTitle
            title="Decisions still open"
            hint="These render grey rather than red. Grey means we haven't agreed the number yet."
          />
          <ul className="list-disc pl-5 text-[0.95rem]">
            {settings.tour_window_weeks === null ? (
              <li>
                <strong>X — the tour window.</strong> How many weeks before departure does an
                under-15-pax tour become actionable? Agree with the managers, then set it below.
                Line 6 reads &ldquo;within X weeks&rdquo; until you do.
              </li>
            ) : null}
            {missingTargets.map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong> has no target agreed.
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-5">
        <SectionTitle
          title="Rollout"
          hint={
            currentWeek < 1
              ? `Rollout hasn't started — week 1 begins ${formatDate(settings.rollout_start_date)}.`
              : `Today is week ${currentWeek}.`
          }
        />
        <SettingsRow
          rolloutStartDate={settings.rollout_start_date}
          tourWindowWeeks={settings.tour_window_weeks}
        />
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Scorecard lines"
          hint="Eleven lines, one owner each. A line goes live in the week you set here — before that it renders grey and is excluded from red counts."
        />
        <div className="grid gap-2">
          {metrics.map((m) => (
            <MetricRow key={m.id} metric={m} users={users} />
          ))}
        </div>
        <p className="text-[0.85rem] text-(--color-muted) mt-3">
          Line 11 is auto-calculated from the to-do review list and cannot be entered by hand.
        </p>
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="People"
          hint="Email is the sign-in identity. Correct these before the first magic link goes out — only Joshua's address is confirmed."
        />
        <div className="grid gap-2">
          {users.map((u) => (
            <PersonRow key={u.id} person={u} />
          ))}
        </div>
        <p className="text-[0.85rem] text-(--color-muted) mt-3">
          Roles are fixed in the seed. Contributors get added here when phase 3 needs them.
        </p>
      </Card>

      <Card className="p-5">
        <SectionTitle title="Export" hint="Any meeting, as markdown." />
        {meetings.length === 0 ? (
          <p className="text-(--color-muted)">No meetings yet.</p>
        ) : (
          <ul className="grid gap-1">
            {meetings.map((m) => (
              <li key={m.id}>
                <a
                  href={`/api/export/${m.id}`}
                  className="underline underline-offset-2"
                >
                  {formatDate(m.date)} — {m.status}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
