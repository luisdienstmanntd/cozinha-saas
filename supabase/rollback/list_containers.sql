-- Reverte 20261113060000_list_containers.sql.
-- public.container_balances é derivada do histórico (saldo recalculável por private.container_balance):
-- apagá-la não perde nenhum registro. Recebimentos, recipientes e movimentos não são tocados
-- (DROP TRIGGER não é UPDATE; nenhum gatilho de proteção é suspenso). A tela volta a precisar da
-- versão anterior do front-end.
drop function if exists public.container_expiry_summary(uuid, uuid, date);
drop function if exists public.list_containers(uuid, uuid, text, uuid, text, date, uuid, integer);
drop function if exists private.container_balance_problems();
drop trigger if exists stock_movements_apply_balance on public.stock_movements;
drop trigger if exists containers_init_balance on public.containers;
drop function if exists private.apply_movement_to_balance();
drop function if exists private.init_container_balance();
drop table if exists public.container_balances;
drop function if exists private.guard_container_balances();
select private.assert_history_protected();
