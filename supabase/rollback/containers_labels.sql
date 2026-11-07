-- Only for the disposable local database, before batch rollback.
begin;
drop function public.ensure_container(uuid,uuid,uuid);
drop function private.ensure_container(uuid,uuid,uuid);
drop table public.containers;
alter table public.batch_receipts drop constraint batch_receipts_scope_id_key;
commit;
