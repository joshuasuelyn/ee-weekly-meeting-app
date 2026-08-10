"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SaveDot, useAutosave } from "@/components/autosave";
import { CarryBadge, Empty, SectionTitle, StatePill } from "@/components/ui";
import {
  addHeadline,
  addIssues,
  createIssueFromMetric,
  createIssueFromPriority,
  closeMeeting,
  deleteHeadline,
  dropIssue,
  setCascadingMessages,
  setMetricValue,
  updateHeadline,
  setPriorityCheck,
  setPriorityStatus,
  setRating,
  setSegueField,
  setTodoStatus,
  solveIssue,
  toggleIssuePick,
} from "@/app/actions";
import { COMPLETION_TARGET, MAX_ISSUES_PER_MEETING, splitBrainDump } from "@/lib/rules";
import { segueQuestionFor } from "@/lib/segue";
import { formatShortDate } from "@/lib/dates";
import type {
  RunnerData,
  RunnerHeadline,
  RunnerIssue,
  RunnerPerson,
  RunnerPriority,
  RunnerScorecardRow,
} from "./data";
import { TodoComposer } from "./todo-composer";

// ---------------------------------------------------------------------------
// 1 · Segue
// ---------------------------------------------------------------------------

/**
 * One person's answer to one half of the segue.
 *
 * Shows what they wrote as text rather than in an input box. Five boxes on a projected
 * screen invite the room to retype what is already there, which is the live composition
 * moving this to the prep screen was meant to end. A box appears only where nothing was
 * written, so whoever skipped prep can still be captured in the room.
 */
function SegueAnswer({
  meetingId,
  person,
  field,
  initial,
  canEdit,
  placeholder,
  multiline = false,
}: {
  meetingId: string;
  person: RunnerPerson;
  field: "personal" | "professional";
  initial: string;
  canEdit: boolean;
  placeholder: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { value, update, state } = useAutosave(initial, (v) =>
    setSegueField(meetingId, person.id, field, v),
  );

  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
  const written = lines.length > 0;

  return (
    <div className="grid gap-2 md:grid-cols-[9rem_1fr] md:items-baseline py-3 border-b border-(--color-line) last:border-0">
      <div>
        <span className="font-semibold">{person.name}</span>
        {written && canEdit ? (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="ml-2 text-[0.75rem] text-(--color-muted) underline underline-offset-2"
          >
            {editing ? "done" : "edit"}
          </button>
        ) : null}
        <div className="mt-0.5">
          <SaveDot state={state} />
        </div>
      </div>

      {written && !editing ? (
        // A single line reads better as a sentence; several are a list of wins.
        lines.length === 1 ? (
          <p className="text-[1.05rem] leading-snug">{lines[0]}</p>
        ) : (
          <ul className="list-disc pl-5 grid gap-0.5">
            {lines.map((l, i) => (
              <li key={i} className="text-[1.05rem] leading-snug">
                {l}
              </li>
            ))}
          </ul>
        )
      ) : multiline ? (
        <textarea
          value={value}
          onChange={(e) => update(e.target.value)}
          rows={Math.max(2, lines.length + 1)}
          placeholder={placeholder}
          aria-label={`${person.name} — best things at work this week`}
          className="w-full px-3 py-2 rounded-xl border border-(--color-line) font-[inherit] resize-y"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => update(e.target.value)}
          placeholder={placeholder}
          aria-label={`${person.name} — this week's question`}
          className="w-full px-3 py-2 rounded-xl border border-(--color-line)"
        />
      )}
    </div>
  );
}

export function SegueSection({ data }: { data: RunnerData }) {
  const question = segueQuestionFor(data.meeting.date);
  const seg = (id: string) => data.segues[id] ?? { personal: "", professional: "" };

  const counted = (field: "personal" | "professional") =>
    data.people.filter((p) => seg(p.id)[field].trim() !== "").length;

  const block = (
    title: string,
    subtitle: string | null,
    field: "personal" | "professional",
    placeholder: string,
    multiline: boolean,
  ) => (
    <section className="mb-8 last:mb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="text-[1.1rem] font-semibold">{title}</h3>
        <span
          className={`pill ${
            counted(field) === data.people.length
              ? "bg-(--color-on-bg) text-(--color-on)"
              : "bg-(--color-grey-bg) text-(--color-muted)"
          }`}
        >
          {counted(field)} of {data.people.length}
        </span>
      </div>
      {subtitle ? <p className="text-(--color-muted) mb-3">{subtitle}</p> : null}
      {data.people.map((p) => (
        <SegueAnswer
          key={p.id}
          meetingId={data.meeting.id}
          person={p}
          field={field}
          initial={seg(p.id)[field]}
          canEdit={data.isFacilitator || p.id === data.currentUserId}
          placeholder={placeholder}
          multiline={multiline}
        />
      ))}
    </section>
  );

  return (
    <>
      <SectionTitle
        title="Segue"
        hint="Round the room twice — the question first, then the wins. Blanks can be filled in now."
      />
      {block("This week's question", question, "personal", "Not answered yet", false)}
      {block("Best things at work this week", null, "professional", "Nothing written yet", true)}
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

function PriorityLine({
  priority,
  onTrack,
  routed,
  indent,
  onChoose,
  onRoute,
  onDone,
}: {
  priority: RunnerPriority;
  onTrack: boolean | null;
  routed: boolean;
  indent: boolean;
  onChoose: (next: boolean) => void;
  onRoute: () => void;
  onDone: () => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0 ${
        indent ? "pl-4 ml-1 border-l-2 border-l-(--color-line)" : ""
      }`}
    >
      <div className="flex-1 min-w-[14rem]">
        <p className={indent ? "text-[0.95rem]" : "font-medium"}>{priority.text}</p>
        <p className="text-[0.8rem] text-(--color-muted)">
          {indent ? "step" : priority.horizon === "week" ? "this week" : "this month"} · due{" "}
          {formatShortDate(priority.dueDate)}
          {/* Steps carry their own owner — a Marketing goal can cascade to Nick — so the
              name matters most on the indented rows, not least. */}
          {` · ${priority.ownerName}`}
          {priority.needsStep ? (
            <span className="text-(--color-amber) font-medium"> · no step this week</span>
          ) : null}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChoose(true)}
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
          onClick={() => onChoose(false)}
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
            disabled={routed}
            onClick={onRoute}
            className="px-3 py-1.5 rounded-lg border border-(--color-off) text-(--color-off) font-medium disabled:opacity-40"
          >
            {routed ? "→ Added" : "→ Issue"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 rounded-lg border border-(--color-line) text-(--color-muted)"
          title="Close this priority"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export function PrioritiesSection({ data }: { data: RunnerData }) {
  const [, startTransition] = useTransition();
  const [checks, setChecks] = useState<Record<string, boolean | null>>(
    Object.fromEntries(data.priorities.map((p) => [p.id, p.onTrack])),
  );
  const [routed, setRouted] = useState<Record<string, boolean>>({});

  /**
   * Department priorities first, grouped by department; then individual ones by owner.
   * This is where the cross-department view lives — the prep screen deliberately shows a
   * manager only their own, so the meeting is the first time everyone sees the whole board.
   */
  const { deptSections, mineSections, looseSections } = useMemo(() => {
    const monthlies = data.priorities.filter((p) => p.horizon !== "week");
    const parentIds = new Set(monthlies.map((p) => p.id));

    const group = (items: RunnerPriority[], key: (p: RunnerPriority) => string) => {
      const map = new Map<string, RunnerPriority[]>();
      for (const p of items) map.set(key(p), [...(map.get(key(p)) ?? []), p]);
      return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    };

    return {
      deptSections: group(
        monthlies.filter((p) => p.scope === "department"),
        (p) => p.department,
      ),
      mineSections: group(
        monthlies.filter((p) => p.scope !== "department"),
        (p) => p.ownerName,
      ),
      looseSections: group(
        data.priorities.filter(
          (p) => p.horizon === "week" && (!p.parentId || !parentIds.has(p.parentId)),
        ),
        (p) => p.ownerName,
      ),
    };
  }, [data.priorities]);

  const stepsOf = (parentId: string) => data.priorities.filter((p) => p.parentId === parentId);

  function choose(id: string, next: boolean) {
    setChecks((c) => ({ ...c, [id]: next }));
    startTransition(() => void setPriorityCheck(data.meeting.id, id, next));
  }

  const lineProps = (p: RunnerPriority) => ({
    priority: p,
    onTrack: checks[p.id] ?? null,
    routed: Boolean(routed[p.id]),
    onChoose: (next: boolean) => choose(p.id, next),
    onRoute: () => {
      setRouted((r) => ({ ...r, [p.id]: true }));
      startTransition(() => void createIssueFromPriority(p.id, data.meeting.date));
    },
    onDone: () => startTransition(() => void setPriorityStatus(p.id, "done")),
  });

  const block = (heading: string, parents: RunnerPriority[]) => (
    <div key={heading} className="mb-5">
      <h3 className="font-semibold text-[0.95rem] mb-1">{heading}</h3>
      {parents.map((parent) => (
        <div key={parent.id} className="mb-3 last:mb-0">
          <PriorityLine {...lineProps(parent)} indent={false} />
          {stepsOf(parent.id).map((s) => (
            <PriorityLine key={s.id} {...lineProps(s)} indent />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <SectionTitle
        title="Priorities"
        hint="On or off. No discussion here — anything off track goes to Issues."
      />

      {data.priorities.length === 0 ? (
        <Empty>No open priorities. Managers declare them on their prep screen.</Empty>
      ) : (
        <>
          {deptSections.length > 0 ? (
            <>
              <p className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-2">
                Department
              </p>
              {deptSections.map(([dept, list]) => block(dept, list))}
            </>
          ) : null}

          {mineSections.length > 0 ? (
            <>
              <p className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-2">
                Individual
              </p>
              {mineSections.map(([owner, list]) => block(owner, list))}
            </>
          ) : null}

          {looseSections.length > 0 ? (
            <>
              <p className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-2">
                This week only
              </p>
              {looseSections.map(([owner, list]) => (
                <div key={owner} className="mb-5">
                  <h3 className="font-semibold text-[0.95rem] mb-1">{owner}</h3>
                  {list.map((p) => (
                    <PriorityLine key={p.id} {...lineProps(p)} indent={false} />
                  ))}
                </div>
              ))}
            </>
          ) : null}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 4 · Headlines
// ---------------------------------------------------------------------------

function HeadlineRow({ headline }: { headline: RunnerHeadline }) {
  const { value, update, state } = useAutosave(headline.text, (v) => updateHeadline(headline.id, v));
  const [, startTransition] = useTransition();
  const lines = value.split("\n").filter((l) => l.trim() !== "").length;

  return (
    <div className="grid gap-2 md:grid-cols-[8rem_1fr] items-start py-3 border-b border-(--color-line) last:border-0">
      <div className="font-medium md:pt-2">{headline.userName}</div>
      <div className="flex items-start gap-2">
        <textarea
          value={value}
          onChange={(e) => update(e.target.value)}
          rows={Math.min(10, Math.max(2, lines + 1))}
          aria-label={`${headline.userName} — what other departments need to know`}
          className="flex-1 px-3 py-2 rounded-xl border border-(--color-line) font-[inherit] resize-y"
        />
        <div className="w-16 shrink-0 pt-2 grid gap-1">
          <SaveDot state={state} />
          <button
            type="button"
            onClick={() => startTransition(() => void deleteHeadline(headline.id))}
            className="text-[0.8rem] text-(--color-muted) underline underline-offset-2 text-left"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function HeadlineComposer({ data }: { data: RunnerData }) {
  const [text, setText] = useState("");
  const [userId, setUserId] = useState(data.currentUserId);
  const [pending, startTransition] = useTransition();

  // The person select sits outside the <form> deliberately: React resets fields inside a
  // form action when it completes, which would bounce the name back to the first in the
  // list every time. Out here it holds, so adding three for the same person is three
  // keystrokes rather than three re-selections.
  return (
    <div className="mt-4 pt-4 border-t border-(--color-line) flex flex-wrap gap-2 items-start">
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        aria-label="Whose point"
        className="px-3 py-2 rounded-xl border border-(--color-line) bg-(--color-panel)"
      >
        {data.people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <form
        action={(fd) =>
          startTransition(async () => {
            await addHeadline(fd);
            setText("");
          })
        }
        className="flex-1 min-w-[18rem] flex flex-wrap gap-2 items-start"
      >
        <input type="hidden" name="meeting_id" value={data.meeting.id} />
        <input type="hidden" name="user_id" value={userId} />
        <textarea
          name="text"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What other departments need to know. As long as it needs to be."
          aria-label="What other departments need to know"
          className="flex-1 min-w-[14rem] px-3 py-2 rounded-xl border border-(--color-line) font-[inherit] resize-y"
        />
        <button
          type="submit"
          disabled={text.trim() === "" || pending}
          className="px-4 py-2 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </div>
  );
}

export function AlignmentSection({ data }: { data: RunnerData }) {
  return (
    <>
      <SectionTitle
        title="Cross-department alignment"
        hint="What another department needs to know. Not a status round — friction gets solved in IDS, not reported here."
        right={
          <span className="pill bg-(--color-grey-bg) text-(--color-muted)">
            {data.headlines.length} raised
          </span>
        }
      />

      {data.headlines.length === 0 ? (
        <Empty>
          Nothing raised. Ask the room — nobody owes one, and no news is a real answer.
        </Empty>
      ) : (
        data.headlines.map((h) => <HeadlineRow key={h.id} headline={h} />)
      )}

      <HeadlineComposer data={data} />
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
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
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
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await closeMeeting(data.meeting.id);
                  // Closing ends the meeting, so staying on the runner reads as nothing
                  // having happened. The record is the point — go and look at it.
                  router.push("/history");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not close the meeting.");
                }
              });
            }}
            className="px-5 py-2.5 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-40"
          >
            {data.meeting.status === "closed"
              ? "Meeting closed"
              : pending
                ? "Closing…"
                : "Close the meeting"}
          </button>
          <span
            className={`text-[0.9rem] ${error ? "text-(--color-off)" : "text-(--color-muted)"}`}
          >
            {error ?? "Locks the completion % and rating average into the record."}
          </span>
        </div>
      ) : null}
    </>
  );
}
