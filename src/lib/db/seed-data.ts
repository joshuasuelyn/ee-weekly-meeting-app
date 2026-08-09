// The five users and eleven metric definitions from §2 and §7 of the build spec.
// IDs are fixed so seeding is idempotent — re-running never creates a second Sue Lyn.

import type { Metric, Settings, User } from "../types";

const u = (n: number) => `11111111-1111-4111-8111-00000000000${n}`;
const m = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;

export const USER_IDS = {
  joshua: u(1),
  may: u(2),
  esther: u(3),
  nick: u(4),
  sueLyn: u(5),
} as const;

/**
 * NOTE: only joshua@easyeurope.com.my is confirmed. The other addresses are placeholders —
 * magic-link sign-in will not reach anyone until they are corrected in Admin → Users.
 */
export const SEED_USERS: User[] = [
  {
    id: USER_IDS.joshua,
    name: "Joshua",
    email: "joshua@easyeurope.com.my",
    role: "facilitator",
    department: "Product",
    active: true,
  },
  {
    id: USER_IDS.may,
    name: "May",
    email: "may@easyeurope.com.my",
    role: "manager",
    department: "Marketing",
    active: true,
  },
  {
    id: USER_IDS.esther,
    name: "Esther",
    email: "esther@easyeurope.com.my",
    role: "manager",
    department: "Sales",
    active: true,
  },
  {
    id: USER_IDS.nick,
    name: "Nick",
    email: "nick@easyeurope.com.my",
    role: "manager",
    department: "Operations",
    active: true,
  },
  {
    id: USER_IDS.sueLyn,
    name: "Sue Lyn",
    email: "suelyn@easyeurope.com.my",
    role: "manager",
    department: "Procurement",
    active: true,
  },
  // Contributors are added in Admin → People when phase 3 needs them.
];

/** Placeholder for X in line 6's definition until the managers agree it (§10 decision 1). */
export const TOUR_WINDOW_TOKEN = "{X}";

export const SEED_METRICS: Metric[] = [
  {
    id: m(1),
    name: "Total signups",
    owner_id: USER_IDS.sueLyn,
    target: 50,
    direction: "gte",
    unit: "",
    definition: "New bookings confirmed this week, all departure years.",
    live_from_week: 1,
    sort_order: 1,
    auto_calc: null,
    active: true,
  },
  {
    id: m(2),
    name: "— of which 2027 departures",
    owner_id: USER_IDS.sueLyn,
    // Target TBC — §10 decision 2. Renders grey, not red, until Sue Lyn sets it.
    target: null,
    direction: "gte",
    unit: "",
    definition: "Subset of total signups for 2027 departures.",
    live_from_week: 1,
    sort_order: 2,
    auto_calc: null,
    active: true,
  },
  {
    id: m(3),
    name: "New leads",
    owner_id: USER_IDS.may,
    target: 330,
    direction: "gte",
    unit: "",
    definition: "New enquiries captured this week, all sources.",
    live_from_week: 1,
    sort_order: 3,
    auto_calc: null,
    active: true,
  },
  {
    id: m(4),
    name: "Cost per lead (MTD)",
    owner_id: USER_IDS.may,
    target: 12,
    direction: "lte",
    unit: "RM",
    definition: "Ad spend month-to-date ÷ leads month-to-date.",
    live_from_week: 2,
    sort_order: 4,
    auto_calc: null,
    active: true,
  },
  {
    id: m(5),
    name: "Regular % of signups",
    owner_id: USER_IDS.esther,
    target: 30,
    direction: "gte",
    unit: "%",
    definition: "Repeat customers as a % of this week's signups.",
    live_from_week: 3,
    sort_order: 5,
    auto_calc: null,
    active: true,
  },
  {
    id: m(6),
    name: "Tours Falling Behind",
    owner_id: USER_IDS.esther,
    target: 0,
    direction: "lte",
    unit: "",
    definition: `Confirmed departures under 15 pax departing within ${TOUR_WINDOW_TOKEN} weeks.`,
    live_from_week: 1,
    sort_order: 6,
    auto_calc: null,
    active: true,
  },
  {
    id: m(7),
    name: "Tours Awaiting Approval",
    owner_id: USER_IDS.esther,
    target: 0,
    direction: "lte",
    unit: "",
    definition: "Ready on all readiness criteria, awaiting Esther's sign-off to operate.",
    live_from_week: 2,
    sort_order: 7,
    auto_calc: null,
    active: true,
  },
  {
    id: m(8),
    name: "Tours with Critical Issues",
    owner_id: USER_IDS.nick,
    target: 0,
    direction: "lte",
    unit: "",
    definition: "Open blocker threatening delivery. Threshold to be written (§10 decision 4).",
    live_from_week: 3,
    sort_order: 8,
    auto_calc: null,
    active: true,
  },
  {
    id: m(9),
    name: "Tour feedback",
    owner_id: USER_IDS.nick,
    target: 4,
    direction: "gte",
    unit: "/5",
    definition: "Overall score, most recently completed tour.",
    live_from_week: 4,
    sort_order: 9,
    auto_calc: null,
    active: true,
  },
  {
    id: m(10),
    name: "Post-tour report ≤ 7 days",
    owner_id: USER_IDS.nick,
    target: null,
    direction: "yesno",
    unit: "",
    definition: "Filed on time for tours completed last week.",
    live_from_week: 4,
    sort_order: 10,
    auto_calc: null,
    active: true,
  },
  {
    id: m(11),
    name: "To-do completion %",
    owner_id: USER_IDS.joshua,
    target: 90,
    direction: "gte",
    unit: "%",
    definition: "Auto-calculated from the to-do review list. Never entered by hand (R7).",
    live_from_week: 2,
    sort_order: 11,
    auto_calc: "todo_completion",
    active: true,
  },
];

export const DEFAULT_SETTINGS: Settings = {
  // Monday of the first rollout week. Change in Admin before week 1.
  rollout_start_date: "2026-08-10",
  // X — not yet decided, must be agreed with the managers (§10 decision 1).
  tour_window_weeks: null,
};

/** Fills X into line 6's definition once it has been agreed. */
export function renderDefinition(definition: string, settings: Settings): string {
  return definition.replace(
    TOUR_WINDOW_TOKEN,
    settings.tour_window_weeks === null ? "X (not yet agreed)" : String(settings.tour_window_weeks),
  );
}
