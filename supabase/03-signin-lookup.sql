-- Lets the sign-in screen ask "is this address on the team?" before anyone is signed in.
--
-- Run this once against a database that already has migration.sql applied. It is also
-- included at the end of migration.sql, so a fresh database needs only that file.
--
-- Why a function rather than a table read: read_all on users is `to authenticated`, and
-- the sign-in lookup necessarily happens with no session. An anonymous select therefore
-- returns zero rows and every address — including real ones — is reported as not on the
-- team. Opening users to the anonymous role would fix sign-in by publishing everyone's
-- name, email and role to the internet. A security-definer function returning one boolean
-- gives the screen exactly what it needs and nothing else: a caller who already knows an
-- address learns whether it can sign in, which is what the sign-in form tells them anyway.

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
