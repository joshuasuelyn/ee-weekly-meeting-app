// The one interface both the Supabase adapter and the local dev adapter implement.
//
// Operations are granular rather than "read the whole database, write the whole database":
// five managers submit at the same time on a Monday morning, and a snapshot-and-overwrite
// store loses whichever write lands second.

import type {
  Headline,
  Issue,
  IssueSource,
  ItemStatus,
  Meeting,
  Metric,
  MetricValue,
  Priority,
  PriorityCheck,
  Rating,
  Segue,
  Settings,
  Submission,
  Todo,
  TodoSource,
  User,
} from "../types";
import type { CarryUpdate } from "../rules";

export interface NewPriority {
  text: string;
  owner_id: string;
  horizon: Priority["horizon"];
  due_date: string;
  scope: Priority["scope"];
  /** The monthly priority this is a weekly step toward, if any. */
  parent_id: string | null;
}

export interface NewTodo {
  text: string;
  owner_id: string;
  due_date: string;
  source: TodoSource;
  origin_issue_id: string | null;
  created_meeting_id: string;
}

export interface NewIssue {
  text: string;
  raised_by_id: string;
  raised_date: string;
  source: IssueSource;
}

export interface Store {
  // --- settings -----------------------------------------------------------
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<void>;

  // --- users --------------------------------------------------------------
  listUsers(opts?: { includeInactive?: boolean }): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  /**
   * Is this address an active team member? Asked before sign-in, so it runs with no
   * session — which is why it cannot be `getUserByEmail() !== null`. Row-level security
   * hides every users row from an anonymous caller, so that check answers "no" for
   * everyone, including people who are on the list. Returns a bare boolean so the
   * anonymous role learns nothing beyond what it already guessed.
   */
  isTeamEmail(email: string): Promise<boolean>;
  upsertUser(user: User): Promise<void>;

  // --- metrics ------------------------------------------------------------
  listMetrics(): Promise<Metric[]>;
  updateMetric(id: string, patch: Partial<Metric>): Promise<void>;
  listMetricValues(meetingId: string): Promise<MetricValue[]>;
  setMetricValue(args: {
    meetingId: string;
    metricId: string;
    value: string | null;
    enteredBy: string;
  }): Promise<void>;

  // --- priorities ---------------------------------------------------------
  listPriorities(): Promise<Priority[]>;
  createPriority(p: NewPriority): Promise<Priority>;
  updatePriority(id: string, patch: Partial<Priority>): Promise<void>;
  listPriorityChecks(meetingId: string): Promise<PriorityCheck[]>;
  setPriorityCheck(meetingId: string, priorityId: string, onTrack: boolean | null): Promise<void>;

  // --- to-dos -------------------------------------------------------------
  listTodos(): Promise<Todo[]>;
  createTodo(t: NewTodo): Promise<Todo>;
  updateTodo(id: string, patch: Partial<Todo>): Promise<void>;
  applyCarryForward(updates: CarryUpdate[]): Promise<void>;

  // --- issues -------------------------------------------------------------
  listIssues(): Promise<Issue[]>;
  createIssues(rows: NewIssue[]): Promise<Issue[]>;
  updateIssue(id: string, patch: Partial<Issue>): Promise<void>;

  // --- meetings -----------------------------------------------------------
  listMeetings(): Promise<Meeting[]>;
  getMeeting(id: string): Promise<Meeting | null>;
  getMeetingByDate(date: string): Promise<Meeting | null>;
  createMeeting(date: string): Promise<Meeting>;
  updateMeeting(id: string, patch: Partial<Meeting>): Promise<void>;

  // --- per-meeting collections -------------------------------------------
  listSegues(meetingId: string): Promise<Segue[]>;
  setSegue(meetingId: string, userId: string, personal: string, professional: string): Promise<void>;
  /**
   * Writes one half of a segue without touching the other. The runner shows the question
   * and the wins as two separate lists, so both halves can be edited on the same screen —
   * a read-modify-write of the whole row would let the slower save undo the faster one.
   */
  setSegueField(
    meetingId: string,
    userId: string,
    field: "personal" | "professional",
    value: string,
  ): Promise<void>;

  listHeadlines(meetingId: string): Promise<Headline[]>;
  addHeadline(meetingId: string, userId: string, text: string): Promise<Headline>;
  updateHeadline(id: string, text: string): Promise<void>;
  deleteHeadline(id: string): Promise<void>;

  listRatings(meetingId: string): Promise<Rating[]>;
  setRating(meetingId: string, userId: string, score: number): Promise<void>;

  listSubmissions(meetingId: string): Promise<Submission[]>;
  setSubmission(meetingId: string, userId: string): Promise<void>;

  /**
   * The issues picked for IDS this week. Not in the spec's data model, but the pick has to
   * survive a browser refresh mid-meeting and R9's cap has to mean something across clients.
   */
  listIssuePicks(meetingId: string): Promise<string[]>;
  setIssuePick(meetingId: string, issueId: string, picked: boolean): Promise<void>;
}

export type { ItemStatus };
