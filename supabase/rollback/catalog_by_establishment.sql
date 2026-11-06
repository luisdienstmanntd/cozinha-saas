-- Destructive rollback for the disposable local database only.
begin;
drop table public.products;
drop table public.suppliers;
alter table public.establishments drop constraint establishments_organization_id_id_key;
commit;
