import { describe, expect, it } from "vitest";
import { SEGUE_QUESTIONS, segueQuestionFor } from "./segue";

describe("segueQuestionFor", () => {
  it("gives the same question for the same date, so every screen in the room agrees", () => {
    expect(segueQuestionFor("2026-08-17")).toBe(segueQuestionFor("2026-08-17"));
  });

  it("moves on the following Monday", () => {
    expect(segueQuestionFor("2026-08-17")).not.toBe(segueQuestionFor("2026-08-10"));
  });

  it("holds steady across the days within one week", () => {
    // A meeting rescheduled to the Tuesday must not change the question mid-morning.
    const monday = segueQuestionFor("2026-08-10");
    expect(segueQuestionFor("2026-08-11")).toBe(monday);
    expect(segueQuestionFor("2026-08-16")).toBe(monday);
  });

  it("works through a full cycle without repeating", () => {
    const seen = new Set<string>();
    let date = new Date(Date.UTC(2026, 7, 10));
    for (let i = 0; i < SEGUE_QUESTIONS.length; i++) {
      seen.add(segueQuestionFor(date.toISOString().slice(0, 10)));
      date = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    expect(seen.size).toBe(SEGUE_QUESTIONS.length);
  });

  it("wraps round to the start rather than running out", () => {
    const first = segueQuestionFor("2026-08-10");
    const weeksLater = new Date(
      Date.UTC(2026, 7, 10) + SEGUE_QUESTIONS.length * 7 * 24 * 60 * 60 * 1000,
    );
    expect(segueQuestionFor(weeksLater.toISOString().slice(0, 10))).toBe(first);
  });

  it("returns a real question for a date before the rotation started", () => {
    // Negative modulo would index off the front of the array.
    expect(SEGUE_QUESTIONS).toContain(segueQuestionFor("2026-01-05"));
    expect(SEGUE_QUESTIONS).toContain(segueQuestionFor("2020-03-02"));
  });

  it("has no duplicate questions in the list", () => {
    expect(new Set(SEGUE_QUESTIONS).size).toBe(SEGUE_QUESTIONS.length);
  });
});
