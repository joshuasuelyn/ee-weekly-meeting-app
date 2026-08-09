import type { ReactNode } from "react";
import type { CarryLevel, MetricState } from "@/lib/rules";
import { CARRY_WARNING } from "@/lib/rules";

export function Card({
  children,
  className = "",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return <As className={`card ${className}`}>{children}</As>;
}

export function SectionTitle({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="text-[0.92rem] text-(--color-muted) mt-0.5">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

const STATE_STYLES: Record<MetricState, { bg: string; fg: string; label: string }> = {
  on: { bg: "bg-(--color-on-bg)", fg: "text-(--color-on)", label: "On track" },
  off: { bg: "bg-(--color-off-bg)", fg: "text-(--color-off)", label: "Off track" },
  grey: { bg: "bg-(--color-grey-bg)", fg: "text-(--color-grey)", label: "No target" },
  future: { bg: "bg-(--color-grey-bg)", fg: "text-(--color-grey)", label: "Not live" },
};

export function StatePill({ state, label }: { state: MetricState; label?: string }) {
  const s = STATE_STYLES[state];
  return <span className={`pill ${s.bg} ${s.fg}`}>{label ?? s.label}</span>;
}

/** R6: amber at 1–2 weeks carried, red at 3+ with the warning attached. */
export function CarryBadge({ weeks, level }: { weeks: number; level: CarryLevel }) {
  if (level === "none") return null;
  const red = level === "red";
  return (
    <span
      className={`pill ${red ? "bg-(--color-off-bg) text-(--color-off)" : "bg-(--color-amber-bg) text-(--color-amber)"}`}
      title={red ? CARRY_WARNING : `Carried ${weeks} week${weeks > 1 ? "s" : ""}`}
    >
      carried {weeks}w{red ? " — this is an issue" : ""}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-(--color-muted) text-[0.95rem] py-6 text-center border border-dashed border-(--color-line) rounded-xl">
      {children}
    </p>
  );
}

export function Stat({
  label,
  value,
  tone = "plain",
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: "plain" | "on" | "off" | "amber";
  sub?: string;
}) {
  const toneClass =
    tone === "on"
      ? "text-(--color-on)"
      : tone === "off"
        ? "text-(--color-off)"
        : tone === "amber"
          ? "text-(--color-amber)"
          : "";
  return (
    <Card className="p-4">
      <div className="text-[0.85rem] uppercase tracking-wide text-(--color-muted) font-medium">
        {label}
      </div>
      <div className={`text-3xl font-semibold mt-1 tabular-nums ${toneClass}`}>{value}</div>
      {sub ? <div className="text-[0.85rem] text-(--color-muted) mt-1">{sub}</div> : null}
    </Card>
  );
}

export function OwnerName({ name }: { name: string | undefined }) {
  return <span className="font-medium">{name ?? "Unassigned"}</span>;
}
