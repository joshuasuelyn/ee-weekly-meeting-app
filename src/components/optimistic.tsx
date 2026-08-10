"use client";

import { useState, useTransition } from "react";

/**
 * Takes a row off the screen the moment it is acted on, instead of when the server answers.
 *
 * Ticking a priority done, removing a to-do, solving an issue — each of these is certain to
 * succeed and each was waiting for a full round trip before anything visibly happened. The
 * write still has to go, but there is no reason for the person to watch it go: the decision
 * was made on the click, and the screen should say so.
 *
 * If the write does fail the row comes back with the reason, which is the honest trade —
 * a rare correction in exchange for every ordinary interaction feeling immediate.
 */
export function useVanish() {
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function vanish(run: () => Promise<unknown>) {
    setError(null);
    setGone(true);
    startTransition(async () => {
      try {
        await run();
      } catch (e) {
        setGone(false);
        setError(e instanceof Error ? e.message : "That didn't save. Try again.");
      }
    });
  }

  return { gone, error, pending, vanish };
}
