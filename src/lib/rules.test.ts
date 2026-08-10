import { describe, expect, it } from "vitest";
import {
  assertSingleOwner,
  buildScorecard,
  canAddMonthlyPriority,
  canAddStep,
  canParentPriority,
  MAX_MONTHLY_PRIORITIES,
  MAX_STEPS_PER_WEEK,
  canSelectMoreIssues,
  canSolveIssue,
  groupPriorities,
  hasStepForWeek,
  monthlyPrioritiesNeedingStep,
  priorityIdsToDrop,
  carryLevel,
  completionFor,
  computeCarryForward,
  evaluateMetric,
  isBeyondTodoHorizon,
  liveMetrics,
  metricsMissingTargets,
  redCount,
  reviewList,
  sortIssues,
  splitBrainDump,
  staleIssues,
  weeksOpen,
} from "./rules";
import {
  endOfMonth,
  isFirstMondayOfMonth,
  mondayOf,
  nextMeetingDate,
  nextMonday,
  rolloutWeek,
} from "./dates";
import type { Issue, Meeting, Metric, Priority, Settings, Todo } from "./types";

const metric = (over: Partial<Metric> = {}): Metric => ({
  id: "m1",
  name: "Total signups",
  owner_id: "u1",
  target: 50,
  direction: "gte",
  unit: "",
  definition: "",
  live_from_week: 1,
  sort_order: 1,
  auto_calc: null,
  active: true,
  ...over,
});

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: "t1",
  text: "Chase 2603IT-B departure date",
  owner_id: "u1",
  due_date: "2026-08-10",
  status: "open",
  source: "manual",
  origin_issue_id: null,
  created_meeting_id: "mtg0",
  weeks_carried: 0,
  last_carried_meeting_id: null,
  ...over,
});

const meeting = (over: Partial<Meeting> = {}): Meeting => ({
  id: "mtg1",
  date: "2026-08-17",
  status: "running",
  current_section: 1,
  section_started_at: null,
  completion_pct: null,
  rating_avg: null,
  cascading_messages: "",
  ...over,
});

const issue = (over: Partial<Issue> = {}): Issue => ({
  id: "i1",
  text: "Hotel contract unsigned",
  raised_by_id: "u1",
  raised_date: "2026-08-03",
  status: "open",
  resolution_note: null,
  solved_meeting_id: null,
  source: "manual",
  ...over,
});

const settings: Settings = { rollout_start_date: "2026-08-10", tour_window_weeks: null };

// ---------------------------------------------------------------------------

describe("R1 — blank renders red", () => {
  it("treats a null value as an off-track, not a neutral gap", () => {
    const v = evaluateMetric(metric(), null, 1);
    expect(v.state).toBe("off");
    expect(v.countsAsRed).toBe(true);
  });

  it("treats an empty string and whitespace as off-track too", () => {
    expect(evaluateMetric(metric(), "", 1).countsAsRed).toBe(true);
    expect(evaluateMetric(metric(), "   ", 1).countsAsRed).toBe(true);
  });

  it("does not count a not-yet-live line as red", () => {
    const v = evaluateMetric(metric({ live_from_week: 4 }), null, 2);
    expect(v.state).toBe("future");
    expect(v.countsAsRed).toBe(false);
  });

  it("counts a line as red once its live week arrives", () => {
    expect(evaluateMetric(metric({ live_from_week: 4 }), null, 4).countsAsRed).toBe(true);
  });

  it("evaluates gte and lte directions", () => {
    expect(evaluateMetric(metric({ direction: "gte", target: 50 }), "50", 1).state).toBe("on");
    expect(evaluateMetric(metric({ direction: "gte", target: 50 }), "49", 1).state).toBe("off");
    expect(evaluateMetric(metric({ direction: "lte", target: 0 }), "0", 1).state).toBe("on");
    expect(evaluateMetric(metric({ direction: "lte", target: 0 }), "3", 1).state).toBe("off");
  });

  it("handles yes/no lines without needing a numeric target", () => {
    const yesno = metric({ direction: "yesno", target: null });
    expect(evaluateMetric(yesno, "yes", 1).state).toBe("on");
    expect(evaluateMetric(yesno, "no", 1).state).toBe("off");
    expect(evaluateMetric(yesno, null, 1).countsAsRed).toBe(true);
  });

  it("treats a non-numeric entry as off-track rather than crashing", () => {
    expect(evaluateMetric(metric(), "about fifty", 1).countsAsRed).toBe(true);
  });
});

describe("R2 — target not set renders grey, distinct from red", () => {
  it("greys a line with no agreed target even when blank", () => {
    const v = evaluateMetric(metric({ target: null }), null, 1);
    expect(v.state).toBe("grey");
    expect(v.countsAsRed).toBe(false);
  });

  it("lists untargeted metrics for the admin to-do list", () => {
    const missing = metricsMissingTargets([
      metric({ id: "a", target: 50 }),
      metric({ id: "b", target: null }),
      metric({ id: "c", target: null, direction: "yesno" }),
    ]);
    expect(missing.map((m) => m.id)).toEqual(["b"]);
  });
});

describe("R3 — exactly one owner", () => {
  it("rejects an empty owner", () => {
    expect(() => assertSingleOwner("")).toThrow();
    expect(() => assertSingleOwner(null)).toThrow();
  });

  it("rejects composite owners", () => {
    expect(() => assertSingleOwner("SL & Grace")).toThrow();
    expect(() => assertSingleOwner("sue, grace")).toThrow();
    expect(() => assertSingleOwner("sue and grace")).toThrow();
  });

  it("accepts a single id", () => {
    expect(assertSingleOwner(" u1 ")).toBe("u1");
  });
});

describe("R4 — a to-do is 7 days", () => {
  it("defaults to the next Monday", () => {
    expect(nextMonday("2026-08-10")).toBe("2026-08-17"); // Monday → next Monday
    expect(nextMonday("2026-08-12")).toBe("2026-08-17"); // Wednesday
    expect(nextMonday("2026-08-16")).toBe("2026-08-17"); // Sunday
  });

  it("prompts only beyond 14 days", () => {
    expect(isBeyondTodoHorizon("2026-08-24", "2026-08-10")).toBe(false); // 14 days
    expect(isBeyondTodoHorizon("2026-08-25", "2026-08-10")).toBe(true); // 15 days
  });
});

describe("R5 — an issue cannot be solved without a to-do", () => {
  it("blocks with an explanation when nothing is linked", () => {
    const gate = canSolveIssue([]);
    expect(gate.allowed).toBe(false);
    expect(gate.message).toMatch(/owner and a due date/i);
  });

  it("blocks a linked to-do that has no owner", () => {
    expect(canSolveIssue([todo({ owner_id: "" })]).allowed).toBe(false);
  });

  it("blocks a linked to-do that has no due date", () => {
    expect(canSolveIssue([todo({ due_date: "" })]).allowed).toBe(false);
  });

  it("ignores dropped to-dos", () => {
    expect(canSolveIssue([todo({ status: "dropped" })]).allowed).toBe(false);
  });

  it("allows once one owned, dated to-do exists", () => {
    expect(canSolveIssue([todo()]).allowed).toBe(true);
  });
});

describe("R6 — overdue to-dos carry themselves", () => {
  const m = meeting({ id: "mtg1", date: "2026-08-17" });

  it("increments only overdue open to-dos", () => {
    const updates = computeCarryForward(
      [
        todo({ id: "overdue", due_date: "2026-08-10" }),
        todo({ id: "duetoday", due_date: "2026-08-17" }),
        todo({ id: "future", due_date: "2026-08-24" }),
        todo({ id: "done", due_date: "2026-08-10", status: "done" }),
      ],
      m,
    );
    expect(updates.map((u) => u.id)).toEqual(["overdue"]);
    expect(updates[0].weeks_carried).toBe(1);
  });

  it("is idempotent — running twice on the same meeting does not double-count", () => {
    let t = todo({ due_date: "2026-08-10" });
    const first = computeCarryForward([t], m);
    expect(first[0].weeks_carried).toBe(1);

    t = { ...t, ...first[0] };
    const second = computeCarryForward([t], m);
    expect(second).toHaveLength(0);
    expect(t.weeks_carried).toBe(1);
  });

  it("increments again at the next meeting", () => {
    let t = todo({ due_date: "2026-08-10" });
    t = { ...t, ...computeCarryForward([t], m)[0] };
    const next = meeting({ id: "mtg2", date: "2026-08-24" });
    t = { ...t, ...computeCarryForward([t], next)[0] };
    expect(t.weeks_carried).toBe(2);
  });

  it("badges amber at 1–2 weeks and red at 3+", () => {
    expect(carryLevel(0)).toBe("none");
    expect(carryLevel(1)).toBe("amber");
    expect(carryLevel(2)).toBe("amber");
    expect(carryLevel(3)).toBe("red");
  });

  it("reaches the red badge after three consecutive meetings, unattended", () => {
    let t = todo({ due_date: "2026-08-10" });
    for (const [id, date] of [
      ["mtg1", "2026-08-17"],
      ["mtg2", "2026-08-24"],
      ["mtg3", "2026-08-31"],
    ] as const) {
      const u = computeCarryForward([t], meeting({ id, date }))[0];
      t = { ...t, ...u };
    }
    expect(t.weeks_carried).toBe(3);
    expect(carryLevel(t.weeks_carried)).toBe("red");
  });
});

describe("R7 — completion % is computed", () => {
  const m = meeting({ id: "mtg2", date: "2026-08-17" });

  it("excludes to-dos created in this same meeting", () => {
    const list = reviewList(
      [
        todo({ id: "old", due_date: "2026-08-10", created_meeting_id: "mtg1" }),
        todo({ id: "new", due_date: "2026-08-17", created_meeting_id: "mtg2" }),
      ],
      m,
    );
    expect(list.map((t) => t.id)).toEqual(["old"]);
  });

  it("excludes dropped to-dos and to-dos not yet due", () => {
    const list = reviewList(
      [
        todo({ id: "dropped", due_date: "2026-08-10", status: "dropped" }),
        todo({ id: "notdue", due_date: "2026-08-24" }),
        todo({ id: "counts", due_date: "2026-08-17" }),
      ],
      m,
    );
    expect(list.map((t) => t.id)).toEqual(["counts"]);
  });

  it("computes the percentage and returns null when nothing is due", () => {
    expect(completionFor([], m)).toEqual({ pct: null, done: 0, total: 0 });
    const c = completionFor(
      [
        todo({ id: "a", due_date: "2026-08-10", status: "done" }),
        todo({ id: "b", due_date: "2026-08-10", status: "done" }),
        todo({ id: "c", due_date: "2026-08-10", status: "open" }),
      ],
      m,
    );
    expect(c).toEqual({ pct: 67, done: 2, total: 3 });
  });

  it("computes correctly across a simulated 3-week cycle", () => {
    // Week 1: three to-dos created, due the following Monday. Nothing to review yet.
    const w1 = meeting({ id: "w1", date: "2026-08-10" });
    const todos: Todo[] = [
      todo({ id: "a", created_meeting_id: "w1", due_date: "2026-08-17" }),
      todo({ id: "b", created_meeting_id: "w1", due_date: "2026-08-17" }),
      todo({ id: "c", created_meeting_id: "w1", due_date: "2026-08-17" }),
    ];
    expect(completionFor(todos, w1).pct).toBeNull();

    // Week 2: all three are up for review, two got done. One new to-do is created and
    // must not dilute this week's number.
    const w2 = meeting({ id: "w2", date: "2026-08-17" });
    todos[0].status = "done";
    todos[1].status = "done";
    todos.push(todo({ id: "d", created_meeting_id: "w2", due_date: "2026-08-24" }));
    expect(completionFor(todos, w2)).toEqual({ pct: 67, done: 2, total: 3 });

    // Week 3: c is still open and carried, d is done. Four items due, three done.
    const w3 = meeting({ id: "w3", date: "2026-08-24" });
    todos[3].status = "done";
    expect(completionFor(todos, w3)).toEqual({ pct: 75, done: 3, total: 4 });
  });

  it("recomputes live as a box is ticked", () => {
    const list = [
      todo({ id: "a", due_date: "2026-08-10" }),
      todo({ id: "b", due_date: "2026-08-10" }),
    ];
    expect(completionFor(list, m).pct).toBe(0);
    list[0].status = "done";
    expect(completionFor(list, m).pct).toBe(50);
  });
});

describe("R8 / R9 — issue ordering and the three-issue cap", () => {
  it("sorts by weeks open, descending", () => {
    const sorted = sortIssues(
      [
        issue({ id: "new", raised_date: "2026-08-15" }),
        issue({ id: "oldest", raised_date: "2026-07-01" }),
        issue({ id: "mid", raised_date: "2026-08-01" }),
      ],
      "2026-08-17",
    );
    expect(sorted.map((i) => i.id)).toEqual(["oldest", "mid", "new"]);
  });

  it("computes weeks open by whole weeks", () => {
    expect(weeksOpen(issue({ raised_date: "2026-08-17" }), "2026-08-17")).toBe(0);
    expect(weeksOpen(issue({ raised_date: "2026-08-11" }), "2026-08-17")).toBe(0);
    expect(weeksOpen(issue({ raised_date: "2026-08-10" }), "2026-08-17")).toBe(1);
    expect(weeksOpen(issue({ raised_date: "2026-07-27" }), "2026-08-17")).toBe(3);
  });

  it("flags issues open 3+ weeks as stale", () => {
    const stale = staleIssues(
      [
        issue({ id: "fresh", raised_date: "2026-08-15" }),
        issue({ id: "stale", raised_date: "2026-07-20" }),
        issue({ id: "solved", raised_date: "2026-07-01", status: "solved" }),
      ],
      "2026-08-17",
    );
    expect(stale.map((i) => i.id)).toEqual(["stale"]);
  });

  it("stops selection at three", () => {
    expect(canSelectMoreIssues(0)).toBe(true);
    expect(canSelectMoreIssues(2)).toBe(true);
    expect(canSelectMoreIssues(3)).toBe(false);
  });
});

describe("R11 — brain dump splitting", () => {
  it("makes each non-empty line its own issue", () => {
    const rows = splitBrainDump("hotel unsigned\n\nflights unconfirmed\n  tour manager TBC  \n");
    expect(rows).toEqual(["hotel unsigned", "flights unconfirmed", "tour manager TBC"]);
  });

  it("strips bullets and numbering from a pasted list", () => {
    expect(splitBrainDump("- one\n* two\n• three\n1. four\n2) five")).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
    ]);
  });

  it("turns a pasted 30-line dump into 30 rows", () => {
    const dump = Array.from({ length: 30 }, (_, i) => `issue number ${i + 1}`).join("\n");
    expect(splitBrainDump(dump)).toHaveLength(30);
  });

  it("returns nothing for whitespace only", () => {
    expect(splitBrainDump("\n\n   \n")).toEqual([]);
  });
});

describe("priorities — scope, and monthly broken into weekly", () => {
  const MEETING = "2026-08-10";

  const monthly = (over: Partial<Priority> = {}): Priority => ({
    id: "m1",
    text: "Cost per lead under RM12",
    owner_id: "u1",
    horizon: "month",
    due_date: "2026-08-31",
    status: "open",
    created_at: "2026-08-03T00:00:00.000Z",
    scope: "department",
    parent_id: null,
    ...over,
  });

  const step = (over: Partial<Priority> = {}): Priority => ({
    id: "s1",
    text: "Rebuild the top 3 ad creatives",
    owner_id: "u1",
    horizon: "week",
    due_date: "2026-08-17",
    status: "open",
    created_at: "2026-08-10T00:00:00.000Z",
    scope: "department",
    parent_id: "m1",
    ...over,
  });

  describe("what may parent what", () => {
    it("lets a monthly priority take weekly steps", () => {
      expect(canParentPriority(monthly(), "week").allowed).toBe(true);
    });

    it("refuses a weekly priority as a parent, with a reason", () => {
      const gate = canParentPriority(monthly({ horizon: "week" }), "week");
      expect(gate.allowed).toBe(false);
      expect(gate.message).toMatch(/monthly priority/i);
    });

    it("refuses a monthly step under a monthly priority", () => {
      expect(canParentPriority(monthly(), "month").allowed).toBe(false);
    });

    it("refuses grandchildren — one level only", () => {
      const gate = canParentPriority(monthly({ parent_id: "other" }), "week");
      expect(gate.allowed).toBe(false);
      expect(gate.message).toMatch(/one level/i);
    });
  });

  describe("does it have a step this week", () => {
    it("counts a step due inside the coming week", () => {
      expect(hasStepForWeek("m1", [monthly(), step()], MEETING)).toBe(true);
    });

    it("ignores a step due beyond the coming week", () => {
      expect(hasStepForWeek("m1", [monthly(), step({ due_date: "2026-08-24" })], MEETING)).toBe(
        false,
      );
    });

    it("ignores a step that was already due before this meeting", () => {
      expect(hasStepForWeek("m1", [monthly(), step({ due_date: "2026-08-03" })], MEETING)).toBe(
        false,
      );
    });

    it("still counts a step already ticked off — no nagging for finishing early", () => {
      expect(hasStepForWeek("m1", [monthly(), step({ status: "done" })], MEETING)).toBe(true);
    });

    it("does not count a dropped step", () => {
      expect(hasStepForWeek("m1", [monthly(), step({ status: "dropped" })], MEETING)).toBe(false);
    });

    it("does not count another monthly priority's step", () => {
      expect(hasStepForWeek("m1", [monthly(), step({ parent_id: "somewhere-else" })], MEETING)).toBe(
        false,
      );
    });
  });

  describe("removing a priority", () => {
    it("takes the goal's open weekly steps with it", () => {
      const board = [monthly(), step({ id: "s1" }), step({ id: "s2" })];
      expect(priorityIdsToDrop("m1", board).sort()).toEqual(["m1", "s1", "s2"]);
    });

    it("leaves finished steps alone — they happened, and the record should say so", () => {
      const board = [monthly(), step({ id: "s1", status: "done" }), step({ id: "s2" })];
      expect(priorityIdsToDrop("m1", board).sort()).toEqual(["m1", "s2"]);
    });

    it("does not touch another goal's steps", () => {
      const board = [monthly(), step({ id: "s1", parent_id: "somewhere-else" })];
      expect(priorityIdsToDrop("m1", board)).toEqual(["m1"]);
    });

    it("removes a lone weekly step without cascading", () => {
      const board = [monthly(), step({ id: "s1" })];
      expect(priorityIdsToDrop("s1", board)).toEqual(["s1"]);
    });

    it("returns nothing for an id that is not on the board", () => {
      expect(priorityIdsToDrop("ghost", [monthly()])).toEqual([]);
    });
  });

  describe("the monthly ceiling", () => {
    const owned = (n: number, ownerId = "u1") =>
      Array.from({ length: n }, (_, i) => monthly({ id: `m${i}`, owner_id: ownerId }));

    it("allows up to the cap", () => {
      expect(MAX_MONTHLY_PRIORITIES).toBe(5);
      expect(canAddMonthlyPriority("u1", owned(0)).allowed).toBe(true);
      expect(canAddMonthlyPriority("u1", owned(MAX_MONTHLY_PRIORITIES - 1)).allowed).toBe(true);
    });

    it("blocks the one past the cap and explains why", () => {
      const gate = canAddMonthlyPriority("u1", owned(MAX_MONTHLY_PRIORITIES));
      expect(gate.allowed).toBe(false);
      expect(gate.message).toMatch(/five is the limit/i);
    });

    // The looser monthly cap is deliberate: naming a month's intent is cheap, cascading it
    // is what costs meeting time, so the tight limit lives on the weekly steps instead.
    it("stays looser than the weekly step cap", () => {
      expect(MAX_MONTHLY_PRIORITIES).toBeGreaterThan(MAX_STEPS_PER_WEEK);
    });

    it("counts each person separately — May's five don't block Nick", () => {
      expect(canAddMonthlyPriority("u2", owned(MAX_MONTHLY_PRIORITIES, "u1")).allowed).toBe(true);
    });

    it("frees a slot when one is closed", () => {
      const full = owned(MAX_MONTHLY_PRIORITIES);
      full[0].status = "done";
      expect(canAddMonthlyPriority("u1", full).allowed).toBe(true);
    });

    it("does not count weekly steps against the monthly cap", () => {
      const mixed = [...owned(2), step({ id: "s9" }), step({ id: "s8" })];
      expect(canAddMonthlyPriority("u1", mixed).allowed).toBe(true);
    });
  });

  describe("the three-step ceiling", () => {
    const withSteps = (n: number) => [
      monthly(),
      ...Array.from({ length: n }, (_, i) => step({ id: `s${i}`, due_date: "2026-08-17" })),
    ];

    it("allows up to the cap in one week", () => {
      expect(MAX_STEPS_PER_WEEK).toBe(3);
      expect(canAddStep("m1", withSteps(0), MEETING).allowed).toBe(true);
      expect(canAddStep("m1", withSteps(MAX_STEPS_PER_WEEK - 1), MEETING).allowed).toBe(true);
    });

    it("blocks the fourth, and says where the work belongs", () => {
      const gate = canAddStep("m1", withSteps(3), MEETING);
      expect(gate.allowed).toBe(false);
      expect(gate.message).toMatch(/to-do/i);
    });

    it("counts only this week — last week's steps don't use up the allowance", () => {
      const list = [
        monthly(),
        ...Array.from({ length: 3 }, (_, i) => step({ id: `old${i}`, due_date: "2026-08-03" })),
      ];
      expect(canAddStep("m1", list, MEETING).allowed).toBe(true);
    });

    it("counts steps cascaded to other people — the cap is per goal, not per viewer", () => {
      // May's goal, three steps handed to three different people. Her own slice shows one
      // step; the goal is full. Counting her slice alone would let her add forever.
      const mine = [monthly({ owner_id: "may" }), step({ id: "s1", owner_id: "may" })];
      const all = [
        ...mine,
        step({ id: "s2", owner_id: "nick" }),
        step({ id: "s3", owner_id: "esther" }),
      ];

      expect(canAddStep("m1", all, MEETING).allowed).toBe(false);

      const grouped = groupPriorities(mine, MEETING, all);
      expect(grouped.department[0].atStepCap).toBe(true);
      expect(grouped.department[0].steps).toHaveLength(3);
    });

    it("clears the amber nudge when the only step went to someone else", () => {
      const mine = [monthly({ owner_id: "may" })];
      const all = [...mine, step({ id: "s1", owner_id: "nick" })];

      expect(groupPriorities(mine, MEETING, all).department[0].needsStep).toBe(false);
      // Counting only her own slice would wrongly nag her.
      expect(groupPriorities(mine, MEETING).department[0].needsStep).toBe(true);
    });

    it("still surfaces a step I own under someone else's goal", () => {
      const mine = [step({ id: "handed", owner_id: "nick", parent_id: "someone-elses-goal" })];
      const all = [monthly({ id: "someone-elses-goal", owner_id: "may" }), ...mine];

      expect(groupPriorities(mine, MEETING, all).orphanWeeklies.map((p) => p.id)).toEqual([
        "handed",
      ]);
    });

    it("counts per goal, not per person", () => {
      const list = [
        monthly({ id: "a" }),
        monthly({ id: "b" }),
        ...Array.from({ length: 3 }, (_, i) =>
          step({ id: `sa${i}`, parent_id: "a", due_date: "2026-08-17" }),
        ),
      ];
      expect(canAddStep("a", list, MEETING).allowed).toBe(false);
      expect(canAddStep("b", list, MEETING).allowed).toBe(true);
    });

    it("ignores dropped steps when counting", () => {
      const list = [
        monthly(),
        step({ id: "s1", due_date: "2026-08-17" }),
        step({ id: "s2", due_date: "2026-08-17" }),
        step({ id: "s3", due_date: "2026-08-17", status: "dropped" }),
      ];
      expect(canAddStep("m1", list, MEETING).allowed).toBe(true);
    });

    it("flags the cap on the group so the UI can switch to a to-do box", () => {
      const grouped = groupPriorities(withSteps(3), MEETING);
      expect(grouped.department[0].atStepCap).toBe(true);
      expect(grouped.department[0].needsStep).toBe(false);
    });
  });

  describe("the amber list", () => {
    it("returns exactly the monthly priorities with no step this week", () => {
      const list = [
        monthly({ id: "stepped" }),
        step({ id: "s", parent_id: "stepped" }),
        monthly({ id: "bare" }),
        step({ id: "orphan", parent_id: null }),
      ];
      expect(monthlyPrioritiesNeedingStep(list, MEETING).map((p) => p.id)).toEqual(["bare"]);
    });

    it("leaves closed monthly priorities alone", () => {
      const list = [monthly({ id: "done", status: "done" })];
      expect(monthlyPrioritiesNeedingStep(list, MEETING)).toEqual([]);
    });
  });

  describe("grouping", () => {
    it("splits department from individual and nests the steps", () => {
      const grouped = groupPriorities(
        [
          monthly({ id: "dept", scope: "department" }),
          step({ id: "deptstep", parent_id: "dept" }),
          monthly({ id: "mine", scope: "individual", text: "Hire a junior designer" }),
          step({ id: "loose", parent_id: null, scope: "individual" }),
        ],
        MEETING,
      );

      expect(grouped.department.map((g) => g.parent.id)).toEqual(["dept"]);
      expect(grouped.department[0].steps.map((s) => s.id)).toEqual(["deptstep"]);
      expect(grouped.department[0].needsStep).toBe(false);

      expect(grouped.individual.map((g) => g.parent.id)).toEqual(["mine"]);
      expect(grouped.individual[0].needsStep).toBe(true);

      expect(grouped.orphanWeeklies.map((p) => p.id)).toEqual(["loose"]);
    });

    it("treats a step whose parent is gone as a standalone weekly priority", () => {
      const grouped = groupPriorities([step({ id: "widowed", parent_id: "deleted" })], MEETING);
      expect(grouped.orphanWeeklies.map((p) => p.id)).toEqual(["widowed"]);
    });

    it("keeps quarterly priorities with the monthly ones rather than dropping them", () => {
      const grouped = groupPriorities(
        [monthly({ id: "q", horizon: "quarter", scope: "individual" })],
        MEETING,
      );
      expect(grouped.individual.map((g) => g.parent.id)).toEqual(["q"]);
    });
  });
});

describe("the monthly rhythm", () => {
  it("spots the first Monday of a month", () => {
    expect(isFirstMondayOfMonth("2026-09-07")).toBe(true); // first Monday, Sept starts Tue
    expect(isFirstMondayOfMonth("2026-09-14")).toBe(false); // second Monday
    expect(isFirstMondayOfMonth("2026-06-01")).toBe(true); // month starts on a Monday
  });

  it("is false for any day that isn't a Monday", () => {
    expect(isFirstMondayOfMonth("2026-09-01")).toBe(false); // a Tuesday
  });

  it("finds the last day of the month", () => {
    expect(endOfMonth("2026-08-10")).toBe("2026-08-31");
    expect(endOfMonth("2026-09-07")).toBe("2026-09-30");
    expect(endOfMonth("2026-02-03")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-07")).toBe("2028-02-29"); // leap year
  });
});

describe("which meeting the app points at", () => {
  it("uses today when today is Monday, otherwise the Monday coming", () => {
    expect(nextMeetingDate(null, "2026-08-17")).toBe("2026-08-17"); // Monday
    expect(nextMeetingDate(null, "2026-08-12")).toBe("2026-08-17"); // Wednesday
    expect(nextMeetingDate(null, "2026-08-16")).toBe("2026-08-17"); // Sunday
  });

  it("rolls forward once this week's meeting is already on the books", () => {
    // Closing Monday's meeting on Monday morning must open the following Monday, not
    // hand back the closed one.
    expect(nextMeetingDate("2026-08-17", "2026-08-17")).toBe("2026-08-24");
    expect(nextMeetingDate("2026-08-17", "2026-08-13")).toBe("2026-08-24");
  });

  it("catches up rather than skipping when meetings were missed", () => {
    expect(nextMeetingDate("2026-07-06", "2026-08-12")).toBe("2026-08-17");
  });
});

describe("rollout gating", () => {
  it("numbers weeks from the rollout Monday", () => {
    expect(rolloutWeek("2026-08-10", "2026-08-10")).toBe(1);
    expect(rolloutWeek("2026-08-14", "2026-08-10")).toBe(1); // same week
    expect(rolloutWeek("2026-08-17", "2026-08-10")).toBe(2);
    expect(rolloutWeek("2026-09-07", "2026-08-10")).toBe(5);
  });

  it("normalises to the Monday of the week", () => {
    expect(mondayOf("2026-08-16")).toBe("2026-08-10"); // Sunday belongs to the prior Monday
    expect(mondayOf("2026-08-17")).toBe("2026-08-17");
  });

  it("shows only live metrics", () => {
    const all = [
      metric({ id: "w1", live_from_week: 1, sort_order: 1 }),
      metric({ id: "w3", live_from_week: 3, sort_order: 2 }),
      metric({ id: "inactive", live_from_week: 1, sort_order: 3, active: false }),
    ];
    expect(liveMetrics(all, 1).map((m) => m.id)).toEqual(["w1"]);
    expect(liveMetrics(all, 3).map((m) => m.id)).toEqual(["w1", "w3"]);
  });
});

describe("scorecard assembly", () => {
  it("computes line 11 rather than reading an entered value, and marks it read-only", () => {
    const rows = buildScorecard({
      metrics: [
        metric({ id: "signups", sort_order: 1 }),
        metric({
          id: "completion",
          name: "To-do completion %",
          sort_order: 2,
          target: 90,
          unit: "%",
          auto_calc: "todo_completion",
        }),
      ],
      values: [
        {
          id: "v1",
          metric_id: "completion",
          meeting_id: "mtg1",
          value: "100", // someone tried to type over it
          entered_by: "u1",
          entered_at: "",
        },
      ],
      previousValues: [],
      meeting: meeting({ date: "2026-08-10" }),
      settings,
      completion: { pct: 67, done: 2, total: 3 },
    });

    const line11 = rows.find((r) => r.metric.id === "completion")!;
    expect(line11.value).toBe("67");
    expect(line11.readOnly).toBe(true);
    expect(line11.verdict.state).toBe("off");
  });

  it("counts blanks toward the red count but not future lines", () => {
    const rows = buildScorecard({
      metrics: [
        metric({ id: "a", sort_order: 1 }),
        metric({ id: "b", sort_order: 2, live_from_week: 9 }),
        metric({ id: "c", sort_order: 3, target: null }),
      ],
      values: [],
      previousValues: [],
      meeting: meeting({ date: "2026-08-10" }),
      settings,
      completion: { pct: null, done: 0, total: 0 },
    });
    expect(rows).toHaveLength(2); // the week-9 line is not shown at all in week 1
    expect(redCount(rows)).toBe(1); // only the blank targeted line
  });

  it("carries last week's value through for reference", () => {
    const rows = buildScorecard({
      metrics: [metric({ id: "a" })],
      values: [],
      previousValues: [
        { id: "p", metric_id: "a", meeting_id: "mtg0", value: "44", entered_by: "u1", entered_at: "" },
      ],
      meeting: meeting({ date: "2026-08-10" }),
      settings,
      completion: { pct: null, done: 0, total: 0 },
    });
    expect(rows[0].lastValue).toBe("44");
  });
});
