"use server";

import { revalidatePath } from "next/cache";
import { requireFacilitator, requireUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { today } from "@/lib/queries";
import {
  assertSingleOwner,
  canParentPriority,
  canSolveIssue,
  completionFor,
  issueTextForMetric,
  issueTextForPriority,
  MAX_ISSUES_PER_MEETING,
  evaluateMetric,
  currentWeekFor,
  splitBrainDump,
  todoDueDateFor,
} from "@/lib/rules";
import type { Horizon, IssueSource, ItemStatus, PriorityScope, TodoSource } from "@/lib/types";

function refresh() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

export async function setMetricValue(meetingId: string, metricId: string, value: string) {
  const user = await requireUser();
  const store = getStore();

  const metric = (await store.listMetrics()).find((m) => m.id === metricId);
  if (!metric) throw new Error("Unknown metric");
  // R7: line 11 is computed. Nothing may write over it.
  if (metric.auto_calc) throw new Error("This line is calculated, not entered.");

  const trimmed = value.trim();
  await store.setMetricValue({
    meetingId,
    metricId,
    value: trimmed === "" ? null : trimmed,
    enteredBy: user.id,
  });
  refresh();
}

/** R10 — one click from a red row to an issue, nothing retyped. */
export async function createIssueFromMetric(meetingId: string, metricId: string) {
  const user = await requireUser();
  const store = getStore();

  const [metrics, settings, meeting, values] = await Promise.all([
    store.listMetrics(),
    store.getSettings(),
    store.getMeeting(meetingId),
    store.listMetricValues(meetingId),
  ]);
  const metric = metrics.find((m) => m.id === metricId);
  if (!metric || !meeting) throw new Error("Unknown metric or meeting");

  const value = values.find((v) => v.metric_id === metricId)?.value ?? null;
  const verdict = evaluateMetric(metric, value, currentWeekFor(meeting.date, settings));

  await store.createIssues([
    {
      text: issueTextForMetric(metric, verdict),
      raised_by_id: user.id,
      raised_date: meeting.date,
      source: "scorecard",
    },
  ]);
  refresh();
}

// ---------------------------------------------------------------------------
// Priorities
// ---------------------------------------------------------------------------

export async function setPriorityCheck(
  meetingId: string,
  priorityId: string,
  onTrack: boolean | null,
) {
  await requireUser();
  await getStore().setPriorityCheck(meetingId, priorityId, onTrack);
  refresh();
}

export async function createPriority(formData: FormData) {
  await requireUser();
  const store = getStore();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  const horizon = (String(formData.get("horizon") ?? "week") as Horizon) ?? "week";
  const parentId = String(formData.get("parent_id") ?? "") || null;
  let scope = (String(formData.get("scope") ?? "individual") as PriorityScope) ?? "individual";

  if (parentId) {
    const parent = (await store.listPriorities()).find((p) => p.id === parentId);
    if (!parent) throw new Error("That monthly priority no longer exists.");

    const gate = canParentPriority(parent, horizon);
    if (!gate.allowed) throw new Error(gate.message);

    // A step belongs to whatever its monthly priority belongs to — a weekly step toward a
    // department goal is department work, whoever happens to be doing it.
    scope = parent.scope;
  }

  await store.createPriority({
    text,
    owner_id: assertSingleOwner(String(formData.get("owner_id") ?? "")),
    horizon,
    due_date: String(formData.get("due_date") ?? todoDueDateFor(today())),
    scope,
    parent_id: parentId,
  });
  refresh();
}

export async function setPriorityStatus(priorityId: string, status: ItemStatus) {
  await requireUser();
  await getStore().updatePriority(priorityId, { status });
  refresh();
}

export async function createIssueFromPriority(priorityId: string, meetingDate: string) {
  const user = await requireUser();
  const store = getStore();

  const priority = (await store.listPriorities()).find((p) => p.id === priorityId);
  if (!priority) throw new Error("Unknown priority");

  await store.createIssues([
    {
      text: issueTextForPriority(priority.text),
      raised_by_id: user.id,
      raised_date: meetingDate,
      source: "priority",
    },
  ]);
  refresh();
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/**
 * R11 — each non-empty line becomes its own issue row. A 30-line paste creates 30 issues.
 */
export async function addIssues(formData: FormData) {
  const user = await requireUser();
  const lines = splitBrainDump(String(formData.get("dump") ?? ""));
  if (lines.length === 0) return;

  const raisedDate = String(formData.get("raised_date") ?? today());
  await getStore().createIssues(
    lines.map((text) => ({
      text,
      raised_by_id: user.id,
      raised_date: raisedDate,
      source: (String(formData.get("source") ?? "manual") as IssueSource) ?? "manual",
    })),
  );
  refresh();
}

/** R9 — the cap is enforced here, not only in the UI. */
export async function toggleIssuePick(meetingId: string, issueId: string, picked: boolean) {
  await requireUser();
  const store = getStore();

  if (picked) {
    const current = await store.listIssuePicks(meetingId);
    if (current.length >= MAX_ISSUES_PER_MEETING && !current.includes(issueId)) {
      throw new Error(`Three issues is the limit for one meeting (R9).`);
    }
  }
  await store.setIssuePick(meetingId, issueId, picked);
  refresh();
}

/**
 * R5 — the only hard gate in the app. An issue cannot be solved without a linked to-do
 * that has an owner and a due date.
 */
export async function solveIssue(issueId: string, resolutionNote: string, meetingId: string) {
  await requireUser();
  const store = getStore();

  const todos = await store.listTodos();
  const linked = todos.filter((t) => t.origin_issue_id === issueId);
  const gate = canSolveIssue(linked);
  if (!gate.allowed) throw new Error(gate.message);

  await store.updateIssue(issueId, {
    status: "solved",
    resolution_note: resolutionNote.trim() || null,
    solved_meeting_id: meetingId,
  });
  refresh();
}

export async function dropIssue(issueId: string) {
  await requireUser();
  await getStore().updateIssue(issueId, { status: "dropped" });
  refresh();
}

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

export async function createTodo(formData: FormData) {
  await requireUser();
  const store = getStore();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  const meetingId = String(formData.get("created_meeting_id") ?? "");
  const meeting = await store.getMeeting(meetingId);
  if (!meeting) throw new Error("Unknown meeting");

  const originIssueId = String(formData.get("origin_issue_id") ?? "") || null;

  await store.createTodo({
    text,
    owner_id: assertSingleOwner(String(formData.get("owner_id") ?? "")),
    due_date: String(formData.get("due_date") ?? "") || todoDueDateFor(meeting.date),
    source: (String(formData.get("source") ?? "manual") as TodoSource) ?? "manual",
    origin_issue_id: originIssueId,
    created_meeting_id: meetingId,
  });
  refresh();
}

/**
 * R4's escape hatch: what the manager picked when told "that's not a to-do, it's a
 * priority" — the item is created as a monthly priority instead.
 */
export async function createPriorityInsteadOfTodo(formData: FormData) {
  await requireUser();
  const store = getStore();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  await store.createPriority({
    text,
    owner_id: assertSingleOwner(String(formData.get("owner_id") ?? "")),
    horizon: "month",
    due_date: String(formData.get("due_date") ?? todoDueDateFor(today())),
    scope: "individual",
    parent_id: null,
  });
  refresh();
}

export async function setTodoStatus(todoId: string, status: ItemStatus) {
  await requireUser();
  const store = getStore();
  await store.updateTodo(todoId, { status });

  // R7: the meeting's snapshot follows the ticks live.
  const todos = await store.listTodos();
  const meetings = await store.listMeetings();
  const openMeeting = meetings.find((m) => m.status === "running");
  if (openMeeting) {
    await store.updateMeeting(openMeeting.id, {
      completion_pct: completionFor(todos, openMeeting).pct,
    });
  }
  refresh();
}

export async function updateTodo(todoId: string, patch: { text?: string; due_date?: string; owner_id?: string }) {
  await requireUser();
  if (patch.owner_id) assertSingleOwner(patch.owner_id);
  await getStore().updateTodo(todoId, patch);
  refresh();
}

// ---------------------------------------------------------------------------
// Per-meeting personal rows
// ---------------------------------------------------------------------------

export async function setSegue(
  meetingId: string,
  userId: string,
  personal: string,
  professional: string,
) {
  await requireUser();
  await getStore().setSegue(meetingId, userId, personal, professional);
  refresh();
}

export async function addHeadline(formData: FormData) {
  await requireUser();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  await getStore().addHeadline(
    String(formData.get("meeting_id") ?? ""),
    assertSingleOwner(String(formData.get("user_id") ?? "")),
    text,
  );
  refresh();
}

export async function updateHeadline(id: string, text: string) {
  await requireUser();
  await getStore().updateHeadline(id, text);
  refresh();
}

export async function deleteHeadline(id: string) {
  await requireUser();
  await getStore().deleteHeadline(id);
  refresh();
}

export async function setRating(meetingId: string, userId: string, score: number) {
  await requireUser();
  await getStore().setRating(meetingId, userId, Math.max(1, Math.min(10, Math.round(score))));
  refresh();
}

export async function submitPrep(meetingId: string) {
  const user = await requireUser();
  await getStore().setSubmission(meetingId, user.id);
  refresh();
}

// ---------------------------------------------------------------------------
// Meeting control — facilitator only
// ---------------------------------------------------------------------------

export async function startMeeting(meetingId: string) {
  await requireFacilitator();
  const store = getStore();
  await store.updateMeeting(meetingId, {
    status: "running",
    current_section: 1,
    section_started_at: new Date().toISOString(),
  });
  refresh();
}

export async function goToSection(meetingId: string, section: number) {
  await requireFacilitator();
  await getStore().updateMeeting(meetingId, {
    current_section: Math.max(1, Math.min(7, section)),
    section_started_at: new Date().toISOString(),
  });
  refresh();
}

export async function setCascadingMessages(meetingId: string, text: string) {
  await requireFacilitator();
  await getStore().updateMeeting(meetingId, { cascading_messages: text });
  refresh();
}

export async function closeMeeting(meetingId: string) {
  await requireFacilitator();
  const store = getStore();

  const [meeting, todos, ratings] = await Promise.all([
    store.getMeeting(meetingId),
    store.listTodos(),
    store.listRatings(meetingId),
  ]);
  if (!meeting) throw new Error("Unknown meeting");

  const avg =
    ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + r.score, 0) / ratings.length) * 10) / 10
      : null;

  await store.updateMeeting(meetingId, {
    status: "closed",
    completion_pct: completionFor(todos, meeting).pct,
    rating_avg: avg,
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Admin — facilitator only
// ---------------------------------------------------------------------------

export async function saveMetric(formData: FormData) {
  await requireFacilitator();
  const id = String(formData.get("id") ?? "");
  const rawTarget = String(formData.get("target") ?? "").trim();

  // A nameless scorecard line is unreadable on Monday. Refuse rather than persist it.
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("A scorecard line needs a name.");

  await getStore().updateMetric(id, {
    name,
    owner_id: assertSingleOwner(String(formData.get("owner_id") ?? "")),
    target: rawTarget === "" ? null : Number(rawTarget),
    unit: String(formData.get("unit") ?? ""),
    live_from_week: Number(formData.get("live_from_week") ?? 1),
    active: formData.get("active") === "on",
  });
  refresh();
}

export async function saveSettings(formData: FormData) {
  await requireFacilitator();
  const raw = String(formData.get("tour_window_weeks") ?? "").trim();

  await getStore().updateSettings({
    rollout_start_date: String(formData.get("rollout_start_date") ?? ""),
    tour_window_weeks: raw === "" ? null : Number(raw),
  });
  refresh();
}

export async function saveUser(formData: FormData) {
  await requireFacilitator();
  const store = getStore();
  const id = String(formData.get("id") ?? "");
  const existing = await store.getUserById(id);
  if (!existing) throw new Error("Unknown user");

  // Name and email are identity: the name labels every owner field in the app and the
  // email is the sign-in credential. Neither may be emptied.
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!name) throw new Error("A person needs a name — it labels every owner field.");
  if (!email) throw new Error("A person needs an email — it's how they sign in.");

  await store.upsertUser({
    ...existing,
    name,
    email,
    department: String(formData.get("department") ?? existing.department).trim(),
    active: formData.get("active") === "on",
  });
  refresh();
}
