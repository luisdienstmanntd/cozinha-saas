create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  timezone text not null,
  created_at timestamptz not null default now()
);
create index establishments_organization_idx on public.establishments(organization_id);
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (organization_id,user_id)
);
create index memberships_user_idx on public.memberships(user_id);
create index memberships_active_idx on public.memberships(user_id,organization_id) where revoked_at is null;

-- Minimal privileged lookup prevents recursive membership policies. No caller-supplied user ID.
create function private.has_membership(target_organization uuid, owner_required boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = target_organization and m.user_id = (select auth.uid())
      and m.revoked_at is null and (not owner_required or m.role = 'owner')
  );
$$;
revoke all on function private.has_membership(uuid,boolean) from public, anon, authenticated;
grant execute on function private.has_membership(uuid,boolean) to authenticated;

create function private.validate_establishment_timezone()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Fuso horário inválido.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_establishment_timezone() from public, anon, authenticated;
create trigger validate_establishment_timezone before insert or update of timezone on public.establishments
for each row execute function private.validate_establishment_timezone();

alter table public.organizations enable row level security;
alter table public.establishments enable row level security;
alter table public.memberships enable row level security;

revoke all on public.organizations, public.establishments, public.memberships from anon, authenticated;
grant select on public.organizations, public.establishments, public.memberships to authenticated;
grant update(name) on public.organizations to authenticated;
grant insert(organization_id,name,timezone), update(name,timezone) on public.establishments to authenticated;
grant all on public.organizations, public.establishments, public.memberships to service_role;

create policy organizations_read on public.organizations for select to authenticated
using (private.has_membership(id));
create policy organizations_update on public.organizations for update to authenticated
using (private.has_membership(id,true)) with check (private.has_membership(id,true));
create policy establishments_read on public.establishments for select to authenticated
using (private.has_membership(organization_id));
create policy establishments_insert on public.establishments for insert to authenticated
with check (private.has_membership(organization_id,true));
create policy establishments_update on public.establishments for update to authenticated
using (private.has_membership(organization_id,true)) with check (private.has_membership(organization_id,true));
create policy memberships_read on public.memberships for select to authenticated
using (revoked_at is null and private.has_membership(organization_id)
  and (user_id=(select auth.uid()) or private.has_membership(organization_id,true)));
