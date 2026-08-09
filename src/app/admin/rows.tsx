"use client";

// Admin rows that save themselves.
//
// Previously each row was its own form with its own Save button, which left an honest
// question unanswered: does this one save everything, or only this line? Autosave removes
// the question rather than answering it — the same way the meeting runner already works,
// and for the same reason. Someone who edits four addresses and closes the tab should not
// lose three of them.
//
// Name and email are refused when empty by saveUser, and a name by saveMetric. Mid-edit a
// field is legitimately empty for a moment, so the row holds off instead of firing a save
// it knows will be rejected, and says why.

import { SaveDot, useAutosave } from "@/components/autosave";
import { saveMetric, saveSettings, saveUser } from "@/app/actions";

function toFormData(fields: Record<string, string | boolean>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    // The actions read checkboxes as `get(key) === "on"`, so false means absent.
    if (typeof value === "boolean") {
      if (value) data.set(key, "on");
    } else {
      data.set(key, value);
    }
  }
  return data;
}

const input = "px-3 py-2 rounded-xl border border-(--color-line)";

function Status({ blocked, state }: { blocked: string | null; state: Parameters<typeof SaveDot>[0]["state"] }) {
  if (blocked) return <span className="text-[0.78rem] text-(--color-off)">{blocked}</span>;
  return <SaveDot state={state} />;
}

export function SettingsRow({
  rolloutStartDate,
  tourWindowWeeks,
}: {
  rolloutStartDate: string;
  tourWindowWeeks: number | null;
}) {
  const { value, update, state } = useAutosave(
    { rollout_start_date: rolloutStartDate, tour_window_weeks: tourWindowWeeks?.toString() ?? "" },
    (v) => saveSettings(toFormData(v)),
  );

  return (
    <div className="flex flex-wrap gap-4 items-end">
      <label className="text-[0.9rem]">
        <div className="text-(--color-muted) mb-1">Week 1 starts</div>
        <input
          type="date"
          value={value.rollout_start_date}
          onChange={(e) => update({ ...value, rollout_start_date: e.target.value })}
          className={`w-44 ${input}`}
        />
      </label>
      <label className="text-[0.9rem]">
        <div className="text-(--color-muted) mb-1">Tour window (weeks)</div>
        <input
          type="number"
          min={1}
          value={value.tour_window_weeks}
          onChange={(e) => update({ ...value, tour_window_weeks: e.target.value })}
          placeholder="not agreed"
          className={`w-40 ${input}`}
        />
      </label>
      <div className="pb-2.5">
        <SaveDot state={state} />
      </div>
    </div>
  );
}

export function MetricRow({
  metric,
  users,
}: {
  metric: {
    id: string;
    name: string;
    owner_id: string;
    target: number | null;
    unit: string;
    live_from_week: number;
    active: boolean;
    direction: string;
  };
  users: { id: string; name: string }[];
}) {
  const { value, update, state } = useAutosave(
    {
      id: metric.id,
      name: metric.name,
      owner_id: metric.owner_id,
      target: metric.target?.toString() ?? "",
      unit: metric.unit,
      live_from_week: metric.live_from_week.toString(),
      active: metric.active,
    },
    async (v) => {
      if (!v.name.trim()) return;
      await saveMetric(toFormData(v));
    },
  );

  const blocked = value.name.trim() === "" ? "Needs a name to save" : null;

  return (
    <div className="flex flex-wrap gap-2 items-center py-2 border-b border-(--color-line) last:border-0">
      <input
        value={value.name}
        onChange={(e) => update({ ...value, name: e.target.value })}
        aria-label="Metric name"
        className={`flex-1 min-w-[14rem] ${input}`}
      />
      <select
        value={value.owner_id}
        onChange={(e) => update({ ...value, owner_id: e.target.value })}
        aria-label="Owner"
        className={`${input} bg-(--color-panel)`}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <span className="text-(--color-muted) text-[0.9rem] w-6 text-center">
        {metric.direction === "gte" ? "≥" : metric.direction === "lte" ? "≤" : "y/n"}
      </span>
      <input
        value={value.target}
        onChange={(e) => update({ ...value, target: e.target.value })}
        placeholder="TBC"
        aria-label="Target"
        className={`w-24 text-right ${input}`}
      />
      <input
        value={value.unit}
        onChange={(e) => update({ ...value, unit: e.target.value })}
        placeholder="unit"
        aria-label="Unit"
        className={`w-20 ${input}`}
      />
      <label className="text-[0.85rem] text-(--color-muted)">
        live W
        <input
          type="number"
          min={1}
          value={value.live_from_week}
          onChange={(e) => update({ ...value, live_from_week: e.target.value })}
          aria-label="Live from week"
          className="w-16 ml-1 px-2 py-2 rounded-xl border border-(--color-line)"
        />
      </label>
      <label className="text-[0.85rem] text-(--color-muted) flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={value.active}
          onChange={(e) => update({ ...value, active: e.target.checked })}
          className="size-4"
        />
        active
      </label>
      <Status blocked={blocked} state={state} />
    </div>
  );
}

export function PersonRow({
  person,
}: {
  person: {
    id: string;
    name: string;
    email: string;
    department: string;
    role: string;
    active: boolean;
  };
}) {
  const { value, update, state } = useAutosave(
    {
      id: person.id,
      name: person.name,
      email: person.email,
      department: person.department,
      active: person.active,
    },
    async (v) => {
      if (!v.name.trim() || !v.email.trim()) return;
      await saveUser(toFormData(v));
    },
  );

  const blocked =
    value.name.trim() === ""
      ? "Needs a name to save"
      : value.email.trim() === ""
        ? "Needs an email to save"
        : null;

  return (
    <div className="flex flex-wrap gap-2 items-center py-2 border-b border-(--color-line) last:border-0">
      <input
        value={value.name}
        onChange={(e) => update({ ...value, name: e.target.value })}
        aria-label="Name"
        className={`w-36 ${input}`}
      />
      <input
        type="email"
        value={value.email}
        onChange={(e) => update({ ...value, email: e.target.value })}
        aria-label="Email"
        className={`flex-1 min-w-[15rem] ${input}`}
      />
      <input
        value={value.department}
        onChange={(e) => update({ ...value, department: e.target.value })}
        aria-label="Department"
        className={`w-40 ${input}`}
      />
      <span className="text-[0.85rem] text-(--color-muted) w-24 capitalize">{person.role}</span>
      <label className="text-[0.85rem] text-(--color-muted) flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={value.active}
          onChange={(e) => update({ ...value, active: e.target.checked })}
          className="size-4"
        />
        active
      </label>
      <Status blocked={blocked} state={state} />
    </div>
  );
}
