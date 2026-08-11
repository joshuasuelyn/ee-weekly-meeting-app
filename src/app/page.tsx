import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { loadMeetingContext, today } from "@/lib/queries";
import { todoDueDateFor } from "@/lib/rules";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { buildRunnerData } from "./meeting/[id]/data";
import { IssueList, PriorityList, QuickIssueAdd, TodoList } from "./dashboard-lists";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ctx = await loadMeetingContext();
  const data = buildRunnerData(ctx, user, todoDueDateFor(ctx.meeting.date), today());

  const notSubmitted = ctx.users.filter(
    (u) => u.role !== "contributor" && !ctx.submissions.some((s) => s.user_id === u.id),
  );

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Next meeting · {formatDate(ctx.meeting.date)}
          </h1>
          <p className="text-(--color-muted) mt-0.5">
            Week {ctx.week} · {ctx.meeting.status}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/prep"
            className="px-4 py-2.5 rounded-xl border border-(--color-line) font-medium hover:bg-(--color-grey-bg)"
          >
            My prep
          </Link>
          <Link
            href={`/meeting/${ctx.meeting.id}`}
            className="px-4 py-2.5 rounded-xl bg-(--color-ink) text-white font-medium"
          >
            {ctx.meeting.status === "running" ? "Rejoin meeting" : "Open the runner"}
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Open to-dos"
          value={data.allOpenTodos.length}
          sub={`${ctx.overdueTodoCount} overdue`}
          tone={ctx.overdueTodoCount > 0 ? "amber" : "plain"}
        />
        <Stat
          label="Open issues"
          value={ctx.openIssues.length}
          sub={`${ctx.staleIssueCount} open 3+ weeks`}
          tone={ctx.staleIssueCount > 0 ? "off" : "plain"}
        />
        <Stat
          label="Scorecard"
          value={`${data.redCount} red`}
          sub={`${ctx.scorecard.length} lines live`}
          tone={data.redCount > 0 ? "off" : "on"}
        />
        <Stat
          label="Last completion %"
          value={ctx.previousMeeting?.completion_pct != null ? `${ctx.previousMeeting.completion_pct}%` : "—"}
          sub={ctx.previousMeeting ? formatDate(ctx.previousMeeting.date) : "no meetings yet"}
          tone={
            ctx.previousMeeting?.completion_pct != null && ctx.previousMeeting.completion_pct >= 90
              ? "on"
              : ctx.previousMeeting?.completion_pct != null
                ? "off"
                : "plain"
          }
        />
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Who's ready"
          hint="Submitted their numbers and priorities for this week. Visible to everyone."
        />
        <div className="flex flex-wrap gap-2">
          {ctx.users
            .filter((u) => u.role !== "contributor")
            .map((u) => {
              const ready = ctx.submissions.some((s) => s.user_id === u.id);
              return (
                <span
                  key={u.id}
                  className={`pill ${ready ? "bg-(--color-on-bg) text-(--color-on)" : "bg-(--color-off-bg) text-(--color-off)"}`}
                >
                  {ready ? "✓" : "○"} {u.name}
                </span>
              );
            })}
        </div>
        {notSubmitted.length > 0 ? (
          <p className="text-[0.9rem] text-(--color-muted) mt-3">
            Still to submit: {notSubmitted.map((u) => u.name).join(", ")}.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Card className="p-5">
          <SectionTitle
            title="Open to-dos"
            hint="Tick anything that's done — no need to wait for Monday."
            right={
              ctx.overdueTodoCount > 0 ? (
                <span className="pill bg-(--color-amber-bg) text-(--color-amber)">
                  {ctx.overdueTodoCount} overdue
                </span>
              ) : null
            }
          />
          <TodoList todos={data.allOpenTodos} />
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Open issues"
            hint="Oldest first, always. The oldest one is the one being avoided."
            right={
              ctx.staleIssueCount > 0 ? (
                <span className="pill bg-(--color-off-bg) text-(--color-off)">
                  {ctx.staleIssueCount} stale
                </span>
              ) : null
            }
          />
          <IssueList issues={data.openIssues} />
          <QuickIssueAdd raisedDate={today()} />
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle title="Current priorities" hint="Carried forward until closed. Nothing retyped." />
        <PriorityList priorities={data.priorities} />
      </Card>

      <p className="text-center text-[0.85rem] text-(--color-muted)">
        <Link href="/history" className="underline underline-offset-2">
          Meeting history
        </Link>
      </p>
    </div>
  );
}
