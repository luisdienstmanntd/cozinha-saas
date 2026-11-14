-- Reverte 20261114020000_pilot_metrics.sql: só uma função de leitura; remover não afeta nenhum registro.
drop function if exists public.pilot_metrics(uuid, uuid, timestamptz, timestamptz);
