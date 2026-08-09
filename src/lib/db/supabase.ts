// Supabase/Postgres implementation of the Store interface. Schema lives in
// supabase/migration.sql; row-level security is what keeps managers out of each other's
// writes, so this adapter deliberately does no permission checking of its own.

import { createClient } from "../supabase/server";
import type { CarryUpdate } from "../rules";
import type {
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
import { DEFAULT_SETTINGS } from "./seed-data";
import type { NewIssue, NewPriority, NewTodo, Store } from "./store";

async function db() {
  return createClient();
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

const SETTINGS_ROW = 1;

export const supabaseStore: Store = {
  // --- settings -----------------------------------------------------------
  async getSettings() {
    const sb = await db();
    const { data, error } = await sb
      .from("settings")
      .select("rollout_start_date, tour_window_weeks")
      .eq("id", SETTINGS_ROW)
      .maybeSingle();
    if (error) throw new Error(`getSettings: ${error.message}`);
    return (data as Settings | null) ?? DEFAULT_SETTINGS;
  },
  async updateSettings(patch: Partial<Settings>) {
    const sb = await db();
    const res = await sb.from("settings").update(patch).eq("id", SETTINGS_ROW);
    if (res.error) throw new Error(`updateSettings: ${res.error.message}`);
  },

  // --- users --------------------------------------------------------------
  async listUsers(opts) {
    const sb = await db();
    let q = sb.from("users").select("*").order("name");
    if (!opts?.includeInactive) q = q.eq("active", true);
    return unwrap(await q, "listUsers") as User[];
  },
  async getUserById(id) {
    const sb = await db();
    const { data, error } = await sb.from("users").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`getUserById: ${error.message}`);
    return (data as User) ?? null;
  },
  async getUserByEmail(email) {
    const sb = await db();
    const { data, error } = await sb
      .from("users")
      .select("*")
      .ilike("email", email.trim())
      .maybeSingle();
    if (error) throw new Error(`getUserByEmail: ${error.message}`);
    return (data as User) ?? null;
  },
  async isTeamEmail(email) {
    const sb = await db();
    // A security-definer function, not a table read: the caller has no session yet and
    // RLS hides users from the anonymous role. See supabase/03-signin-lookup.sql.
    const { data, error } = await sb.rpc("is_team_email", { addr: email.trim() });
    if (error) throw new Error(`isTeamEmail: ${error.message}`);
    return data === true;
  },
  async upsertUser(user: User) {
    const sb = await db();
    const res = await sb.from("users").upsert(user);
    if (res.error) throw new Error(`upsertUser: ${res.error.message}`);
  },

  // --- metrics ------------------------------------------------------------
  async listMetrics() {
    const sb = await db();
    return unwrap(
      await sb.from("metrics").select("*").order("sort_order"),
      "listMetrics",
    ) as Metric[];
  },
  async updateMetric(id, patch: Partial<Metric>) {
    const sb = await db();
    const res = await sb.from("metrics").update(patch).eq("id", id);
    if (res.error) throw new Error(`updateMetric: ${res.error.message}`);
  },
  async listMetricValues(meetingId) {
    const sb = await db();
    return unwrap(
      await sb.from("metric_values").select("*").eq("meeting_id", meetingId),
      "listMetricValues",
    ) as MetricValue[];
  },
  async setMetricValue({ meetingId, metricId, value, enteredBy }) {
    const sb = await db();
    const res = await sb.from("metric_values").upsert(
      {
        meeting_id: meetingId,
        metric_id: metricId,
        value,
        entered_by: enteredBy,
        entered_at: new Date().toISOString(),
      },
      { onConflict: "meeting_id,metric_id" },
    );
    if (res.error) throw new Error(`setMetricValue: ${res.error.message}`);
  },

  // --- priorities ---------------------------------------------------------
  async listPriorities() {
    const sb = await db();
    return unwrap(
      await sb.from("priorities").select("*").order("created_at"),
      "listPriorities",
    ) as Priority[];
  },
  async createPriority(p: NewPriority) {
    const sb = await db();
    const { data, error } = await sb
      .from("priorities")
      .insert({ ...p, status: "open" })
      .select()
      .single();
    if (error) throw new Error(`createPriority: ${error.message}`);
    return data as Priority;
  },
  async updatePriority(id, patch: Partial<Priority>) {
    const sb = await db();
    const res = await sb.from("priorities").update(patch).eq("id", id);
    if (res.error) throw new Error(`updatePriority: ${res.error.message}`);
  },
  async listPriorityChecks(meetingId) {
    const sb = await db();
    return unwrap(
      await sb.from("priority_checks").select("*").eq("meeting_id", meetingId),
      "listPriorityChecks",
    ) as PriorityCheck[];
  },
  async setPriorityCheck(meetingId, priorityId, onTrack) {
    const sb = await db();
    const res = await sb
      .from("priority_checks")
      .upsert(
        { meeting_id: meetingId, priority_id: priorityId, on_track: onTrack },
        { onConflict: "meeting_id,priority_id" },
      );
    if (res.error) throw new Error(`setPriorityCheck: ${res.error.message}`);
  },

  // --- to-dos -------------------------------------------------------------
  async listTodos() {
    const sb = await db();
    return unwrap(await sb.from("todos").select("*"), "listTodos") as Todo[];
  },
  async createTodo(t: NewTodo) {
    const sb = await db();
    const { data, error } = await sb
      .from("todos")
      .insert({ ...t, status: "open", weeks_carried: 0, last_carried_meeting_id: null })
      .select()
      .single();
    if (error) throw new Error(`createTodo: ${error.message}`);
    return data as Todo;
  },
  async updateTodo(id, patch: Partial<Todo>) {
    const sb = await db();
    const res = await sb.from("todos").update(patch).eq("id", id);
    if (res.error) throw new Error(`updateTodo: ${res.error.message}`);
  },
  async applyCarryForward(updates: CarryUpdate[]) {
    if (updates.length === 0) return;
    const sb = await db();
    // R6 idempotency is enforced in the WHERE clause, not in application memory: a second
    // run finds last_carried_meeting_id already set and updates zero rows.
    for (const u of updates) {
      const res = await sb
        .from("todos")
        .update({ weeks_carried: u.weeks_carried, last_carried_meeting_id: u.last_carried_meeting_id })
        .eq("id", u.id)
        .or(
          `last_carried_meeting_id.is.null,last_carried_meeting_id.neq.${u.last_carried_meeting_id}`,
        );
      if (res.error) throw new Error(`applyCarryForward: ${res.error.message}`);
    }
  },

  // --- issues -------------------------------------------------------------
  async listIssues() {
    const sb = await db();
    return unwrap(await sb.from("issues").select("*"), "listIssues") as Issue[];
  },
  async createIssues(rows: NewIssue[]) {
    if (rows.length === 0) return [];
    const sb = await db();
    const { data, error } = await sb
      .from("issues")
      .insert(rows.map((r) => ({ ...r, status: "open" })))
      .select();
    if (error) throw new Error(`createIssues: ${error.message}`);
    return data as Issue[];
  },
  async updateIssue(id, patch: Partial<Issue>) {
    const sb = await db();
    const res = await sb.from("issues").update(patch).eq("id", id);
    if (res.error) throw new Error(`updateIssue: ${res.error.message}`);
  },

  // --- meetings -----------------------------------------------------------
  async listMeetings() {
    const sb = await db();
    return unwrap(
      await sb.from("meetings").select("*").order("date", { ascending: false }),
      "listMeetings",
    ) as Meeting[];
  },
  async getMeeting(id) {
    const sb = await db();
    const { data, error } = await sb.from("meetings").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`getMeeting: ${error.message}`);
    return (data as Meeting) ?? null;
  },
  async getMeetingByDate(date) {
    const sb = await db();
    const { data, error } = await sb.from("meetings").select("*").eq("date", date).maybeSingle();
    if (error) throw new Error(`getMeetingByDate: ${error.message}`);
    return (data as Meeting) ?? null;
  },
  async createMeeting(date) {
    const sb = await db();
    const { data, error } = await sb
      .from("meetings")
      .upsert({ date, status: "scheduled", current_section: 1 }, { onConflict: "date" })
      .select()
      .single();
    if (error) throw new Error(`createMeeting: ${error.message}`);
    return data as Meeting;
  },
  async updateMeeting(id, patch: Partial<Meeting>) {
    const sb = await db();
    const res = await sb.from("meetings").update(patch).eq("id", id);
    if (res.error) throw new Error(`updateMeeting: ${res.error.message}`);
  },

  // --- per-meeting collections -------------------------------------------
  async listSegues(meetingId) {
    const sb = await db();
    return unwrap(
      await sb.from("segues").select("*").eq("meeting_id", meetingId),
      "listSegues",
    ) as Segue[];
  },
  async setSegue(meetingId, userId, personal, professional) {
    const sb = await db();
    const res = await sb
      .from("segues")
      .upsert(
        { meeting_id: meetingId, user_id: userId, personal, professional },
        { onConflict: "meeting_id,user_id" },
      );
    if (res.error) throw new Error(`setSegue: ${res.error.message}`);
  },

  async listHeadlines(meetingId) {
    const sb = await db();
    return unwrap(
      await sb.from("headlines").select("*").eq("meeting_id", meetingId).order("created_at"),
      "listHeadlines",
    ) as Headline[];
  },
  async addHeadline(meetingId, userId, text) {
    const sb = await db();
    const { data, error } = await sb
      .from("headlines")
      .insert({ meeting_id: meetingId, user_id: userId, text })
      .select()
      .single();
    if (error) throw new Error(`addHeadline: ${error.message}`);
    return data as Headline;
  },
  async updateHeadline(id, text) {
    const sb = await db();
    const res = await sb.from("headlines").update({ text }).eq("id", id);
    if (res.error) throw new Error(`updateHeadline: ${res.error.message}`);
  },
  async deleteHeadline(id) {
    const sb = await db();
    const res = await sb.from("headlines").delete().eq("id", id);
    if (res.error) throw new Error(`deleteHeadline: ${res.error.message}`);
  },

  async listRatings(meetingId) {
    const sb = await db();
    return unwrap(
      await sb.from("ratings").select("*").eq("meeting_id", meetingId),
      "listRatings",
    ) as Rating[];
  },
  async setRating(meetingId, userId, score) {
    const sb = await db();
    const res = await sb
      .from("ratings")
      .upsert({ meeting_id: meetingId, user_id: userId, score }, { onConflict: "meeting_id,user_id" });
    if (res.error) throw new Error(`setRating: ${res.error.message}`);
  },

  async listSubmissions(meetingId) {
    const sb = await db();
    return unwrap(
      await sb.from("submissions").select("*").eq("meeting_id", meetingId),
      "listSubmissions",
    ) as Submission[];
  },
  async setSubmission(meetingId, userId) {
    const sb = await db();
    const res = await sb.from("submissions").upsert(
      { meeting_id: meetingId, user_id: userId, submitted_at: new Date().toISOString() },
      { onConflict: "meeting_id,user_id" },
    );
    if (res.error) throw new Error(`setSubmission: ${res.error.message}`);
  },

  async listIssuePicks(meetingId) {
    const sb = await db();
    const rows = unwrap(
      await sb.from("issue_picks").select("issue_id").eq("meeting_id", meetingId),
      "listIssuePicks",
    ) as { issue_id: string }[];
    return rows.map((r) => r.issue_id);
  },
  async setIssuePick(meetingId, issueId, picked) {
    const sb = await db();
    const res = picked
      ? await sb
          .from("issue_picks")
          .upsert({ meeting_id: meetingId, issue_id: issueId }, { onConflict: "meeting_id,issue_id" })
      : await sb.from("issue_picks").delete().eq("meeting_id", meetingId).eq("issue_id", issueId);
    if (res.error) throw new Error(`setIssuePick: ${res.error.message}`);
  },
};
