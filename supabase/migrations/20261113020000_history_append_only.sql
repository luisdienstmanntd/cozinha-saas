-- Fase 6, fatia 6.0a (P5 da REVISAO_05): histórico append-only também para o backend.
-- Recebimentos, recipientes e movimentos só recebem INSERT pelas funções autorizadas. Nenhum papel da
-- aplicação altera, apaga ou trunca essas tabelas: o gatilho recusa até o dono das tabelas, e
-- service_role (chave de serviço) fica só com leitura. Correções são feitas por novos eventos
-- (anulação), nunca editando o passado. Não protege contra o superusuário do banco.

-- Função única chamada pelos gatilhos. 55000 = object_not_in_prerequisite_state.
create function private.reject_history_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Histórico não pode ser alterado nem apagado.'
    using errcode = '55000', detail = tg_table_name || ': ' || tg_op;
end;
$$;
revoke all on function private.reject_history_change() from public, anon, authenticated, service_role;

-- Gatilho por comando (BEFORE ... FOR EACH STATEMENT): recusa o comando inteiro, mesmo sem linhas,
-- e cobre TRUNCATE, que não dispara gatilhos por linha. ENABLE ALWAYS: também dispara com
-- session_replication_role = replica.
create trigger batch_receipts_append_only before update or delete or truncate on public.batch_receipts
  for each statement execute function private.reject_history_change();
alter table public.batch_receipts enable always trigger batch_receipts_append_only;

create trigger containers_append_only before update or delete or truncate on public.containers
  for each statement execute function private.reject_history_change();
alter table public.containers enable always trigger containers_append_only;

create trigger stock_movements_append_only before update or delete or truncate on public.stock_movements
  for each statement execute function private.reject_history_change();
alter table public.stock_movements enable always trigger stock_movements_append_only;

-- service_role tinha DELETE (limpeza dos testes) e os privilégios padrão; agora só lê.
revoke insert, update, delete, truncate, references, trigger on public.batch_receipts, public.containers, public.stock_movements from service_role;
grant select on public.batch_receipts, public.containers, public.stock_movements to service_role;

-- Verificação reutilizável (B-1, D-033). Toda migração que suspender um gatilho de proteção para um
-- backfill chama esta função no fim da mesma transação; se algo faltar, a migração inteira é desfeita.
-- Lista fixa de tabelas: uma tabela nova de histórico precisa ser acrescentada aqui e na guarda.
create function private.assert_history_protected()
returns void language plpgsql set search_path = '' as $$
declare
  v_problems text;
begin
  select string_agg(problem, '; ' order by problem) into v_problems
  from (
    select t.name || ': gatilho de proteção ausente, desabilitado ou incompleto' as problem
    from unnest(array['batch_receipts', 'containers', 'stock_movements']) as t(name)
    where not exists (
      select 1
      from pg_catalog.pg_trigger g
      where g.tgrelid = ('public.' || t.name)::regclass
        and g.tgname = t.name || '_append_only'
        and g.tgfoid = 'private.reject_history_change()'::regprocedure
        and g.tgenabled = 'A'                -- ENABLE ALWAYS
        and (g.tgtype & 1) = 0               -- por comando
        and (g.tgtype & 2) = 2               -- BEFORE
        and (g.tgtype & 8) = 8               -- DELETE
        and (g.tgtype & 16) = 16             -- UPDATE
        and (g.tgtype & 32) = 32             -- TRUNCATE
    )
    union all
    select t.name || ': ' || r.role || ' tem ' || p.priv
    from unnest(array['batch_receipts', 'containers', 'stock_movements']) as t(name)
    cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
    where pg_catalog.has_table_privilege(r.role, ('public.' || t.name)::regclass, p.priv)
  ) as problems;
  if v_problems is not null then
    raise exception 'Proteção do histórico incompleta: %', v_problems using errcode = '55000';
  end if;
end;
$$;
revoke all on function private.assert_history_protected() from public, anon, authenticated, service_role;

select private.assert_history_protected();
