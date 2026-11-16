-- Reverte 20261116000000_session_inactivity.sql (V2, D-025).
-- Depois do rollback a sessão volta a valer até o vencimento do JWT, sem limite de inatividade no banco.
-- O aplicativo da V2 continua chamando touch_session: reverter também o front-end, ou ele não entra.
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';

create or replace function private.has_membership(target_organization uuid, owner_required boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = target_organization and m.user_id = (select auth.uid())
      and m.revoked_at is null and (not owner_required or m.role = 'owner')
  );
$$;

create or replace function private.member_organizations(p_owner_only boolean default false)
returns setof uuid language sql stable security definer set search_path = '' rows 10 as $$
  select m.organization_id from public.memberships m
  where m.user_id = (select auth.uid())
    and m.revoked_at is null
    and (not p_owner_only or m.role = 'owner');
$$;

drop function if exists session_guard.check_request();
drop schema if exists session_guard;
drop function if exists public.touch_session();
drop function if exists private.touch_session();
drop function if exists private.session_active();
drop function if exists private.session_state();
drop function if exists private.session_inactivity_limit();
drop table if exists private.session_activity;
