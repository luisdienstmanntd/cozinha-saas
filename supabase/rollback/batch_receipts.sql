-- Only for the disposable local database, before catalog rollback.
begin;
drop function public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid);
drop function private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid);
drop table public.batch_receipts;
alter table public.products drop constraint products_scope_id_key;
alter table public.suppliers drop constraint suppliers_scope_id_key;
commit;
