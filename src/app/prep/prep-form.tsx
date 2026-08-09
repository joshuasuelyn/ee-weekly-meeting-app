"use client";

import { useState, useTransition } from "react";
import { SaveDot, useAutosave } from "@/components/autosave";
import { Card, SectionTitle } from "@/components/ui";
import { addIssues, setMetricValue, setPriorityCheck, submitPrep } from "@/app/actions";
import { splitBrainDump } from "@/lib/rules";
import type { Metric, Priority } from "@/lib/types";

export interface PrepMetric {
  metric: Metric;
  value: string;
  lastValue: string | null;
  definition: string;
}

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

function PriorityRow({
  meetingId,
  priority,
  initial,
}: {
  meetingId: string;
  priority: Priority;
  initial: boolean | null;
}) {
  const [onTrack, setOnTrack] = useState<boolean | null>(initial);
  const [, startTransition] = useTransition();

  function choose(next: boolean) {
    setOnTrack(next); // optimistic
    startTransition(() => void setPriorityCheck(meetingId, priority.id, next));
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3 border-b border-(--color-line) last:border-0">
      <div className="flex-1 min-w-[14rem]">
        <p className="font-medium">{priority.text}</p>
        <p className="text-[0.85rem] text-(--color-muted) capitalize">
          {priority.horizon}ly · due {priority.due_date}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => choose(true)}
          className={`px-4 py-2 rounded-xl border font-medium ${
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
          className={`px-4 py-2 rounded-xl border font-medium ${
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
          {count === 0
            ? "Add issues"
            : `Add ${count} issue${count > 1 ? "s" : ""}`}
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

export function PrepForm({
  meetingId,
  meetingDate,
  metrics,
  priorities,
  checks,
  submitted,
}: {
  meetingId: string;
  meetingDate: string;
  metrics: PrepMetric[];
  priorities: { priority: Priority; onTrack: boolean | null }[];
  checks: number;
  submitted: boolean;
}) {
  const [isSubmitted, setSubmitted] = useState(submitted);
  const [, startTransition] = useTransition();

  const blanks = metrics.filter((m) => m.value.trim() === "").length;
  const unchecked = priorities.filter((p) => p.onTrack === null).length;

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

      <Card className="p-5">
        <SectionTitle
          title="My priorities"
          hint="On or off. Off-track drops into Issues at the meeting — no explanation needed here."
          right={
            unchecked > 0 ? (
              <span className="pill bg-(--color-amber-bg) text-(--color-amber)">
                {unchecked} unreviewed
              </span>
            ) : null
          }
        />
        {priorities.length === 0 ? (
          <p className="text-(--color-muted) py-2">
            None yet. Declare one below and it carries itself from here on.
          </p>
        ) : (
          priorities.map(({ priority, onTrack }) => (
            <PriorityRow
              key={priority.id}
              meetingId={meetingId}
              priority={priority}
              initial={onTrack}
            />
          ))
        )}
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

      <p className="text-[0.85rem] text-(--color-muted) text-center">
        {checks} priorit{checks === 1 ? "y" : "ies"} reviewed · everything saves as you type
      </p>
    </div>
  );
}
