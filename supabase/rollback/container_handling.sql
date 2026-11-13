-- Reverte 20261113070000_container_handling.sql.
-- RECUSA se existir manipulação: o histórico é append-only, e sem as tabelas e colunas da 6.3 os
-- derivados, a transferência e o descarte de sobra perderiam o vínculo com a operação que os criou
-- (e o rollback da 6.1 também recusa com derivados).
-- ATENÇÃO: os nomes de exibição definidos em memberships são perdidos (coluna removida); a trilha de
-- quem definiu e quando continua em entity_changes. Reaplicar a migração não os recupera.
do $$
begin
  if exists (select 1 from public.container_handlings) then
    raise exception 'Rollback recusado: existem manipulações registradas.' using errcode = '55000';
  end if;
end;
$$;

drop function if exists public.handle_container(uuid, uuid, uuid, text, numeric[], date, text, timestamptz, uuid, text, text, text, text, uuid);
drop function if exists private.handle_container(uuid, uuid, uuid, text, numeric[], date, text, timestamptz, uuid, text, text, text, text, uuid);
drop function if exists public.set_member_display_name(uuid, uuid, text);
drop function if exists private.set_member_display_name(uuid, uuid, text);
drop trigger if exists log_membership_display_name on public.memberships;
drop function if exists private.log_membership_display_name();

-- Funções de saldo, conservação, anulação e proteção voltam ao texto das migrações 6.0c, 6.1 e 6.2.
create or replace function private.container_balance(p_container_id uuid)
returns numeric language sql stable set search_path = '' as $$
  select c.initial_quantity - coalesce(sum(case when m.kind in ('consumption', 'discard') then m.quantity
                                                 when m.kind = 'reversal' then -m.quantity end), 0)
    from public.containers c
    left join public.stock_movements m on m.organization_id = c.organization_id
      and m.establishment_id = c.establishment_id and m.batch_id = c.batch_id and m.container_id = c.id
   where c.id = p_container_id
   group by c.id, c.initial_quantity;
$$;

create or replace function private.stock_conservation_problems()
returns table (batch_id uuid, problem text) language sql stable set search_path = '' as $$
  with balances as (
    select c.batch_id, c.id, private.container_balance(c.id) as balance from public.containers c
  )
  select b.id, 'recebimento sem exatamente um recipiente integral'
    from public.batch_receipts b
   where (select count(*) from public.containers c where c.batch_id = b.id and c.kind = 'integral') <> 1
  union all
  select c.batch_id, 'integral difere do recebimento: ' || c.id
    from public.containers c join public.batch_receipts b on b.id = c.batch_id
   where c.kind = 'integral' and (c.initial_quantity <> b.quantity or c.expiry_date <> b.expiry_date or c.timezone <> b.timezone)
  union all
  select batch_id, 'saldo negativo no recipiente ' || id from balances where balance < 0
  union all
  select m.batch_id, 'tipo de movimento sem regra de saldo: ' || m.kind
    from public.stock_movements m where m.kind not in ('consumption', 'discard', 'reversal')
  union all
  select b.id, 'soma dos saldos dos recipientes difere de recebimento − saídas + anulações'
    from public.batch_receipts b
   where (select sum(x.balance) from balances x where x.batch_id = b.id)
         is distinct from b.quantity - coalesce((
           select sum(case when m.kind in ('consumption', 'discard') then m.quantity
                           when m.kind = 'reversal' then -m.quantity end)
             from public.stock_movements m
            where m.organization_id = b.organization_id and m.establishment_id = b.establishment_id
              and m.batch_id = b.id), 0);
$$;

create or replace function private.apply_movement_to_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_delta numeric;
begin
  v_delta := case when new.kind in ('consumption', 'discard') then -new.quantity
                  when new.kind = 'reversal' then new.quantity end;
  if v_delta is null then
    raise exception 'Tipo de movimento sem regra de saldo.' using errcode = '55000', detail = new.kind;
  end if;
  update public.container_balances set balance = balance + v_delta where container_id = new.container_id;
  if not found then
    raise exception 'Recipiente sem saldo registrado.' using errcode = '55000';
  end if;
  return null;
end;
$$;

create or replace function private.reverse_movement(p_organization_id uuid,p_establishment_id uuid,p_movement_id uuid,p_reason text,p_intent_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_original public.stock_movements%rowtype; v_existing public.stock_movements%rowtype; v_batch_id uuid; v_reason text:=nullif(btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),''); v_timezone text; v_id uuid;
begin
 if v_user is null or not private.has_membership(p_organization_id,true) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_intent_id is null or v_reason is null or length(v_reason)>500 then raise exception 'Motivo ou identificador inválido.' using errcode='22023'; end if;
 select batch_id into v_batch_id from public.stock_movements where id=p_movement_id and organization_id=p_organization_id and establishment_id=p_establishment_id;
 if not found then raise exception 'Movimento não encontrado.' using errcode='23503'; end if;
 perform 1 from public.batch_receipts where id=v_batch_id and organization_id=p_organization_id and establishment_id=p_establishment_id for update;
 select * into strict v_original from public.stock_movements where id=p_movement_id and organization_id=p_organization_id and establishment_id=p_establishment_id and batch_id=v_batch_id;
 if v_original.kind='reversal' then raise exception 'Estorno de estorno não é permitido.' using errcode='22023'; end if;
 select * into v_existing from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id;
 if found then
   if v_existing.kind is distinct from 'reversal' or v_existing.reverses_id is distinct from p_movement_id or v_existing.created_by is distinct from v_user or v_existing.reason is distinct from v_reason then raise exception 'Identificador já utilizado com outros dados.' using errcode='23505'; end if;
   return v_existing.id;
 end if;
 if exists(select 1 from public.stock_movements where reverses_id=p_movement_id) then raise exception 'Movimento já estornado.' using errcode='23505'; end if;
 select timezone into strict v_timezone from public.establishments where organization_id=p_organization_id and id=p_establishment_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by,reverses_id) values(p_organization_id,p_establishment_id,v_batch_id,v_original.container_id,p_intent_id,'reversal',v_original.quantity,v_reason,v_timezone,v_user,p_movement_id) returning id into v_id;
 return v_id;
end;
$$;

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

-- Movimentos: sem 'transfer' e sem vínculo com manipulação (não há linhas com handling_id: recusado acima).
drop index if exists public.stock_movements_one_transfer_idx;
drop index if exists public.stock_movements_one_remainder_idx;
alter table public.stock_movements drop constraint if exists stock_movements_handling_fk;
alter table public.stock_movements drop constraint if exists stock_movements_handling_check;
alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check
  check (kind = any (array['consumption'::text, 'discard'::text, 'reversal'::text]));
alter table public.stock_movements drop column handling_id;

-- Recipientes: forma da 6.1 (sem derivados de manipulação: recusado acima).
alter table public.containers drop constraint containers_kind_shape_check;
alter table public.containers drop constraint containers_handling_source_fk;
alter table public.containers drop constraint containers_handling_expiry_fk;
alter table public.containers drop constraint containers_handling_storage_fk;
alter table public.containers drop constraint containers_handling_handled_at_fk;
drop index if exists public.containers_handling_position_idx;
drop index if exists public.containers_handling_expiry_idx;
drop index if exists public.containers_handling_storage_idx;
drop index if exists public.containers_handling_handled_at_idx;
alter table public.containers drop column handling_id, drop column position, drop column handled_at, drop column storage;
alter table public.containers add constraint containers_kind_shape_check check (
    (kind = 'integral' and parent_container_id is null and expiry_origin = 'receipt') or
    (kind = 'derived' and parent_container_id is not null and parent_container_id <> id and expiry_origin = 'handling'));

drop table public.container_handlings;
alter table public.containers drop constraint containers_id_expiry_key;

alter table public.memberships drop constraint memberships_display_name_check;
alter table public.memberships drop column display_name;

drop function if exists private.handling_late_window();
drop function if exists private.visible_text(text);

select private.assert_history_protected();
