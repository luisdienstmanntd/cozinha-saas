-- Fase 6, fatia 6.9: locais de armazenamento e transferência entre locais (FASE_06_DESENHO.md 4.9,
-- D-030, Q9). Mover um recipiente de local NÃO altera saldo, validade nem conservação: é só um registro
-- de onde o recipiente está. Só o proprietário escreve (D-019).
--   * storage_locations: nome, condição do local, unidade, ativo. Criado e desativado, nunca apagado.
--   * location_moves: evento imutável (append-only). Localização atual = evento de maior seq do
--     recipiente (I-8). Mover bloqueia a linha do recebimento, como as demais escritas do lote.
--   * Derivado herda o local atual da origem, como evento 'inherited' na mesma transação da criação.
--   * Anular uma manipulação é recusado se algum derivado foi movido pelo usuário (4.10); o evento
--     herdado na criação não conta.
-- Recipiente esgotado ou bloqueado por ocorrência não pode ser movido. Divergência entre a condição
-- do local e a do recipiente exige confirmação e fica registrada; nada muda sozinho.
-- O local inicial no recebimento e na manipulação é registrado logo depois, por move_container (uma
-- segunda operação), para não mudar as assinaturas de receive_batch e handle_container.
-- Nada aqui afirma conformidade sanitária.

-- 1) Locais ----------------------------------------------------------------------------------------------
create table public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  name text not null check (
    length(name) between 1 and 40
    and name = btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  condition text not null check (condition in ('ambient', 'refrigerated', 'frozen')),
  active boolean not null default true,
  intent_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  changed_by uuid references auth.users(id),
  changed_at timestamptz,
  constraint storage_locations_scope_key unique (organization_id, establishment_id, id),
  constraint storage_locations_intent_key unique (organization_id, establishment_id, intent_id),
  constraint storage_locations_establishment_fk foreign key (organization_id, establishment_id)
    references public.establishments (organization_id, id)
);
create unique index storage_locations_name_idx on public.storage_locations (organization_id, establishment_id, lower(name));
create index storage_locations_created_by_idx on public.storage_locations (created_by);
create index storage_locations_changed_by_idx on public.storage_locations (changed_by);
alter table public.storage_locations enable row level security;
revoke all on public.storage_locations from public, anon, authenticated, service_role;
grant select on public.storage_locations to authenticated, service_role;
create policy storage_locations_read on public.storage_locations for select to authenticated
  using (organization_id in (select private.member_organizations()));

-- 2) Eventos de local (append-only) -----------------------------------------------------------------------
create table public.location_moves (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null,
  container_id uuid not null,
  kind text not null check (kind in ('move', 'inherited')),
  from_location_id uuid,
  to_location_id uuid not null,
  mismatch_confirmed boolean not null default false,
  handled_by uuid not null,
  handled_by_name text not null check (length(handled_by_name) between 1 and 40),
  intent_id uuid not null,
  timezone text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint location_moves_seq_key unique (seq),
  constraint location_moves_intent_key unique (organization_id, establishment_id, intent_id),
  constraint location_moves_container_fk foreign key (organization_id, establishment_id, batch_id, container_id)
    references public.containers (organization_id, establishment_id, batch_id, id),
  constraint location_moves_to_fk foreign key (organization_id, establishment_id, to_location_id)
    references public.storage_locations (organization_id, establishment_id, id),
  constraint location_moves_from_fk foreign key (organization_id, establishment_id, from_location_id)
    references public.storage_locations (organization_id, establishment_id, id),
  constraint location_moves_handled_by_fk foreign key (organization_id, handled_by)
    references public.memberships (organization_id, user_id),
  constraint location_moves_shape_check check (from_location_id is distinct from to_location_id)
);
create index location_moves_container_idx on public.location_moves (container_id, seq desc);
create index location_moves_scope_idx on public.location_moves (organization_id, establishment_id, to_location_id);
create index location_moves_from_idx on public.location_moves (organization_id, establishment_id, from_location_id);
create index location_moves_handled_by_idx on public.location_moves (organization_id, handled_by);
create index location_moves_created_by_idx on public.location_moves (created_by);
alter table public.location_moves enable row level security;
revoke all on public.location_moves from public, anon, authenticated, service_role;
grant select on public.location_moves to authenticated, service_role;
create policy location_moves_read on public.location_moves for select to authenticated
  using (organization_id in (select private.member_organizations()));
create trigger location_moves_append_only before update or delete or truncate on public.location_moves
  for each statement execute function private.reject_history_change();
alter table public.location_moves enable always trigger location_moves_append_only;

-- 3) Local herdado pelo derivado (mesma transação da criação) ---------------------------------------------
create function private.inherit_container_location()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_parent public.location_moves%rowtype;
  v_handling public.container_handlings%rowtype;
begin
  if new.kind <> 'derived' then return null; end if;
  select * into v_parent from public.location_moves m where m.container_id = new.parent_container_id
   order by m.seq desc limit 1;
  if not found then return null; end if;
  select * into v_handling from public.container_handlings h where h.id = new.handling_id;
  insert into public.location_moves (organization_id, establishment_id, batch_id, container_id, kind, from_location_id,
    to_location_id, handled_by, handled_by_name, intent_id, timezone, created_by)
  values (new.organization_id, new.establishment_id, new.batch_id, new.id, 'inherited', null, v_parent.to_location_id,
    v_handling.handled_by, v_handling.handled_by_name, gen_random_uuid(), new.timezone, v_handling.created_by);
  return null;
end;
$$;
revoke all on function private.inherit_container_location() from public, anon, authenticated, service_role;
create trigger containers_inherit_location after insert on public.containers
  for each row execute function private.inherit_container_location();

-- 4) Anulação de manipulação: derivado movido pelo usuário impede (4.10) ------------------------------------
create function private.check_void_no_user_moves()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.location_moves m join public.containers c on c.id = m.container_id
              where c.handling_id = new.handling_id and m.kind = 'move') then
    raise exception 'Algum recipiente desta manipulação já mudou de local; a manipulação não pode ser anulada.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.check_void_no_user_moves() from public, anon, authenticated, service_role;
create trigger handling_voids_check_moves before insert on public.handling_voids
  for each row execute function private.check_void_no_user_moves();

-- 5) Escritas ------------------------------------------------------------------------------------------------
create function private.create_storage_location(
  p_organization_id uuid, p_establishment_id uuid, p_name text, p_condition text, p_intent_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_name text := private.visible_text(p_name);
  v_existing public.storage_locations%rowtype;
  v_id uuid;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_intent_id is null or v_name is null or length(v_name) > 40 or p_condition is null
     or p_condition not in ('ambient', 'refrigerated', 'frozen') then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.establishments e where e.organization_id = p_organization_id and e.id = p_establishment_id) then
    raise exception 'Unidade não encontrada.' using errcode = '23503';
  end if;
  select * into v_existing from public.storage_locations l
   where l.organization_id = p_organization_id and l.establishment_id = p_establishment_id and l.intent_id = p_intent_id;
  if found then
    if v_existing.name is distinct from v_name or v_existing.condition is distinct from p_condition
       or v_existing.created_by is distinct from v_user then
      raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  if exists (select 1 from public.storage_locations l where l.organization_id = p_organization_id
              and l.establishment_id = p_establishment_id and lower(l.name) = lower(v_name)) then
    raise exception 'Já existe um local com esse nome nesta unidade.' using errcode = '23505';
  end if;
  insert into public.storage_locations (organization_id, establishment_id, name, condition, intent_id, created_by)
  values (p_organization_id, p_establishment_id, v_name, p_condition, p_intent_id, v_user) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.create_storage_location(uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.create_storage_location(uuid, uuid, text, text, uuid) to authenticated;
create function public.create_storage_location(
  p_organization_id uuid, p_establishment_id uuid, p_name text, p_condition text, p_intent_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_storage_location(p_organization_id, p_establishment_id, p_name, p_condition, p_intent_id);
$$;
revoke all on function public.create_storage_location(uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_storage_location(uuid, uuid, text, text, uuid) to authenticated;

create function private.set_storage_location_active(
  p_organization_id uuid, p_establishment_id uuid, p_location_id uuid, p_active boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_location_id is null or p_active is null then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  update public.storage_locations l set active = p_active, changed_by = v_user, changed_at = now()
   where l.organization_id = p_organization_id and l.establishment_id = p_establishment_id and l.id = p_location_id
     and l.active is distinct from p_active;
  if not found and not exists (select 1 from public.storage_locations l where l.organization_id = p_organization_id
                                and l.establishment_id = p_establishment_id and l.id = p_location_id) then
    raise exception 'Local não encontrado.' using errcode = '23503';
  end if;
  return p_active;
end;
$$;
revoke all on function private.set_storage_location_active(uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function private.set_storage_location_active(uuid, uuid, uuid, boolean) to authenticated;
create function public.set_storage_location_active(
  p_organization_id uuid, p_establishment_id uuid, p_location_id uuid, p_active boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select private.set_storage_location_active(p_organization_id, p_establishment_id, p_location_id, p_active);
$$;
revoke all on function public.set_storage_location_active(uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_storage_location_active(uuid, uuid, uuid, boolean) to authenticated;

create function private.move_container(
  p_organization_id uuid, p_establishment_id uuid, p_container_id uuid, p_location_id uuid, p_handled_by uuid,
  p_intent_id uuid, p_confirm_mismatch boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_container public.containers%rowtype;
  v_batch public.batch_receipts%rowtype;
  v_location public.storage_locations%rowtype;
  v_current public.location_moves%rowtype;
  v_existing public.location_moves%rowtype;
  v_name text;
  v_condition text;
  v_mismatch boolean;
  v_id uuid;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_intent_id is null or p_container_id is null or p_location_id is null or p_handled_by is null then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;

  select * into v_container from public.containers c
   where c.organization_id = p_organization_id and c.establishment_id = p_establishment_id and c.id = p_container_id;
  if not found then
    raise exception 'Recipiente não encontrado.' using errcode = '23503';
  end if;
  select * into v_batch from public.batch_receipts b
   where b.organization_id = p_organization_id and b.establishment_id = p_establishment_id and b.id = v_container.batch_id
   for update;

  -- Replay antes das regras de estado.
  select * into v_existing from public.location_moves m
   where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id and m.intent_id = p_intent_id;
  if found then
    if v_existing.kind <> 'move' or v_existing.container_id is distinct from p_container_id
       or v_existing.to_location_id is distinct from p_location_id or v_existing.handled_by is distinct from p_handled_by
       or v_existing.created_by is distinct from v_user then
      raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  -- I-3: o identificador de outra operação não vira mudança de local.
  if exists (select 1 from public.stock_movements m where m.organization_id = p_organization_id
              and m.establishment_id = p_establishment_id and m.intent_id = p_intent_id)
     or exists (select 1 from public.container_handlings h where h.organization_id = p_organization_id
              and h.establishment_id = p_establishment_id and h.intent_id = p_intent_id)
     or exists (select 1 from public.handling_voids v where v.organization_id = p_organization_id
              and v.establishment_id = p_establishment_id and v.intent_id = p_intent_id)
     or exists (select 1 from public.batch_receipts r where r.organization_id = p_organization_id
              and r.establishment_id = p_establishment_id and r.intent_id = p_intent_id)
     or exists (select 1 from public.occurrence_decisions d where d.organization_id = p_organization_id
              and d.establishment_id = p_establishment_id and d.intent_id = p_intent_id) then
    raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
  end if;

  -- Local no escopo, ativo.
  select * into v_location from public.storage_locations l
   where l.organization_id = p_organization_id and l.establishment_id = p_establishment_id and l.id = p_location_id;
  if not found then
    raise exception 'Local não encontrado.' using errcode = '23503';
  end if;
  if not v_location.active then
    raise exception 'Local desativado; escolha outro local.' using errcode = '22023';
  end if;

  -- Estado do recipiente: com saldo e sem bloqueio por ocorrência.
  if coalesce(private.container_balance(p_container_id), 0) <= 0 then
    raise exception 'Recipiente sem saldo; não é possível mudar de local.' using errcode = '22023';
  end if;
  perform private.raise_if_blocked(p_organization_id, p_establishment_id, p_container_id);

  select * into v_current from public.location_moves m where m.container_id = p_container_id
   order by m.seq desc limit 1;
  if found and v_current.to_location_id = p_location_id then
    raise exception 'O recipiente já está neste local.' using errcode = '22023';
  end if;

  -- Quem moveu: vínculo ativo e nome de exibição.
  select m.display_name into v_name from public.memberships m
   where m.organization_id = p_organization_id and m.user_id = p_handled_by and m.revoked_at is null;
  if not found then
    raise exception 'A pessoa que mudou o recipiente de local precisa ter vínculo ativo com a empresa.' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Defina o nome de exibição da pessoa antes de registrar.' using errcode = '22023';
  end if;

  -- Divergência entre a condição do local e a do recipiente: confirmação, sem mudança automática.
  v_condition := coalesce(v_container.storage, v_batch.storage_condition);
  v_mismatch := v_condition is not null and v_condition <> v_location.condition;
  if v_mismatch and coalesce(p_confirm_mismatch, false) is not true then
    raise exception 'A condição do local é diferente da condição do recipiente; confirme para registrar.' using errcode = '22023';
  end if;

  insert into public.location_moves (organization_id, establishment_id, batch_id, container_id, kind, from_location_id,
    to_location_id, mismatch_confirmed, handled_by, handled_by_name, intent_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_container.batch_id, p_container_id, 'move', v_current.to_location_id,
    p_location_id, v_mismatch, p_handled_by, v_name, p_intent_id, v_batch.timezone, v_user)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.move_container(uuid, uuid, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function private.move_container(uuid, uuid, uuid, uuid, uuid, uuid, boolean) to authenticated;
create function public.move_container(
  p_organization_id uuid, p_establishment_id uuid, p_container_id uuid, p_location_id uuid, p_handled_by uuid,
  p_intent_id uuid, p_confirm_mismatch boolean default false)
returns uuid language sql security invoker set search_path = '' as $$
  select private.move_container(p_organization_id, p_establishment_id, p_container_id, p_location_id, p_handled_by,
    p_intent_id, p_confirm_mismatch);
$$;
revoke all on function public.move_container(uuid, uuid, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.move_container(uuid, uuid, uuid, uuid, uuid, uuid, boolean) to authenticated;

-- 6) Leitura: local atual de cada recipiente (maior seq) --------------------------------------------------
create function public.list_container_locations(p_organization_id uuid, p_establishment_id uuid)
returns table (container_id uuid, location_id uuid, location_name text, location_condition text, moved_at timestamptz,
  handled_by_name text, mismatch_confirmed boolean)
language sql stable security invoker set search_path = '' as $$
  select distinct on (m.container_id) m.container_id, m.to_location_id, l.name, l.condition, m.created_at,
         m.handled_by_name, m.mismatch_confirmed
    from public.location_moves m
    join public.storage_locations l on l.organization_id = m.organization_id and l.establishment_id = m.establishment_id
     and l.id = m.to_location_id
   where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id
   order by m.container_id, m.seq desc;
$$;
revoke all on function public.list_container_locations(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_container_locations(uuid, uuid) to authenticated;

-- 7) find_operation passa a conhecer a mudança de local (prioridade menor que as demais, I-3) --------------
create or replace function public.find_operation(p_organization_id uuid, p_establishment_id uuid, p_intent_id uuid)
returns table (kind text, id uuid, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select found.kind, found.id, found.created_at
    from (
      select 'handling'::text as kind, h.id, h.created_at, 1 as ord
        from public.container_handlings h
       where h.organization_id = p_organization_id and h.establishment_id = p_establishment_id
         and h.intent_id = p_intent_id
      union all
      select 'receipt', r.id, r.created_at, 2
        from public.batch_receipts r
       where r.organization_id = p_organization_id and r.establishment_id = p_establishment_id
         and r.intent_id = p_intent_id
      union all
      select 'handling_void', v.id, v.created_at, 3
        from public.handling_voids v
       where v.organization_id = p_organization_id and v.establishment_id = p_establishment_id
         and v.intent_id = p_intent_id
      union all
      select 'decision', d.id, d.created_at, 4
        from public.occurrence_decisions d
       where d.organization_id = p_organization_id and d.establishment_id = p_establishment_id
         and d.intent_id = p_intent_id
      union all
      select 'movement', m.id, m.created_at, 5
        from public.stock_movements m
       where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id
         and m.intent_id = p_intent_id
      union all
      select 'location_move', lm.id, lm.created_at, 6
        from public.location_moves lm
       where lm.organization_id = p_organization_id and lm.establishment_id = p_establishment_id
         and lm.intent_id = p_intent_id and lm.kind = 'move'
      union all
      select 'location', sl.id, sl.created_at, 7
        from public.storage_locations sl
       where sl.organization_id = p_organization_id and sl.establishment_id = p_establishment_id
         and sl.intent_id = p_intent_id
    ) found
   where p_intent_id is not null
   order by found.ord
   limit 1;
$$;

-- 8) Proteção do histórico passa a incluir location_moves ---------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef('private.assert_history_protected()'::regprocedure) into v_def;
  v_def := replace(v_def, '''handling_voids'']', '''handling_voids'', ''location_moves'']');
  if v_def not like '%location_moves%' then
    -- A lista pode ter mais nomes depois de handling_voids; acrescenta ao fim de cada lista.
    v_def := regexp_replace(v_def, '(array\[[^\]]*''handling_voids''[^\]]*)\]', '\1, ''location_moves'']', 'g');
  end if;
  if v_def not like '%location_moves%' then
    raise exception 'Não foi possível incluir location_moves na proteção do histórico.' using errcode = '55000';
  end if;
  execute v_def;
end;
$$;
revoke all on function private.assert_history_protected() from public, anon, authenticated, service_role;

do $$
begin
  perform private.assert_history_protected();
  if not exists (select 1 from pg_catalog.pg_proc p where p.oid = 'private.assert_history_protected()'::regprocedure
                  and pg_get_functiondef(p.oid) like '%location_moves%') then
    raise exception 'Proteção do histórico não inclui location_moves; migração desfeita.' using errcode = '55000';
  end if;
end;
$$;
