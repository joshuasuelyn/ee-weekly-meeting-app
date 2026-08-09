/**
 * Integration pass over the §12 definition of done.
 *
 * Drives the real store — not mocks — through three consecutive weekly meetings, so the
 * rules are checked against data that has actually round-tripped through persistence.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canSolveIssue,
  carryLevel,
  completionFor,
  computeCarryForward,
  evaluateMetric,
  splitBrainDump,
} from "./rules";
import { SEED_METRICS, USER_IDS } from "./db/seed-data";
import type { Store } from "./db/store";
import type { Meeting } from "./types";

let store: Store;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ee-weekly-"));
  process.env.LOCAL_DB_PATH = join(dir, "db.json");
  // Imported after the path is set — the adapter reads it once at module load.
  store = (await import("./db/local")).localStore;
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("definition of done — three-week cycle on the real store", () => {
  const meetings: Meeting[] = [];

  it("seeds the five managers and eleven metric definitions", async () => {
    const users = await store.listUsers();
    const metrics = await store.listMetrics();

    expect(users.map((u) => u.name).sort()).toEqual(["Esther", "Joshua", "May", "Nick", "Sue Lyn"]);
    expect(metrics).toHaveLength(11);
    // Ownership balance from §7: Sue Lyn 2 · May 2 · Esther 3 · Nick 3 · Joshua 1.
    const counts = new Map<string, number>();
    for (const m of metrics) counts.set(m.owner_id, (counts.get(m.owner_id) ?? 0) + 1);
    expect(counts.get(USER_IDS.sueLyn)).toBe(2);
    expect(counts.get(USER_IDS.may)).toBe(2);
    expect(counts.get(USER_IDS.esther)).toBe(3);
    expect(counts.get(USER_IDS.nick)).toBe(3);
    expect(counts.get(USER_IDS.joshua)).toBe(1);
  });

  it("week 1: blank scorecard cells read as off-track, not as neutral gaps (R1)", async () => {
    const m = await store.createMeeting("2026-08-10");
    meetings.push(m);

    // Only Sue Lyn's first line gets entered. Everything else is left blank.
    await store.setMetricValue({
      meetingId: m.id,
      metricId: SEED_METRICS[0].id,
      value: "44",
      enteredBy: USER_IDS.sueLyn,
    });

    const values = await store.listMetricValues(m.id);
    const live = SEED_METRICS.filter((x) => x.live_from_week <= 1);
    expect(live.map((x) => x.sort_order)).toEqual([1, 2, 3, 6]);

    const verdicts = live.map((metric) =>
      evaluateMetric(metric, values.find((v) => v.metric_id === metric.id)?.value ?? null, 1),
    );

    // Line 1 entered but under target → off. Line 2 has no agreed target → grey, not red.
    // Lines 3 and 6 are blank → red.
    expect(verdicts.map((v) => v.state)).toEqual(["off", "grey", "off", "off"]);
    expect(verdicts.filter((v) => v.countsAsRed)).toHaveLength(3);
    expect(verdicts[1].countsAsRed).toBe(false);
  });

  it("week 1: a 30-line brain dump becomes 30 separate issue rows (R11)", async () => {
    const dump = Array.from({ length: 30 }, (_, i) => `- Sue Lyn dump item ${i + 1}`).join("\n");
    const created = await store.createIssues(
      splitBrainDump(dump).map((text) => ({
        text,
        raised_by_id: USER_IDS.sueLyn,
        raised_date: "2026-08-10",
        source: "manual" as const,
      })),
    );

    expect(created).toHaveLength(30);
    expect(created[0].text).toBe("Sue Lyn dump item 1"); // bullet stripped
    expect(await store.listIssues()).toHaveLength(30);
  });

  it("week 1: an issue cannot be solved until a to-do with an owner and a date exists (R5)", async () => {
    const issue = (await store.listIssues())[0];
    const meeting = meetings[0];

    expect(canSolveIssue([]).allowed).toBe(false);

    const todo = await store.createTodo({
      text: "Confirm the 2603IT-B departure date",
      owner_id: USER_IDS.esther,
      due_date: "2026-08-17",
      source: "ids",
      origin_issue_id: issue.id,
      created_meeting_id: meeting.id,
    });

    const linked = (await store.listTodos()).filter((t) => t.origin_issue_id === issue.id);
    expect(linked).toEqual([todo]);
    expect(canSolveIssue(linked).allowed).toBe(true);

    await store.updateIssue(issue.id, {
      status: "solved",
      solved_meeting_id: meeting.id,
      resolution_note: "Esther to chase the supplier",
    });
    expect((await store.listIssues()).filter((i) => i.status === "open")).toHaveLength(29);
  });

  it("week 1: nothing is up for review yet, so completion is not a zero (R7)", async () => {
    const todos = await store.listTodos();
    expect(completionFor(todos, meetings[0])).toEqual({ pct: null, done: 0, total: 0 });
    await store.updateMeeting(meetings[0].id, { status: "closed", completion_pct: null });
  });

  it("week 2: the overdue to-do carries itself, and carrying twice does not double-count (R6)", async () => {
    const m = await store.createMeeting("2026-08-17");
    meetings.push(m);

    // Two more to-dos land in week 2 so there is a real review list later.
    for (const [text, owner] of [
      ["Rome hotel contract", USER_IDS.sueLyn],
      ["Ad creative refresh", USER_IDS.may],
    ] as const) {
      await store.createTodo({
        text,
        owner_id: owner,
        due_date: "2026-08-24",
        source: "declared",
        origin_issue_id: null,
        created_meeting_id: m.id,
      });
    }

    const carry = async () => {
      const todos = await store.listTodos();
      const updates = computeCarryForward(todos, m);
      await store.applyCarryForward(updates);
      return updates.length;
    };

    expect(await carry()).toBe(0); // the week-1 to-do is due today, not overdue
    const first = (await store.listTodos()).find((t) => t.text.includes("2603IT-B"))!;
    expect(first.weeks_carried).toBe(0);

    // It was not done, so review it as missed and let it run past its date.
    const review = completionFor(await store.listTodos(), m);
    expect(review).toEqual({ pct: 0, done: 0, total: 1 });

    await store.updateMeeting(m.id, { status: "closed", completion_pct: review.pct });
  });

  it("week 3: completion % counts only what was due and not created today (R7)", async () => {
    const m = await store.createMeeting("2026-08-24");
    meetings.push(m);

    const todos = await store.listTodos();
    const updates = computeCarryForward(todos, m);
    // The week-1 to-do is now overdue by a week.
    expect(updates).toHaveLength(1);
    await store.applyCarryForward(updates);

    // Idempotency: running the same carry again changes nothing.
    const again = computeCarryForward(await store.listTodos(), m);
    expect(again).toHaveLength(0);

    const carried = (await store.listTodos()).find((t) => t.text.includes("2603IT-B"))!;
    expect(carried.weeks_carried).toBe(1);
    expect(carryLevel(carried.weeks_carried)).toBe("amber");

    // Tick one of the two week-2 to-dos, and create a fresh one that must not dilute today.
    const rome = (await store.listTodos()).find((t) => t.text === "Rome hotel contract")!;
    await store.updateTodo(rome.id, { status: "done" });
    await store.createTodo({
      text: "Booked in this meeting, due next week",
      owner_id: USER_IDS.nick,
      due_date: "2026-08-31",
      source: "ids",
      origin_issue_id: null,
      created_meeting_id: m.id,
    });

    // Review list: the carried week-1 item plus the two week-2 items. One done of three.
    const completion = completionFor(await store.listTodos(), m);
    expect(completion).toEqual({ pct: 33, done: 1, total: 3 });

    await store.updateMeeting(m.id, { status: "closed", completion_pct: completion.pct });
  });

  it("a to-do left alone for three meetings reaches the red carried badge (R6)", async () => {
    for (const date of ["2026-08-31", "2026-09-07"]) {
      const m = await store.createMeeting(date);
      await store.applyCarryForward(computeCarryForward(await store.listTodos(), m));
      await store.updateMeeting(m.id, { status: "closed" });
    }

    const stubborn = (await store.listTodos()).find((t) => t.text.includes("2603IT-B"))!;
    expect(stubborn.weeks_carried).toBe(3);
    expect(carryLevel(stubborn.weeks_carried)).toBe("red");
  });

  it("records a completion trend across the closed meetings", async () => {
    const closed = (await store.listMeetings())
      .filter((m) => m.status === "closed")
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(closed.map((m) => `${m.date}:${m.completion_pct ?? "—"}`)).toEqual([
      "2026-08-10:—",
      "2026-08-17:0",
      "2026-08-24:33",
      "2026-08-31:—",
      "2026-09-07:—",
    ]);
  });

  // The sign-in gate runs before anyone has a session. On Supabase that means the
  // anonymous role, which RLS hides every users row from — so this deliberately does not
  // go through getUserByEmail. Both adapters must agree on the answer.
  describe("sign-in gate", () => {
    it("recognises a seeded address", async () => {
      expect(await store.isTeamEmail("joshua@easyeurope.com.my")).toBe(true);
    });

    it("ignores case and surrounding whitespace", async () => {
      expect(await store.isTeamEmail("  JOSHUA@EasyEurope.com.my ")).toBe(true);
    });

    it("turns away an address that is not on the list", async () => {
      expect(await store.isTeamEmail("stranger@example.com")).toBe(false);
    });

    it("turns away a deactivated member", async () => {
      const may = await store.getUserByEmail("may@easyeurope.com.my");
      await store.upsertUser({ ...may!, active: false });
      expect(await store.isTeamEmail("may@easyeurope.com.my")).toBe(false);
      await store.upsertUser({ ...may!, active: true });
    });
  });
});
