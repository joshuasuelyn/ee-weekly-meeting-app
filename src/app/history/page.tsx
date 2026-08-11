import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { COMPLETION_TARGET } from "@/lib/rules";
import { today } from "@/lib/queries";
import { Card, Empty, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  if (!(await getCurrentUser())) redirect("/login");

  const store = getStore();
  const [meetings, todos, issues] = await Promise.all([
    store.listMeetings(),
    store.listTodos(),
    store.listIssues(),
  ]);

  const closed = meetings.filter((m) => m.status === "closed");
  const todayDate = today();

  return (
    <div className="max-w-4xl mx-auto">
      <SectionTitle
        title="History"
        hint="Completion % is the health metric for the whole system. Watch this column, not the individual numbers."
      />

      {meetings.length === 0 ? (
        <Empty>No meetings yet.</Empty>
      ) : (
        <Card className="p-5">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[0.8rem] uppercase tracking-wide text-(--color-muted)">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Completion</th>
                <th className="py-2 px-3 font-medium">Rating</th>
                <th className="py-2 px-3 font-medium">To-dos created</th>
                <th className="py-2 px-3 font-medium">Issues solved</th>
                <th className="py-2 pl-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => {
                const created = todos.filter((t) => t.created_meeting_id === m.id).length;
                const solved = issues.filter((i) => i.solved_meeting_id === m.id).length;
                const hit = m.completion_pct != null && m.completion_pct >= COMPLETION_TARGET;
                return (
                  <tr key={m.id} className="border-t border-(--color-line)">
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <Link href={`/meeting/${m.id}`} className="underline underline-offset-2">
                        {formatDate(m.date)}
                      </Link>
                    </td>
                    {/* A meeting in the past that was never closed has no locked completion
                        percentage and no rating in the record. The week rolls past it on its
                        own now, so it costs nothing — but it should not look finished. */}
                    <td
                      className={`py-2.5 px-3 ${
                        m.status !== "closed" && m.date < todayDate
                          ? "text-(--color-amber) font-medium"
                          : "text-(--color-muted)"
                      }`}
                      title={
                        m.status !== "closed" && m.date < todayDate
                          ? "Never closed — open it to finish and lock in the week's numbers"
                          : undefined
                      }
                    >
                      {m.status !== "closed" && m.date < todayDate ? "not closed" : m.status}
                    </td>
                    <td
                      className={`py-2.5 px-3 tabular-nums font-semibold ${
                        m.completion_pct == null
                          ? "text-(--color-muted)"
                          : hit
                            ? "text-(--color-on)"
                            : "text-(--color-off)"
                      }`}
                    >
                      {m.completion_pct == null ? "—" : `${m.completion_pct}%`}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">{m.rating_avg ?? "—"}</td>
                    <td className="py-2.5 px-3 tabular-nums">{created}</td>
                    <td className="py-2.5 px-3 tabular-nums">{solved}</td>
                    <td className="py-2.5 pl-3">
                      <a
                        href={`/api/export/${m.id}`}
                        className="text-[0.9rem] underline underline-offset-2 whitespace-nowrap"
                      >
                        Export .md
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {closed.length > 0 ? (
        <p className="text-[0.9rem] text-(--color-muted) mt-4">
          {closed.length} meeting{closed.length === 1 ? "" : "s"} closed. The completion-%
          trend chart arrives in phase 2.
        </p>
      ) : null}
    </div>
  );
}
