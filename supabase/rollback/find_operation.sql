-- Reverte 20261114000000_find_operation.sql: a 6.8 só acrescenta uma função de leitura, sem tabela,
-- coluna ou dado. Remover não afeta nenhum registro.
drop function if exists public.find_operation(uuid, uuid, uuid);
