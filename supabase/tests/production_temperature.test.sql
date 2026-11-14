-- Fase 7, fatia 7.9: temperatura opcional da produção (fim do resfriamento, reaquecimento).
-- É só um registro do que a pessoa mediu: o sistema não classifica como conforme, não cria ocorrência,
-- não bloqueia e não mexe no estoque (D-003, como a D-027 no recebimento). Quem registra: o proprietário
-- e, quando a unidade permite (7.6), o colaborador só da própria produção. Dados sintéticos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ----------------------------------------------------------------------------------------
select has_table('public', 'production_temperatures', 'tabela de temperaturas da produção');
select ok((select relrowsecurity from pg_class where oid = 'public.production_temperatures'::regclass), 'com RLS');
select ok(not has_any_column_privilege('authenticated', 'public.production_temperatures', 'INSERT,UPDATE'),
  'só a função autorizada grava');
select ok(not has_table_privilege('authenticated', 'public.production_temperatures', 'DELETE'), 'ninguém apaga');
select ok(not has_table_privilege('service_role', 'public.production_temperatures', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'service_role só lê');
select ok(not has_table_privilege('anon', 'public.production_temperatures', 'SELECT'), 'anon não lê');
select ok((select not prosecdef from pg_proc
  where oid = 'public.record_production_temperature(uuid,uuid,uuid,text,numeric,timestamptz)'::regprocedure),
  'record_production_temperature público é SECURITY INVOKER');
select ok(not has_function_privilege('anon', 'public.record_production_temperature(uuid,uuid,uuid,text,numeric,timestamptz)', 'execute'),
  'anon não registra');
select is((select count(*)::int from pg_trigger g where g.tgrelid = 'public.production_temperatures'::regclass
    and g.tgname = 'production_temperatures_append_only' and g.tgfoid = 'private.reject_history_change()'::regprocedure), 1,
  'histórico append-only');
select lives_ok($$select private.assert_history_protected()$$, 'proteção do histórico completa com a tabela nova');

insert into auth.users(id) values
 ('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002'),
 ('d1000000-0000-4000-8000-000000000003'),('d1000000-0000-4000-8000-000000000004');
insert into organizations(id,name) values
 ('d2000000-0000-4000-8000-00000000000a','A'),('d2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('d3000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-00000000000a','Cozinha','America/Sao_Paulo'),
 ('d3000000-0000-4000-8000-0000000000b1','d2000000-0000-4000-8000-00000000000b','UB','America/Sao_Paulo');
insert into memberships(organization_id,user_id,role,display_name,revoked_at) values
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000001','owner','Dona Maria',null),
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000002','member','Ana Souza',null),
 ('d2000000-0000-4000-8000-00000000000b','d1000000-0000-4000-8000-000000000003','owner','Outra',null),
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000004','member','Revogada',now());
insert into products(id,organization_id,establishment_id,name,unit,storage_condition,kind) values
 ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','Caldo de legumes','l','refrigerated','preparation'),
 ('d4000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','Arroz','kg','ambient','product');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','F');

select (now() at time zone 'America/Sao_Paulo')::date as sp \gset

set local role authenticated;
create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
-- Produção feita há 30 minutos por p_by (a pessoa que produziu).
create function pg_temp.produce(p_intent uuid, p_by text) returns uuid language sql as $$
  select public.register_production('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
    'd4000000-0000-4000-8000-000000000001', 6, ((now() at time zone 'America/Sao_Paulo')::date + 3),
    now() - interval '30 minutes', p_by::uuid, null, null, p_intent)
$$;
create function pg_temp.temp(p_batch uuid, p_moment text, p_value numeric, p_at timestamptz default now() - interval '10 minutes')
returns uuid language sql as $$
  select public.record_production_temperature('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
    p_batch, p_moment, p_value, p_at)
$$;
grant execute on all functions in schema pg_temp to authenticated;

select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select pg_temp.produce('d7000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001') as lote_dono \gset
select pg_temp.produce('d7000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002') as lote_ana \gset
select (select count(*) from public.batch_receipts) as n_batches, (select count(*) from public.containers) as n_containers,
  (select count(*) from public.stock_movements) as n_movements, (select count(*) from public.occurrences) as n_occ,
  (select coalesce(sum(balance),0) from public.container_balances) as saldo \gset

-- 1) Quem registra -------------------------------------------------------------------------------------------
select ok(pg_temp.temp(:'lote_dono', 'cooling_end', 4.0) is not null, 'proprietário registra o fim do resfriamento');
select is((select temperature_c from public.production_temperatures where batch_id = :'lote_dono' and moment = 'cooling_end'),
  4.0::numeric, 'a temperatura é guardada como informada');
select is((select recorded_by_name from public.production_temperatures where batch_id = :'lote_dono'), 'Dona Maria',
  'o nome de quem registrou é copiado');
select is((select recorded_by from public.production_temperatures where batch_id = :'lote_dono'),
  'd1000000-0000-4000-8000-000000000001'::uuid, 'e o autor');
select ok(pg_temp.temp(:'lote_dono', 'reheating', 74.5) is not null, 'reaquecimento também');
select ok(pg_temp.temp(:'lote_dono', 'cooling_end', -2.5) is not null, 'valores negativos são aceitos');
select ok(pg_temp.temp(:'lote_dono', 'cooling_end', 4.0) is not null, 'a mesma medição pode ser registrada de novo (cada uma é uma linha)');
select is((select count(*)::int from public.production_temperatures where batch_id = :'lote_dono'), 4, 'quatro linhas');

select pg_temp.as_user('d1000000-0000-4000-8000-000000000002');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0)$$, :'lote_ana'), '42501', 'Acesso negado.',
  'padrão: colaborador não registra (só o proprietário escreve, D-019)');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0)$$, :'lote_dono'), '42501', 'Acesso negado.', 'outra empresa não registra');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000004');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0)$$, :'lote_dono'), '42501', 'Acesso negado.', 'vínculo revogado não registra');

-- Modo "colaboradores registram a própria produção" (7.6): só a temperatura da própria produção.
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select public.set_establishment_settings('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  'member', 120, 60, 'equal') is not null as ok \gset
select pg_temp.as_user('d1000000-0000-4000-8000-000000000002');
select ok(pg_temp.temp(:'lote_ana', 'cooling_end', 3.5) is not null, 'modo colaboradores: registra a temperatura da própria produção');
select is((select recorded_by_name from public.production_temperatures where batch_id = :'lote_ana'), 'Ana Souza', 'com o nome dela');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0)$$, :'lote_dono'), '42501',
  'Quem não é proprietário registra só a temperatura da própria produção.', 'não registra a de outra pessoa');

-- 2) Valores ---------------------------------------------------------------------------------------------------
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select throws_ok(format($$select pg_temp.temp(%L, 'outro', 4.0)$$, :'lote_dono'), '22023', 'Dados inválidos.', 'momento desconhecido');
select throws_ok(format($$select pg_temp.temp(%L, null, 4.0)$$, :'lote_dono'), '22023', 'Dados inválidos.', 'momento nulo');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', null)$$, :'lote_dono'), '22023', 'Dados inválidos.', 'temperatura nula');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 'NaN'::numeric)$$, :'lote_dono'), '22023', 'Dados inválidos.', 'NaN');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 80.1)$$, :'lote_dono'), '22023', 'Dados inválidos.', 'acima de 80 °C');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', -50.1)$$, :'lote_dono'), '22023', 'Dados inválidos.', 'abaixo de -50 °C');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.55)$$, :'lote_dono'), '22023', 'Dados inválidos.', 'mais de uma casa decimal');
select ok(pg_temp.temp(:'lote_dono', 'reheating', 80.0) is not null, '80 °C é aceito');
select ok(pg_temp.temp(:'lote_dono', 'cooling_end', -50.0) is not null, '-50 °C é aceito');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0, now() + interval '5 minutes')$$, :'lote_dono'), '22023',
  'O horário da medição não pode estar no futuro.', 'horário no futuro');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0, now() - interval '2 hours')$$, :'lote_dono'), '22023',
  'O horário da medição não pode ser anterior à produção.', 'horário antes da produção');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0, null)$$, :'lote_dono'), '22023', 'Dados inválidos.', 'horário nulo');

-- 3) O lote certo ----------------------------------------------------------------------------------------------
select throws_ok($$select pg_temp.temp(gen_random_uuid(), 'cooling_end', 4.0)$$, '23503', 'Lote de produção não encontrado.', 'lote inexistente');
select public.receive_batch('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  'd4000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000001','L-1',10,
  (:'sp'::date + 10),'original',(:'sp'::date + 10),'ambient','not_required',null,null,
  'd7000000-0000-4000-8000-000000000003') as rec \gset
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0)$$, :'rec'), '23503', 'Lote de produção não encontrado.',
  'recebimento não é produção: a temperatura dele é a do recebimento');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0)$$, :'lote_dono'), '42501', 'Acesso negado.', 'outra empresa não vê o lote de A');

-- 4) Produção anulada ----------------------------------------------------------------------------------------
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select pg_temp.produce('d7000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001') as lote2 \gset
select public.void_production('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  :'lote2', 'Validade digitada errada', 'd7000000-0000-4000-8000-000000000006') is not null as ok \gset
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0)$$, :'lote2'), '22023',
  'Produção anulada: não há temperatura a registrar.', 'produção anulada não registra temperatura');

-- 5) Quem registra precisa de nome de exibição ----------------------------------------------------------
reset role;
update public.memberships set display_name = null where user_id = 'd1000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.as_user('d1000000-0000-4000-8000-000000000002');
select throws_ok(format($$select pg_temp.temp(%L, 'cooling_end', 4.0)$$, :'lote_ana'), '22023',
  'Defina o nome de exibição de quem registra a temperatura antes de registrar.', 'sem nome de exibição, não registra');

-- 6) Sem classificação e sem efeito no estoque (D-003, D-027) ----------------------------------------------
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select is((select count(*) from public.occurrences), :n_occ::bigint, 'temperatura (mesmo 80 °C ou -50 °C) não cria ocorrência');
select is((select count(*) from public.stock_movements) - :n_movements, 1::bigint,
  'movimentos novos: só a anulação da segunda produção, nenhum pelo registro');
select is((select count(*) from public.batch_receipts) - :n_batches, 2::bigint,
  'lotes novos: só o recebimento e a segunda produção criados no teste, nenhum pelo registro');
select is((select coalesce(sum(balance),0) from public.container_balances where batch_id = :'lote_dono'), 6::numeric,
  'o saldo da produção não mudou');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'production_temperatures'
    and column_name in ('status', 'conforme', 'compliant', 'classification', 'result')), 0,
  'a tabela não tem coluna de classificação');

-- 7) Leitura e isolamento -----------------------------------------------------------------------------------
select pg_temp.as_user('d1000000-0000-4000-8000-000000000002');
select cmp_ok((select count(*) from public.production_temperatures), '>=', 7::bigint, 'colaborador lê as temperaturas da empresa');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select is_empty($$select 1 from public.production_temperatures$$, 'outra empresa não lê');

reset role;
select throws_ok($$update public.production_temperatures set temperature_c = 1$$, '55000', null, 'registro não é alterado');
select throws_ok($$delete from public.production_temperatures$$, '55000', null, 'registro não é apagado');
select throws_ok($$truncate public.production_temperatures$$, '55000', null, 'registro não é truncado');

select * from finish();
rollback;
