// The rotating segue question.
//
// Deliberately not random. Five people open the runner on five screens, and a Math.random()
// would give each of them a different question — and a different one again on every
// re-render. The question is derived from the meeting date instead, so the whole room sees
// the same one all morning, and next Monday's is already decided.
//
// The professional half of the segue never rotates: "one professional best" is the part
// that carries information into the meeting. It is the personal half that goes stale, and
// the personal half that does the actual work of changing the temperature of the room.

import { daysBetween } from "./dates";

/**
 * One line to answer, nothing that needs a story. A question someone can duck without it
 * being awkward, because the point is to arrive as people, not to run an exercise.
 */
export const SEGUE_QUESTIONS = [
  "What's the best thing that happened to you outside work this week?",
  "What are you looking forward to this month?",
  "What's the last meal you had that was genuinely worth it, and where?",
  "What did you learn this week that had nothing to do with work?",
  "Who did something for you recently that you haven't thanked them for yet?",
  "What's the last thing that made you laugh properly?",
  "What's a small win you had at home this week?",
  "What's the best thing you've read, watched or listened to lately?",
  "If next Friday were free, what would you do with it?",
  "Which place on our own tours would you most want to go to yourself?",
  "What did you do at the weekend that you'd happily do again?",
  "What's a habit you've picked up recently that's actually working?",
  "Who in this room has helped you out lately?",
  "What's the best advice you've been given this year?",
  "What surprised you this week?",
  "How do you switch off after a long day?",
  "What's something you're proud of that nobody here knows about?",
  "What's one thing you want done by the end of this month that isn't work?",
] as const;

/** Fixed Monday the rotation counts from. Any Monday works; this one is week 1 of rollout. */
const ROTATION_EPOCH = "2026-08-10";

/**
 * The question for a given meeting date. Same date always gives the same question, so it
 * survives a refresh, and every screen in the room agrees.
 */
export function segueQuestionFor(meetingDate: string): string {
  const weeks = Math.floor(daysBetween(ROTATION_EPOCH, meetingDate) / 7);
  // Modulo of a negative week count is negative in JS — a meeting dated before the epoch
  // would index off the front of the array and return undefined.
  const index = ((weeks % SEGUE_QUESTIONS.length) + SEGUE_QUESTIONS.length) % SEGUE_QUESTIONS.length;
  return SEGUE_QUESTIONS[index];
}
