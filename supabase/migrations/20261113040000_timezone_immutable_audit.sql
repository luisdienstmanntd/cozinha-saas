-- Fase 6, fatia 6.0c (P6 da REVISAO_05, S8): fuso imutável depois do primeiro recebimento e auditoria
-- de nome e fuso. O fuso define o "dia" em que o prazo vence; mudá-lo depois de existir recebimento
-- reclassificaria retroativamente o vencimento. Nome e fuso passam a deixar rastro de quem mudou.
-- Sem mudança de tela: a interface do PR #1 (D-017) já não edita o fuso; agora o banco garante.

-- 1) Auditoria de organização e unidade (append-only, só o proprietário lê) -------------------------
create table public.entity_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  establishment_id uuid,
  -- 'membership' é reservado ao nome de exibição (fatia 6.3); o gatilho dele chega junto com a coluna.
  entity text not null check (entity in ('organization', 'establishment', 'membership')),
  entity_id uuid not null,
  field text not null check (field in ('name', 'timezone', 'display_name')),
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id), -- nulo = mudança sem sessão (administrativa)
  changed_at timestamptz not null default now(),
  foreign key (organization_id, establishment_id) references public.establishments (organization_id, id)
);
create index entity_changes_scope_idx on public.entity_changes (organization_id, changed_at desc);
alter table public.entity_changes enable row level security;
revoke all on public.entity_changes from public, anon, authenticated, service_role;
grant select on public.entity_changes to authenticated, service_role;
create policy entity_changes_read on public.entity_changes for select to authenticated
  using (organization_id in (select private.member_organizations(true)));

create trigger entity_changes_append_only before update or delete or truncate on public.entity_changes
  for each statement execute function private.reject_history_change();
alter table public.entity_changes enable always trigger entity_changes_append_only;

-- A verificação final dos backfills (D-033) passa a exigir também esta tabela.
create or replace function private.assert_history_protected()
returns void language plpgsql set search_path = '' as $$
declare
  v_problems text;
begin
  select string_agg(problem, '; ' order by problem) into v_problems
  from (
    select t.name || ': gatilho de proteção ausente, desabilitado ou incompleto' as problem
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes']) as t(name)
    where not exists (
      select 1
      from pg_catalog.pg_trigger g
      where g.tgrelid = ('public.' || t.name)::regclass
        and g.tgname = t.name || '_append_only'
        and g.tgfoid = 'private.reject_history_change()'::regprocedure
        and g.tgenabled = 'A'                -- ENABLE ALWAYS
        and (g.tgtype & 1) = 0               -- por comando
        and (g.tgtype & 2) = 2               -- BEFORE
        and (g.tgtype & 8) = 8               -- DELETE
        and (g.tgtype & 16) = 16             -- UPDATE
        and (g.tgtype & 32) = 32             -- TRUNCATE
    )
    union all
    select t.name || ': ' || r.role || ' tem ' || p.priv
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes']) as t(name)
    cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
    where pg_catalog.has_table_privilege(r.role, ('public.' || t.name)::regclass, p.priv)
  ) as problems;
  if v_problems is not null then
    raise exception 'Proteção do histórico incompleta: %', v_problems using errcode = '55000';
  end if;
end;
$$;
revoke all on function private.assert_history_protected() from public, anon, authenticated, service_role;

-- 2) Gatilho que registra mudança de nome (organização, unidade) e de fuso (unidade) ---------------
create function private.log_entity_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'organizations' then
    if new.name is distinct from old.name then
      insert into public.entity_changes(organization_id, entity, entity_id, field, old_value, new_value, changed_by)
      values (new.id, 'organization', new.id, 'name', old.name, new.name, auth.uid());
    end if;
  else
    if new.name is distinct from old.name then
      insert into public.entity_changes(organization_id, establishment_id, entity, entity_id, field, old_value, new_value, changed_by)
      values (new.organization_id, new.id, 'establishment', new.id, 'name', old.name, new.name, auth.uid());
    end if;
    if new.timezone is distinct from old.timezone then
      insert into public.entity_changes(organization_id, establishment_id, entity, entity_id, field, old_value, new_value, changed_by)
      values (new.organization_id, new.id, 'establishment', new.id, 'timezone', old.timezone, new.timezone, auth.uid());
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.log_entity_changes() from public, anon, authenticated, service_role;
create trigger log_organization_changes after update of name on public.organizations
  for each row execute function private.log_entity_changes();
create trigger log_establishment_changes after update of name, timezone on public.establishments
  for each row execute function private.log_entity_changes();

-- 3) Fuso imutável depois do primeiro recebimento --------------------------------------------------
-- Dispara depois de validate_establishment_timezone (ordem alfabética): fuso inválido continua 22023.
-- Trava a linha da unidade antes de olhar os recebimentos; receive_batch lê a unidade com FOR SHARE,
-- então um UPDATE de fuso e um recebimento concorrentes não terminam os dois (I-11).
create function private.lock_establishment_timezone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.timezone is distinct from old.timezone then
    perform 1 from public.establishments e where e.id = old.id for no key update;
    if exists (select 1 from public.batch_receipts r where r.establishment_id = old.id) then
      raise exception 'O fuso horário não pode mudar depois do primeiro recebimento da unidade.'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.lock_establishment_timezone() from public, anon, authenticated, service_role;
create trigger validate_establishment_timezone_locked before update of timezone on public.establishments
  for each row execute function private.lock_establishment_timezone();

-- 4) receive_batch: mesma lógica e mesmos erros; a única mudança é ler a unidade com FOR SHARE ---------
create or replace function private.receive_batch(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_intent_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_unit text; v_timezone text; v_id uuid; v_existing public.batch_receipts%rowtype;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_intent_id is null or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000
      or p_quantity <> trunc(p_quantity, 3) then
    raise exception 'Quantidade ou identificação inválida.' using errcode='22023';
  end if;
  -- I-11: a unidade é travada antes do recebimento; mudar o fuso espera este recebimento confirmar.
  select e.timezone into v_timezone from public.establishments e
    where e.organization_id=p_organization_id and e.id=p_establishment_id for share;
  if not found then
    raise exception 'Produto ou fornecedor inválido para o estabelecimento.' using errcode='23503';
  end if;
  select p.unit into v_unit from public.products p
    where p.organization_id=p_organization_id and p.establishment_id=p_establishment_id and p.id=p_product_id;
  if not found or not exists (select 1 from public.suppliers s where s.organization_id=p_organization_id
      and s.establishment_id=p_establishment_id and s.id=p_supplier_id) then
    raise exception 'Produto ou fornecedor inválido para o estabelecimento.' using errcode='23503';
  end if;
  insert into public.batch_receipts (organization_id, establishment_id, product_id, supplier_id, source_code,
    quantity, unit, expiry_date, expiry_origin, original_expiry_date, intent_id, timezone, created_by)
  values (p_organization_id,p_establishment_id,p_product_id,p_supplier_id,btrim(p_source_code),p_quantity,
    v_unit,p_expiry_date,p_expiry_origin,p_original_expiry_date,p_intent_id,v_timezone,v_user)
  on conflict (organization_id, establishment_id, intent_id) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;
  select * into strict v_existing from public.batch_receipts where organization_id=p_organization_id
    and establishment_id=p_establishment_id and intent_id=p_intent_id;
  if v_existing.created_by is distinct from v_user or v_existing.product_id is distinct from p_product_id
    or v_existing.supplier_id is distinct from p_supplier_id or v_existing.source_code is distinct from btrim(p_source_code)
    or v_existing.quantity is distinct from p_quantity or v_existing.expiry_date is distinct from p_expiry_date
    or v_existing.expiry_origin is distinct from p_expiry_origin or v_existing.original_expiry_date is distinct from p_original_expiry_date then
      raise exception 'Identificador já utilizado com outros dados.' using errcode='23505';
  end if;
  return v_existing.id;
end;
$$;

select private.assert_history_protected();
