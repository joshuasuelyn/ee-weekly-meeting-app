"use client";

import { useEffect, useState } from "react";

function clock(totalSeconds: number): string {
  const s = Math.abs(Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Counts down the section's allocation, then counts up in red. Sections are timed but not
 * hard-stopped (§3), so this never blocks anything — it just makes the overrun visible.
 */
export function SectionTimer({
  startedAt,
  minutes,
}: {
  startedAt: string | null;
  minutes: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!startedAt) {
    return (
      <span className="tabular-nums text-2xl font-semibold text-(--color-muted)">
        {clock(minutes * 60)}
      </span>
    );
  }

  const elapsed = (now - new Date(startedAt).getTime()) / 1000;
  const remaining = minutes * 60 - elapsed;
  const over = remaining < 0;

  return (
    <span
      className={`tabular-nums text-2xl font-semibold ${over ? "text-(--color-off)" : ""}`}
      aria-label={over ? "over time" : "time remaining"}
    >
      {over ? "+" : ""}
      {clock(remaining)}
    </span>
  );
}

/** Total elapsed for the whole meeting, shown next to the section timer. */
export function MeetingClock({ startedAt }: { startedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!startedAt) return null;
  return (
    <span className="tabular-nums text-[0.9rem] text-(--color-muted)">
      {clock((now - new Date(startedAt).getTime()) / 1000)} in section
    </span>
  );
}
