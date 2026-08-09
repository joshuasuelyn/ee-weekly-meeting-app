"use client";

import { useState, useTransition } from "react";
import { SaveDot, useAutosave } from "@/components/autosave";
import { Card, SectionTitle } from "@/components/ui";
import { addIssues, setMetricValue, setPriorityCheck, submitPrep } from "@/app/actions";
import { createPriority } from "@/app/actions";
import { nextMonday } from "@/lib/dates";
import { NO_STEP_PROMPT, splitBrainDump, type GroupedPriorities, type PriorityGroup } from "@/lib/rules";
import type { Metric, Priority } from "@/lib/types";

export interface PrepMetric {
  metric: Metric;
  value: string;
  lastValue: string | null;
  definition: string;
}

// ---------------------------------------------------------------------------
// My numbers
// ---------------------------------------------------------------------------

function MetricInput({ meetingId, row }: { meetingId: string; row: PrepMetric }) {
  const { value, update, state } = useAutosave(row.value, (v) =>
    setMetricValue(meetingId, row.metric.id, v),
  );

  const targetLabel =
    row.metric.target === null
      ? "target not agreed yet"
      : `target ${row.metric.direction === "gte" ? "≥" : "≤"} ${row.metric.unit === "RM" ? "RM" : ""}${row.metric.target}${row.metric.unit !== "RM" ? row.metric.unit : ""}`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 border-b border-(--color-line) last:border-0">
      <div className="flex-1 min-w-[16rem]">
        <label htmlFor={`m-${row.metric.id}`} className="font-medium">
          {row.metric.name}
        </label>
        <p className="text-[0.85rem] text-(--color-muted)">
          {targetLabel}
          {row.lastValue ? ` · last week ${row.lastValue}` : " · no value last week"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`m-${row.metric.id}`}
          type={row.metric.direction === "yesno" ? "text" : "number"}
          inputMode={row.metric.direction === "yesno" ? "text" : "decimal"}
          step="any"
          value={value}
          onChange={(e) => update(e.target.value)}
          placeholder={row.metric.direction === "yesno" ? "yes / no" : "—"}
          aria-describedby={`d-${row.metric.id}`}
          className={`w-32 px-3 py-2 rounded-xl border text-right text-lg ${
            value.trim() === ""
              ? "border-(--color-off) bg-(--color-off-bg)"
              : "border-(--color-line)"
          }`}
        />
        <span className="w-24 text-[0.78rem]">
          {value.trim() === "" ? (
            <span className="text-(--color-off) font-medium">blank = off track</span>
          ) : (
            <SaveDot state={state} />
          )}
        </span>
      </div>
      <p id={`d-${row.metric.id}`} className="sr-only">
        {row.definition}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priorities
// ---------------------------------------------------------------------------

function PriorityRow({
  meetingId,
  priority,
  initial,
  indent = false,
}: {
  meetingId: string;
  priority: Priority;
  initial: boolean | null;
  indent?: boolean;
}) {
  const [onTrack, setOnTrack] = useState<boolean | null>(initial);
  const [, startTransition] = useTransition();

  function choose(next: boolean) {
    setOnTrack(next); // optimistic
    startTransition(() => void setPriorityCheck(meetingId, priority.id, next));
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0 ${
        indent ? "pl-4 border-l-2 border-l-(--color-line) ml-1" : ""
      }`}
    >
      <div className="flex-1 min-w-[13rem]">
        <p className={indent ? "text-[0.95rem]" : "font-medium"}>{priority.text}</p>
        <p className="text-[0.82rem] text-(--color-muted)">
          {indent ? "step · due" : "this month · due"} {priority.due_date}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => choose(true)}
          className={`px-3.5 py-1.5 rounded-lg border font-medium ${
            onTrack === true
              ? "bg-(--color-on-bg) text-(--color-on) border-(--color-on)"
              : "border-(--color-line) hover:bg-(--color-grey-bg)"
          }`}
        >
          On
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          className={`px-3.5 py-1.5 rounded-lg border font-medium ${
            onTrack === false
              ? "bg-(--color-off-bg) text-(--color-off) border-(--color-off)"
              : "border-(--color-line) hover:bg-(--color-grey-bg)"
          }`}
        >
          Off
        </button>
      </div>
    </div>
  );
}

/**
 * Adds a weekly step under a monthly priority. Always available — a month's work rarely
 * fits in one step a week — but it only *prompts* when nothing is moving this priority
 * forward. A prompt, not a gate, in the same weight class as R4.
 */
function StepAdder({
  ownerId,
  parentId,
  meetingDate,
  urgent,
}: {
  ownerId: string;
  parentId: string;
  meetingDate: string;
  urgent: boolean;
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await createPriority(fd);
          setText("");
        })
      }
      className={`ml-1 pl-4 py-3 border-l-2 ${
        urgent ? "border-l-(--color-amber)" : "border-l-(--color-line)"
      }`}
    >
      <input type="hidden" name="owner_id" value={ownerId} />
      <input type="hidden" name="parent_id" value={parentId} />
      <input type="hidden" name="horizon" value="week" />
      <input type="hidden" name="due_date" value={nextMonday(meetingDate)} />

      {urgent ? (
        <p className="text-[0.9rem] font-medium text-(--color-amber) mb-2">{NO_STEP_PROMPT}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={urgent ? "Rebuild the top 3 ad creatives" : "Another step this week"}
          aria-label="This week's step"
          className="flex-1 min-w-[14rem] px-3 py-2 rounded-xl border border-(--color-line)"
        />
        <button
          type="submit"
          disabled={text.trim() === "" || pending}
          className={`px-4 py-2 rounded-xl font-medium disabled:opacity-40 ${
            urgent
              ? "bg-(--color-ink) text-white"
              : "border border-(--color-line) hover:bg-(--color-grey-bg)"
          }`}
        >
          Add step
        </button>
      </div>
    </form>
  );
}

function PriorityGroupBlock({
  group,
  meetingId,
  meetingDate,
  ownerId,
  checks,
}: {
  group: PriorityGroup;
  meetingId: string;
  meetingDate: string;
  ownerId: string;
  checks: Record<string, boolean | null>;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <PriorityRow
        meetingId={meetingId}
        priority={group.parent}
        initial={checks[group.parent.id] ?? null}
      />
      {group.steps.map((s) => (
        <PriorityRow
          key={s.id}
          meetingId={meetingId}
          priority={s}
          initial={checks[s.id] ?? null}
          indent
        />
      ))}
      <StepAdder
        ownerId={ownerId}
        parentId={group.parent.id}
        meetingDate={meetingDate}
        urgent={group.needsStep}
      />
    </div>
  );
}

/**
 * Creation only — On/Off review lives in the block below, so no control appears twice.
 *
 * Rendered whenever a slot is still empty, but only *urgent* (amber, prompting copy) when
 * the month genuinely needs setting up. The rest of the time it's a quiet affordance, so
 * filling one slot never hides the other half-way through the job.
 */
function MonthlySetup({
  ownerId,
  department,
  monthDueDate,
  hasDepartment,
  hasIndividual,
  urgent,
}: {
  ownerId: string;
  department: string;
  monthDueDate: string;
  hasDepartment: boolean;
  hasIndividual: boolean;
  urgent: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const slot = (scope: "department" | "individual", label: string, placeholder: string) => (
    <form
      action={(fd) => startTransition(async () => void (await createPriority(fd)))}
      className="py-3 border-b border-(--color-line) last:border-0"
    >
      <input type="hidden" name="owner_id" value={ownerId} />
      <input type="hidden" name="horizon" value="month" />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="due_date" value={monthDueDate} />

      <label className="text-[0.9rem] font-medium block mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-2">
        <input
          name="text"
          required
          placeholder={placeholder}
          className="flex-1 min-w-[15rem] px-3 py-2 rounded-xl border border-(--color-line)"
        />
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-xl border border-(--color-line) font-medium hover:bg-(--color-grey-bg) disabled:opacity-40"
        >
          Set
        </button>
      </div>
    </form>
  );

  const anySet = hasDepartment || hasIndividual;

  return (
    <Card className={`p-5 ${urgent ? "border-(--color-amber)" : ""}`}>
      <SectionTitle
        title={urgent ? "Set this month" : "Add a monthly priority"}
        hint={
          urgent
            ? `Due ${monthDueDate}. One month, then it's reviewed. You'll break it into weekly steps below.`
            : `Optional, and you can have several of each. Due ${monthDueDate}.`
        }
      />
      {slot(
        "department",
        hasDepartment ? `${department} — another` : `${department} — this month`,
        "Get cost per lead under RM12",
      )}
      {slot(
        "individual",
        hasIndividual ? "Mine — another" : "Mine — this month",
        "Hire a junior designer",
      )}
      {anySet ? null : (
        <p className="text-[0.85rem] text-(--color-muted) mt-3">
          Three or four between them is plenty. Every one you set is something you&rsquo;ll be
          asked about every Monday.
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

function IssueDump({ meetingDate }: { meetingDate: string }) {
  const [text, setText] = useState("");
  const [added, setAdded] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const count = splitBrainDump(text).length;

  return (
    <form
      action={(fd) => {
        const n = count;
        startTransition(async () => {
          await addIssues(fd);
          setText("");
          setAdded(n);
        });
      }}
    >
      <input type="hidden" name="raised_date" value={meetingDate} />
      <input type="hidden" name="source" value="manual" />
      <textarea
        name="dump"
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setAdded(null);
        }}
        placeholder={"One issue per line.\nPaste as long a list as you like — every line becomes its own row."}
        className="w-full px-3 py-2.5 rounded-xl border border-(--color-line) font-[inherit]"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          type="submit"
          disabled={count === 0 || pending}
          className="px-4 py-2 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-40"
        >
          {count === 0 ? "Add issues" : `Add ${count} issue${count > 1 ? "s" : ""}`}
        </button>
        {added ? (
          <span className="text-[0.9rem] text-(--color-on)">
            Added {added} issue{added > 1 ? "s" : ""}.
          </span>
        ) : (
          <span className="text-[0.9rem] text-(--color-muted)">
            {count > 0 ? `${count} line${count > 1 ? "s" : ""} detected` : "Nothing to add yet"}
          </span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function PrepForm({
  meetingId,
  meetingDate,
  ownerId,
  department,
  metrics,
  grouped,
  checks,
  needsMonthlySetup,
  monthDueDate,
  submitted,
}: {
  meetingId: string;
  meetingDate: string;
  ownerId: string;
  department: string;
  metrics: PrepMetric[];
  grouped: GroupedPriorities;
  checks: Record<string, boolean | null>;
  needsMonthlySetup: boolean;
  monthDueDate: string;
  submitted: boolean;
}) {
  const [isSubmitted, setSubmitted] = useState(submitted);
  const [, startTransition] = useTransition();

  const blanks = metrics.filter((m) => m.value.trim() === "").length;
  const allGroups = [...grouped.department, ...grouped.individual];
  const unstepped = allGroups.filter((g) => g.needsStep).length;
  const nothingAtAll = allGroups.length === 0 && grouped.orphanWeeklies.length === 0;

  const groupProps = { meetingId, meetingDate, ownerId, checks };

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <SectionTitle
          title="My numbers"
          hint={
            metrics.length === 0
              ? "No scorecard lines are yours this week."
              : "Enter the number. A blank counts as off track."
          }
          right={
            blanks > 0 ? (
              <span className="pill bg-(--color-off-bg) text-(--color-off)">
                {blanks} still blank
              </span>
            ) : (
              <span className="pill bg-(--color-on-bg) text-(--color-on)">all entered</span>
            )
          }
        />
        {metrics.map((row) => (
          <MetricInput key={row.metric.id} meetingId={meetingId} row={row} />
        ))}
      </Card>

      <MonthlySetup
        ownerId={ownerId}
        department={department}
        monthDueDate={monthDueDate}
        hasDepartment={grouped.department.length > 0}
        hasIndividual={grouped.individual.length > 0}
        urgent={needsMonthlySetup}
      />

      <Card className="p-5">
        <SectionTitle
          title="My priorities"
          hint="On or off. Off-track drops into Issues at the meeting — no explanation needed here."
          right={
            unstepped > 0 ? (
              <span className="pill bg-(--color-amber-bg) text-(--color-amber)">
                {unstepped} with no step this week
              </span>
            ) : null
          }
        />

        {nothingAtAll ? (
          <p className="text-(--color-muted) py-2">
            Nothing yet. Set this month&rsquo;s priorities above and they carry themselves from
            here on.
          </p>
        ) : null}

        {grouped.department.length > 0 ? (
          <div className="mb-5">
            <h3 className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-1">
              {department}
            </h3>
            {grouped.department.map((g) => (
              <PriorityGroupBlock key={g.parent.id} group={g} {...groupProps} />
            ))}
          </div>
        ) : null}

        {grouped.individual.length > 0 ? (
          <div className="mb-5">
            <h3 className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-1">
              Mine
            </h3>
            {grouped.individual.map((g) => (
              <PriorityGroupBlock key={g.parent.id} group={g} {...groupProps} />
            ))}
          </div>
        ) : null}

        {grouped.orphanWeeklies.length > 0 ? (
          <div>
            <h3 className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-1">
              This week only
            </h3>
            {grouped.orphanWeeklies.map((p) => (
              <PriorityRow
                key={p.id}
                meetingId={meetingId}
                priority={p}
                initial={checks[p.id] ?? null}
              />
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <SectionTitle title="Add issues" hint="One per line. Paste a dump — it gets split for you." />
        <IssueDump meetingDate={meetingDate} />
      </Card>

      <Card className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium">{isSubmitted ? "You're marked ready." : "Done for the week?"}</p>
          <p className="text-[0.9rem] text-(--color-muted)">
            {blanks > 0
              ? `${blanks} number${blanks > 1 ? "s" : ""} still blank — they'll read red on Monday.`
              : "Everything's in. Nothing to retype on Monday."}
          </p>
        </div>
        <button
          type="button"
          disabled={isSubmitted}
          onClick={() => {
            setSubmitted(true);
            startTransition(() => void submitPrep(meetingId));
          }}
          className="px-5 py-2.5 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-40"
        >
          {isSubmitted ? "Ready ✓" : "I'm ready"}
        </button>
      </Card>
    </div>
  );
}
