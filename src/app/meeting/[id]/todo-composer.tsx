"use client";

import { useState, useTransition } from "react";
import { createPriorityInsteadOfTodo, createTodo } from "@/app/actions";
import { isBeyondTodoHorizon } from "@/lib/rules";
import type { RunnerPerson } from "./data";

/**
 * The one place a to-do is created. Owner is a single select — R3 means the UI must not
 * allow two names — and R4's prompt fires when the due date drifts past a fortnight.
 */
export function TodoComposer({
  meetingId,
  meetingDate,
  people,
  defaultDueDate,
  originIssueId = null,
  source,
  label = "Add to-do",
  compact = false,
}: {
  meetingId: string;
  meetingDate: string;
  people: RunnerPerson[];
  defaultDueDate: string;
  originIssueId?: string | null;
  source: "ids" | "declared" | "manual";
  label?: string;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [ownerId, setOwnerId] = useState(people[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [pending, startTransition] = useTransition();

  const tooFarOut = dueDate !== "" && isBeyondTodoHorizon(dueDate, meetingDate);
  const ready = text.trim() !== "" && ownerId !== "" && dueDate !== "";

  function submit(asPriority: boolean) {
    const fd = new FormData();
    fd.set("text", text.trim());
    fd.set("owner_id", ownerId);
    fd.set("due_date", dueDate);
    fd.set("source", source);
    fd.set("created_meeting_id", meetingId);
    if (originIssueId) fd.set("origin_issue_id", originIssueId);

    startTransition(async () => {
      if (asPriority) await createPriorityInsteadOfTodo(fd);
      else await createTodo(fd);
      setText("");
      setDueDate(defaultDueDate);
    });
  }

  return (
    <div className={compact ? "" : "border-t border-(--color-line) pt-4 mt-4"}>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[14rem]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="The action that closes this"
            className="w-full px-3 py-2 rounded-xl border border-(--color-line)"
            aria-label="To-do text"
          />
        </div>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          aria-label="Owner"
          className="px-3 py-2 rounded-xl border border-(--color-line) bg-(--color-panel)"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          className="px-3 py-2 rounded-xl border border-(--color-line)"
        />
        <button
          type="button"
          disabled={!ready || pending || tooFarOut}
          onClick={() => submit(false)}
          className="px-4 py-2 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-40"
        >
          {label}
        </button>
      </div>

      {tooFarOut ? (
        <div className="mt-3 p-3 rounded-xl bg-(--color-amber-bg) text-[0.92rem]">
          <p className="font-medium text-(--color-amber)">
            That&rsquo;s not a to-do, it&rsquo;s a priority.
          </p>
          <p className="text-(--color-muted) mt-0.5">
            More than two weeks out. Create it as a monthly priority instead?
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              disabled={!ready || pending}
              onClick={() => submit(true)}
              className="px-3 py-1.5 rounded-lg bg-(--color-ink) text-white font-medium disabled:opacity-40"
            >
              Make it a monthly priority
            </button>
            <button
              type="button"
              onClick={() => setDueDate(defaultDueDate)}
              className="px-3 py-1.5 rounded-lg border border-(--color-line) font-medium"
            >
              Pull the date back in
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
