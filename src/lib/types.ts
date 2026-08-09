// Domain types — mirrors the data model in §4 of the build spec.

export type Role = "facilitator" | "manager" | "contributor";
export type Direction = "gte" | "lte" | "yesno";
export type Horizon = "week" | "month" | "quarter";
/** Whose goal this is. The department itself is the owner's `users.department`. */
export type PriorityScope = "department" | "individual";
export type ItemStatus = "open" | "done" | "dropped";
export type TodoSource = "ids" | "declared" | "manual";
export type IssueStatus = "open" | "solved" | "dropped";
export type IssueSource = "manual" | "scorecard" | "priority" | "todo";
export type MeetingStatus = "scheduled" | "running" | "closed";
export type AutoCalc = "todo_completion";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  active: boolean;
}

export interface Metric {
  id: string;
  name: string;
  owner_id: string;
  /** Null = target not yet agreed. Renders grey, not red (R2). */
  target: number | null;
  direction: Direction;
  unit: string;
  definition: string;
  /** Rollout gate. Before this week the line is greyed and excluded from red counts (R1 exception). */
  live_from_week: number;
  sort_order: number;
  /** `todo_completion` is computed by R7, never entered. */
  auto_calc: AutoCalc | null;
  active: boolean;
}

export interface MetricValue {
  id: string;
  metric_id: string;
  meeting_id: string;
  /** Null is an off-track, not a neutral gap (R1). */
  value: string | null;
  entered_by: string;
  entered_at: string;
}

export interface Priority {
  id: string;
  text: string;
  owner_id: string;
  horizon: Horizon;
  due_date: string;
  status: ItemStatus;
  created_at: string;
  /** Set on monthly priorities; weekly children inherit it from their parent. */
  scope: PriorityScope;
  /**
   * The monthly priority this is a weekly step toward. One level only — a weekly
   * priority never parents anything, so there are no trees to walk.
   */
  parent_id: string | null;
}

export interface PriorityCheck {
  priority_id: string;
  meeting_id: string;
  /** Null = not reviewed this week. */
  on_track: boolean | null;
}

export interface Todo {
  id: string;
  text: string;
  owner_id: string;
  due_date: string;
  status: ItemStatus;
  source: TodoSource;
  origin_issue_id: string | null;
  created_meeting_id: string;
  weeks_carried: number;
  /**
   * Implementation detail for R6. The spec defines `weeks_carried` as auto-incremented but
   * gives it no idempotency key; storing the meeting that last incremented it is what makes
   * "running twice on the same meeting date must not double-count" true by construction.
   */
  last_carried_meeting_id: string | null;
}

export interface Issue {
  id: string;
  text: string;
  raised_by_id: string;
  raised_date: string;
  status: IssueStatus;
  resolution_note: string | null;
  solved_meeting_id: string | null;
  source: IssueSource;
}

export interface Meeting {
  id: string;
  date: string;
  status: MeetingStatus;
  current_section: number;
  section_started_at: string | null;
  completion_pct: number | null;
  rating_avg: number | null;
  cascading_messages: string;
}

export interface Segue {
  meeting_id: string;
  user_id: string;
  personal: string;
  professional: string;
}

/**
 * Added as needed rather than one box per person. Nobody owes a headline — silence is a
 * real answer, and a field every manager is expected to fill is how a section becomes
 * filler and then gets abandoned.
 */
export interface Headline {
  id: string;
  meeting_id: string;
  user_id: string;
  text: string;
  created_at: string;
}

export interface Rating {
  meeting_id: string;
  user_id: string;
  score: number;
}

export interface Submission {
  meeting_id: string;
  user_id: string;
  submitted_at: string;
}

export interface Settings {
  /** The Monday of week 1. Drives `live_from_week` gating. */
  rollout_start_date: string;
  /** "X" from §7 line 6 — weeks before departure that an under-min-pax tour becomes actionable. */
  tour_window_weeks: number | null;
}

export interface Database {
  users: User[];
  metrics: Metric[];
  metric_values: MetricValue[];
  priorities: Priority[];
  priority_checks: PriorityCheck[];
  todos: Todo[];
  issues: Issue[];
  meetings: Meeting[];
  segues: Segue[];
  headlines: Headline[];
  ratings: Rating[];
  submissions: Submission[];
  settings: Settings;
}

/**
 * `short` is what the left rail shows; `name` is the section heading. They differ only for
 * cross-department alignment, whose full name is deliberately plain English — "headlines"
 * is EOS vocabulary the team doesn't use — but too long to sit in the rail.
 *
 * Order note: sections 2, 3 and 4 are all binary, so they run back to back as one fast
 * block. Alignment sits at 5, immediately before IDS: it's the only prose section before
 * the discussion, and it works as a residual — "what matters that the numbers didn't
 * show" — which needs the numbers to have been read first.
 */
export const SECTIONS = [
  { n: 1, name: "Segue", short: "Segue", minutes: 5, blurb: "One personal best + one professional best. One line each." },
  { n: 2, name: "Scorecard", short: "Scorecard", minutes: 5, blurb: "Read the numbers. On or off track. No discussion." },
  { n: 3, name: "Priorities", short: "Priorities", minutes: 5, blurb: "On or off track only. Off-track drops to Issues." },
  { n: 4, name: "To-Do Review", short: "To-Do Review", minutes: 5, blurb: "Done or not done. No explanations. Target 90%." },
  {
    n: 5,
    name: "Cross-department alignment",
    short: "Alignment",
    minutes: 5,
    blurb: "What other departments need to know. Nobody owes one.",
  },
  { n: 6, name: "IDS", short: "IDS", minutes: 60, blurb: "Identify · Discuss · Solve. Top 3 issues. Each solve creates a to-do." },
  { n: 7, name: "Conclude", short: "Conclude", minutes: 5, blurb: "Recap to-dos, cascading messages, rate the meeting 1–10." },
] as const;

export const TOTAL_MEETING_MINUTES = SECTIONS.reduce((sum, s) => sum + s.minutes, 0);
