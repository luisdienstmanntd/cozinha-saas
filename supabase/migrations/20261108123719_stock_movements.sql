create table public.stock_movements (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null, establishment_id uuid not null, batch_id uuid not null,
 intent_id uuid not null, kind text not null check (kind in ('consumption','discard')),
 quantity numeric not null check (quantity > 0 and quantity <= 1000000000 and quantity = trunc(quantity,3)),
 reason text check (reason is null or (length(reason) between 1 and 500 and reason = btrim(reason))),
 timezone text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique (organization_id, establishment_id, intent_id),
 foreign key (organization_id,establishment_id,batch_id) references public.batch_receipts(organization_id,establishment_id,id),
 check (kind <> 'discard' or reason is not null)
);
create index stock_movements_batch_idx on public.stock_movements (organization_id, establishment_id, batch_id, created_at, id);
alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from public, anon, authenticated;
grant select on public.stock_movements to authenticated;
grant select, delete on public.stock_movements to service_role;
create policy stock_movements_read on public.stock_movements for select to authenticated using (private.has_membership(organization_id));

create function private.record_movement(p_organization_id uuid,p_establishment_id uuid,p_batch_id uuid,p_kind text,p_quantity numeric,p_reason text,p_intent_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_batch public.batch_receipts%rowtype; v_existing public.stock_movements%rowtype; v_id uuid; v_total numeric; v_timezone text; v_reason text := nullif(btrim(p_reason),'');
begin
 if v_user is null or not private.has_membership(p_organization_id,true) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_intent_id is null or p_kind is null or p_kind not in ('consumption','discard') or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity <= 0 or p_quantity > 1000000000 or p_quantity <> trunc(p_quantity,3) or (p_kind='discard' and v_reason is null) or length(v_reason)>500 then
   raise exception 'Dados inválidos.' using errcode='22023';
 end if;
 select * into v_batch from public.batch_receipts where id=p_batch_id and organization_id=p_organization_id and establishment_id=p_establishment_id for update;
 if not found then raise exception 'Recebimento não encontrado.' using errcode='23503'; end if;
 if v_batch.unit='un' and p_quantity <> trunc(p_quantity) then raise exception 'Quantidade inválida.' using errcode='22023'; end if;
 select * into v_existing from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id;
 if found then
   if v_existing.created_by is distinct from v_user or v_existing.batch_id is distinct from p_batch_id or v_existing.kind is distinct from p_kind or v_existing.quantity is distinct from p_quantity or v_existing.reason is distinct from v_reason then raise exception 'Identificador já utilizado com outros dados.' using errcode='23505'; end if;
   return v_existing.id;
 end if;
 select coalesce(sum(quantity),0) into v_total from public.stock_movements where batch_id=p_batch_id;
 if p_quantity > v_batch.quantity - v_total then raise exception 'Quantidade excede saldo registrado.' using errcode='22023'; end if;
 select timezone into strict v_timezone from public.establishments where id=p_establishment_id and organization_id=p_organization_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,intent_id,kind,quantity,reason,timezone,created_by)
 values(p_organization_id,p_establishment_id,p_batch_id,p_intent_id,p_kind,p_quantity,v_reason,v_timezone,v_user) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function private.record_movement(uuid,uuid,uuid,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function private.record_movement(uuid,uuid,uuid,text,numeric,text,uuid) to authenticated;
create function public.record_movement(p_organization_id uuid,p_establishment_id uuid,p_batch_id uuid,p_kind text,p_quantity numeric,p_reason text,p_intent_id uuid)
returns uuid language sql security invoker set search_path='' as $$
 select private.record_movement(p_organization_id,p_establishment_id,p_batch_id,p_kind,p_quantity,p_reason,p_intent_id);
$$;
revoke all on function public.record_movement(uuid,uuid,uuid,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.record_movement(uuid,uuid,uuid,text,numeric,text,uuid) to authenticated;
