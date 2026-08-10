// View-model assembly. Pages read from here rather than talking to the store directly, so
// "what is the current meeting" and "what carries forward" have one answer each.

import { getStore } from "./db";
import {
  endOfMonth,
  isFirstMondayOfMonth,
  mondayOf,
  nextMeetingDate,
  nextMonday,
  toDateString,
} from "./dates";
import { segueQuestionFor } from "./segue";
import {
  buildScorecard,
  completionFor,
  computeCarryForward,
  currentWeekFor,
  groupPriorities,
  liveMetrics,
  sortIssues,
  staleIssues,
  type Completion,
  type ScorecardRow,
} from "./rules";
import type {
  Headline,
  Issue,
  Meeting,
  Metric,
  Priority,
  PriorityCheck,
  Rating,
  Segue,
  Settings,
  Submission,
  Todo,
  User,
} from "./types";

export function today(): string {
  return toDateString(new Date());
}

/** Monday's meeting: today if today is Monday, otherwise the Monday coming. */
export function targetMeetingDate(from = today()): string {
  return mondayOf(from) === from ? from : nextMonday(from);
}

/**
 * The meeting everything currently points at. The newest meeting that hasn't been closed,
 * or a fresh one for the coming Monday. Created on demand so a manager can prep on Friday
 * without waiting for the facilitator to open it.
 */
export async function getOrCreateCurrentMeeting(): Promise<Meeting> {
  const store = getStore();
  const meetings = await store.listMeetings(); // newest first
  const openMeeting = meetings.find((m) => m.status !== "closed");
  if (openMeeting) return openMeeting;

  return store.createMeeting(nextMeetingDate(meetings[0]?.date ?? null, today()));
}

export interface MeetingContext {
  meeting: Meeting;
  previousMeeting: Meeting | null;
  settings: Settings;
  week: number;
  users: User[];
  usersById: Map<string, User>;
  metrics: Metric[];
  scorecard: ScorecardRow[];
  completion: Completion;
  todos: Todo[];
  openTodos: Todo[];
  reviewTodos: Todo[];
  issues: Issue[];
  openIssues: Issue[];
  priorities: Priority[];
  openPriorities: Priority[];
  priorityChecks: Map<string, boolean | null>;
  segues: Segue[];
  headlines: Headline[];
  ratings: Rating[];
  submissions: Submission[];
  picks: string[];
  staleIssueCount: number;
  overdueTodoCount: number;
}

export async function loadMeetingContext(meetingId?: string): Promise<MeetingContext> {
  const store = getStore();

  const meeting = meetingId
    ? ((await store.getMeeting(meetingId)) ?? (await getOrCreateCurrentMeeting()))
    : await getOrCreateCurrentMeeting();

  const [settings, users, metrics, todos, issues, priorities, meetings] = await Promise.all([
    store.getSettings(),
    store.listUsers(),
    store.listMetrics(),
    store.listTodos(),
    store.listIssues(),
    store.listPriorities(),
    store.listMeetings(),
  ]);

  const previousMeeting =
    meetings.filter((m) => m.date < meeting.date).sort((a, b) => b.date.localeCompare(a.date))[0] ??
    null;

  const [values, previousValues, checks, segues, headlines, ratings, submissions, picks] =
    await Promise.all([
      store.listMetricValues(meeting.id),
      previousMeeting ? store.listMetricValues(previousMeeting.id) : Promise.resolve([]),
      store.listPriorityChecks(meeting.id),
      store.listSegues(meeting.id),
      store.listHeadlines(meeting.id),
      store.listRatings(meeting.id),
      store.listSubmissions(meeting.id),
      store.listIssuePicks(meeting.id),
    ]);

  const completion = completionFor(todos, meeting);
  const scorecard = buildScorecard({
    metrics,
    values,
    previousValues,
    meeting,
    settings,
    completion,
  });

  const openTodos = todos.filter((t) => t.status === "open");
  const openIssues = issues.filter((i) => i.status === "open");

  return {
    meeting,
    previousMeeting,
    settings,
    week: currentWeekFor(meeting.date, settings),
    users,
    usersById: new Map(users.map((u) => [u.id, u])),
    metrics,
    scorecard,
    completion,
    todos,
    openTodos,
    reviewTodos: reviewListSorted(todos, meeting),
    issues,
    openIssues: sortIssues(openIssues, meeting.date),
    priorities,
    openPriorities: priorities.filter((p) => p.status === "open"),
    priorityChecks: new Map<string, boolean | null>(
      (checks as PriorityCheck[]).map((c) => [c.priority_id, c.on_track]),
    ),
    segues,
    headlines,
    ratings,
    submissions,
    picks,
    staleIssueCount: staleIssues(openIssues, meeting.date).length,
    overdueTodoCount: openTodos.filter((t) => t.due_date < meeting.date).length,
  };
}

function reviewListSorted(todos: Todo[], meeting: Meeting): Todo[] {
  return todos
    .filter(
      (t) => t.due_date <= meeting.date && t.created_meeting_id !== meeting.id && t.status !== "dropped",
    )
    .sort((a, b) => b.weeks_carried - a.weeks_carried || a.due_date.localeCompare(b.due_date));
}

/** The manager's own slice of the world — everything the 5-minute screen needs, nothing else. */
export async function loadPrep(user: User) {
  const store = getStore();
  const meeting = await getOrCreateCurrentMeeting();

  const [settings, metrics, priorities, meetings, submissions, users, headlines, segues] =
    await Promise.all([
      store.getSettings(),
      store.listMetrics(),
      store.listPriorities(),
      store.listMeetings(),
      store.listSubmissions(meeting.id),
      store.listUsers(),
      store.listHeadlines(meeting.id),
      store.listSegues(meeting.id),
    ]);

  const previousMeeting =
    meetings.filter((m) => m.date < meeting.date).sort((a, b) => b.date.localeCompare(a.date))[0] ??
    null;

  const [values, previousValues] = await Promise.all([
    store.listMetricValues(meeting.id),
    previousMeeting ? store.listMetricValues(previousMeeting.id) : Promise.resolve([]),
  ]);

  const week = currentWeekFor(meeting.date, settings);
  const mine = liveMetrics(metrics, week).filter((m) => m.owner_id === user.id && !m.auto_calc);
  const myPriorities = priorities.filter((p) => p.owner_id === user.id && p.status === "open");
  const monthlies = myPriorities.filter((p) => p.horizon !== "week");

  return {
    meeting,
    settings,
    week,
    myMetrics: mine.map((metric) => ({
      metric,
      value: values.find((v) => v.metric_id === metric.id)?.value ?? "",
      lastValue: previousValues.find((v) => v.metric_id === metric.id)?.value ?? null,
    })),
    myPriorities,
    /**
     * Closed this month, newest first. Done is one click with no confirmation, so there has
     * to be a way back that outlives the undo banner — otherwise a misclick noticed after a
     * refresh is permanent.
     */
    myClosed: priorities
      .filter(
        (p) =>
          p.owner_id === user.id &&
          p.status === "done" &&
          p.due_date >= meeting.date.slice(0, 8) + "01",
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8),
    /**
     * My own segue answers. On the prep screen because being asked cold in the room is
     * what makes the round slow and awkward — people deserve a moment to think of
     * something worth saying. It is still spoken aloud on Monday; this only means nobody
     * is composing it while four people wait.
     */
    mySegue: (() => {
      const mine = segues.find((s) => s.user_id === user.id);
      return { personal: mine?.personal ?? "", professional: mine?.professional ?? "" };
    })(),
    segueQuestion: segueQuestionFor(meeting.date),
    // Second argument is the whole board: my goals, but every step hanging off them.
    grouped: groupPriorities(myPriorities, meeting.date, priorities),
    /** Everyone a weekly step can be handed to — the cascade runs to people, not to roles. */
    people: users.map((u) => ({ id: u.id, name: u.name })),
    /**
     * My cross-department points for this meeting. Written on Friday means Monday's
     * section is read aloud rather than typed — the same reason the numbers are prepped.
     */
    myAlignment: headlines
      .filter((h) => h.user_id === user.id)
      .map((h) => ({ id: h.id, text: h.text })),
    /**
     * Text of the monthly goals my steps hang off, including goals owned by someone else.
     * A step cascaded down from another manager arrives with no context otherwise.
     */
    parentTextById: Object.fromEntries(
      priorities
        .filter((p) => myPriorities.some((m) => m.parent_id === p.id))
        .map((p) => [p.id, p.text]),
    ) as Record<string, string>,
    /**
     * Whether the month's setup block should *press*. True on the first Monday of a month,
     * and in any week where this person's department has no monthly goal or one has run
     * past its date. When false the block is still offered, just quietly — a card that nags
     * every week is a card people learn to scroll past.
     */
    needsMonthlySetup:
      isFirstMondayOfMonth(meeting.date) ||
      monthlies.filter((p) => p.scope === "department").length === 0 ||
      monthlies.some((p) => p.due_date < meeting.date),
    monthDueDate: endOfMonth(meeting.date),
    // A plain object rather than a Map: this crosses into a client component.
    checks: Object.fromEntries(
      (await store.listPriorityChecks(meeting.id)).map((c) => [c.priority_id, c.on_track]),
    ) as Record<string, boolean | null>,
    submitted: submissions.some((s) => s.user_id === user.id),
  };
}

/**
 * R6 at meeting start: every overdue open to-do carries itself. Idempotent, so calling this
 * on every load of the runner is safe.
 */
export async function applyCarryForwardFor(meeting: Meeting): Promise<void> {
  const store = getStore();
  const todos = await store.listTodos();
  const updates = computeCarryForward(todos, meeting);
  if (updates.length > 0) await store.applyCarryForward(updates);
}
