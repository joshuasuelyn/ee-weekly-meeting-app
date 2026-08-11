// Calendar-date helpers. Dates are handled as plain YYYY-MM-DD strings throughout the app
// so nothing drifts a day when the server runs in UTC and the team is in UTC+8.

const MS_PER_DAY = 86_400_000;

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parses YYYY-MM-DD at UTC midnight. Never use `new Date(str)` on a date-only string elsewhere. */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / MS_PER_DAY);
}

export function addDays(date: string, days: number): string {
  return toDateString(new Date(parseDate(date).getTime() + days * MS_PER_DAY));
}

/** The next Monday strictly after `from`. Default due date for every to-do (R4). */
export function nextMonday(from: string): string {
  const day = parseDate(from).getUTCDay(); // 0 Sun … 6 Sat
  const delta = ((8 - day) % 7) || 7;
  return addDays(from, delta);
}

/** The Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  const day = parseDate(date).getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/**
 * Rollout week number for a meeting. Week 1 is the week containing `rolloutStart`.
 * Drives `live_from_week` gating on the scorecard.
 */
export function rolloutWeek(meetingDate: string, rolloutStart: string): number {
  const weeks = Math.floor(daysBetween(mondayOf(rolloutStart), mondayOf(meetingDate)) / 7);
  return weeks + 1;
}

/**
 * True for a Monday in the first seven days of its month — the week the prep screen asks
 * for this month's priorities. Every other week it stays out of the way.
 */
export function isFirstMondayOfMonth(date: string): boolean {
  return mondayOf(date) === date && parseDate(date).getUTCDate() <= 7;
}

/** Last calendar day of the month containing `date` — where a monthly priority is due. */
export function endOfMonth(date: string): string {
  const d = parseDate(date);
  return toDateString(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/**
 * Which Monday the app should be pointing at. Today if today is Monday, otherwise the
 * Monday coming — and always strictly after the most recent meeting, so closing a meeting
 * on Monday morning rolls the team forward instead of leaving them on a read-only record.
 */
export function nextMeetingDate(latestMeetingDate: string | null, from: string): string {
  const target = mondayOf(from) === from ? from : nextMonday(from);
  if (latestMeetingDate && latestMeetingDate >= target) return nextMonday(latestMeetingDate);
  return target;
}

/**
 * Has the week moved on from a meeting that already happened?
 *
 * A meeting nobody closed stays "current" indefinitely, so someone sitting down on Saturday
 * to think about the week ahead was still being asked about the week just gone. From
 * Saturday the app rolls to the coming Monday on its own — which is when people actually
 * prepare, and it should not depend on the facilitator having remembered to close anything.
 *
 * Tuesday to Friday it deliberately does not roll: that meeting is still the current one,
 * and its to-dos are still the ones being worked on.
 */
export function weekHasMovedOn(meetingDate: string, from: string): boolean {
  if (meetingDate >= from) return false;

  // The weekend belongs to the week just gone by the calendar, but not in anyone's head:
  // Saturday is when you think about Monday. Roll early.
  const day = parseDate(from).getUTCDay(); // 0 Sun … 6 Sat
  if (day === 6 || day === 0) return true;

  // And roll regardless once a later week has started — otherwise a meeting nobody closed
  // stays "current" forever, and next Monday opens last Monday's.
  return mondayOf(from) > meetingDate;
}

/** Saturday or Sunday — when people plan the week rather than work it. */
export function isPlanningWeekend(from: string): boolean {
  const day = parseDate(from).getUTCDay(); // 0 Sun … 6 Sat
  return day === 6 || day === 0;
}

export function formatDate(s: string): string {
  return parseDate(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatShortDate(s: string): string {
  return parseDate(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** First day of the month before the one containing `date`. */
export function startOfPreviousMonth(date: string): string {
  const d = parseDate(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based
  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  return `${prev.y}-${String(prev.m + 1).padStart(2, "0")}-01`;
}
