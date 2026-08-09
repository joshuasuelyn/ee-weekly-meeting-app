-- Easy Europe — Weekly Meeting App
-- Phase 1 schema. Run once in the Supabase SQL editor, then run 02-seed.sql.
--
-- Auth model: Supabase magic-link sign-in creates a row in auth.users. The application
-- user is matched to it by email, so a person exists in public.users before they ever
-- log in — that is what lets the facilitator seed the team up front.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role       as enum ('facilitator', 'manager', 'contributor');
create type metric_direction as enum ('gte', 'lte', 'yesno');
create type metric_auto_calc as enum ('todo_completion');
create type horizon         as enum ('week', 'month', 'quarter');
create type priority_scope  as enum ('department', 'individual');
create type item_status     as enum ('open', 'done', 'dropped');
create type todo_source     as enum ('ids', 'declared', 'manual');
create type issue_status    as enum ('open', 'solved', 'dropped');
create type issue_source    as enum ('manual', 'scorecard', 'priority', 'todo');
create type meeting_status  as enum ('scheduled', 'running', 'closed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null unique,
  role       user_role not null default 'manager',
  department text not null default '',
  active     boolean not null default true
);

create table settings (
  id                 int primary key default 1,
  rollout_start_date date not null,
  -- X from §7 line 6. Null until the managers agree it (§10 decision 1).
  tour_window_weeks  int,
  constraint settings_singleton check (id = 1)
);

create table metrics (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  -- R3: exactly one owner. not null is the whole point.
  owner_id        uuid not null references users(id),
  -- R2: null means "target not agreed yet" and renders grey, not red.
  target          numeric,
  direction       metric_direction not null,
  unit            text not null default '',
  definition      text not null default '',
  live_from_week  int not null default 1,
  sort_order      int not null,
  auto_calc       metric_auto_calc,
  active          boolean not null default true
);

create table meetings (
  id                 uuid primary key default gen_random_uuid(),
  date               date not null unique,
  status             meeting_status not null default 'scheduled',
  current_section    int not null default 1 check (current_section between 1 and 7),
  section_started_at timestamptz,
  completion_pct     int,
  rating_avg         numeric,
  cascading_messages text not null default ''
);

create table metric_values (
  id         uuid primary key default gen_random_uuid(),
  metric_id  uuid not null references metrics(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  -- R1: nullable, and null is an off-track rather than a neutral gap.
  value      text,
  entered_by uuid not null references users(id),
  entered_at timestamptz not null default now(),
  unique (meeting_id, metric_id)
);

create table priorities (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  owner_id   uuid not null references users(id),
  horizon    horizon not null,
  due_date   date not null,
  status     item_status not null default 'open',
  created_at timestamptz not null default now(),
  -- Whose goal this is. The department itself comes from the owner's users.department,
  -- so there is no second place for it to disagree.
  scope      priority_scope not null default 'individual',
  -- The monthly priority this is a weekly step toward. One level only: a weekly priority
  -- never parents anything. Enforced in the action layer, where the message can explain
  -- itself rather than surfacing as a constraint violation.
  parent_id  uuid references priorities(id) on delete set null
);

-- On a database created before priorities carried scope and parent_id, the two columns
-- above arrive as:
--   alter table priorities
--     add column scope     priority_scope not null default 'individual',
--     add column parent_id uuid references priorities(id) on delete set null;

create index priorities_parent_idx on priorities (parent_id);

create table priority_checks (
  priority_id uuid not null references priorities(id) on delete cascade,
  meeting_id  uuid not null references meetings(id) on delete cascade,
  -- Null = not reviewed this week.
  on_track    boolean,
  primary key (meeting_id, priority_id)
);

create table issues (
  id               uuid primary key default gen_random_uuid(),
  text             text not null,
  raised_by_id     uuid not null references users(id),
  raised_date      date not null default current_date,
  status           issue_status not null default 'open',
  resolution_note  text,
  solved_meeting_id uuid references meetings(id),
  source           issue_source not null default 'manual'
);

create table todos (
  id                 uuid primary key default gen_random_uuid(),
  text               text not null,
  -- R3 again. "SL & Grace" is not an owner.
  owner_id           uuid not null references users(id),
  due_date           date not null,
  status             item_status not null default 'open',
  source             todo_source not null default 'manual',
  origin_issue_id    uuid references issues(id) on delete set null,
  created_meeting_id uuid not null references meetings(id) on delete cascade,
  weeks_carried      int not null default 0,
  -- R6 idempotency key: the meeting that last incremented weeks_carried.
  last_carried_meeting_id uuid references meetings(id)
);

create table segues (
  meeting_id   uuid not null references meetings(id) on delete cascade,
  user_id      uuid not null references users(id),
  personal     text not null default '',
  professional text not null default '',
  primary key (meeting_id, user_id)
);

-- Any number per meeting, from anyone, added as needed. Not one row per person: a field
-- every manager is expected to fill is how a section fills with filler.
create table headlines (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id    uuid not null references users(id),
  text       text not null default '',
  created_at timestamptz not null default now()
);

create index headlines_meeting_idx on headlines (meeting_id, created_at);

create table ratings (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id    uuid not null references users(id),
  score      int not null check (score between 1 and 10),
  primary key (meeting_id, user_id)
);

create table submissions (
  meeting_id   uuid not null references meetings(id) on delete cascade,
  user_id      uuid not null references users(id),
  submitted_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

-- The three issues picked for IDS. Not in the spec's data model, but the pick has to
-- survive a refresh mid-meeting and R9's cap has to hold across five browsers.
create table issue_picks (
  meeting_id uuid not null references meetings(id) on delete cascade,
  issue_id   uuid not null references issues(id) on delete cascade,
  primary key (meeting_id, issue_id)
);

create index todos_status_due_idx on todos (status, due_date);
create index issues_status_raised_idx on issues (status, raised_date);
create index metric_values_meeting_idx on metric_values (meeting_id);

-- ---------------------------------------------------------------------------
-- Auth helpers
-- ---------------------------------------------------------------------------

-- The signed-in person's row in public.users, matched on the email in their JWT.
create or replace function app_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select u.id from users u
  where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function is_facilitator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users u
    where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and u.role = 'facilitator'
      and u.active
  )
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Everyone on the team reads everything — the meeting is a shared screen and the
-- pre-meeting readiness panel is deliberately visible to all (§6.2). Writes are
-- restricted to the owner of the row, with the facilitator able to write anything
-- because they drive the runner during the live meeting.
-- ---------------------------------------------------------------------------

alter table users           enable row level security;
alter table settings        enable row level security;
alter table metrics         enable row level security;
alter table meetings        enable row level security;
alter table metric_values   enable row level security;
alter table priorities      enable row level security;
alter table priority_checks enable row level security;
alter table issues          enable row level security;
alter table todos           enable row level security;
alter table segues          enable row level security;
alter table headlines       enable row level security;
alter table ratings         enable row level security;
alter table submissions     enable row level security;
alter table issue_picks     enable row level security;

-- Read: any authenticated team member.
create policy read_all on users           for select to authenticated using (true);
create policy read_all on settings        for select to authenticated using (true);
create policy read_all on metrics         for select to authenticated using (true);
create policy read_all on meetings        for select to authenticated using (true);
create policy read_all on metric_values   for select to authenticated using (true);
create policy read_all on priorities      for select to authenticated using (true);
create policy read_all on priority_checks for select to authenticated using (true);
create policy read_all on issues          for select to authenticated using (true);
create policy read_all on todos           for select to authenticated using (true);
create policy read_all on segues          for select to authenticated using (true);
create policy read_all on headlines       for select to authenticated using (true);
create policy read_all on ratings         for select to authenticated using (true);
create policy read_all on submissions     for select to authenticated using (true);
create policy read_all on issue_picks     for select to authenticated using (true);

-- Facilitator-only configuration.
create policy admin_write on users    for all to authenticated
  using (is_facilitator()) with check (is_facilitator());
create policy admin_write on settings for all to authenticated
  using (is_facilitator()) with check (is_facilitator());
create policy admin_write on metrics  for all to authenticated
  using (is_facilitator()) with check (is_facilitator());

-- Any team member may open the coming Monday's meeting row, so a manager can prep on
-- Friday without waiting for the facilitator. Only the facilitator drives it afterwards.
create policy open_meeting on meetings for insert to authenticated
  with check (app_user_id() is not null);
create policy admin_write on meetings for update to authenticated
  using (is_facilitator()) with check (is_facilitator());
create policy admin_delete on meetings for delete to authenticated using (is_facilitator());
create policy admin_write on issue_picks for all to authenticated
  using (is_facilitator()) with check (is_facilitator());

-- Metric values: the metric's owner enters their own numbers; the facilitator can fix
-- anything on the shared screen.
create policy owner_write on metric_values for all to authenticated
  using (
    is_facilitator()
    or exists (select 1 from metrics m where m.id = metric_id and m.owner_id = app_user_id())
  )
  with check (
    is_facilitator()
    or exists (select 1 from metrics m where m.id = metric_id and m.owner_id = app_user_id())
  );

create policy owner_write on priorities for all to authenticated
  using (is_facilitator() or owner_id = app_user_id())
  with check (is_facilitator() or owner_id = app_user_id());

create policy owner_write on priority_checks for all to authenticated
  using (
    is_facilitator()
    or exists (select 1 from priorities p where p.id = priority_id and p.owner_id = app_user_id())
  )
  with check (
    is_facilitator()
    or exists (select 1 from priorities p where p.id = priority_id and p.owner_id = app_user_id())
  );

-- Anyone on the team, including contributors, can raise an issue on any day (§6.3).
create policy insert_any on issues for insert to authenticated
  with check (raised_by_id = app_user_id() or is_facilitator());
create policy update_own on issues for update to authenticated
  using (is_facilitator() or raised_by_id = app_user_id())
  with check (is_facilitator() or raised_by_id = app_user_id());

-- To-dos are created for other people during IDS, so any team member may insert; editing
-- and ticking is the owner's or the facilitator's.
create policy insert_any on todos for insert to authenticated with check (app_user_id() is not null);
create policy update_own on todos for update to authenticated
  using (is_facilitator() or owner_id = app_user_id())
  with check (is_facilitator() or owner_id = app_user_id());

-- Personal per-meeting rows: your own, or the facilitator typing them on the shared screen.
create policy own_row on segues for all to authenticated
  using (is_facilitator() or user_id = app_user_id())
  with check (is_facilitator() or user_id = app_user_id());
create policy own_row on headlines for all to authenticated
  using (is_facilitator() or user_id = app_user_id())
  with check (is_facilitator() or user_id = app_user_id());
create policy own_row on ratings for all to authenticated
  using (is_facilitator() or user_id = app_user_id())
  with check (is_facilitator() or user_id = app_user_id());
create policy own_row on submissions for all to authenticated
  using (is_facilitator() or user_id = app_user_id())
  with check (is_facilitator() or user_id = app_user_id());

-- Sign-in lookup, kept identical to supabase/03-signin-lookup.sql.
create or replace function public.is_team_email(addr text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where lower(email) = lower(trim(addr))
      and active
  );
$$;
revoke all on function public.is_team_email(text) from public;
grant execute on function public.is_team_email(text) to anon, authenticated;
