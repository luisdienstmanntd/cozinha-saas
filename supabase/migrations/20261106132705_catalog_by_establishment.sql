alter table public.establishments add constraint establishments_organization_id_id_key unique (organization_id, id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  -- Match the ECMAScript trim character set used by the form and the API adapter.
  name text not null check (length(name) between 1 and 120 and
    name = btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'un')),
  created_at timestamptz not null default now(),
  foreign key (organization_id, establishment_id) references public.establishments (organization_id, id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  name text not null check (length(name) between 1 and 120 and
    name = btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  created_at timestamptz not null default now(),
  foreign key (organization_id, establishment_id) references public.establishments (organization_id, id)
);

create unique index products_scoped_name_idx on public.products (organization_id, establishment_id, lower(name));
create unique index suppliers_scoped_name_idx on public.suppliers (organization_id, establishment_id, lower(name));

alter table public.products enable row level security;
alter table public.suppliers enable row level security;
revoke all on public.products, public.suppliers from public, anon, authenticated;
grant select on public.products, public.suppliers to authenticated;
grant insert (organization_id, establishment_id, name, unit) on public.products to authenticated;
grant insert (organization_id, establishment_id, name) on public.suppliers to authenticated;
grant select, insert, delete on public.products, public.suppliers to service_role;

create policy products_read on public.products for select to authenticated
using (private.has_membership(organization_id));
create policy products_insert on public.products for insert to authenticated
with check (private.has_membership(organization_id, true));
create policy suppliers_read on public.suppliers for select to authenticated
using (private.has_membership(organization_id));
create policy suppliers_insert on public.suppliers for insert to authenticated
with check (private.has_membership(organization_id, true));
