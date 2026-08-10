// File-backed store for local development and for verifying the rules end-to-end without
// provisioning anything. Same interface as the Supabase adapter; not for production use —
// it assumes a single Node process and serialises writes through one promise chain.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CarryUpdate } from "../rules";
import type {
  Database,
  Headline,
  Issue,
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
  User,
} from "../types";
import { DEFAULT_SETTINGS, SEED_METRICS, SEED_USERS } from "./seed-data";
import type { NewIssue, NewPriority, NewTodo, Store } from "./store";

interface LocalDatabase extends Database {
  issue_picks: { meeting_id: string; issue_id: string }[];
}

const DB_PATH = process.env.LOCAL_DB_PATH ?? join(process.cwd(), ".data", "db.json");

function emptyDb(): LocalDatabase {
  return {
    users: structuredClone(SEED_USERS),
    metrics: structuredClone(SEED_METRICS),
    metric_values: [],
    priorities: [],
    priority_checks: [],
    todos: [],
    issues: [],
    meetings: [],
    segues: [],
    headlines: [],
    ratings: [],
    submissions: [],
    issue_picks: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Always reads from disk. An in-memory cache looks tempting at this size, but Next.js
 * loads server actions and page renders into separate module instances, so a cached
 * snapshot goes stale the moment the other instance writes — the file is the only thing
 * both sides agree on. The dataset is a few hundred rows; re-reading it costs nothing.
 */
async function load(): Promise<LocalDatabase> {
  try {
    const raw = await readFile(DB_PATH, "utf8");
    return { ...emptyDb(), ...(JSON.parse(raw) as LocalDatabase) };
  } catch {
    const fresh = emptyDb();
    await persist(fresh);
    return fresh;
  }
}

/**
 * Written to a temp file and renamed, because rename is atomic. A plain write that gets
 * interrupted — stopping the dev server mid-save — leaves truncated JSON, and `load()`
 * treats unparseable JSON as "no database yet" and silently reseeds. Losing a week of
 * test data to a Ctrl-C is a bad way to find that out.
 */
async function persist(db: LocalDatabase): Promise<void> {
  await mkdir(dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await rename(tmp, DB_PATH);
}

/** Serialises read-modify-write so two concurrent submissions can't clobber each other. */
function mutate<T>(fn: (db: LocalDatabase) => T): Promise<T> {
  const next = queue.then(async () => {
    const db = await load();
    const result = fn(db);
    await persist(db);
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

async function read<T>(fn: (db: LocalDatabase) => T): Promise<T> {
  return fn(await load());
}

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export const localStore: Store = {
  // --- settings -----------------------------------------------------------
  getSettings: () => read((db) => structuredClone(db.settings)),
  updateSettings: (patch: Partial<Settings>) =>
    mutate((db) => {
      db.settings = { ...db.settings, ...patch };
    }),

  // --- users --------------------------------------------------------------
  listUsers: (opts) =>
    read((db) =>
      structuredClone(db.users)
        .filter((u) => opts?.includeInactive || u.active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    ),
  getUserById: (uid) => read((db) => structuredClone(db.users.find((u) => u.id === uid) ?? null)),
  getUserByEmail: (email) =>
    read((db) =>
      structuredClone(
        db.users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim()) ?? null,
      ),
    ),
  isTeamEmail: (email) =>
    read((db) =>
      db.users.some((u) => u.email.toLowerCase() === email.toLowerCase().trim() && u.active),
    ),
  upsertUser: (user: User) =>
    mutate((db) => {
      const i = db.users.findIndex((u) => u.id === user.id);
      if (i === -1) db.users.push(user);
      else db.users[i] = { ...db.users[i], ...user };
    }),

  // --- metrics ------------------------------------------------------------
  listMetrics: () =>
    read((db) => structuredClone(db.metrics).sort((a, b) => a.sort_order - b.sort_order)),
  updateMetric: (mid, patch: Partial<Metric>) =>
    mutate((db) => {
      const i = db.metrics.findIndex((m) => m.id === mid);
      if (i !== -1) db.metrics[i] = { ...db.metrics[i], ...patch };
    }),
  listMetricValues: (meetingId) =>
    read((db) => structuredClone(db.metric_values.filter((v) => v.meeting_id === meetingId))),
  setMetricValue: ({ meetingId, metricId, value, enteredBy }) =>
    mutate((db) => {
      const existing = db.metric_values.find(
        (v) => v.meeting_id === meetingId && v.metric_id === metricId,
      );
      if (existing) {
        existing.value = value;
        existing.entered_by = enteredBy;
        existing.entered_at = now();
        return;
      }
      const row: MetricValue = {
        id: id(),
        metric_id: metricId,
        meeting_id: meetingId,
        value,
        entered_by: enteredBy,
        entered_at: now(),
      };
      db.metric_values.push(row);
    }),

  // --- priorities ---------------------------------------------------------
  listPriorities: () =>
    read((db) => structuredClone(db.priorities).sort((a, b) => a.created_at.localeCompare(b.created_at))),
  createPriority: (p: NewPriority) =>
    mutate((db) => {
      const row: Priority = { id: id(), status: "open", created_at: now(), ...p };
      db.priorities.push(row);
      return structuredClone(row);
    }),
  updatePriority: (pid, patch: Partial<Priority>) =>
    mutate((db) => {
      const i = db.priorities.findIndex((p) => p.id === pid);
      if (i !== -1) db.priorities[i] = { ...db.priorities[i], ...patch };
    }),
  listPriorityChecks: (meetingId) =>
    read((db) => structuredClone(db.priority_checks.filter((c) => c.meeting_id === meetingId))),
  setPriorityCheck: (meetingId, priorityId, onTrack) =>
    mutate((db) => {
      const existing = db.priority_checks.find(
        (c) => c.meeting_id === meetingId && c.priority_id === priorityId,
      );
      if (existing) existing.on_track = onTrack;
      else
        db.priority_checks.push({
          meeting_id: meetingId,
          priority_id: priorityId,
          on_track: onTrack,
        } satisfies PriorityCheck);
    }),

  // --- to-dos -------------------------------------------------------------
  listTodos: () => read((db) => structuredClone(db.todos)),
  createTodo: (t: NewTodo) =>
    mutate((db) => {
      const row: Todo = {
        id: id(),
        status: "open",
        weeks_carried: 0,
        last_carried_meeting_id: null,
        ...t,
      };
      db.todos.push(row);
      return structuredClone(row);
    }),
  updateTodo: (tid, patch: Partial<Todo>) =>
    mutate((db) => {
      const i = db.todos.findIndex((t) => t.id === tid);
      if (i !== -1) db.todos[i] = { ...db.todos[i], ...patch };
    }),
  applyCarryForward: (updates: CarryUpdate[]) =>
    mutate((db) => {
      for (const u of updates) {
        const t = db.todos.find((x) => x.id === u.id);
        if (!t) continue;
        // Re-check inside the write so a concurrent carry can't double-count (R6).
        if (t.last_carried_meeting_id === u.last_carried_meeting_id) continue;
        t.weeks_carried = u.weeks_carried;
        t.last_carried_meeting_id = u.last_carried_meeting_id;
      }
    }),

  // --- issues -------------------------------------------------------------
  listIssues: () => read((db) => structuredClone(db.issues)),
  createIssues: (rows: NewIssue[]) =>
    mutate((db) => {
      const created: Issue[] = rows.map((r) => ({
        id: id(),
        status: "open" as const,
        resolution_note: null,
        solved_meeting_id: null,
        ...r,
      }));
      db.issues.push(...created);
      return structuredClone(created);
    }),
  updateIssue: (iid, patch: Partial<Issue>) =>
    mutate((db) => {
      const i = db.issues.findIndex((x) => x.id === iid);
      if (i !== -1) db.issues[i] = { ...db.issues[i], ...patch };
    }),

  // --- meetings -----------------------------------------------------------
  listMeetings: () =>
    read((db) => structuredClone(db.meetings).sort((a, b) => b.date.localeCompare(a.date))),
  getMeeting: (mid) => read((db) => structuredClone(db.meetings.find((m) => m.id === mid) ?? null)),
  getMeetingByDate: (date) =>
    read((db) => structuredClone(db.meetings.find((m) => m.date === date) ?? null)),
  createMeeting: (date) =>
    mutate((db) => {
      const existing = db.meetings.find((m) => m.date === date);
      if (existing) return structuredClone(existing);
      const row: Meeting = {
        id: id(),
        date,
        status: "scheduled",
        current_section: 1,
        section_started_at: null,
        completion_pct: null,
        rating_avg: null,
        cascading_messages: "",
      };
      db.meetings.push(row);
      return structuredClone(row);
    }),
  updateMeeting: (mid, patch: Partial<Meeting>) =>
    mutate((db) => {
      const i = db.meetings.findIndex((m) => m.id === mid);
      if (i !== -1) db.meetings[i] = { ...db.meetings[i], ...patch };
    }),

  // --- per-meeting collections -------------------------------------------
  listSegues: (meetingId) =>
    read((db) => structuredClone(db.segues.filter((s) => s.meeting_id === meetingId))),
  setSegue: (meetingId, userId, personal, professional) =>
    mutate((db) => {
      const existing = db.segues.find((s) => s.meeting_id === meetingId && s.user_id === userId);
      if (existing) {
        existing.personal = personal;
        existing.professional = professional;
      } else db.segues.push({ meeting_id: meetingId, user_id: userId, personal, professional } satisfies Segue);
    }),

  setSegueField: (meetingId, userId, field, value) =>
    mutate((db) => {
      const existing = db.segues.find((s) => s.meeting_id === meetingId && s.user_id === userId);
      if (existing) existing[field] = value;
      else
        db.segues.push({
          meeting_id: meetingId,
          user_id: userId,
          personal: field === "personal" ? value : "",
          professional: field === "professional" ? value : "",
        } satisfies Segue);
    }),

  listHeadlines: (meetingId) =>
    read((db) =>
      structuredClone(db.headlines.filter((h) => h.meeting_id === meetingId)).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      ),
    ),
  addHeadline: (meetingId, userId, text) =>
    mutate((db) => {
      const row: Headline = {
        id: id(),
        meeting_id: meetingId,
        user_id: userId,
        text,
        created_at: now(),
      };
      db.headlines.push(row);
      return structuredClone(row);
    }),
  updateHeadline: (hid, text) =>
    mutate((db) => {
      const h = db.headlines.find((x) => x.id === hid);
      if (h) h.text = text;
    }),
  deleteHeadline: (hid) =>
    mutate((db) => {
      const i = db.headlines.findIndex((x) => x.id === hid);
      if (i !== -1) db.headlines.splice(i, 1);
    }),

  listRatings: (meetingId) =>
    read((db) => structuredClone(db.ratings.filter((r) => r.meeting_id === meetingId))),
  setRating: (meetingId, userId, score) =>
    mutate((db) => {
      const existing = db.ratings.find((r) => r.meeting_id === meetingId && r.user_id === userId);
      if (existing) existing.score = score;
      else db.ratings.push({ meeting_id: meetingId, user_id: userId, score } satisfies Rating);
    }),

  listSubmissions: (meetingId) =>
    read((db) => structuredClone(db.submissions.filter((s) => s.meeting_id === meetingId))),
  setSubmission: (meetingId, userId) =>
    mutate((db) => {
      const existing = db.submissions.find(
        (s) => s.meeting_id === meetingId && s.user_id === userId,
      );
      if (existing) existing.submitted_at = now();
      else
        db.submissions.push({
          meeting_id: meetingId,
          user_id: userId,
          submitted_at: now(),
        } satisfies Submission);
    }),

  listIssuePicks: (meetingId) =>
    read((db) =>
      db.issue_picks.filter((p) => p.meeting_id === meetingId).map((p) => p.issue_id),
    ),
  setIssuePick: (meetingId, issueId, picked) =>
    mutate((db) => {
      const i = db.issue_picks.findIndex(
        (p) => p.meeting_id === meetingId && p.issue_id === issueId,
      );
      if (picked && i === -1) db.issue_picks.push({ meeting_id: meetingId, issue_id: issueId });
      if (!picked && i !== -1) db.issue_picks.splice(i, 1);
    }),
};

/** Test/dev helper — drops everything back to seed state. */
export async function resetLocalStore(): Promise<void> {
  await persist(emptyDb());
}

export type { LocalDatabase, Metric, PriorityCheck };
