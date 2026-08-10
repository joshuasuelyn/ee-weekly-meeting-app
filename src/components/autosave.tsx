"use client";

import { useEffect, useRef, useState } from "react";

type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

// How many fields on this page are holding changes the database has not confirmed.
// Module-level rather than React state because the browser's unload warning has to be able
// to answer "is anything outstanding?" without a component tree to walk.
let outstanding = 0;
const watchers = new Set<() => void>();

function changeOutstanding(delta: number) {
  outstanding = Math.max(0, outstanding + delta);
  for (const w of watchers) w();
}

/**
 * Blocks the tab from closing while a change is still in flight. Autosave is only
 * trustworthy if it is impossible to walk away from unsaved work without being told, and
 * this is the part that makes the promise true rather than merely likely.
 */
export function UnsavedGuard() {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (outstanding === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  return null;
}

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

  // Unmounting with a change still counted would leave the unload warning stuck on.
  const counted = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (counted.current) {
        counted.current = false;
        changeOutstanding(-1);
      }
    },
    [],
  );

  async function commit() {
    if (timer.current) clearTimeout(timer.current);
    setState("saving");
    try {
      await save(latest.current);
      dirty.current = false;
      setState("saved");
    } catch {
      setState("error");
      return;
    }
    if (counted.current) {
      counted.current = false;
      changeOutstanding(-1);
    }
  }

  function update(next: T) {
    dirty.current = true;
    setValue(next);
    latest.current = next;
    // "unsaved", not "saving": nothing has been sent yet, and saying otherwise is the
    // small lie that makes the whole indicator untrustworthy.
    setState("unsaved");
    if (!counted.current) {
      counted.current = true;
      changeOutstanding(1);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(), delay);
  }

  /** Send it now rather than waiting out the debounce. */
  function saveNow() {
    if (!dirty.current) return;
    void commit();
  }

  return { value, update, state, saveNow, dirty: state === "unsaved" || state === "error" };
}

/** Live count of fields whose changes the database has not confirmed. */
export function useOutstandingCount(): number {
  const [count, setCount] = useState(outstanding);
  useEffect(() => {
    const w = () => setCount(outstanding);
    watchers.add(w);
    w();
    return () => void watchers.delete(w);
  }, []);
  return count;
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

/**
 * Four states, said plainly. The distinction that matters is between "unsaved" and
 * "saved": everything else is decoration. "Saved" appears only once the database has
 * confirmed the write, so it is a fact about the server rather than a hope about the
 * network.
 */
export function SaveDot({ state }: { state: SaveState }) {
  if (state === "idle") return null;

  const { label, tone } = {
    unsaved: { label: "● Not saved yet", tone: "text-(--color-amber)" },
    saving: { label: "Saving…", tone: "text-(--color-muted)" },
    saved: { label: "✓ Saved", tone: "text-(--color-on)" },
    error: { label: "✕ Not saved — check connection", tone: "text-(--color-off)" },
  }[state];

  return <span className={`text-[0.78rem] whitespace-nowrap ${tone}`}>{label}</span>;
}

/**
 * Page-level answer to "is everything in?". Sits in the header so it is visible without
 * hunting field by field, and is the thing to look at before closing the tab.
 */
export function SaveStatusBanner() {
  const count = useOutstandingCount();

  if (count === 0) {
    return (
      <span className="text-[0.85rem] text-(--color-on)">✓ All changes saved</span>
    );
  }
  return (
    <span className="text-[0.85rem] text-(--color-amber)">
      ● {count} change{count === 1 ? "" : "s"} not saved yet
    </span>
  );
}
