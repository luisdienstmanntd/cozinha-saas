-- Reverte 20261113020000_history_append_only.sql (sem perda de dados).
-- Devolve a service_role exatamente os privilégios anteriores (SELECT e DELETE concedidos pelas
-- migrações, TRUNCATE/REFERENCES/TRIGGER vindos dos privilégios padrão do Supabase).
-- Atenção: depois do rollback o histórico volta a poder ser apagado pela chave de serviço.
drop trigger if exists batch_receipts_append_only on public.batch_receipts;
drop trigger if exists containers_append_only on public.containers;
drop trigger if exists stock_movements_append_only on public.stock_movements;
drop function if exists private.assert_history_protected();
drop function if exists private.reject_history_change();
grant select, delete, truncate, references, trigger on public.batch_receipts, public.containers, public.stock_movements to service_role;
