"use client";

import { useState, useTransition } from "react";
import { addIssues, dropIssue, setPriorityStatus, setTodoStatus } from "@/app/actions";
import { CarryBadge, Empty } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import {
  NEEDS_HELP_LABEL,
  ON_TRACK_LABEL, splitBrainDump } from "@/lib/rules";
import type { RunnerIssue, RunnerPriority, RunnerTodo } from "./meeting/[id]/data";

export function TodoList({ todos }: { todos: RunnerTodo[] }) {
  const [, startTransition] = useTransition();
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(todos.map((t) => [t.id, t.status])),
  );

  if (todos.length === 0) return <Empty>No open to-dos. Suspicious, but well done.</Empty>;

  return (
    <ul>
      {todos.map((t) => {
        const done = statuses[t.id] === "done";
        return (
          <li
            key={t.id}
            className="flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0"
          >
            <input
              id={`home-todo-${t.id}`}
              type="checkbox"
              checked={done}
              onChange={(e) => {
                const next = e.target.checked;
                setStatuses((s) => ({ ...s, [t.id]: next ? "done" : "open" }));
                startTransition(() => void setTodoStatus(t.id, next ? "done" : "open"));
              }}
              className="size-5 shrink-0 accent-[oklch(0.58_0.15_150)]"
            />
            <label
              htmlFor={`home-todo-${t.id}`}
              className={`flex-1 min-w-[12rem] ${done ? "line-through text-(--color-muted)" : ""}`}
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
  );
}

export function IssueList({ issues }: { issues: RunnerIssue[] }) {
  const [, startTransition] = useTransition();

  if (issues.length === 0) return <Empty>No open issues.</Empty>;

  return (
    <ul>
      {issues.map((i) => (
        <li
          key={i.id}
          className="flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0"
        >
          <span
            className={`pill shrink-0 ${
              i.weeksOpen >= 3
                ? "bg-(--color-off-bg) text-(--color-off)"
                : i.weeksOpen >= 1
                  ? "bg-(--color-amber-bg) text-(--color-amber)"
                  : "bg-(--color-grey-bg) text-(--color-muted)"
            }`}
          >
            {i.weeksOpen}w
          </span>
          <span className="flex-1 min-w-[12rem]">{i.text}</span>
          <span className="text-[0.85rem] text-(--color-muted)">{i.raisedByName}</span>
          <button
            type="button"
            onClick={() => startTransition(() => void dropIssue(i.id))}
            className="text-[0.85rem] text-(--color-muted) underline underline-offset-2"
          >
            No action needed
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PriorityList({ priorities }: { priorities: RunnerPriority[] }) {
  const [, startTransition] = useTransition();

  if (priorities.length === 0) return <Empty>No open priorities.</Empty>;

  // Monthly priorities carry their weekly steps directly beneath them, same nesting as the
  // prep screen and the runner.
  const parentIds = new Set(priorities.filter((p) => p.horizon !== "week").map((p) => p.id));
  const top = priorities.filter((p) => !p.parentId || !parentIds.has(p.parentId));

  const row = (p: RunnerPriority, indent: boolean) => (
    <li
      key={p.id}
      className={`flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0 ${
        indent ? "pl-4 ml-1 border-l-2 border-l-(--color-line)" : ""
      }`}
    >
      {/* Unset means on track — the review records exceptions, not confirmations. */}
      <span
        className={`pill shrink-0 ${
          p.onTrack === false
            ? "bg-(--color-off-bg) text-(--color-off)"
            : "bg-(--color-on-bg) text-(--color-on)"
        }`}
      >
        {p.onTrack === false ? NEEDS_HELP_LABEL : ON_TRACK_LABEL}
      </span>
      {p.scope === "department" && !indent ? (
        <span className="pill shrink-0 bg-(--color-grey-bg) text-(--color-muted)">
          {p.department}
        </span>
      ) : null}
      <span className="flex-1 min-w-[12rem]">{p.text}</span>
      {p.needsStep ? (
        <span className="pill shrink-0 bg-(--color-amber-bg) text-(--color-amber)">no step</span>
      ) : null}
      <span className="text-[0.85rem] text-(--color-muted) whitespace-nowrap">
        {p.ownerName} · {formatShortDate(p.dueDate)}
      </span>
      <button
        type="button"
        onClick={() => startTransition(() => void setPriorityStatus(p.id, "done"))}
        className="text-[0.85rem] text-(--color-muted) underline underline-offset-2"
      >
        Close
      </button>
    </li>
  );

  return (
    <ul>
      {top.flatMap((p) => [
        row(p, false),
        ...priorities.filter((s) => s.parentId === p.id).map((s) => row(s, true)),
      ])}
    </ul>
  );
}

/** Issues are addable any day of the week, not only at the meeting (§6.3). */
export function QuickIssueAdd({ raisedDate }: { raisedDate: string }) {
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
      className="mt-3"
    >
      <input type="hidden" name="raised_date" value={raisedDate} />
      <textarea
        name="dump"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Raise an issue — one per line"
        className="w-full px-3 py-2 rounded-xl border border-(--color-line) font-[inherit]"
      />
      <button
        type="submit"
        disabled={count === 0 || pending}
        className="mt-2 px-4 py-2 rounded-xl border border-(--color-line) font-medium disabled:opacity-40"
      >
        {count === 0 ? "Add" : `Add ${count} issue${count > 1 ? "s" : ""}`}
      </button>
    </form>
  );
}
