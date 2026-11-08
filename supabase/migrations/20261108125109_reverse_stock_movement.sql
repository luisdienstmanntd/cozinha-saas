alter table public.stock_movements add constraint stock_movements_scope_batch_id_key unique (organization_id, establishment_id, batch_id, id);
alter table public.stock_movements add column reverses_id uuid;
alter table public.stock_movements add constraint stock_movements_reverses_fk foreign key (organization_id,establishment_id,batch_id,reverses_id) references public.stock_movements(organization_id,establishment_id,batch_id,id);
alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check check (kind in ('consumption','discard','reversal'));
alter table public.stock_movements add constraint stock_movements_reversal_check check ((kind='reversal' and reverses_id is not null and reason is not null) or (kind<>'reversal' and reverses_id is null));
create unique index stock_movements_one_reversal_idx on public.stock_movements(reverses_id) where reverses_id is not null;

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
 select coalesce(sum(case when kind='reversal' then -quantity else quantity end),0) into v_total from public.stock_movements where batch_id=p_batch_id;
 if p_quantity > v_batch.quantity - v_total then raise exception 'Quantidade excede saldo registrado.' using errcode='22023'; end if;
 select timezone into strict v_timezone from public.establishments where id=p_establishment_id and organization_id=p_organization_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,intent_id,kind,quantity,reason,timezone,created_by) values(p_organization_id,p_establishment_id,p_batch_id,p_intent_id,p_kind,p_quantity,v_reason,v_timezone,v_user) returning id into v_id;
 return v_id;
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
 insert into public.stock_movements(organization_id,establishment_id,batch_id,intent_id,kind,quantity,reason,timezone,created_by,reverses_id) values(p_organization_id,p_establishment_id,v_batch_id,p_intent_id,'reversal',v_original.quantity,v_reason,v_timezone,v_user,p_movement_id) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function private.reverse_movement(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.reverse_movement(uuid,uuid,uuid,text,uuid) to authenticated;
create function public.reverse_movement(p_organization_id uuid,p_establishment_id uuid,p_movement_id uuid,p_reason text,p_intent_id uuid) returns uuid language sql security invoker set search_path='' as $$
 select private.reverse_movement(p_organization_id,p_establishment_id,p_movement_id,p_reason,p_intent_id);
$$;
revoke all on function public.reverse_movement(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reverse_movement(uuid,uuid,uuid,text,uuid) to authenticated;
