"use client";

import { useTransition } from "react";
import { goToSection, startMeeting } from "@/app/actions";
import { Card } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { SECTIONS, TOTAL_MEETING_MINUTES } from "@/lib/types";
import type { RunnerData } from "./data";
import {
  AlignmentSection,
  ConcludeSection,
  IdsSection,
  PrioritiesSection,
  ScorecardSection,
  SegueSection,
  TodoReviewSection,
} from "./sections";
import { SectionTimer } from "./timer";

// Must stay in lockstep with SECTIONS — index 0 renders section 1.
const RENDERERS = [
  SegueSection,
  ScorecardSection,
  PrioritiesSection,
  TodoReviewSection,
  AlignmentSection,
  IdsSection,
  ConcludeSection,
];

export function Runner({ data }: { data: RunnerData }) {
  const [pending, startTransition] = useTransition();
  const current = data.meeting.current_section;
  const section = SECTIONS[current - 1];
  const Section = RENDERERS[current - 1];

  const notStarted = data.meeting.status === "scheduled";

  return (
    <div>
      <header className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex-1 min-w-[14rem]">
          <h1 className="text-2xl font-semibold tracking-tight">
            {formatDate(data.meeting.date)}
          </h1>
          <p className="text-(--color-muted)">
            Week {data.week} · {TOTAL_MEETING_MINUTES} minutes ·{" "}
            {data.meeting.status === "closed"
              ? "closed"
              : data.meeting.status === "running"
                ? "running"
                : "not started"}
          </p>
        </div>

        {notStarted && data.isFacilitator ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => void startMeeting(data.meeting.id))}
            className="px-5 py-2.5 rounded-xl bg-(--color-ink) text-white font-medium"
          >
            Start the meeting
          </button>
        ) : (
          <div className="text-right">
            <SectionTimer startedAt={data.meeting.section_started_at} minutes={section.minutes} />
            <div className="text-[0.85rem] text-(--color-muted)">
              {section.name} · {section.minutes} min
            </div>
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr] items-start">
        <nav aria-label="Meeting sections" className="grid gap-1">
          {SECTIONS.map((s) => {
            const done = s.n < current;
            const active = s.n === current;
            return (
              <button
                key={s.n}
                type="button"
                disabled={!data.isFacilitator}
                onClick={() => startTransition(() => void goToSection(data.meeting.id, s.n))}
                className={`text-left px-3 py-2.5 rounded-xl border flex items-center gap-2.5 ${
                  active
                    ? "border-(--color-ink) bg-(--color-panel) font-medium"
                    : "border-transparent hover:bg-(--color-grey-bg)"
                } ${data.isFacilitator ? "" : "cursor-default"}`}
              >
                <span
                  className={`size-6 shrink-0 rounded-full grid place-items-center text-[0.78rem] tabular-nums ${
                    done
                      ? "bg-(--color-on-bg) text-(--color-on)"
                      : active
                        ? "bg-(--color-ink) text-white"
                        : "bg-(--color-grey-bg) text-(--color-muted)"
                  }`}
                >
                  {done ? "✓" : s.n}
                </span>
                <span className="flex-1">{s.short}</span>
                <span className="text-[0.8rem] text-(--color-muted) tabular-nums">{s.minutes}m</span>
              </button>
            );
          })}

          <div className="mt-3 px-3 text-[0.82rem] text-(--color-muted) leading-relaxed">
            {section.blurb}
          </div>
        </nav>

        <Card className="p-5 min-h-[24rem]">
          <Section data={data} />

          {data.isFacilitator ? (
            <div className="flex justify-between mt-8 pt-5 border-t border-(--color-line)">
              <button
                type="button"
                disabled={current === 1 || pending}
                onClick={() => startTransition(() => void goToSection(data.meeting.id, current - 1))}
                className="px-4 py-2 rounded-xl border border-(--color-line) font-medium disabled:opacity-30"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={current === 7 || pending}
                onClick={() => startTransition(() => void goToSection(data.meeting.id, current + 1))}
                className="px-4 py-2 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-30"
              >
                Next: {SECTIONS[current]?.short ?? "—"} →
              </button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
