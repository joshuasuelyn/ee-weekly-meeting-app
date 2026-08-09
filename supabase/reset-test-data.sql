-- Clears everything produced by testing, and nothing else.
--
-- Deletes: meetings and every record hanging off them — numbers entered, priorities and
-- their weekly steps, to-dos, issues, segues, alignment points, ratings, prep submissions.
--
-- Keeps: users, metrics, settings. Deliberately. The people table holds email addresses
-- you corrected by hand in Admin, and re-running 02-seed.sql would put the placeholder
-- guesses back. The metric definitions and the rollout start date are configuration, not
-- test data.
--
-- Safe to run more than once. Wrapped in a transaction, so a failure part-way leaves the
-- database exactly as it was rather than half-cleared.
--
-- THIS CANNOT BE UNDONE. On the Supabase free tier there are no automatic backups, so if
-- there is anything in here you want to keep, export it from the History page first.

begin;

-- Children before parents. Most of these would cascade from deleting meetings, but doing
-- it explicitly means the script says what it removes rather than relying on the schema.
delete from issue_picks;
delete from submissions;
delete from ratings;
delete from headlines;
delete from segues;
delete from priority_checks;
delete from metric_values;

-- todos references issues and meetings; issues references meetings. Order matters here.
delete from todos;
delete from issues;

-- priorities are self-referencing (a weekly step points at its monthly goal), and
-- parent_id is `on delete set null`, so a single delete clears both levels.
delete from priorities;

delete from meetings;

commit;

-- What is left. Expect 5 people, 11 metrics, 1 settings row, and zeroes across the rest.
select
  (select count(*) from users)       as users,
  (select count(*) from metrics)     as metrics,
  (select count(*) from settings)    as settings,
  (select count(*) from meetings)    as meetings,
  (select count(*) from priorities)  as priorities,
  (select count(*) from todos)       as todos,
  (select count(*) from issues)      as issues;
