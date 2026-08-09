import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { formatDate, rolloutWeek } from "@/lib/dates";
import { metricsMissingTargets } from "@/lib/rules";
import { today } from "@/lib/queries";
import { Card, SectionTitle } from "@/components/ui";
import { saveMetric, saveSettings, saveUser } from "@/app/actions";

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
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

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
        <form action={saveSettings} className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="rollout" className="text-[0.85rem] font-medium block mb-1">
              Week 1 starts (Monday)
            </label>
            <input
              id="rollout"
              type="date"
              name="rollout_start_date"
              defaultValue={settings.rollout_start_date}
              className="px-3 py-2 rounded-xl border border-(--color-line)"
            />
          </div>
          <div>
            <label htmlFor="x" className="text-[0.85rem] font-medium block mb-1">
              X — tour window (weeks)
            </label>
            <input
              id="x"
              type="number"
              min={1}
              name="tour_window_weeks"
              defaultValue={settings.tour_window_weeks ?? ""}
              placeholder="not agreed"
              className="w-40 px-3 py-2 rounded-xl border border-(--color-line)"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-(--color-ink) text-white font-medium"
          >
            Save
          </button>
        </form>
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Scorecard lines"
          hint="Eleven lines, one owner each. A line goes live in the week you set here — before that it renders grey and is excluded from red counts."
        />
        <div className="grid gap-2">
          {metrics.map((m) => (
            <form
              key={m.id}
              action={saveMetric}
              className="flex flex-wrap gap-2 items-center py-2 border-b border-(--color-line) last:border-0"
            >
              <input type="hidden" name="id" value={m.id} />
              <span className="w-6 text-(--color-muted) tabular-nums text-[0.85rem]">
                {m.sort_order}
              </span>
              <input
                name="name"
                defaultValue={m.name}
                aria-label="Metric name"
                className="flex-1 min-w-[13rem] px-3 py-2 rounded-xl border border-(--color-line)"
              />
              <select
                name="owner_id"
                defaultValue={m.owner_id}
                aria-label="Owner"
                className="px-3 py-2 rounded-xl border border-(--color-line) bg-(--color-panel)"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <span className="text-(--color-muted) text-[0.9rem] w-6 text-center">
                {m.direction === "gte" ? "≥" : m.direction === "lte" ? "≤" : "y/n"}
              </span>
              <input
                name="target"
                defaultValue={m.target ?? ""}
                placeholder="TBC"
                aria-label="Target"
                className="w-24 px-3 py-2 rounded-xl border border-(--color-line) text-right"
              />
              <input
                name="unit"
                defaultValue={m.unit}
                placeholder="unit"
                aria-label="Unit"
                className="w-20 px-3 py-2 rounded-xl border border-(--color-line)"
              />
              <label className="text-[0.85rem] text-(--color-muted)">
                live W
                <input
                  name="live_from_week"
                  type="number"
                  min={1}
                  defaultValue={m.live_from_week}
                  aria-label="Live from week"
                  className="w-16 ml-1 px-2 py-2 rounded-xl border border-(--color-line)"
                />
              </label>
              <label className="text-[0.85rem] text-(--color-muted) flex items-center gap-1.5">
                <input type="checkbox" name="active" defaultChecked={m.active} className="size-4" />
                active
              </label>
              <button
                type="submit"
                className="px-3 py-2 rounded-xl border border-(--color-line) font-medium"
              >
                Save
              </button>
            </form>
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
            <form
              key={u.id}
              action={saveUser}
              className="flex flex-wrap gap-2 items-center py-2 border-b border-(--color-line) last:border-0"
            >
              <input type="hidden" name="id" value={u.id} />
              <input
                name="name"
                defaultValue={u.name}
                aria-label="Name"
                className="w-36 px-3 py-2 rounded-xl border border-(--color-line)"
              />
              <input
                name="email"
                type="email"
                defaultValue={u.email}
                aria-label="Email"
                className="flex-1 min-w-[15rem] px-3 py-2 rounded-xl border border-(--color-line)"
              />
              <input
                name="department"
                defaultValue={u.department}
                aria-label="Department"
                className="w-40 px-3 py-2 rounded-xl border border-(--color-line)"
              />
              <span className="text-[0.85rem] text-(--color-muted) w-24 capitalize">{u.role}</span>
              <label className="text-[0.85rem] text-(--color-muted) flex items-center gap-1.5">
                <input type="checkbox" name="active" defaultChecked={u.active} className="size-4" />
                active
              </label>
              <button
                type="submit"
                className="px-3 py-2 rounded-xl border border-(--color-line) font-medium"
              >
                Save
              </button>
            </form>
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
