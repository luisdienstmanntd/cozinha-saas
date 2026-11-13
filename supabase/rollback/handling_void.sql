-- Reverte 20261113080000_handling_void.sql.
-- RECUSA se existir anulação de manipulação: o histórico é append-only, e sem a tabela e os tipos da
-- 6.4 a devolução e as saídas dos derivados perderiam a regra de saldo e o vínculo com a anulação.
do $$
begin
  if exists (select 1 from public.handling_voids)
     or exists (select 1 from public.stock_movements where kind in ('transfer_reversal', 'handling_void') or handling_void_id is not null) then
    raise exception 'Rollback recusado: existem anulações de manipulação registradas.' using errcode = '55000';
  end if;
end;
$$;

drop function if exists public.void_handling(uuid, uuid, uuid, text, uuid);
drop function if exists private.void_handling(uuid, uuid, uuid, text, uuid);

-- Restrições e índices de stock_movements voltam ao texto da 6.3.
drop index if exists public.stock_movements_one_transfer_reversal_idx;
drop index if exists public.stock_movements_one_handling_void_idx;
drop index if exists public.stock_movements_handling_void_idx;
drop index if exists public.stock_movements_reverses_handling_idx;
alter table public.stock_movements
  drop constraint if exists stock_movements_reverses_handling_fk,
  drop constraint if exists stock_movements_handling_void_derived_fk,
  drop constraint if exists stock_movements_handling_void_fk,
  drop constraint if exists stock_movements_derived_handling_check,
  drop constraint stock_movements_handling_check,
  drop constraint stock_movements_reversal_check,
  drop constraint stock_movements_kind_check,
  drop constraint if exists stock_movements_id_handling_key;
alter table public.stock_movements add constraint stock_movements_kind_check
  check (kind = any (array['consumption'::text, 'discard'::text, 'reversal'::text, 'transfer'::text]));
alter table public.stock_movements add constraint stock_movements_reversal_check
  check ((kind='reversal' and reverses_id is not null and reason is not null) or (kind<>'reversal' and reverses_id is null));
alter table public.stock_movements add constraint stock_movements_handling_check check (
  (kind = 'transfer' and handling_id is not null and reason is null and reverses_id is null) or
  (kind = 'discard') or
  (kind in ('consumption', 'reversal') and handling_id is null));
alter table public.stock_movements drop column handling_void_id, drop column derived_handling_id;
drop trigger if exists stock_movements_check_handling_void on public.stock_movements;
drop function if exists private.check_handling_void_container();

drop table public.handling_voids;

-- Funções de saldo, conservação, anulação comum e proteção voltam ao texto da 6.3.
create or replace function private.container_balance(p_container_id uuid)
returns numeric language sql stable set search_path = '' as $$
  select c.initial_quantity - coalesce(sum(case when m.kind in ('consumption', 'discard', 'transfer') then m.quantity
                                                 when m.kind = 'reversal' then -m.quantity end), 0)
    from public.containers c
    left join public.stock_movements m on m.organization_id = c.organization_id
      and m.establishment_id = c.establishment_id and m.batch_id = c.batch_id and m.container_id = c.id
   where c.id = p_container_id
   group by c.id, c.initial_quantity;
$$;

create or replace function private.apply_movement_to_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_delta numeric;
begin
  v_delta := case when new.kind in ('consumption', 'discard', 'transfer') then -new.quantity
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
    from public.stock_movements m where m.kind not in ('consumption', 'discard', 'reversal', 'transfer')
  union all
  select b.id, 'soma dos saldos dos recipientes difere de recebimento − saídas + anulações'
    from public.batch_receipts b
   where (select sum(x.balance) from balances x where x.batch_id = b.id)
         is distinct from b.quantity - coalesce((
           select sum(case when m.kind in ('consumption', 'discard') then m.quantity
                           when m.kind = 'reversal' then -m.quantity else 0 end)
             from public.stock_movements m
            where m.organization_id = b.organization_id and m.establishment_id = b.establishment_id
              and m.batch_id = b.id), 0)
  union all
  select c.batch_id, 'derivado sem transferência da origem: ' || c.id
    from public.containers c
   where c.kind = 'derived'
     and not exists (select 1 from public.stock_movements m where m.handling_id = c.handling_id and m.kind = 'transfer')
  union all
  select h.batch_id, 'manipulação com derivados, transferência ou sobra divergentes: ' || h.id
    from public.container_handlings h
   where h.total_quantity is distinct from (select sum(c.initial_quantity) from public.containers c where c.handling_id = h.id)
      or h.total_quantity is distinct from (select sum(m.quantity) from public.stock_movements m where m.handling_id = h.id and m.kind = 'transfer')
      or (select count(*) from public.containers c where c.handling_id = h.id)
         <> h.portion_count + case when h.remainder = 'portion' then 1 else 0 end
      or (h.remainder = 'portion') is distinct from exists (
           select 1 from public.containers c where c.handling_id = h.id and c.position = h.portion_count + 1
              and c.initial_quantity = h.remainder_quantity)
      or coalesce((select sum(m.quantity) from public.stock_movements m where m.handling_id = h.id and m.kind = 'discard'), 0)
         is distinct from case when h.remainder = 'discarded' then h.remainder_quantity else 0 end;
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
 if v_original.kind='transfer' or v_original.handling_id is not null then raise exception 'Movimento de manipulação só é desfeito pela anulação da manipulação.' using errcode='22023'; end if;
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
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes', 'container_handlings']) as t(name)
    where not exists (
      select 1
      from pg_catalog.pg_trigger g
      where g.tgrelid = ('public.' || t.name)::regclass
        and g.tgname = t.name || '_append_only'
        and g.tgfoid = 'private.reject_history_change()'::regprocedure
        and g.tgenabled = 'A'
        and (g.tgtype & 1) = 0
        and (g.tgtype & 2) = 2
        and (g.tgtype & 8) = 8
        and (g.tgtype & 16) = 16
        and (g.tgtype & 32) = 32
    )
    union all
    select t.name || ': ' || r.role || ' tem ' || p.priv
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes', 'container_handlings']) as t(name)
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

do $$
begin
  perform private.assert_history_protected();
  if exists (select 1 from private.stock_conservation_problems()) or exists (select 1 from private.container_balance_problems()) then
    raise exception 'Conservação ou saldo divergente depois do rollback; rollback desfeito.' using errcode = '55000';
  end if;
end;
$$;
