"use client";

import { useEffect, useRef, useState } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Debounced autosave. The facilitator types on a shared screen during a live meeting, so
 * every input is optimistic: local state updates immediately and the write catches up.
 * There are no save buttons anywhere in the runner.
 */
export function useAutosave<T>(initial: T, save: (value: T) => Promise<void>, delay = 600) {
  const [value, setValue] = useState<T>(initial);
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initial);
  const dirty = useRef(false);

  // Accept a newer server value only while the field is clean, so a background refresh
  // can't yank a half-typed number out from under the person typing it.
  useEffect(() => {
    if (!dirty.current) {
      latest.current = initial;
      setValue(initial);
    }
  }, [initial]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function update(next: T) {
    dirty.current = true;
    setValue(next);
    latest.current = next;
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await save(latest.current);
        dirty.current = false;
        setState("saved");
      } catch {
        setState("error");
      }
    }, delay);
  }

  return { value, update, state };
}

export function SaveDot({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const label =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Not saved — check connection";
  return (
    <span
      className={`text-[0.78rem] ${state === "error" ? "text-(--color-off)" : "text-(--color-muted)"}`}
    >
      {label}
    </span>
  );
}
