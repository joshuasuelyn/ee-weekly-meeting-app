"use client";

import { useMemo, useState, useTransition } from "react";
import { SaveDot, useAutosave } from "@/components/autosave";
import { CarryBadge, Empty, SectionTitle, StatePill } from "@/components/ui";
import {
  addIssues,
  createIssueFromMetric,
  createIssueFromPriority,
  closeMeeting,
  dropIssue,
  setCascadingMessages,
  setHeadline,
  setMetricValue,
  setPriorityCheck,
  setPriorityStatus,
  setRating,
  setSegue,
  setTodoStatus,
  solveIssue,
  toggleIssuePick,
} from "@/app/actions";
import { COMPLETION_TARGET, MAX_ISSUES_PER_MEETING, splitBrainDump } from "@/lib/rules";
import { formatShortDate } from "@/lib/dates";
import type { RunnerData, RunnerIssue, RunnerPerson, RunnerScorecardRow } from "./data";
import { TodoComposer } from "./todo-composer";

// ---------------------------------------------------------------------------
// 1 · Segue
// ---------------------------------------------------------------------------

function SegueRow({
  meetingId,
  person,
  initial,
}: {
  meetingId: string;
  person: RunnerPerson;
  initial: { personal: string; professional: string };
}) {
  const { value, update, state } = useAutosave(initial, (v) =>
    setSegue(meetingId, person.id, v.personal, v.professional),
  );

  return (
    <div className="grid gap-2 md:grid-cols-[8rem_1fr_1fr] items-center py-3 border-b border-(--color-line) last:border-0">
      <div className="font-medium">
        {person.name}
        <div className="text-[0.8rem] text-(--color-muted) font-normal">{person.department}</div>
      </div>
      <input
        value={value.personal}
        onChange={(e) => update({ ...value, personal: e.target.value })}
        placeholder="Personal best"
        aria-label={`${person.name} personal best`}
        className="px-3 py-2 rounded-xl border border-(--color-line)"
      />
      <div className="flex items-center gap-2">
        <input
          value={value.professional}
          onChange={(e) => update({ ...value, professional: e.target.value })}
          placeholder="Professional best"
          aria-label={`${person.name} professional best`}
          className="flex-1 px-3 py-2 rounded-xl border border-(--color-line)"
        />
        <span className="w-16 shrink-0">
          <SaveDot state={state} />
        </span>
      </div>
    </div>
  );
}

export function SegueSection({ data }: { data: RunnerData }) {
  return (
    <>
      <SectionTitle title="Segue" hint="One personal best and one professional best. One line each." />
      {data.people.map((p) => (
        <SegueRow
          key={p.id}
          meetingId={data.meeting.id}
          person={p}
          initial={data.segues[p.id] ?? { personal: "", professional: "" }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// 2 · Scorecard
// ---------------------------------------------------------------------------

function ScorecardValue({
  meetingId,
  row,
  editable,
}: {
  meetingId: string;
  row: RunnerScorecardRow;
  editable: boolean;
}) {
  const { value, update, state } = useAutosave(row.value, (v) =>
    setMetricValue(meetingId, row.metricId, v),
  );

  if (row.readOnly) {
    return (
      <span className="tabular-nums text-lg font-semibold" title="Calculated, not entered (R7)">
        {row.value === "" ? "—" : row.value}
      </span>
    );
  }

  if (!editable) {
    return (
      <span className="tabular-nums text-lg font-semibold">{row.value === "" ? "—" : row.value}</span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input
        type={row.isYesNo ? "text" : "number"}
        step="any"
        value={value}
        onChange={(e) => update(e.target.value)}
        aria-label={`${row.name} value`}
        className={`w-24 px-2 py-1.5 rounded-lg border text-right text-lg ${
          value.trim() === "" ? "border-(--color-off) bg-(--color-off-bg)" : "border-(--color-line)"
        }`}
      />
      <span className="w-14 shrink-0">
        <SaveDot state={state} />
      </span>
    </span>
  );
}

export function ScorecardSection({ data }: { data: RunnerData }) {
  const [, startTransition] = useTransition();
  const [routed, setRouted] = useState<Record<string, boolean>>({});

  return (
    <>
      <SectionTitle
        title="Scorecard"
        hint="Read the numbers. On or off track, nothing in between. Anything off drops to Issues."
        right={
          <span
            className={`pill ${data.redCount > 0 ? "bg-(--color-off-bg) text-(--color-off)" : "bg-(--color-on-bg) text-(--color-on)"}`}
          >
            {data.redCount} off track
          </span>
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[0.8rem] uppercase tracking-wide text-(--color-muted)">
              <th className="py-2 pr-3 font-medium">Metric</th>
              <th className="py-2 px-3 font-medium">Owner</th>
              <th className="py-2 px-3 font-medium">Target</th>
              <th className="py-2 px-3 font-medium">Last</th>
              <th className="py-2 px-3 font-medium">This week</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 pl-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.scorecard.map((row) => {
              const editable = data.isFacilitator || row.ownerId === data.currentUserId;
              return (
                <tr
                  key={row.metricId}
                  className={`border-t border-(--color-line) ${row.countsAsRed ? "bg-(--color-off-bg)/40" : ""}`}
                >
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{row.name}</span>
                    <div className="text-[0.8rem] text-(--color-muted)">{row.definition}</div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{row.ownerName}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">{row.targetLabel}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-(--color-muted)">
                    {row.lastValue ?? "—"}
                  </td>
                  <td className="py-2.5 px-3">
                    <ScorecardValue meetingId={data.meeting.id} row={row} editable={editable} />
                  </td>
                  <td className="py-2.5 px-3">
                    <StatePill state={row.state} />
                    <div className="text-[0.78rem] text-(--color-muted) mt-0.5">{row.reason}</div>
                  </td>
                  <td className="py-2.5 pl-3">
                    {row.countsAsRed ? (
                      <button
                        type="button"
                        disabled={routed[row.metricId]}
                        onClick={() => {
                          setRouted((r) => ({ ...r, [row.metricId]: true }));
                          startTransition(
                            () => void createIssueFromMetric(data.meeting.id, row.metricId),
                          );
                        }}
                        className="px-3 py-1.5 rounded-lg border border-(--color-off) text-(--color-off) font-medium whitespace-nowrap disabled:opacity-40"
                      >
                        {routed[row.metricId] ? "→ Added" : "→ Issue"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3 · Priorities
// ---------------------------------------------------------------------------

export function PrioritiesSection({ data }: { data: RunnerData }) {
  const [, startTransition] = useTransition();
  const [checks, setChecks] = useState<Record<string, boolean | null>>(
    Object.fromEntries(data.priorities.map((p) => [p.id, p.onTrack])),
  );
  const [routed, setRouted] = useState<Record<string, boolean>>({});

  const byOwner = useMemo(() => {
    const groups = new Map<string, typeof data.priorities>();
    for (const p of data.priorities) {
      const list = groups.get(p.ownerName) ?? [];
      list.push(p);
      groups.set(p.ownerName, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data.priorities]);

  function choose(id: string, next: boolean) {
    setChecks((c) => ({ ...c, [id]: next }));
    startTransition(() => void setPriorityCheck(data.meeting.id, id, next));
  }

  return (
    <>
      <SectionTitle
        title="Priorities"
        hint="On or off. No discussion here — anything off track goes to Issues."
      />

      {data.priorities.length === 0 ? (
        <Empty>No open priorities. Managers declare them on their prep screen.</Empty>
      ) : (
        byOwner.map(([owner, list]) => (
          <div key={owner} className="mb-5">
            <h3 className="font-semibold text-[0.95rem] mb-1">{owner}</h3>
            {list.map((p) => {
              const onTrack = checks[p.id];
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0"
                >
                  <div className="flex-1 min-w-[14rem]">
                    <p>{p.text}</p>
                    <p className="text-[0.8rem] text-(--color-muted) capitalize">
                      {p.horizon}ly · due {formatShortDate(p.dueDate)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => choose(p.id, true)}
                      className={`px-3.5 py-1.5 rounded-lg border font-medium ${
                        onTrack === true
                          ? "bg-(--color-on-bg) text-(--color-on) border-(--color-on)"
                          : "border-(--color-line)"
                      }`}
                    >
                      On
                    </button>
                    <button
                      type="button"
                      onClick={() => choose(p.id, false)}
                      className={`px-3.5 py-1.5 rounded-lg border font-medium ${
                        onTrack === false
                          ? "bg-(--color-off-bg) text-(--color-off) border-(--color-off)"
                          : "border-(--color-line)"
                      }`}
                    >
                      Off
                    </button>
                    {onTrack === false ? (
                      <button
                        type="button"
                        disabled={routed[p.id]}
                        onClick={() => {
                          setRouted((r) => ({ ...r, [p.id]: true }));
                          startTransition(
                            () => void createIssueFromPriority(p.id, data.meeting.date),
                          );
                        }}
                        className="px-3 py-1.5 rounded-lg border border-(--color-off) text-(--color-off) font-medium disabled:opacity-40"
                      >
                        {routed[p.id] ? "→ Added" : "→ Issue"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => startTransition(() => void setPriorityStatus(p.id, "done"))}
                      className="px-3 py-1.5 rounded-lg border border-(--color-line) text-(--color-muted)"
                      title="Close this priority"
                    >
                      Done
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 4 · Headlines
// ---------------------------------------------------------------------------

function HeadlineRow({
  meetingId,
  person,
  initial,
}: {
  meetingId: string;
  person: RunnerPerson;
  initial: string;
}) {
  const { value, update, state } = useAutosave(initial, (v) => setHeadline(meetingId, person.id, v));

  return (
    <div className="grid gap-2 md:grid-cols-[8rem_1fr] items-center py-3 border-b border-(--color-line) last:border-0">
      <div className="font-medium">{person.name}</div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => update(e.target.value)}
          placeholder="One line the other departments need to know"
          aria-label={`${person.name} headline`}
          className="flex-1 px-3 py-2 rounded-xl border border-(--color-line)"
        />
        <span className="w-16 shrink-0">
          <SaveDot state={state} />
        </span>
      </div>
    </div>
  );
}

export function HeadlinesSection({ data }: { data: RunnerData }) {
  return (
    <>
      <SectionTitle
        title="Headlines"
        hint="Cross-department alignment, one line each. Not a status round — friction gets solved in IDS, not reported here."
      />
      {data.people.map((p) => (
        <HeadlineRow
          key={p.id}
          meetingId={data.meeting.id}
          person={p}
          initial={data.headlines[p.id] ?? ""}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// 5 · To-Do Review
// ---------------------------------------------------------------------------

export function TodoReviewSection({ data }: { data: RunnerData }) {
  const [, startTransition] = useTransition();
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(data.reviewTodos.map((t) => [t.id, t.status])),
  );

  const total = data.reviewTodos.length;
  const done = data.reviewTodos.filter((t) => statuses[t.id] === "done").length;
  const pct = total === 0 ? null : Math.round((done / total) * 100);
  const hit = pct !== null && pct >= COMPLETION_TARGET;

  function toggle(id: string, next: boolean) {
    setStatuses((s) => ({ ...s, [id]: next ? "done" : "open" }));
    startTransition(() => void setTodoStatus(id, next ? "done" : "open"));
  }

  return (
    <>
      <SectionTitle
        title="To-Do Review"
        hint="Done or not done. No explanations — anything that needs one is an issue."
      />

      <div className="flex items-baseline gap-4 mb-5">
        <span
          className={`text-6xl font-semibold tabular-nums ${
            pct === null ? "text-(--color-muted)" : hit ? "text-(--color-on)" : "text-(--color-off)"
          }`}
        >
          {pct === null ? "—" : `${pct}%`}
        </span>
        <span className="text-(--color-muted)">
          {total === 0 ? "nothing due for review this week" : `${done} of ${total} done`} · target{" "}
          {COMPLETION_TARGET}%
        </span>
      </div>

      {total === 0 ? (
        <Empty>Nothing was due by today that wasn&rsquo;t created in this meeting.</Empty>
      ) : (
        <ul>
          {data.reviewTodos.map((t) => {
            const isDone = statuses[t.id] === "done";
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0"
              >
                <input
                  id={`todo-${t.id}`}
                  type="checkbox"
                  checked={isDone}
                  onChange={(e) => toggle(t.id, e.target.checked)}
                  className="size-5 shrink-0 accent-[oklch(0.58_0.15_150)]"
                />
                <label
                  htmlFor={`todo-${t.id}`}
                  className={`flex-1 min-w-[14rem] ${isDone ? "line-through text-(--color-muted)" : ""}`}
                >
                  {t.text}
                </label>
                <CarryBadge weeks={t.weeksCarried} level={t.carry} />
                <span className="text-[0.85rem] text-(--color-muted) whitespace-nowrap">
                  {t.ownerName} · {formatShortDate(t.dueDate)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 6 · IDS
// ---------------------------------------------------------------------------

function SolvePanel({ data, issue }: { data: RunnerData; issue: RunnerIssue }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="card p-4 mb-4 border-(--color-accent)/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{issue.text}</p>
          <p className="text-[0.85rem] text-(--color-muted)">
            {issue.raisedByName} · open {issue.weeksOpen} week{issue.weeksOpen === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => void toggleIssuePick(data.meeting.id, issue.id, false))}
          className="text-[0.85rem] text-(--color-muted) underline underline-offset-2"
        >
          Unpick
        </button>
      </div>

      {issue.linkedTodos.length > 0 ? (
        <ul className="mt-3 text-[0.92rem]">
          {issue.linkedTodos.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-1">
              <span className="text-(--color-on)">✓</span>
              <span className="flex-1">{t.text}</span>
              <span className="text-(--color-muted)">
                {t.ownerName} · {formatShortDate(t.dueDate)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <TodoComposer
        meetingId={data.meeting.id}
        meetingDate={data.meeting.date}
        people={data.people}
        defaultDueDate={data.defaultDueDate}
        originIssueId={issue.id}
        source="ids"
        label="Attach to-do"
      />

      <div className="mt-4 pt-4 border-t border-(--color-line)">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What we decided (optional)"
          className="w-full px-3 py-2 rounded-xl border border-(--color-line) mb-2"
          aria-label="Resolution note"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!issue.canSolve || pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await solveIssue(issue.id, note, data.meeting.id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not solve this issue.");
                }
              });
            }}
            className="px-4 py-2 rounded-xl bg-(--color-on) text-white font-medium disabled:opacity-40"
          >
            Mark solved
          </button>
          {/* R5 explains itself rather than silently disabling the button. */}
          <p
            className={`text-[0.9rem] ${issue.canSolve ? "text-(--color-muted)" : "text-(--color-off)"}`}
          >
            {error ?? issue.solveMessage}
          </p>
        </div>
      </div>
    </div>
  );
}

function IssueDumpInline({ meetingDate }: { meetingDate: string }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const count = splitBrainDump(text).length;

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await addIssues(fd);
          setText("");
        })
      }
      className="mt-4"
    >
      <input type="hidden" name="raised_date" value={meetingDate} />
      <textarea
        name="dump"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add issues — one per line"
        className="w-full px-3 py-2 rounded-xl border border-(--color-line) font-[inherit]"
      />
      <button
        type="submit"
        disabled={count === 0 || pending}
        className="mt-2 px-4 py-2 rounded-xl border border-(--color-line) font-medium disabled:opacity-40"
      >
        {count === 0 ? "Add issues" : `Add ${count} issue${count > 1 ? "s" : ""}`}
      </button>
    </form>
  );
}

export function IdsSection({ data }: { data: RunnerData }) {
  const [, startTransition] = useTransition();
  const picked = data.openIssues.filter((i) => i.picked);
  const unpicked = data.openIssues.filter((i) => !i.picked);
  const atCap = picked.length >= MAX_ISSUES_PER_MEETING;

  return (
    <>
      <SectionTitle
        title="IDS — Identify, Discuss, Solve"
        hint="Oldest first, because the oldest issue is the one being avoided. Pick three. Every solve creates a to-do."
        right={
          <span className="pill bg-(--color-grey-bg) text-(--color-muted)">
            {picked.length} of {MAX_ISSUES_PER_MEETING} picked
          </span>
        }
      />

      {picked.length > 0 ? (
        <div className="mb-6">
          {picked.map((issue) => (
            <SolvePanel key={issue.id} data={data} issue={issue} />
          ))}
        </div>
      ) : null}

      <h3 className="font-semibold text-[0.95rem] mb-2">
        Open issues · oldest first {atCap ? "· three picked, that's the limit" : ""}
      </h3>

      {unpicked.length === 0 ? (
        <Empty>No other open issues.</Empty>
      ) : (
        <ul>
          {unpicked.map((issue) => (
            <li
              key={issue.id}
              className="flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0"
            >
              <span
                className={`pill shrink-0 ${
                  issue.weeksOpen >= 3
                    ? "bg-(--color-off-bg) text-(--color-off)"
                    : issue.weeksOpen >= 1
                      ? "bg-(--color-amber-bg) text-(--color-amber)"
                      : "bg-(--color-grey-bg) text-(--color-muted)"
                }`}
              >
                {issue.weeksOpen}w
              </span>
              <span className="flex-1 min-w-[14rem]">{issue.text}</span>
              <span className="text-[0.85rem] text-(--color-muted)">{issue.raisedByName}</span>
              <button
                type="button"
                disabled={atCap}
                onClick={() =>
                  startTransition(() => void toggleIssuePick(data.meeting.id, issue.id, true))
                }
                className="px-3 py-1.5 rounded-lg border border-(--color-line) font-medium disabled:opacity-30"
                title={atCap ? "Three issues is the limit for one meeting" : "Take this one"}
              >
                Pick
              </button>
              <button
                type="button"
                onClick={() => startTransition(() => void dropIssue(issue.id))}
                className="text-[0.85rem] text-(--color-muted) underline underline-offset-2"
              >
                Drop
              </button>
            </li>
          ))}
        </ul>
      )}

      <IssueDumpInline meetingDate={data.meeting.date} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 7 · Conclude
// ---------------------------------------------------------------------------

function RatingRow({
  meetingId,
  person,
  initial,
}: {
  meetingId: string;
  person: RunnerPerson;
  initial: number | undefined;
}) {
  const [score, setScore] = useState<number | undefined>(initial);
  const [, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-(--color-line) last:border-0">
      <span className="w-28 font-medium">{person.name}</span>
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setScore(n);
              startTransition(() => void setRating(meetingId, person.id, n));
            }}
            className={`size-9 rounded-lg border tabular-nums ${
              score === n
                ? "bg-(--color-ink) text-white border-(--color-ink)"
                : "border-(--color-line) hover:bg-(--color-grey-bg)"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConcludeSection({ data }: { data: RunnerData }) {
  const [pending, startTransition] = useTransition();
  const cascading = useAutosave(data.meeting.cascading_messages, (v) =>
    setCascadingMessages(data.meeting.id, v),
  );

  const ratings = Object.values(data.ratings);
  const avg =
    ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
      : null;

  return (
    <>
      <SectionTitle
        title="Conclude"
        hint="Recap the new to-dos, agree what cascades, rate the meeting."
      />

      <h3 className="font-semibold text-[0.95rem] mb-2">
        New to-dos from this meeting ({data.newTodos.length})
      </h3>
      {data.newTodos.length === 0 ? (
        <Empty>Nothing was created today. If an issue was solved, something should have been.</Empty>
      ) : (
        <ul className="mb-6">
          {data.newTodos.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-3 py-2 border-b border-(--color-line) last:border-0"
            >
              <span className="flex-1 min-w-[14rem]">{t.text}</span>
              <span className="text-[0.9rem] text-(--color-muted)">
                {t.ownerName} · {formatShortDate(t.dueDate)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="font-semibold text-[0.95rem] mb-2">Cascading messages</h3>
      <textarea
        rows={3}
        value={cascading.value}
        onChange={(e) => cascading.update(e.target.value)}
        placeholder="What goes out to the wider team, and who says it"
        className="w-full px-3 py-2.5 rounded-xl border border-(--color-line) font-[inherit] mb-1"
      />
      <div className="mb-6">
        <SaveDot state={cascading.state} />
      </div>

      <h3 className="font-semibold text-[0.95rem] mb-2">
        Rate the meeting {avg !== null ? `· average ${avg}` : ""}
      </h3>
      {data.people.map((p) => (
        <RatingRow
          key={p.id}
          meetingId={data.meeting.id}
          person={p}
          initial={data.ratings[p.id]}
        />
      ))}

      {data.isFacilitator ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || data.meeting.status === "closed"}
            onClick={() => startTransition(() => void closeMeeting(data.meeting.id))}
            className="px-5 py-2.5 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-40"
          >
            {data.meeting.status === "closed" ? "Meeting closed" : "Close the meeting"}
          </button>
          <span className="text-[0.9rem] text-(--color-muted)">
            Locks the completion % and rating average into the record.
          </span>
        </div>
      ) : null}
    </>
  );
}
