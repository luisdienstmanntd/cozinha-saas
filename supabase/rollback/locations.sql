-- Reverte 20261114010000_locations.sql. ATENÇÃO: apaga os locais e o histórico de mudança de local.
-- Faça cópia antes. location_moves é append-only: o gatilho é removido com a tabela (DROP TABLE não é
-- bloqueado por gatilho de comando) e find_operation volta à versão da 6.8.
drop trigger if exists handling_voids_check_moves on public.handling_voids;
drop function if exists private.check_void_no_user_moves();
drop trigger if exists containers_inherit_location on public.containers;
drop function if exists private.inherit_container_location();
drop function if exists public.list_container_locations(uuid, uuid);
drop function if exists public.move_container(uuid, uuid, uuid, uuid, uuid, uuid, boolean);
drop function if exists private.move_container(uuid, uuid, uuid, uuid, uuid, uuid, boolean);
drop function if exists public.set_storage_location_active(uuid, uuid, uuid, boolean);
drop function if exists private.set_storage_location_active(uuid, uuid, uuid, boolean);
drop function if exists public.create_storage_location(uuid, uuid, text, text, uuid);
drop function if exists private.create_storage_location(uuid, uuid, text, text, uuid);
drop table if exists public.location_moves;
drop table if exists public.storage_locations;
-- Reaplique a versão anterior de public.find_operation (20261114000000_find_operation.sql) e de
-- private.assert_history_protected (20261113090000_conservation_occurrences.sql).
