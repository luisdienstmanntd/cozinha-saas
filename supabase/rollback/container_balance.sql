-- Reverte 20261113050000_container_balance.sql.
-- RECUSA se existir recipiente derivado: sem as colunas da 6.1, o derivado e os seus movimentos
-- ficariam indistinguíveis do integral e o saldo do recebimento contaria a mesma quantidade duas vezes.
-- ATENÇÃO: os recipientes integrais criados pelo backfill e pelo gatilho de recebimento continuam
-- existindo (histórico é append-only; nada é apagado). Na tela antiga eles aparecem como "recipiente"
-- do recebimento, como se a etiqueta já tivesse sido gerada. Os códigos curtos e o vínculo
-- movimento → recipiente são perdidos (colunas removidas); reaplicar a migração os recalcula iguais.
-- DROP COLUMN não dispara os gatilhos de proteção (não é UPDATE), então nenhum é suspenso aqui.
do $$
begin
  if exists (select 1 from public.containers where kind = 'derived') then
    raise exception 'Rollback recusado: existem recipientes derivados.' using errcode = '55000';
  end if;
end;
$$;

drop function if exists public.record_container_movement(uuid,uuid,uuid,text,numeric,text,uuid);
drop function if exists private.record_container_movement(uuid,uuid,uuid,text,numeric,text,uuid);
drop trigger if exists stock_movements_fill_container on public.stock_movements;
drop trigger if exists batch_receipts_create_integral on public.batch_receipts;
drop trigger if exists containers_prepare on public.containers;
drop function if exists private.fill_movement_container();
drop function if exists private.create_integral_container();
drop function if exists private.prepare_container();

-- record_movement volta ao texto da migração 20261112153000 (saldo por recebimento, filtro de escopo).
create or replace function private.record_movement(p_organization_id uuid,p_establishment_id uuid,p_batch_id uuid,p_kind text,p_quantity numeric,p_reason text,p_intent_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_batch public.batch_receipts%rowtype; v_existing public.stock_movements%rowtype; v_id uuid; v_total numeric; v_timezone text; v_reason text := nullif(btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'');
begin
 if v_user is null or not private.has_membership(p_organization_id,true) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_intent_id is null or p_kind is null or p_kind not in ('consumption','discard') or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity <= 0 or p_quantity > 1000000000 or p_quantity <> trunc(p_quantity,3) or (p_kind='discard' and v_reason is null) or length(v_reason)>500 then raise exception 'Dados inválidos.' using errcode='22023'; end if;
 select * into v_batch from public.batch_receipts where id=p_batch_id and organization_id=p_organization_id and establishment_id=p_establishment_id for update;
 if not found then raise exception 'Recebimento não encontrado.' using errcode='23503'; end if;
 if v_batch.unit='un' and p_quantity <> trunc(p_quantity) then raise exception 'Quantidade inválida.' using errcode='22023'; end if;
 select * into v_existing from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id;
 if found then
   if v_existing.created_by is distinct from v_user or v_existing.batch_id is distinct from p_batch_id or v_existing.kind is distinct from p_kind or v_existing.quantity is distinct from p_quantity or v_existing.reason is distinct from v_reason then raise exception 'Identificador já utilizado com outros dados.' using errcode='23505'; end if;
   return v_existing.id;
 end if;
 select coalesce(sum(case when kind='reversal' then -quantity else quantity end),0) into v_total from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and batch_id=p_batch_id;
 if p_quantity > v_batch.quantity - v_total then raise exception 'Quantidade excede saldo registrado.' using errcode='22023'; end if;
 select timezone into strict v_timezone from public.establishments where id=p_establishment_id and organization_id=p_organization_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,intent_id,kind,quantity,reason,timezone,created_by) values(p_organization_id,p_establishment_id,p_batch_id,p_intent_id,p_kind,p_quantity,v_reason,v_timezone,v_user) returning id into v_id;
 return v_id;
end;
$$;
drop function if exists private.apply_stock_exit(uuid,uuid,uuid,uuid,boolean,text,numeric,text,uuid);
drop function if exists private.stock_conservation_problems();
drop function if exists private.container_balance(uuid);

-- reverse_movement volta ao texto da migração 20261108125109.
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
 insert into public.stock_movements(organization_id,establishment_id,batch_id,intent_id,kind,quantity,reason,timezone,created_by,reverses_id) values(p_organization_id,p_establishment_id,v_batch_id,p_intent_id,'reversal',v_original.quantity,v_reason,v_timezone,v_user,p_movement_id) returning id into v_id;
 return v_id;
end;
$$;

-- Movimentos: anulação volta a apontar para o mesmo recebimento; coluna do recipiente sai.
alter table public.stock_movements drop constraint stock_movements_reverses_fk;
alter table public.stock_movements add constraint stock_movements_reverses_fk
  foreign key (organization_id,establishment_id,batch_id,reverses_id) references public.stock_movements(organization_id,establishment_id,batch_id,id);
alter table public.stock_movements drop constraint stock_movements_scope_container_id_key;
alter table public.stock_movements drop constraint stock_movements_container_fk;
alter table public.stock_movements drop column container_id;

-- Recipientes: volta o unique (batch_id) (sem derivados, há no máximo um recipiente por recebimento).
drop index if exists public.containers_parent_idx;
alter table public.containers drop constraint containers_parent_fk;
alter table public.containers add constraint containers_batch_id_key unique (batch_id);
drop index if exists public.containers_one_integral_idx;
alter table public.containers
  drop constraint containers_scope_batch_id_key,
  drop constraint containers_short_code_key,
  drop constraint containers_short_code_check,
  drop constraint containers_expiry_date_check,
  drop constraint containers_initial_quantity_check,
  drop constraint containers_kind_shape_check,
  drop constraint containers_kind_check,
  drop column kind,
  drop column parent_container_id,
  drop column initial_quantity,
  drop column expiry_date,
  drop column expiry_origin,
  drop column short_code,
  drop column timezone;

-- ensure_container volta ao texto da migração 20261107132900.
create or replace function private.ensure_container(p_organization_id uuid,p_establishment_id uuid,p_batch_id uuid)
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

drop function if exists private.format_container_short_code(bigint);
drop sequence if exists private.container_short_code_seq;

select private.assert_history_protected();
