alter table public.batch_receipts add constraint batch_receipts_scope_id_key unique (organization_id, establishment_id, id);
create table public.containers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,establishment_id,batch_id) references public.batch_receipts (organization_id,establishment_id,id)
);
create index containers_scope_idx on public.containers(organization_id,establishment_id);
alter table public.containers enable row level security;
revoke all on public.containers from public, anon, authenticated;
grant select on public.containers to authenticated;
grant select, delete on public.containers to service_role;
create policy containers_read on public.containers for select to authenticated using (private.has_membership(organization_id));

create function private.ensure_container(p_organization_id uuid,p_establishment_id uuid,p_batch_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null or not private.has_membership(p_organization_id,true) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if not exists(select 1 from public.batch_receipts b where b.id=p_batch_id and b.organization_id=p_organization_id and b.establishment_id=p_establishment_id) then
    raise exception 'Recebimento não encontrado.' using errcode='23503';
  end if;
  insert into public.containers(organization_id,establishment_id,batch_id,created_by)
    values(p_organization_id,p_establishment_id,p_batch_id,v_user)
    on conflict(batch_id) do nothing returning id into v_id;
  if v_id is null then select id into strict v_id from public.containers where batch_id=p_batch_id; end if;
  return v_id;
end;
$$;
revoke all on function private.ensure_container(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function private.ensure_container(uuid,uuid,uuid) to authenticated;
create function public.ensure_container(p_organization_id uuid,p_establishment_id uuid,p_batch_id uuid)
returns uuid language sql security invoker set search_path='' as $$
  select private.ensure_container(p_organization_id,p_establishment_id,p_batch_id);
$$;
revoke all on function public.ensure_container(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.ensure_container(uuid,uuid,uuid) to authenticated;
