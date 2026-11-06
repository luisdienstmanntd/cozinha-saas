alter table public.products add constraint products_scope_id_key unique (organization_id, establishment_id, id);
alter table public.suppliers add constraint suppliers_scope_id_key unique (organization_id, establishment_id, id);

create table public.batch_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  product_id uuid not null,
  supplier_id uuid not null,
  intent_id uuid not null,
  source_code text not null check (length(source_code) between 1 and 120 and source_code = btrim(source_code, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  quantity numeric not null check (quantity > 0 and quantity <= 1000000000 and quantity = trunc(quantity, 3)),
  unit text not null check (unit in ('kg','g','l','ml','un')),
  expiry_date date not null,
  expiry_origin text not null check (expiry_origin in ('original','responsible')),
  original_expiry_date date,
  timezone text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, establishment_id, intent_id),
  foreign key (organization_id, establishment_id, product_id) references public.products (organization_id, establishment_id, id),
  foreign key (organization_id, establishment_id, supplier_id) references public.suppliers (organization_id, establishment_id, id),
  check (unit <> 'un' or quantity = trunc(quantity)),
  check (expiry_date between date '0001-01-01' and date '9999-12-31'),
  check (original_expiry_date is null or original_expiry_date between date '0001-01-01' and date '9999-12-31'),
  check ((expiry_origin = 'original' and original_expiry_date is not null and original_expiry_date = expiry_date) or
    (expiry_origin = 'responsible' and (original_expiry_date is null or expiry_date <= original_expiry_date)))
);
create index batch_receipts_scope_created_idx on public.batch_receipts (organization_id, establishment_id, created_at desc);
alter table public.batch_receipts enable row level security;
revoke all on public.batch_receipts from public, anon, authenticated;
grant select on public.batch_receipts to authenticated;
grant select, delete on public.batch_receipts to service_role;
create policy batch_receipts_read on public.batch_receipts for select to authenticated
using (private.has_membership(organization_id));

create function private.receive_batch(
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
  select p.unit, e.timezone into v_unit, v_timezone from public.products p
    join public.establishments e on e.organization_id=p.organization_id and e.id=p.establishment_id
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
revoke all on function private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid) from public, anon, authenticated;
grant execute on function private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid) to authenticated;

create function public.receive_batch(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_intent_id uuid
) returns uuid language sql security invoker set search_path = '' as $$
  select private.receive_batch(p_organization_id,p_establishment_id,p_product_id,p_supplier_id,
    p_source_code,p_quantity,p_expiry_date,p_expiry_origin,p_original_expiry_date,p_intent_id);
$$;
revoke all on function public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid) from public, anon, authenticated;
grant execute on function public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid) to authenticated;
