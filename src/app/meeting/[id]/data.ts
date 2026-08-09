// Flattens a MeetingContext into plain, serialisable props for the client runner.
// Everything the runner needs is computed here on the server so the client never
// re-derives a verdict and disagrees with the scorecard.

import { renderDefinition } from "@/lib/db/seed-data";
import type { MeetingContext } from "@/lib/queries";
import { carryLevel, hasStepForWeek, weeksOpen, type CarryLevel, type MetricState } from "@/lib/rules";
import type { Meeting, PriorityScope, User } from "@/lib/types";

export interface RunnerPerson {
  id: string;
  name: string;
  department: string;
  role: User["role"];
}

export interface RunnerScorecardRow {
  metricId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  targetLabel: string;
  definition: string;
  value: string;
  lastValue: string | null;
  state: MetricState;
  reason: string;
  countsAsRed: boolean;
  readOnly: boolean;
  isYesNo: boolean;
}

export interface RunnerPriority {
  id: string;
  text: string;
  ownerId: string;
  ownerName: string;
  /** The owner's department — how department-scoped priorities are grouped in the runner. */
  department: string;
  horizon: string;
  dueDate: string;
  onTrack: boolean | null;
  scope: PriorityScope;
  parentId: string | null;
  /** True for a monthly priority with nothing moving it this week. */
  needsStep: boolean;
}

export interface RunnerTodo {
  id: string;
  text: string;
  ownerId: string;
  ownerName: string;
  dueDate: string;
  status: string;
  weeksCarried: number;
  carry: CarryLevel;
  originIssueId: string | null;
  createdThisMeeting: boolean;
}

export interface RunnerIssue {
  id: string;
  text: string;
  raisedByName: string;
  raisedDate: string;
  weeksOpen: number;
  picked: boolean;
  linkedTodos: RunnerTodo[];
  canSolve: boolean;
  solveMessage: string;
}

export interface RunnerHeadline {
  id: string;
  userId: string;
  userName: string;
  text: string;
}

export interface RunnerData {
  meeting: Meeting;
  week: number;
  isFacilitator: boolean;
  currentUserId: string;
  people: RunnerPerson[];
  scorecard: RunnerScorecardRow[];
  redCount: number;
  priorities: RunnerPriority[];
  reviewTodos: RunnerTodo[];
  newTodos: RunnerTodo[];
  /** Every open to-do, not only this week's review list — what the dashboard shows. */
  allOpenTodos: RunnerTodo[];
  openIssues: RunnerIssue[];
  segues: Record<string, { personal: string; professional: string }>;
  headlines: RunnerHeadline[];
  ratings: Record<string, number>;
  completion: { pct: number | null; done: number; total: number };
  submittedUserIds: string[];
  defaultDueDate: string;
}

function targetLabel(row: MeetingContext["scorecard"][number]): string {
  const { metric } = row;
  if (metric.direction === "yesno") return "yes";
  if (metric.target === null) return "TBC";
  const arrow = metric.direction === "gte" ? "≥" : "≤";
  return metric.unit === "RM"
    ? `${arrow} RM${metric.target}`
    : `${arrow} ${metric.target}${metric.unit}`;
}

export function toRunnerTodo(
  t: MeetingContext["todos"][number],
  ctx: Pick<MeetingContext, "usersById" | "meeting">,
): RunnerTodo {
  return {
    id: t.id,
    text: t.text,
    ownerId: t.owner_id,
    ownerName: ctx.usersById.get(t.owner_id)?.name ?? "Unassigned",
    dueDate: t.due_date,
    status: t.status,
    weeksCarried: t.weeks_carried,
    carry: carryLevel(t.weeks_carried),
    originIssueId: t.origin_issue_id,
    createdThisMeeting: t.created_meeting_id === ctx.meeting.id,
  };
}

export function buildRunnerData(
  ctx: MeetingContext,
  currentUser: User,
  defaultDueDate: string,
): RunnerData {
  const name = (id: string) => ctx.usersById.get(id)?.name ?? "Unassigned";
  const mapTodo = (t: MeetingContext["todos"][number]) => toRunnerTodo(t, ctx);

  const openIssues: RunnerIssue[] = ctx.openIssues.map((issue) => {
    const linked = ctx.todos
      .filter((t) => t.origin_issue_id === issue.id)
      .map(mapTodo);
    // R5: usable means not dropped, with an owner and a due date.
    const usable = linked.filter((t) => t.status !== "dropped" && t.ownerId && t.dueDate);
    return {
      id: issue.id,
      text: issue.text,
      raisedByName: name(issue.raised_by_id),
      raisedDate: issue.raised_date,
      weeksOpen: weeksOpen(issue, ctx.meeting.date),
      picked: ctx.picks.includes(issue.id),
      linkedTodos: linked,
      canSolve: usable.length > 0,
      solveMessage:
        usable.length > 0
          ? `${usable.length} to-do${usable.length > 1 ? "s" : ""} attached.`
          : "An issue can't be marked solved until it has a to-do with one owner and a due date. Add the action that closes it.",
    };
  });

  return {
    meeting: ctx.meeting,
    week: ctx.week,
    isFacilitator: currentUser.role === "facilitator",
    currentUserId: currentUser.id,
    people: ctx.users.map((u) => ({
      id: u.id,
      name: u.name,
      department: u.department,
      role: u.role,
    })),
    scorecard: ctx.scorecard.map((row) => ({
      metricId: row.metric.id,
      name: row.metric.name,
      ownerId: row.metric.owner_id,
      ownerName: name(row.metric.owner_id),
      targetLabel: targetLabel(row),
      definition: renderDefinition(row.metric.definition, ctx.settings),
      value: row.value ?? "",
      lastValue: row.lastValue,
      state: row.verdict.state,
      reason: row.verdict.reason,
      countsAsRed: row.verdict.countsAsRed,
      readOnly: row.readOnly,
      isYesNo: row.metric.direction === "yesno",
    })),
    redCount: ctx.scorecard.filter((r) => r.verdict.countsAsRed).length,
    priorities: ctx.openPriorities.map((p) => ({
      id: p.id,
      text: p.text,
      ownerId: p.owner_id,
      ownerName: name(p.owner_id),
      department: ctx.usersById.get(p.owner_id)?.department ?? "Unassigned",
      horizon: p.horizon,
      dueDate: p.due_date,
      onTrack: ctx.priorityChecks.get(p.id) ?? null,
      scope: p.scope,
      parentId: p.parent_id,
      needsStep:
        p.horizon !== "week" && !hasStepForWeek(p.id, ctx.priorities, ctx.meeting.date),
    })),
    reviewTodos: ctx.reviewTodos.map(mapTodo),
    newTodos: ctx.todos.filter((t) => t.created_meeting_id === ctx.meeting.id).map(mapTodo),
    allOpenTodos: ctx.openTodos
      .map(mapTodo)
      .sort((a, b) => b.weeksCarried - a.weeksCarried || a.dueDate.localeCompare(b.dueDate)),
    openIssues,
    segues: Object.fromEntries(
      ctx.segues.map((s) => [s.user_id, { personal: s.personal, professional: s.professional }]),
    ),
    headlines: ctx.headlines.map((h) => ({
      id: h.id,
      userId: h.user_id,
      userName: name(h.user_id),
      text: h.text,
    })),
    ratings: Object.fromEntries(ctx.ratings.map((r) => [r.user_id, r.score])),
    completion: ctx.completion,
    submittedUserIds: ctx.submissions.map((s) => s.user_id),
    defaultDueDate,
  };
}
