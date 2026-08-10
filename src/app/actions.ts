"use server";

import { revalidatePath } from "next/cache";
import { requireFacilitator, requireUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { getOrCreateCurrentMeeting, today } from "@/lib/queries";
import {
  assertSingleOwner,
  canAddMonthlyPriority,
  canAddStep,
  canCompletePriority,
  canParentPriority,
  canSolveIssue,
  completionFor,
  issueTextForMetric,
  issueTextForPriority,
  priorityIdsToDrop,
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

/**
 * Deliberately does not revalidate.
 *
 * Every write used to invalidate the whole layout, so each debounced keystroke and each
 * On Track click made the server rebuild the entire meeting — fifteen queries — and ship a
 * fresh render back. These writes are already optimistic on screen: the value the person
 * just typed is the value they are looking at, and revalidating only replaces it with an
 * identical copy. What it costs is the pause after every interaction.
 *
 * Anything whose result other rows depend on — a completion percentage, a new issue, a
 * closed meeting — still calls refresh().
 */
function noRefreshNeeded() {}

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
  noRefreshNeeded();
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
  noRefreshNeeded();
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
    const all = await store.listPriorities();
    const parent = all.find((p) => p.id === parentId);
    if (!parent) throw new Error("That monthly priority no longer exists.");

    const gate = canParentPriority(parent, horizon);
    if (!gate.allowed) throw new Error(gate.message);

    // The three-step ceiling, enforced here as well as in the UI.
    const meetingDate = (await getOrCreateCurrentMeeting()).date;
    const cap = canAddStep(parentId, all, meetingDate);
    if (!cap.allowed) throw new Error(cap.message);

    // A step belongs to whatever its monthly priority belongs to — a weekly step toward a
    // department goal is department work, whoever happens to be doing it.
    scope = parent.scope;
  } else if (horizon === "month") {
    // The three-a-month ceiling, enforced here as well as in the UI. A fourth priority
    // never gets cascaded, so refusing it is kinder than letting it sit there unworked.
    const ownerId = assertSingleOwner(String(formData.get("owner_id") ?? ""));
    const cap = canAddMonthlyPriority(ownerId, await store.listPriorities());
    if (!cap.allowed) throw new Error(cap.message);
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
  const store = getStore();

  // Closing a monthly priority over the top of its open steps strands them. Enforced here
  // as well as in the UI, so the rule holds however the call arrives.
  if (status === "done") {
    const all = await store.listPriorities();
    const target = all.find((p) => p.id === priorityId);
    if (target) {
      const gate = canCompletePriority(target, all);
      if (!gate.allowed) throw new Error(gate.message);
    }
  }

  await store.updatePriority(priorityId, { status });
  refresh();
}

/** Fix the wording. A typo shouldn't be permanent, and rewriting it shouldn't need a delete. */
export async function renamePriority(priorityId: string, text: string) {
  await requireUser();
  const trimmed = text.trim();
  // An empty priority is unreadable on Monday — refuse rather than persist it. Removing one
  // is a deliberate act with its own control, not something you fall into by deleting text.
  if (!trimmed) throw new Error("A priority needs words. Use Remove if you meant to delete it.");
  await getStore().updatePriority(priorityId, { text: trimmed });
  refresh();
}

/**
 * Takes a priority off the board without erasing it. "dropped" rather than a hard delete:
 * the weekly steps hanging off it, and any issue it produced, still refer to it, and a
 * board that can silently lose rows is not a record.
 */
export async function dropPriority(priorityId: string) {
  await requireUser();
  const store = getStore();

  // A monthly priority takes its open steps with it, or they are left pointing at a goal
  // that is no longer on anyone's screen. Which ids that means is a rule, not a detail.
  for (const id of priorityIdsToDrop(priorityId, await store.listPriorities())) {
    await store.updatePriority(id, { status: "dropped" });
  }
  refresh();
}

export async function createIssueFromPriority(priorityId: string, meetingDate: string) {
  const user = await requireUser();
  const store = getStore();

  const priority = (await store.listPriorities()).find((p) => p.id === priorityId);
  if (!priority) throw new Error("Unknown priority");

  const text = issueTextForPriority(priority.text);

  // Marking Need Help raises the issue on its own, so a manager who flips the state twice
  // — or two people doing it on two screens — must not end up with the same issue listed
  // twice on Monday. Idempotent per priority per meeting.
  const already = (await store.listIssues()).some(
    (i) => i.status === "open" && i.raised_date === meetingDate && i.text === text,
  );
  if (already) return;

  await store.createIssues([
    { text, raised_by_id: user.id, raised_date: meetingDate, source: "priority" },
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
  // Facilitator-only, matching the row-level policy. Asking for less here meant anyone else
  // pressing the button got silence: the database refused the write and said nothing.
  await requireFacilitator();
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

/**
 * Takes a to-do off the list without erasing it.
 *
 * Dropped rather than deleted: an issue solved on the strength of this to-do still points
 * at it, and the export should show that it existed. Note that a dropped to-do leaves the
 * review list, so it stops counting toward the completion percentage — which is right for
 * one raised in error, and worth knowing before using it on one that simply was not done.
 * Something that was not done should be left open to carry, which is what R6 is for.
 */
export async function dropTodo(todoId: string) {
  const user = await requireUser();
  const store = getStore();

  const todo = (await store.listTodos()).find((t) => t.id === todoId);
  if (!todo) return;

  // Matches the row-level policy, so a refusal arrives as a message rather than silence.
  if (user.role !== "facilitator" && todo.owner_id !== user.id) {
    throw new Error("Only the person who owns this to-do, or the facilitator, can remove it.");
  }

  await store.updateTodo(todoId, { status: "dropped" });
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
  noRefreshNeeded();
}

/** One half of a segue. See Store.setSegueField for why the halves are written apart. */
export async function setSegueField(
  meetingId: string,
  userId: string,
  field: "personal" | "professional",
  value: string,
) {
  await requireUser();
  await getStore().setSegueField(meetingId, userId, field, value);
  noRefreshNeeded();
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
  noRefreshNeeded();
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

/**
 * Puts a running meeting back to not-started.
 *
 * For the meeting begun by accident, or the one abandoned when half the room turned out to
 * be travelling. Everything entered stays exactly where it is — numbers, ticks, issues —
 * because none of it is wrong, it just is not Monday yet. Distinct from closing, which
 * locks the completion percentage and the rating into the record.
 */
export async function stopMeeting(meetingId: string) {
  await requireFacilitator();
  await getStore().updateMeeting(meetingId, {
    status: "scheduled",
    current_section: 1,
    section_started_at: null,
  });
  refresh();
}

/** Back to section 1 with the clock reset. Nothing entered is touched. */
export async function restartMeeting(meetingId: string) {
  await requireFacilitator();
  await getStore().updateMeeting(meetingId, {
    status: "running",
    current_section: 1,
    section_started_at: new Date().toISOString(),
  });
  refresh();
}

/**
 * Reopens a closed meeting. The completion percentage and rating average were locked in at
 * close; they are recomputed the next time it closes, so reopening is safe rather than
 * merely possible.
 */
export async function reopenMeeting(meetingId: string) {
  await requireFacilitator();
  await getStore().updateMeeting(meetingId, { status: "running" });
  refresh();
}

export async function goToSection(meetingId: string, section: number) {
  await requireFacilitator();
  await getStore().updateMeeting(meetingId, {
    current_section: Math.max(1, Math.min(7, section)),
    section_started_at: new Date().toISOString(),
  });
  // The runner already moved: every section's content was in the payload it was given, so
  // there is nothing to fetch. This write only records where the meeting got to.
  noRefreshNeeded();
}

export async function setCascadingMessages(meetingId: string, text: string) {
  await requireFacilitator();
  await getStore().updateMeeting(meetingId, { cascading_messages: text });
  noRefreshNeeded();
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
