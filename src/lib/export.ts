// Markdown export of a single meeting. The spec keeps the app deliberately unintegrated
// with the existing Google Sheet (§9), so this is the one way the record leaves the system.

import { renderDefinition } from "./db/seed-data";
import { formatDate } from "./dates";
import type { MeetingContext } from "./queries";
import { COMPLETION_TARGET, groupPriorities } from "./rules";

export function meetingToMarkdown(ctx: MeetingContext): string {
  const name = (id: string) => ctx.usersById.get(id)?.name ?? "Unassigned";
  const lines: string[] = [];

  lines.push(`# Easy Europe weekly meeting — ${formatDate(ctx.meeting.date)}`);
  lines.push("");
  lines.push(
    `Week ${ctx.week} · ${ctx.meeting.status}` +
      (ctx.meeting.rating_avg != null ? ` · meeting rating ${ctx.meeting.rating_avg}/10` : ""),
  );
  lines.push("");

  // 1 · Segue
  lines.push("## Segue");
  lines.push("");
  if (ctx.segues.length === 0) lines.push("_Not recorded._");
  for (const s of ctx.segues) {
    lines.push(`- **${name(s.user_id)}** — ${s.personal || "—"} / ${s.professional || "—"}`);
  }
  lines.push("");

  // 2 · Scorecard
  lines.push("## Scorecard");
  lines.push("");
  lines.push("| Metric | Owner | Target | Value | Status |");
  lines.push("|---|---|---|---|---|");
  for (const row of ctx.scorecard) {
    const target =
      row.metric.direction === "yesno"
        ? "yes"
        : row.metric.target === null
          ? "TBC"
          : `${row.metric.direction === "gte" ? "≥" : "≤"} ${row.metric.target}${row.metric.unit}`;
    const status =
      row.verdict.state === "on"
        ? "on track"
        : row.verdict.state === "off"
          ? "**OFF TRACK**"
          : row.verdict.state === "grey"
            ? "no target"
            : "not live";
    lines.push(
      `| ${row.metric.name} | ${name(row.metric.owner_id)} | ${target} | ${row.value ?? "_blank_"} | ${status} |`,
    );
  }
  lines.push("");
  const reds = ctx.scorecard.filter((r) => r.verdict.countsAsRed).length;
  lines.push(`${reds} line${reds === 1 ? "" : "s"} off track.`);
  lines.push("");

  // 3 · Priorities — same grouping as the prep screen and the runner, via groupPriorities.
  lines.push("## Priorities");
  lines.push("");
  if (ctx.openPriorities.length === 0) lines.push("_None open._");

  const mark = (id: string) => {
    const check = ctx.priorityChecks.get(id);
    return check === true ? "on track" : check === false ? "**off track**" : "not reviewed";
  };
  const grouped = groupPriorities(ctx.openPriorities, ctx.meeting.date);

  const writeGroups = (heading: string, groups: typeof grouped.department) => {
    if (groups.length === 0) return;
    lines.push(`### ${heading}`);
    lines.push("");
    for (const g of groups) {
      const dept = ctx.usersById.get(g.parent.owner_id)?.department;
      lines.push(
        `- **${g.parent.text}** — ${name(g.parent.owner_id)}${heading === "Department" ? ` (${dept})` : ""}, ` +
          `due ${g.parent.due_date} — ${mark(g.parent.id)}` +
          (g.needsStep ? " · _no step this week_" : ""),
      );
      for (const s of g.steps) {
        lines.push(`  - ${s.text} — ${name(s.owner_id)}, due ${s.due_date} — ${mark(s.id)}`);
      }
    }
    lines.push("");
  };

  writeGroups("Department", grouped.department);
  writeGroups("Individual", grouped.individual);

  if (grouped.orphanWeeklies.length > 0) {
    lines.push("### This week only");
    lines.push("");
    for (const p of grouped.orphanWeeklies) {
      lines.push(`- ${p.text} — ${name(p.owner_id)}, due ${p.due_date} — ${mark(p.id)}`);
    }
    lines.push("");
  }

  // 4 · Headlines
  lines.push("## Headlines");
  lines.push("");
  if (ctx.headlines.length === 0) lines.push("_Not recorded._");
  for (const h of ctx.headlines) {
    // Headlines can run to several lines; keep each one a list item rather than letting a
    // newline break out of the bullet and mangle the rest of the document.
    const written = h.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (written.length === 0) continue;
    if (written.length === 1) {
      lines.push(`- **${name(h.user_id)}** — ${written[0]}`);
    } else {
      lines.push(`- **${name(h.user_id)}**`);
      for (const l of written) lines.push(`  - ${l}`);
    }
  }
  lines.push("");

  // 5 · To-do review
  lines.push("## To-do review");
  lines.push("");
  lines.push(
    ctx.completion.pct === null
      ? "_Nothing was due for review._"
      : `**${ctx.completion.pct}%** (${ctx.completion.done} of ${ctx.completion.total}) · target ${COMPLETION_TARGET}%`,
  );
  lines.push("");
  for (const t of ctx.reviewTodos) {
    const box = t.status === "done" ? "x" : " ";
    const carried = t.weeks_carried > 0 ? ` _(carried ${t.weeks_carried}w)_` : "";
    lines.push(`- [${box}] ${t.text} — ${name(t.owner_id)}, due ${t.due_date}${carried}`);
  }
  lines.push("");

  // 6 · IDS
  lines.push("## IDS");
  lines.push("");
  const solved = ctx.issues.filter((i) => i.solved_meeting_id === ctx.meeting.id);
  lines.push(`### Solved this week (${solved.length})`);
  lines.push("");
  if (solved.length === 0) lines.push("_None._");
  for (const i of solved) {
    lines.push(`- ${i.text}${i.resolution_note ? ` — ${i.resolution_note}` : ""}`);
    for (const t of ctx.todos.filter((t) => t.origin_issue_id === i.id)) {
      lines.push(`  - to-do: ${t.text} — ${name(t.owner_id)}, due ${t.due_date}`);
    }
  }
  lines.push("");
  lines.push(`### Still open (${ctx.openIssues.length}, oldest first)`);
  lines.push("");
  if (ctx.openIssues.length === 0) lines.push("_None._");
  for (const i of ctx.openIssues) {
    lines.push(`- ${i.text} — raised ${i.raised_date} by ${name(i.raised_by_id)}`);
  }
  lines.push("");

  // 7 · Conclude
  lines.push("## Conclude");
  lines.push("");
  const created = ctx.todos.filter((t) => t.created_meeting_id === ctx.meeting.id);
  lines.push(`### New to-dos (${created.length})`);
  lines.push("");
  if (created.length === 0) lines.push("_None._");
  for (const t of created) {
    lines.push(`- ${t.text} — **${name(t.owner_id)}**, due ${t.due_date}`);
  }
  lines.push("");
  if (ctx.meeting.cascading_messages.trim()) {
    lines.push("### Cascading messages");
    lines.push("");
    lines.push(ctx.meeting.cascading_messages.trim());
    lines.push("");
  }
  if (ctx.ratings.length > 0) {
    lines.push("### Ratings");
    lines.push("");
    for (const r of ctx.ratings) lines.push(`- ${name(r.user_id)}: ${r.score}/10`);
    lines.push("");
  }

  // The definitions travel with the export so a number is never read without its meaning.
  lines.push("---");
  lines.push("");
  lines.push("### Metric definitions");
  lines.push("");
  for (const row of ctx.scorecard) {
    lines.push(`- **${row.metric.name}** — ${renderDefinition(row.metric.definition, ctx.settings)}`);
  }
  lines.push("");

  return lines.join("\n");
}
