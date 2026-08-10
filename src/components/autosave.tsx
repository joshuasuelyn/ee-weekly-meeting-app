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
  //
  // Keyed on the serialised value, not on `initial` itself. Callers that pass an object
  // build a fresh one on every render, so an identity check fires constantly — and the
  // render right after a save completes, when dirty has just been cleared but the server
  // payload has not arrived yet, would reset the field to the value it just replaced.
  // That looked exactly like a save that silently failed.
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    if (dirty.current) return;
    latest.current = initial;
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

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

/**
 * True for a couple of seconds after `pending` falls back to false — the moment a save
 * finished. Takes pending as an argument rather than reading it, because the prep screen
 * dispatches its actions through startTransition, which useFormStatus never sees.
 */
export function useJustSaved(pending: boolean, ms = 2500): boolean {
  const ranOnce = useRef(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (pending) {
      ranOnce.current = true;
      setJustSaved(false);
      return;
    }
    // Only on the falling edge — otherwise every mount would claim to have just saved.
    if (!ranOnce.current) return;
    ranOnce.current = false;
    setJustSaved(true);
    const timer = setTimeout(() => setJustSaved(false), ms);
    return () => clearTimeout(timer);
  }, [pending, ms]);

  return justSaved;
}

/** Reserves its space whether or not it is showing, so nothing shifts as it appears. */
export function SavedFlag({ show, label = "Saved" }: { show: boolean; label?: string }) {
  return (
    <span
      aria-live="polite"
      className={`text-[0.78rem] text-(--color-on) whitespace-nowrap transition-opacity ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      {show ? label : ""}
    </span>
  );
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
