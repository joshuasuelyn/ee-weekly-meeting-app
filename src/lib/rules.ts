// The non-negotiables from §5 of the build spec, as pure functions.
//
// Every rule here exists because its absence caused a documented failure in the previous
// format. They are kept free of I/O so they can be tested without a database, and so the
// UI has exactly one place to ask "is this red?" rather than deciding for itself.

import { addDays, daysBetween, nextMonday, rolloutWeek } from "./dates";
import type {
  Horizon,
  Issue,
  Meeting,
  Metric,
  MetricValue,
  Priority,
  Settings,
  Todo,
} from "./types";

// ---------------------------------------------------------------------------
// R1 / R2 — blank renders red, target-not-set renders grey
// ---------------------------------------------------------------------------

export type MetricState =
  | "on" // hit the target
  | "off" // missed it, or blank (R1)
  | "grey" // target not agreed yet (R2)
  | "future"; // not live until a later rollout week

export interface MetricVerdict {
  state: MetricState;
  /** True when this line counts toward the meeting's red count. */
  countsAsRed: boolean;
  reason: string;
}

export function evaluateMetric(
  metric: Metric,
  rawValue: string | null | undefined,
  currentWeek: number,
): MetricVerdict {
  if (metric.live_from_week > currentWeek) {
    return {
      state: "future",
      countsAsRed: false,
      reason: `Live from week ${metric.live_from_week}`,
    };
  }

  const value = rawValue == null ? "" : String(rawValue).trim();

  if (metric.direction === "yesno") {
    // Yes/no lines carry their own target; an unset numeric target is not a gap here.
    if (value === "") {
      return { state: "off", countsAsRed: true, reason: "Not entered — a blank is an off-track" };
    }
    const yes = /^(y|yes|true|1)$/i.test(value);
    return yes
      ? { state: "on", countsAsRed: false, reason: "Yes" }
      : { state: "off", countsAsRed: true, reason: "No" };
  }

  if (metric.target === null) {
    return {
      state: "grey",
      countsAsRed: false,
      reason: "Target not agreed yet — decide it before this line can go red",
    };
  }

  // R1. This is the single most important rule: a missing number is an off-track,
  // not a neutral gap. The previous format died because half-filled columns looked fine.
  if (value === "") {
    return { state: "off", countsAsRed: true, reason: "Not entered — a blank is an off-track" };
  }

  const n = Number(value);
  if (Number.isNaN(n)) {
    return { state: "off", countsAsRed: true, reason: "Not a number" };
  }

  const on = metric.direction === "gte" ? n >= metric.target : n <= metric.target;
  return {
    state: on ? "on" : "off",
    countsAsRed: !on,
    reason: on
      ? `${n} ${metric.direction === "gte" ? "≥" : "≤"} ${metric.target}`
      : `${n} ${metric.direction === "gte" ? "<" : ">"} ${metric.target}`,
  };
}

/** Metrics that are live for a given meeting week — what the scorecard actually shows. */
export function liveMetrics(metrics: Metric[], currentWeek: number): Metric[] {
  return metrics
    .filter((m) => m.active && m.live_from_week <= currentWeek)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** R2 follow-through: grey lines belong on an admin to-do list until a target is agreed. */
export function metricsMissingTargets(metrics: Metric[]): Metric[] {
  return metrics.filter((m) => m.active && m.direction !== "yesno" && m.target === null);
}

export function currentWeekFor(meetingDate: string, settings: Settings): number {
  return rolloutWeek(meetingDate, settings.rollout_start_date);
}

// ---------------------------------------------------------------------------
// R4 — a to-do is 7 days
// ---------------------------------------------------------------------------

export const TODO_HORIZON_DAYS = 14;

export function defaultDueDate(from: string): string {
  return nextMonday(from);
}

/**
 * True when a proposed due date is far enough out that it is really a priority.
 * The UI prompts rather than blocks — R4 is a nudge, not a gate.
 */
export function isBeyondTodoHorizon(dueDate: string, from: string): boolean {
  return daysBetween(from, dueDate) > TODO_HORIZON_DAYS;
}

// ---------------------------------------------------------------------------
// Priorities — scope, and monthly broken down to weekly
//
// A monthly priority nobody has broken into a weekly step is a wish. The previous format
// proved it: `Win For The Month` was blank in 34 weeks out of 34, and
// `Department Goal Progress` lasted four. So an un-stepped monthly priority is rendered
// visibly incomplete, the same way a blank metric is under R1 — amber rather than red,
// because this is a nudge like R4 and not a gate like R5.
// ---------------------------------------------------------------------------

/** A weekly step counts if it lands inside the week the meeting opens. */
export const STEP_WINDOW_DAYS = 7;

/**
 * Steps are checkpoints, not a work breakdown. Without a ceiling the board measures who
 * writes things down rather than who delivers: the manager who lists thirty items looks
 * buried while the one who lists none looks idle, and section 3 stops fitting in its five
 * minutes. Three is the same ceiling R9 puts on issues, for the same reason.
 */
export const MAX_STEPS_PER_WEEK = 3;

/** Singular and verifiable on purpose — "what will be done", not "what will I work on". */
export const NO_STEP_PROMPT = "No step this week. What will be visibly done by next Monday?";

export const STEP_OVERFLOW_PROMPT =
  "Three steps is the limit for one goal. Anything beyond that is a to-do, not a priority — put it on the to-do list and it gets reviewed done/not-done on Monday.";

/**
 * Monthly priorities one department may carry at once.
 *
 * Three, for the same reason issues cap at three and steps cap at three: a list longer
 * than that stops being a set of priorities and becomes a description of the job. Each one
 * has to cascade into weekly steps that the room reviews on Monday, and nobody cascades
 * six goals in five minutes — so the ceiling is what keeps the cascade real rather than
 * decorative.
 */
export const MAX_MONTHLY_PRIORITIES = 3;

export const MONTHLY_OVERFLOW_PROMPT =
  "Three is the limit for a month. A fourth would not get cascaded — close or finish one first.";

/** Open monthly priorities owned by this person, whatever their scope. */
export function monthlyPrioritiesFor(ownerId: string, priorities: Priority[]): Priority[] {
  return priorities.filter(
    (p) => p.owner_id === ownerId && p.horizon === "month" && p.status === "open",
  );
}

/** The ceiling on monthly priorities. Blocks a fourth and says why. */
export function canAddMonthlyPriority(ownerId: string, priorities: Priority[]): Gate {
  return monthlyPrioritiesFor(ownerId, priorities).length >= MAX_MONTHLY_PRIORITIES
    ? { allowed: false, message: MONTHLY_OVERFLOW_PROMPT }
    : { allowed: true, message: "" };
}

export function canParentPriority(parent: Priority, childHorizon: Horizon): Gate {
  if (parent.horizon !== "month") {
    return {
      allowed: false,
      message: "Only a monthly priority can be broken into weekly steps.",
    };
  }
  if (parent.parent_id !== null) {
    return {
      allowed: false,
      message: "A step can't have its own steps — keep it one level deep.",
    };
  }
  if (childHorizon !== "week") {
    return { allowed: false, message: "A step toward a monthly priority is a weekly one." };
  }
  return { allowed: true, message: "" };
}

/** The weekly steps hanging off a monthly priority, dropped ones excluded. */
export function stepsFor(parentId: string, priorities: Priority[]): Priority[] {
  return priorities
    .filter((p) => p.parent_id === parentId && p.status !== "dropped")
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at));
}

/**
 * Steps on this monthly priority landing inside the coming week. A date range rather than
 * an exact match, so hand-editing a due date by a day doesn't silently void a step. A step
 * already done still counts — nobody should be nagged for finishing early.
 */
export function stepsThisWeek(
  parentId: string,
  priorities: Priority[],
  meetingDate: string,
): Priority[] {
  const windowEnd = addDays(meetingDate, STEP_WINDOW_DAYS);
  return stepsFor(parentId, priorities).filter(
    (s) => s.due_date > meetingDate && s.due_date <= windowEnd,
  );
}

export function hasStepForWeek(
  parentId: string,
  priorities: Priority[],
  meetingDate: string,
): boolean {
  return stepsThisWeek(parentId, priorities, meetingDate).length > 0;
}

/** The ceiling. Blocks a fourth step and says where the work actually belongs. */
export function canAddStep(
  parentId: string,
  priorities: Priority[],
  meetingDate: string,
): Gate {
  const used = stepsThisWeek(parentId, priorities, meetingDate).length;
  return used >= MAX_STEPS_PER_WEEK
    ? { allowed: false, message: STEP_OVERFLOW_PROMPT }
    : { allowed: true, message: "" };
}

export function monthlyPrioritiesNeedingStep(
  priorities: Priority[],
  meetingDate: string,
): Priority[] {
  return priorities.filter(
    (p) =>
      p.horizon === "month" &&
      p.status === "open" &&
      !hasStepForWeek(p.id, priorities, meetingDate),
  );
}

export interface PriorityGroup {
  parent: Priority;
  steps: Priority[];
  needsStep: boolean;
  /** True once this goal has its three steps for the week — further work is a to-do. */
  atStepCap: boolean;
}

export interface GroupedPriorities {
  department: PriorityGroup[];
  individual: PriorityGroup[];
  /** Weekly priorities declared on their own, with no monthly priority above them. */
  orphanWeeklies: Priority[];
}

/**
 * The one grouping function. The prep screen, the meeting runner and the markdown export
 * all call it, so a priority can never appear under one heading in the meeting and a
 * different one in the export.
 */
export function groupPriorities(
  mine: Priority[],
  meetingDate: string,
  /**
   * Every priority in play, when `mine` is one person's slice. A goal's steps belong to
   * the goal, not to the viewer — cascade three steps to three people and the owner still
   * has to see all three, or the cap counts one and the amber nudge fires on a goal that
   * is already covered. Defaults to `mine` for callers that pass the whole board.
   */
  all: Priority[] = mine,
): GroupedPriorities {
  const byCreated = (a: Priority, b: Priority) => a.created_at.localeCompare(b.created_at);

  const monthly = mine.filter((p) => p.horizon !== "week" && p.status === "open").sort(byCreated);

  const toGroup = (parent: Priority): PriorityGroup => {
    const thisWeek = stepsThisWeek(parent.id, all, meetingDate);
    return {
      parent,
      steps: stepsFor(parent.id, all),
      needsStep: thisWeek.length === 0,
      atStepCap: thisWeek.length >= MAX_STEPS_PER_WEEK,
    };
  };

  // Orphan detection uses the parents on *this* screen: a step I own under someone else's
  // goal has to surface somewhere, and their goal isn't shown here.
  const shownParentIds = new Set(monthly.map((p) => p.id));

  return {
    department: monthly.filter((p) => p.scope === "department").map(toGroup),
    individual: monthly.filter((p) => p.scope !== "department").map(toGroup),
    orphanWeeklies: mine
      .filter(
        (p) =>
          p.horizon === "week" &&
          p.status === "open" &&
          (p.parent_id === null || !shownParentIds.has(p.parent_id)),
      )
      .sort(byCreated),
  };
}

// ---------------------------------------------------------------------------
// R5 — an issue cannot be solved without a to-do
// ---------------------------------------------------------------------------

/** A yes/no with a reason attached. Nothing in this app disables silently. */
export interface Gate {
  allowed: boolean;
  message: string;
}

export type SolveGate = Gate;

/** The only hard gate in the app. Returns an explanation, never a silent disable. */
export function canSolveIssue(linkedTodos: Todo[]): SolveGate {
  const usable = linkedTodos.filter(
    (t) => t.status !== "dropped" && t.owner_id?.trim() && t.due_date?.trim(),
  );
  if (usable.length === 0) {
    return {
      allowed: false,
      message:
        "An issue can't be marked solved until it has a to-do with one owner and a due date. Add the action that closes it.",
    };
  }
  return { allowed: true, message: `${usable.length} to-do${usable.length > 1 ? "s" : ""} attached.` };
}

// ---------------------------------------------------------------------------
// R6 — overdue to-dos carry themselves
// ---------------------------------------------------------------------------

export interface CarryUpdate {
  id: string;
  weeks_carried: number;
  last_carried_meeting_id: string;
}

/**
 * Every open to-do overdue at meeting start gets weeks_carried += 1.
 * Idempotent: a to-do already carried by this meeting is skipped, so running twice on the
 * same meeting date cannot double-count.
 */
export function computeCarryForward(todos: Todo[], meeting: Meeting): CarryUpdate[] {
  return todos
    .filter(
      (t) =>
        t.status === "open" &&
        daysBetween(t.due_date, meeting.date) > 0 &&
        t.last_carried_meeting_id !== meeting.id,
    )
    .map((t) => ({
      id: t.id,
      weeks_carried: t.weeks_carried + 1,
      last_carried_meeting_id: meeting.id,
    }));
}

export type CarryLevel = "none" | "amber" | "red";

/** Amber at 1–2 weeks carried, red at 3+. Anything red is an issue, not a to-do. */
export function carryLevel(weeksCarried: number): CarryLevel {
  if (weeksCarried >= 3) return "red";
  if (weeksCarried >= 1) return "amber";
  return "none";
}

export const CARRY_WARNING =
  "Carried 3+ weeks. This is an issue, not a to-do — take it to IDS.";

// ---------------------------------------------------------------------------
// R7 — completion % is computed, not entered
// ---------------------------------------------------------------------------

export const COMPLETION_TARGET = 90;

export interface Completion {
  pct: number | null;
  done: number;
  total: number;
}

/**
 * The review list is every to-do due by the meeting date that was not created in this same
 * meeting — you cannot fail a to-do you were handed thirty seconds ago.
 */
export function reviewList(todos: Todo[], meeting: Meeting): Todo[] {
  return todos.filter(
    (t) =>
      daysBetween(t.due_date, meeting.date) >= 0 &&
      t.created_meeting_id !== meeting.id &&
      t.status !== "dropped",
  );
}

export function completionFor(todos: Todo[], meeting: Meeting): Completion {
  const list = reviewList(todos, meeting);
  const done = list.filter((t) => t.status === "done").length;
  if (list.length === 0) return { pct: null, done: 0, total: 0 };
  return { pct: Math.round((done / list.length) * 100), done, total: list.length };
}

// ---------------------------------------------------------------------------
// R8 / R9 — issue ordering and the three-issue cap
// ---------------------------------------------------------------------------

export const MAX_ISSUES_PER_MEETING = 3;

export function weeksOpen(issue: Issue, asOf: string): number {
  return Math.max(0, Math.floor(daysBetween(issue.raised_date, asOf) / 7));
}

/**
 * Oldest first, always. The oldest issue is the one being avoided, so the app never offers
 * a different default sort.
 */
export function sortIssues<T extends Issue>(issues: T[], asOf: string): T[] {
  return [...issues].sort((a, b) => {
    const diff = weeksOpen(b, asOf) - weeksOpen(a, asOf);
    if (diff !== 0) return diff;
    return a.raised_date.localeCompare(b.raised_date);
  });
}

export function canSelectMoreIssues(selectedCount: number): boolean {
  return selectedCount < MAX_ISSUES_PER_MEETING;
}

/** Issues open 3+ weeks — surfaced on the dashboard as the staleness count. */
export function staleIssues<T extends Issue>(issues: T[], asOf: string): T[] {
  return issues.filter((i) => i.status === "open" && weeksOpen(i, asOf) >= 3);
}

// ---------------------------------------------------------------------------
// R11 — brain dump splitting
// ---------------------------------------------------------------------------

/**
 * Each non-empty line becomes its own issue. Sue Lyn writes 25–40 item dumps into a single
 * cell today and must not be asked to change that; the format absorbs her, not the reverse.
 * Leading bullets and numbering are stripped so a pasted list doesn't arrive as "- thing".
 */
export function splitBrainDump(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((line) => line.length > 0);
}

// ---------------------------------------------------------------------------
// R10 — off-track routes to Issues in one click
// ---------------------------------------------------------------------------

export function issueTextForMetric(metric: Metric, verdict: MetricVerdict): string {
  return `${metric.name} off track — ${verdict.reason}`;
}

export function issueTextForPriority(priorityText: string): string {
  return `Priority off track — ${priorityText}`;
}

// ---------------------------------------------------------------------------
// R3 — exactly one owner
// ---------------------------------------------------------------------------

/**
 * "SL & Grace" is not an owner. Owner fields are single-select in the UI; this guards the
 * server action against anything that gets past it.
 */
export function assertSingleOwner(ownerId: string | null | undefined): string {
  const id = (ownerId ?? "").trim();
  if (!id) throw new Error("An owner is required — exactly one person, never a pair (R3).");
  if (/[,&]|\band\b|\+/i.test(id)) {
    throw new Error("Exactly one owner. Two names is the same as no owner (R3).");
  }
  return id;
}

// ---------------------------------------------------------------------------
// Scorecard assembly — the one place the scorecard is computed
// ---------------------------------------------------------------------------

export interface ScorecardRow {
  metric: Metric;
  value: string | null;
  verdict: MetricVerdict;
  /** Previous meeting's value, shown for reference on the prep screen. */
  lastValue: string | null;
  readOnly: boolean;
}

export function buildScorecard(args: {
  metrics: Metric[];
  values: MetricValue[];
  previousValues: MetricValue[];
  meeting: Meeting;
  settings: Settings;
  completion: Completion;
}): ScorecardRow[] {
  const { metrics, values, previousValues, meeting, settings, completion } = args;
  const week = currentWeekFor(meeting.date, settings);

  return liveMetrics(metrics, week).map((metric) => {
    // R7: line 11 is computed and read-only on the scorecard.
    const value =
      metric.auto_calc === "todo_completion"
        ? completion.pct === null
          ? null
          : String(completion.pct)
        : (values.find((v) => v.metric_id === metric.id)?.value ?? null);

    return {
      metric,
      value,
      verdict: evaluateMetric(metric, value, week),
      lastValue: previousValues.find((v) => v.metric_id === metric.id)?.value ?? null,
      readOnly: metric.auto_calc !== null,
    };
  });
}

export function redCount(rows: ScorecardRow[]): number {
  return rows.filter((r) => r.verdict.countsAsRed).length;
}

// ---------------------------------------------------------------------------
// R12 — nothing is retyped, ever
// ---------------------------------------------------------------------------

/**
 * What carries into a new meeting without anyone typing: open to-dos, open issues, open
 * priorities. Kept as one named function so "does this carry?" has a single answer.
 */
export function carriesForward(item: { status: string }): boolean {
  return item.status === "open";
}

/** Default due date for a to-do created during a meeting. */
export function todoDueDateFor(meetingDate: string): string {
  return defaultDueDate(meetingDate);
}

/** A monthly priority created from an over-horizon to-do lands four weeks out. */
export function monthlyDueDateFor(from: string): string {
  return addDays(from, 28);
}
