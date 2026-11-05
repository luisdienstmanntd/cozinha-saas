-- Destructive rollback for the disposable Fase 2 database only. Preserves auth users.
begin;
drop table public.establishments;
drop table public.memberships;
drop table public.organizations;
drop function private.has_membership(uuid,boolean);
drop function private.validate_establishment_timezone();
commit;
