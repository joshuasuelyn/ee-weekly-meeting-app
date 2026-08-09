"use client";

import { useState, useTransition } from "react";
import { addIssues, dropIssue, setPriorityStatus, setTodoStatus } from "@/app/actions";
import { CarryBadge, Empty } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { splitBrainDump } from "@/lib/rules";
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
            Drop
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PriorityList({ priorities }: { priorities: RunnerPriority[] }) {
  const [, startTransition] = useTransition();

  if (priorities.length === 0) return <Empty>No open priorities.</Empty>;

  return (
    <ul>
      {priorities.map((p) => (
        <li
          key={p.id}
          className="flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0"
        >
          <span
            className={`pill shrink-0 ${
              p.onTrack === true
                ? "bg-(--color-on-bg) text-(--color-on)"
                : p.onTrack === false
                  ? "bg-(--color-off-bg) text-(--color-off)"
                  : "bg-(--color-grey-bg) text-(--color-muted)"
            }`}
          >
            {p.onTrack === true ? "on" : p.onTrack === false ? "off" : "unreviewed"}
          </span>
          <span className="flex-1 min-w-[12rem]">{p.text}</span>
          <span className="text-[0.85rem] text-(--color-muted) capitalize whitespace-nowrap">
            {p.ownerName} · {p.horizon}ly · {formatShortDate(p.dueDate)}
          </span>
          <button
            type="button"
            onClick={() => startTransition(() => void setPriorityStatus(p.id, "done"))}
            className="text-[0.85rem] text-(--color-muted) underline underline-offset-2"
          >
            Close
          </button>
        </li>
      ))}
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
