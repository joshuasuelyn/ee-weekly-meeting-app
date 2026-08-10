"use client";

import { useState, useTransition } from "react";
import { SaveDot, SavedFlag, useAutosave, useJustSaved } from "@/components/autosave";
import { useVanish } from "@/components/optimistic";
import { Card, SectionTitle } from "@/components/ui";
import {
  addHeadline,
  addIssues,
  dropIssue,
  createIssueFromPriority,
  createPriority,
  createTodo,
  deleteHeadline,
  dropPriority,
  renameIssue,
  renamePriority,
  setMetricValue,
  setPriorityCheck,
  setPriorityStatus,
  setSegueField,
  submitPrep,
  updateHeadline,
} from "@/app/actions";
import { nextMonday } from "@/lib/dates";
import {
  MAX_MONTHLY_PRIORITIES,
  MONTHLY_OVERFLOW_PROMPT,
  canCompletePriority,
  NEEDS_HELP_LABEL,
  ON_TRACK_LABEL,
  NO_STEP_PROMPT,
  STEP_OVERFLOW_PROMPT,
  splitBrainDump,
  type GroupedPriorities,
  type PriorityGroup,
} from "@/lib/rules";
import type { Metric, Priority } from "@/lib/types";

export interface PrepMetric {
  metric: Metric;
  value: string;
  lastValue: string | null;
  definition: string;
}

// ---------------------------------------------------------------------------
// My numbers
// ---------------------------------------------------------------------------

function MetricInput({ meetingId, row }: { meetingId: string; row: PrepMetric }) {
  const { value, update, state } = useAutosave(row.value, (v) =>
    setMetricValue(meetingId, row.metric.id, v),
  );

  const targetLabel =
    row.metric.target === null
      ? "target not agreed yet"
      : `target ${row.metric.direction === "gte" ? "≥" : "≤"} ${row.metric.unit === "RM" ? "RM" : ""}${row.metric.target}${row.metric.unit !== "RM" ? row.metric.unit : ""}`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 border-b border-(--color-line) last:border-0">
      <div className="flex-1 min-w-[16rem]">
        <label htmlFor={`m-${row.metric.id}`} className="font-medium">
          {row.metric.name}
        </label>
        <p className="text-[0.85rem] text-(--color-muted)">
          {targetLabel}
          {row.lastValue ? ` · last week ${row.lastValue}` : " · no value last week"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`m-${row.metric.id}`}
          type={row.metric.direction === "yesno" ? "text" : "number"}
          inputMode={row.metric.direction === "yesno" ? "text" : "decimal"}
          step="any"
          value={value}
          onChange={(e) => update(e.target.value)}
          placeholder={row.metric.direction === "yesno" ? "yes / no" : "—"}
          aria-describedby={`d-${row.metric.id}`}
          className={`w-32 px-3 py-2 rounded-xl border text-right text-lg ${
            value.trim() === ""
              ? "border-(--color-off) bg-(--color-off-bg)"
              : "border-(--color-line)"
          }`}
        />
        <span className="w-24 text-[0.78rem]">
          {value.trim() === "" ? (
            <span className="text-(--color-off) font-medium">blank = off track</span>
          ) : (
            <SaveDot state={state} />
          )}
        </span>
      </div>
      <p id={`d-${row.metric.id}`} className="sr-only">
        {row.definition}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priorities
// ---------------------------------------------------------------------------

function PriorityRow({
  meetingId,
  meetingDate,
  priority,
  initial,
  indent = false,
  ownerName,
  towards,
  readOnly = false,
  onDone,
  siblings,
}: {
  meetingId: string;
  meetingDate: string;
  priority: Priority;
  initial: boolean | null;
  indent?: boolean;
  /** Shown when a step belongs to someone other than the person reading the screen. */
  ownerName?: string;
  /** The monthly goal this step serves, when its parent isn't on this screen. */
  towards?: string;
  /** Someone else's step under my goal: visible so I know the goal is covered, but theirs to tick. */
  readOnly?: boolean;
  /** Told what was just closed, so the screen can offer to put it back. */
  onDone?: (p: Priority) => void;
  /** The board this row sits on — needed to see whether steps are still open underneath. */
  siblings?: Priority[];
}) {
  const [onTrack, setOnTrack] = useState<boolean | null>(initial);
  const [raised, setRaised] = useState(false);
  const closing = useVanish();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = useAutosave(priority.text, (v) => renamePriority(priority.id, v));
  // A month's goal closes by finishing its steps, not instead of them.
  const completable = canCompletePriority(priority, siblings ?? [priority]);

  function choose(next: boolean) {
    setOnTrack(next); // optimistic
    startTransition(async () => {
      await setPriorityCheck(meetingId, priority.id, next);
      // Saying it needs help and then not raising it is how a board goes stale, and the
      // extra click was one nobody made. The action is idempotent, so flipping back and
      // forth cannot list the same issue twice.
      if (!next) {
        setRaised(true);
        await createIssueFromPriority(priority.id, meetingDate);
      }
    });
  }

  if (closing.gone) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 py-2.5 border-b border-(--color-line) last:border-0 ${
        indent ? "pl-4 border-l-2 border-l-(--color-line) ml-1" : ""
      }`}
    >
      <div className="flex-1 min-w-[13rem]">
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={text.value}
              onChange={(e) => text.update(e.target.value)}
              autoFocus
              aria-label="Priority wording"
              className="flex-1 min-w-[12rem] px-3 py-1.5 rounded-lg border border-(--color-line)"
            />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[0.8rem] underline underline-offset-2"
            >
              done
            </button>
            <SaveDot state={text.state} />
          </div>
        ) : (
          <p className={indent ? "text-[0.95rem]" : "font-medium"}>{text.value}</p>
        )}
        <p className="text-[0.82rem] text-(--color-muted)">
          {indent || priority.horizon === "week" ? "step · due" : "this month · due"}{" "}
          {priority.due_date}
          {ownerName ? ` · ${ownerName}` : ""}
          {towards ? ` · toward "${towards}"` : ""}
        </p>
        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-3 mt-1 text-[0.8rem]">
            {editing ? null : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-(--color-muted) underline underline-offset-2"
              >
                Edit
              </button>
            )}
            {confirmRemove ? (
              <>
                <span className="text-(--color-muted)">
                  {priority.horizon === "month"
                    ? "Remove this and its weekly steps?"
                    : "Remove this step?"}
                </span>
                <button
                  type="button"
                  onClick={() => closing.vanish(() => dropPriority(priority.id))}
                  className="text-(--color-off) font-medium underline underline-offset-2"
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="text-(--color-muted) underline underline-offset-2"
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="text-(--color-muted) underline underline-offset-2"
              >
                Remove
              </button>
            )}
            {!completable.allowed ? (
              <span className="text-(--color-muted)">{completable.message}</span>
            ) : null}
            {raised || onTrack === false ? (
              <span className="text-(--color-off)">· raised as an issue for Monday</span>
            ) : null}
            {closing.error ? <span className="text-(--color-off)">{closing.error}</span> : null}
            {error ? <span className="text-(--color-off)">{error}</span> : null}
          </div>
        )}
      </div>
      {readOnly ? (
        <span
          className={`pill shrink-0 ${
            onTrack === false
              ? "bg-(--color-off-bg) text-(--color-off)"
              : "bg-(--color-on-bg) text-(--color-on)"
          }`}
        >
          {onTrack === false ? NEEDS_HELP_LABEL : ON_TRACK_LABEL}
        </span>
      ) : (
        <div className="flex flex-wrap gap-1.5 items-center">
          {
            <>
              <button
                type="button"
                onClick={() => choose(true)}
                className={`px-2.5 py-1 rounded-lg text-[0.82rem] font-medium border ${
                  onTrack === false
                    ? "border-(--color-line) text-(--color-muted) hover:bg-(--color-grey-bg)"
                    : "bg-(--color-on-bg) text-(--color-on) border-(--color-on)"
                }`}
              >
                {ON_TRACK_LABEL}
              </button>
              <button
                type="button"
                onClick={() => choose(false)}
                className={`px-2.5 py-1 rounded-lg text-[0.82rem] font-medium border ${
                  onTrack === false
                    ? "bg-(--color-off-bg) text-(--color-off) border-(--color-off)"
                    : "border-(--color-line) text-(--color-muted) hover:bg-(--color-grey-bg)"
                }`}
              >
                {NEEDS_HELP_LABEL}
              </button>
              {/* No confirmation. A dialog in the way of a weekly tick is friction on the
                  common case; an Undo costs nothing until you need it, and unlike a
                  confirm it also catches the click you did not mean to make. */}
              <button
                type="button"
                disabled={!completable.allowed}
                onClick={() => {
                  onDone?.(priority);
                  closing.vanish(() => setPriorityStatus(priority.id, "done"));
                }}
                className="px-2.5 py-1 rounded-lg text-[0.82rem] font-medium border border-(--color-line) text-(--color-muted) hover:bg-(--color-grey-bg) disabled:opacity-40 disabled:hover:bg-transparent"
                title={completable.allowed ? "Close this priority" : completable.message}
              >
                Done
              </button>
            </>
          }
        </div>
      )}
    </div>
  );
}

/**
 * Adds a weekly step under a monthly priority. Always available — a month's work rarely
 * fits in one step a week — but it only *prompts* when nothing is moving this priority
 * forward. A prompt, not a gate, in the same weight class as R4.
 */
function StepAdder({
  ownerId,
  people,
  parentId,
  meetingId,
  meetingDate,
  urgent,
  atCap,
  stepMessage,
}: {
  ownerId: string;
  people: { id: string; name: string }[];
  parentId: string;
  meetingId: string;
  meetingDate: string;
  urgent: boolean;
  atCap: boolean;
  /** Names the step already there, when the goal has one that has just come due. */
  stepMessage: string;
}) {
  const [text, setText] = useState("");
  // A step is where the goal meets a person, and it need not be the person who owns the
  // goal — a Marketing goal can cascade to Nick. Exactly one name, per R3.
  const [stepOwner, setStepOwner] = useState(ownerId);
  const [pending, startTransition] = useTransition();
  const justSaved = useJustSaved(pending);

  // Past the cap the same box keeps working, but what it creates changes: a to-do rather
  // than a step. The work still gets captured — it just stops inflating the priorities
  // board and lands where it's reviewed done/not-done in five minutes.
  const submit = atCap ? createTodo : createPriority;

  return (
    <div
      className={`ml-1 pl-4 py-3 border-l-2 ${
        urgent ? "border-l-(--color-amber)" : "border-l-(--color-line)"
      }`}
    >
      {urgent ? (
        <p className="text-[0.9rem] font-medium text-(--color-amber) mb-2">{stepMessage}</p>
      ) : null}
      {atCap ? (
        <p className="text-[0.85rem] text-(--color-muted) mb-2">{STEP_OVERFLOW_PROMPT}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {/* Outside the form: React resets fields inside a form action on completion. */}
        <select
          value={stepOwner}
          onChange={(e) => setStepOwner(e.target.value)}
          aria-label={atCap ? "Who owns this to-do" : "Who owns this step"}
          className="px-3 py-2 rounded-xl border border-(--color-line) bg-(--color-panel)"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <form
          action={(fd) =>
            startTransition(async () => {
              await submit(fd);
              setText("");
            })
          }
          className="flex-1 min-w-[16rem] flex flex-wrap gap-2"
        >
          <input type="hidden" name="owner_id" value={stepOwner} />
          <input type="hidden" name="due_date" value={nextMonday(meetingDate)} />
          {atCap ? (
            <>
              <input type="hidden" name="created_meeting_id" value={meetingId} />
              <input type="hidden" name="source" value="declared" />
            </>
          ) : (
            <>
              <input type="hidden" name="parent_id" value={parentId} />
              <input type="hidden" name="horizon" value="week" />
            </>
          )}
          <input
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              atCap
                ? "Something else that needs doing this week"
                : urgent
                  ? "Create 3 new ad creatives"
                  : "Another step this week"
            }
            aria-label={atCap ? "New to-do" : "This week's step"}
            className="flex-1 min-w-[13rem] px-3 py-2 rounded-xl border border-(--color-line)"
          />
          <button
            type="submit"
            disabled={text.trim() === "" || pending}
            className={`px-4 py-2 rounded-xl font-medium disabled:opacity-40 ${
              urgent
                ? "bg-(--color-ink) text-white"
                : "border border-(--color-line) hover:bg-(--color-grey-bg)"
            }`}
          >
            {atCap ? "Add to-do" : "Add step"}
          </button>
          <SavedFlag show={justSaved} label={atCap ? "To-do added" : "Step added"} />
        </form>
      </div>
    </div>
  );
}

function PriorityGroupBlock({
  group,
  meetingId,
  meetingDate,
  ownerId,
  people,
  checks,
  onDone,
}: {
  group: PriorityGroup;
  meetingId: string;
  meetingDate: string;
  ownerId: string;
  people: { id: string; name: string }[];
  checks: Record<string, boolean | null>;
  onDone?: (p: Priority) => void;
}) {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name;

  return (
    <div className="mb-4 last:mb-0">
      <PriorityRow
        meetingId={meetingId}
        meetingDate={meetingDate}
        priority={group.parent}
        initial={checks[group.parent.id] ?? null}
        onDone={onDone}
        siblings={[group.parent, ...group.steps]}
      />
      {group.steps.map((s) => (
        <PriorityRow
          key={s.id}
          meetingId={meetingId}
          meetingDate={meetingDate}
          priority={s}
          initial={checks[s.id] ?? null}
          onDone={onDone}
          indent
          // Only name the owner when it isn't the person reading the screen.
          ownerName={s.owner_id === ownerId ? undefined : nameOf(s.owner_id)}
          readOnly={s.owner_id !== ownerId}
        />
      ))}
      <StepAdder
        ownerId={ownerId}
        people={people}
        parentId={group.parent.id}
        meetingId={meetingId}
        meetingDate={meetingDate}
        urgent={group.needsStep}
        atCap={group.atStepCap}
        stepMessage={group.stepReason}
      />
    </div>
  );
}

/**
 * Creation only — On/Off review lives in the block below, so no control appears twice.
 *
 * Department goals only. At Easy Europe's size each manager *is* their department, so a
 * separate "mine" monthly slot asked the same question twice and doubled the prep cost.
 * Ownership lives on the weekly steps instead, where it can fan out to whoever does the
 * work. Individual priorities still exist in the model — R4's "that's not a to-do, it's a
 * priority" escape hatch creates them, and any already set still show and review below —
 * they're just no longer something to fill in every month.
 */
function MonthlySetup({
  ownerId,
  department,
  monthDueDate,
  hasDepartment,
  urgent,
  monthlyCount,
}: {
  ownerId: string;
  department: string;
  monthDueDate: string;
  hasDepartment: boolean;
  urgent: boolean;
  monthlyCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const justSaved = useJustSaved(pending);

  const slot = (scope: "department" | "individual", label: string, placeholder: string) => (
    <form
      action={(fd) => startTransition(async () => void (await createPriority(fd)))}
      className="py-3 border-b border-(--color-line) last:border-0"
    >
      <input type="hidden" name="owner_id" value={ownerId} />
      <input type="hidden" name="horizon" value="month" />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="due_date" value={monthDueDate} />

      <label className="text-[0.9rem] font-medium block mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-2">
        <input
          name="text"
          required
          placeholder={placeholder}
          className="flex-1 min-w-[15rem] px-3 py-2 rounded-xl border border-(--color-line)"
        />
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-xl border border-(--color-line) font-medium hover:bg-(--color-grey-bg) disabled:opacity-40"
        >
          Set
        </button>
        <SavedFlag show={justSaved} label="Saved" />
      </div>
    </form>
  );

  // "Company priority" for the top level; every other department is named as one.
  const heading =
    department.toLowerCase() === "company"
      ? "Company priority this month"
      : `${department} Department priority this month`;
  const full = monthlyCount >= MAX_MONTHLY_PRIORITIES;

  return (
    <Card className={`p-5 ${urgent && !full ? "border-(--color-amber)" : ""}`}>
      <SectionTitle
        title={heading}
        hint="Write what you want to see happen — each one gets cascaded to the team as weekly steps, so you can watch it come true week by week."
        right={
          <span
            className={`pill ${full ? "bg-(--color-grey-bg) text-(--color-muted)" : "bg-(--color-on-bg) text-(--color-on)"}`}
          >
            {monthlyCount} of {MAX_MONTHLY_PRIORITIES}
          </span>
        }
      />
      {full ? (
        <p className="text-[0.9rem] text-(--color-muted) py-2">{MONTHLY_OVERFLOW_PROMPT}</p>
      ) : (
        slot(
          "department",
          hasDepartment ? "Another one" : "This month",
          "Get cost per lead under RM12",
        )
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cross-department alignment
// ---------------------------------------------------------------------------

function AlignmentRow({ item }: { item: { id: string; text: string } }) {
  const { value, update, state } = useAutosave(item.text, (v) => updateHeadline(item.id, v));
  const [, startTransition] = useTransition();
  const lines = value.split("\n").filter((l) => l.trim() !== "").length;

  return (
    <div className="flex items-start gap-2 py-3 border-b border-(--color-line) last:border-0">
      <textarea
        value={value}
        onChange={(e) => update(e.target.value)}
        rows={Math.min(8, Math.max(2, lines + 1))}
        aria-label="What other departments need to know"
        className="flex-1 px-3 py-2 rounded-xl border border-(--color-line) font-[inherit] resize-y"
      />
      <div className="w-16 shrink-0 pt-2 grid gap-1">
        <SaveDot state={state} />
        <button
          type="button"
          onClick={() => startTransition(() => void deleteHeadline(item.id))}
          className="text-[0.8rem] text-(--color-muted) underline underline-offset-2 text-left"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function AlignmentPrep({
  meetingId,
  ownerId,
  items,
}: {
  meetingId: string;
  ownerId: string;
  items: { id: string; text: string }[];
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const justSaved = useJustSaved(pending);

  return (
    <Card className="p-5">
      <SectionTitle
        title="Cross-department alignment"
        hint="Anything another department needs to know before it bites them. Optional — most weeks there's nothing, and that's a real answer."
        right={
          items.length > 0 ? (
            <span className="pill bg-(--color-grey-bg) text-(--color-muted)">
              {items.length} to raise
            </span>
          ) : null
        }
      />

      {items.map((item) => (
        <AlignmentRow key={item.id} item={item} />
      ))}

      <form
        action={(fd) =>
          startTransition(async () => {
            await addHeadline(fd);
            setText("");
          })
        }
        className={items.length > 0 ? "pt-4" : ""}
      >
        <input type="hidden" name="meeting_id" value={meetingId} />
        <input type="hidden" name="user_id" value={ownerId} />
        <textarea
          name="text"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Supplier terms change from 1 Sept — anyone quoting a Sept departure needs to reprice."
          aria-label="What other departments need to know"
          className="w-full px-3 py-2 rounded-xl border border-(--color-line) font-[inherit] resize-y"
        />
        <button
          type="submit"
          disabled={text.trim() === "" || pending}
          className="mt-2 px-4 py-2 rounded-xl border border-(--color-line) font-medium disabled:opacity-40"
        >
          Add
        </button>
        <SavedFlag show={justSaved} label="Added" />
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/**
 * One issue I raised, shown back to me.
 *
 * The composer swallowed whatever was typed and said only "Added 3 issues", so a line
 * written in a hurry on Friday could not be reread, reworded or withdrawn before the room
 * saw it on Monday. It also made it impossible to notice you had raised the same thing
 * twice — which is how an issues list starts looking longer than the problem is.
 */
function MyIssueRow({ issue }: { issue: { id: string; text: string; raisedDate: string } }) {
  const removing = useVanish();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const text = useAutosave(issue.text, (v) => renameIssue(issue.id, v));

  if (removing.gone) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 py-2 border-b border-(--color-line) last:border-0">
      {editing ? (
        <input
          value={text.value}
          onChange={(e) => text.update(e.target.value)}
          autoFocus
          aria-label="Issue wording"
          className="flex-1 min-w-[14rem] px-3 py-1.5 rounded-lg border border-(--color-line)"
        />
      ) : (
        <span className="flex-1 min-w-[14rem]">{text.value}</span>
      )}
      <SaveDot state={text.state} />
      <button
        type="button"
        onClick={() => setEditing((e) => !e)}
        className="text-[0.8rem] text-(--color-muted) underline underline-offset-2"
      >
        {editing ? "Done" : "Edit"}
      </button>
      <button
        type="button"
        onClick={() => (confirm ? removing.vanish(() => dropIssue(issue.id)) : setConfirm(true))}
        className={`text-[0.8rem] underline underline-offset-2 whitespace-nowrap ${
          confirm ? "text-(--color-off) font-medium" : "text-(--color-muted)"
        }`}
      >
        {confirm ? "Remove it?" : "Remove"}
      </button>
      {removing.error ? (
        <span className="text-[0.8rem] text-(--color-off)">{removing.error}</span>
      ) : null}
    </div>
  );
}

function IssueDump({ meetingDate }: { meetingDate: string }) {
  const [text, setText] = useState("");
  const [added, setAdded] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  // No SavedFlag here: this one already reports its own count — "Added 3 issues."

  const count = splitBrainDump(text).length;

  return (
    <form
      action={(fd) => {
        const n = count;
        startTransition(async () => {
          await addIssues(fd);
          setText("");
          setAdded(n);
        });
      }}
    >
      <input type="hidden" name="raised_date" value={meetingDate} />
      <input type="hidden" name="source" value="manual" />
      <textarea
        name="dump"
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setAdded(null);
        }}
        placeholder={"One issue per line.\nPaste as long a list as you like — every line becomes its own row."}
        className="w-full px-3 py-2.5 rounded-xl border border-(--color-line) font-[inherit]"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          type="submit"
          disabled={count === 0 || pending}
          className="px-4 py-2 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-40"
        >
          {count === 0 ? "Add issues" : `Add ${count} issue${count > 1 ? "s" : ""}`}
        </button>
        {added ? (
          <span className="text-[0.9rem] text-(--color-on)">
            Added {added} issue{added > 1 ? "s" : ""}.
          </span>
        ) : (
          <span className="text-[0.9rem] text-(--color-muted)">
            {count > 0 ? `${count} line${count > 1 ? "s" : ""} detected` : "Nothing to add yet"}
          </span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

/**
 * The segue, answerable on Friday.
 *
 * It stays a spoken round on Monday — this is not a substitute for saying it out loud. It
 * exists because being asked cold in the room is what makes the round slow: people reach
 * for something and land on "nothing much", which teaches everyone the question is a
 * formality. Given a day to notice an answer, they bring a real one.
 */
function SeguePrep({
  meetingId,
  ownerId,
  question,
  initial,
}: {
  meetingId: string;
  ownerId: string;
  question: string;
  initial: { personal: string; professional: string };
}) {
  // Two independent saves, one per half. They are shown as one card here, but the runner
  // splits them into separate lists, so the store writes each column on its own.
  const answer = useAutosave(initial.personal, (v) =>
    setSegueField(meetingId, ownerId, "personal", v),
  );
  const wins = useAutosave(initial.professional, (v) =>
    setSegueField(meetingId, ownerId, "professional", v),
  );

  const winCount = wins.value.split("\n").filter((l) => l.trim() !== "").length;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Two things to open with"
        hint="You'll say these out loud on Monday. Writing them now means you're not put on the spot."
      />

      <label className="block mb-4">
        <div className="text-[0.9rem] font-medium mb-1">{question}</div>
        <input
          value={answer.value}
          onChange={(e) => answer.update(e.target.value)}
          placeholder="One line is plenty"
          className="w-full px-3 py-2.5 rounded-xl border border-(--color-line)"
        />
        <div className="mt-1">
          <SaveDot state={answer.state} />
        </div>
      </label>

      <label className="block">
        <div className="text-[0.9rem] font-medium mb-1">
          Best things at work this week
          {winCount > 0 ? (
            <span className="text-(--color-muted) font-normal">
              {" "}
              · {winCount} win{winCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <textarea
          value={wins.value}
          onChange={(e) => wins.update(e.target.value)}
          rows={Math.min(8, Math.max(3, winCount + 1))}
          placeholder={"One win per line.\nThey don't have to be big — a week usually has more than one."}
          className="w-full px-3 py-2.5 rounded-xl border border-(--color-line) font-[inherit] resize-y"
        />
        <div className="mt-1">
          <SaveDot state={wins.state} />
        </div>
      </label>
    </Card>
  );
}

export function PrepForm({
  meetingId,
  meetingDate,
  ownerId,
  department,
  metrics,
  grouped,
  checks,
  needsMonthlySetup,
  monthDueDate,
  submitted,
  people,
  parentTextById,
  alignment,
  closed,
  issues,
  segue,
  segueQuestion,
}: {
  meetingId: string;
  meetingDate: string;
  ownerId: string;
  department: string;
  metrics: PrepMetric[];
  grouped: GroupedPriorities;
  checks: Record<string, boolean | null>;
  needsMonthlySetup: boolean;
  monthDueDate: string;
  submitted: boolean;
  people: { id: string; name: string }[];
  parentTextById: Record<string, string>;
  alignment: { id: string; text: string }[];
  closed: Priority[];
  issues: { id: string; text: string; raisedDate: string }[];
  segue: { personal: string; professional: string };
  segueQuestion: string;
}) {
  const [isSubmitted, setSubmitted] = useState(submitted);
  const [, startTransition] = useTransition();

  const blanks = metrics.filter((m) => m.value.trim() === "").length;
  const allGroups = [...grouped.department, ...grouped.individual];
  // Every open monthly priority of mine counts against the three, whatever its scope.
  const monthlyCount = allGroups.length;
  const unstepped = allGroups.filter((g) => g.needsStep).length;
  const nothingAtAll = allGroups.length === 0 && grouped.orphanWeeklies.length === 0;

  // What was just closed, so it can be put back. Replaces a confirmation dialog: the
  // common case costs nothing, and unlike a confirm this also catches a misclick.
  const [justDone, setJustDone] = useState<Priority | null>(null);
  const undoDone = (p: Priority) => {
    setJustDone(null);
    startTransition(() => void setPriorityStatus(p.id, "open"));
  };

  const groupProps = { meetingId, meetingDate, ownerId, people, checks, onDone: setJustDone };

  return (
    <div className="grid gap-6">
      <SeguePrep
        meetingId={meetingId}
        ownerId={ownerId}
        question={segueQuestion}
        initial={segue}
      />

      <Card className="p-5">
        <SectionTitle
          title="My numbers"
          hint={
            metrics.length === 0
              ? "No scorecard lines are yours this week."
              : "Enter the number. A blank counts as off track."
          }
          right={
            blanks > 0 ? (
              <span className="pill bg-(--color-off-bg) text-(--color-off)">
                {blanks} still blank
              </span>
            ) : (
              <span className="pill bg-(--color-on-bg) text-(--color-on)">all entered</span>
            )
          }
        />
        {metrics.map((row) => (
          <MetricInput key={row.metric.id} meetingId={meetingId} row={row} />
        ))}
      </Card>

      <MonthlySetup
        ownerId={ownerId}
        department={department}
        monthDueDate={monthDueDate}
        hasDepartment={grouped.department.length > 0}
        urgent={needsMonthlySetup}
        monthlyCount={monthlyCount}
      />

      <Card className="p-5">
        <SectionTitle
          title="My priorities"
          hint="On or off. Off-track drops into Issues at the meeting — no explanation needed here."
          right={
            unstepped > 0 ? (
              <span className="pill bg-(--color-amber-bg) text-(--color-amber)">
                {unstepped} with no step this week
              </span>
            ) : null
          }
        />

        {nothingAtAll ? (
          <p className="text-(--color-muted) py-2">
            Nothing yet. Set this month&rsquo;s priorities above and they carry themselves from
            here on.
          </p>
        ) : null}

        {justDone ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 px-3 py-2 rounded-xl bg-(--color-on-bg) text-[0.9rem]">
            <span className="text-(--color-on)">
              &ldquo;{justDone.text}&rdquo; marked done.
            </span>
            <button
              type="button"
              onClick={() => undoDone(justDone)}
              className="font-medium underline underline-offset-2 text-(--color-on)"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setJustDone(null)}
              className="text-(--color-muted) underline underline-offset-2 ml-auto"
            >
              dismiss
            </button>
          </div>
        ) : null}

        {grouped.department.length > 0 ? (
          <div className="mb-5">
            <h3 className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-1">
              {department}
            </h3>
            {grouped.department.map((g) => (
              <PriorityGroupBlock key={g.parent.id} group={g} {...groupProps} />
            ))}
          </div>
        ) : null}

        {grouped.individual.length > 0 ? (
          <div className="mb-5">
            <h3 className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-1">
              Mine
            </h3>
            {grouped.individual.map((g) => (
              <PriorityGroupBlock key={g.parent.id} group={g} {...groupProps} />
            ))}
          </div>
        ) : null}

        {/* Visible rather than tucked behind a disclosure. This is the answer to "I ticked
            that by mistake", and an answer nobody finds is not one. */}
        {closed.length > 0 ? (
          <div className="mt-4 pt-3 border-t border-(--color-line)">
            <h3 className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-1">
              Finished this month ({closed.length})
            </h3>
            <div className="grid gap-1">
              {closed.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 text-[0.9rem] py-1">
                  <span className="flex-1 min-w-[12rem] text-(--color-muted) line-through">
                    {p.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => startTransition(() => void setPriorityStatus(p.id, "open"))}
                    className="px-2.5 py-1 rounded-lg text-[0.8rem] font-medium border border-(--color-line) text-(--color-muted) hover:bg-(--color-grey-bg)"
                  >
                    Reopen
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {grouped.orphanWeeklies.length > 0 ? (
          <div>
            <h3 className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-1">
              Handed to me this week
            </h3>
            {grouped.orphanWeeklies.map((p) => (
              <PriorityRow
                key={p.id}
                meetingId={meetingId}
                meetingDate={meetingDate}
                priority={p}
                initial={checks[p.id] ?? null}
                onDone={setJustDone}
                // A step cascaded from someone else's monthly goal — say which one, or it
                // arrives as an orphan task with no reason attached.
                towards={p.parent_id ? parentTextById[p.parent_id] : undefined}
              />
            ))}
          </div>
        ) : null}
      </Card>

      {/* Mirrors the meeting's order: numbers, priorities, alignment, then issues. */}
      <AlignmentPrep meetingId={meetingId} ownerId={ownerId} items={alignment} />

      <Card className="p-5">
        <SectionTitle
          title="Add issues"
          hint="One per line. Paste a dump — it gets split for you."
          right={
            issues.length > 0 ? (
              <span className="pill bg-(--color-grey-bg) text-(--color-muted)">
                {issues.length} open from you
              </span>
            ) : undefined
          }
        />
        <IssueDump meetingDate={meetingDate} />

        {issues.length > 0 ? (
          <div className="mt-4 pt-3 border-t border-(--color-line)">
            <h3 className="text-[0.8rem] uppercase tracking-wide text-(--color-muted) font-medium mb-1">
              Your open issues
            </h3>
            <p className="text-[0.85rem] text-(--color-muted) mb-2">
              Reword anything that won&rsquo;t make sense to the room on Monday, or remove it if
              you&rsquo;ve since thought better of it.
            </p>
            {issues.map((i) => (
              <MyIssueRow key={i.id} issue={i} />
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium">{isSubmitted ? "You're marked ready." : "Done for the week?"}</p>
          <p className="text-[0.9rem] text-(--color-muted)">
            {blanks > 0
              ? `${blanks} number${blanks > 1 ? "s" : ""} still blank — they'll read red on Monday.`
              : "Everything's in. Nothing to retype on Monday."}
          </p>
        </div>
        <button
          type="button"
          disabled={isSubmitted}
          onClick={() => {
            setSubmitted(true);
            startTransition(() => void submitPrep(meetingId));
          }}
          className="px-5 py-2.5 rounded-xl bg-(--color-ink) text-white font-medium disabled:opacity-40"
        >
          {isSubmitted ? "Ready ✓" : "I'm ready"}
        </button>
      </Card>
    </div>
  );
}
