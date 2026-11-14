-- Fase 7, fatia 7.5: porcionar preparação própria (horário mínimo = produção; porção com a mesma
-- validade do lote, decisão B de luis) e métricas do piloto de produções. Dados sintéticos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id) values
 ('f1000000-0000-4000-8000-000000000001'),('f1000000-0000-4000-8000-000000000002'),('f1000000-0000-4000-8000-000000000003');
insert into organizations(id,name) values
 ('f2000000-0000-4000-8000-00000000000a','A'),('f2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('f3000000-0000-4000-8000-0000000000a1','f2000000-0000-4000-8000-00000000000a','Cozinha','America/Sao_Paulo'),
 ('f3000000-0000-4000-8000-0000000000b1','f2000000-0000-4000-8000-00000000000b','UB','America/Sao_Paulo');
insert into memberships(organization_id,user_id,role,display_name) values
 ('f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-000000000001','owner','Dona Maria'),
 ('f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-000000000002','member','Ana Souza'),
 ('f2000000-0000-4000-8000-00000000000b','f1000000-0000-4000-8000-000000000003','owner','Outra');
insert into products(id,organization_id,establishment_id,name,unit,storage_condition,kind) values
 ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Caldo de legumes','l','refrigerated','preparation'),
 ('f4000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Arroz','kg','ambient','product');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('f5000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','F');

select (now() at time zone 'America/Sao_Paulo')::date as sp \gset

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

create function pg_temp.produce(p_qty numeric, p_produced timestamptz, p_late text, p_intent uuid) returns uuid language sql as $$
  select public.register_production('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
    'f4000000-0000-4000-8000-000000000001', p_qty, ((now() at time zone 'America/Sao_Paulo')::date + 3),
    p_produced, 'f1000000-0000-4000-8000-000000000002', null, p_late, p_intent)
$$;
create function pg_temp.integral(p_batch uuid) returns uuid language sql as $$
  select id from public.containers where batch_id = p_batch and kind = 'integral'
$$;
create function pg_temp.portion(p_container uuid, p_expiry date, p_at timestamptz, p_intent uuid) returns uuid language sql as $$
  select public.handle_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
    p_container, 'portioning', array[2,2]::numeric[], p_expiry, 'refrigerated', p_at,
    'f1000000-0000-4000-8000-000000000002', 'sealed', null, null, null, p_intent)
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- Produção feita 30 minutos antes do registro.
select pg_temp.produce(6, now() - interval '30 minutes', null, 'f7000000-0000-4000-8000-000000000001') as lote \gset
select pg_temp.integral(:'lote') as box \gset
select expiry_date as lot_expiry from public.containers where id = :'box' \gset

-- 1) Horário: a partir da produção, não do registro do lote (limite 1 da 7.1).
select throws_ok(format($$select pg_temp.portion(%L, %L, now() - interval '40 minutes', 'f7000000-0000-4000-8000-000000000010')$$, :'box', :'lot_expiry'),
  '22023', 'O horário da manipulação não pode ser anterior ao do recipiente de origem.',
  'porcionar antes do horário da produção continua recusado');
select lives_ok(format($$select pg_temp.portion(%L, %L, now() - interval '25 minutes', 'f7000000-0000-4000-8000-000000000011')$$, :'box', :'lot_expiry'),
  'porcionar entre a produção e o registro do lote é aceito');
select is((select count(*) from public.containers where batch_id = :'lote' and kind = 'derived'), 2::bigint,
  'as duas porções foram criadas');

-- 2) Validade da porção = validade do lote (decisão B; "igual ou menor" é configuração da 7.6).
select pg_temp.produce(6, now() - interval '10 minutes', null, 'f7000000-0000-4000-8000-000000000002') as lote2 \gset
select pg_temp.integral(:'lote2') as box2 \gset
select throws_ok(format($$select pg_temp.portion(%L, %L::date - 1, now(), 'f7000000-0000-4000-8000-000000000012')$$, :'box2', :'lot_expiry'),
  '22023', 'A porção de preparação própria leva a mesma validade do recipiente de origem.',
  'porção de preparação com validade menor é recusada');
select throws_ok(format($$select pg_temp.portion(%L, %L::date + 1, now(), 'f7000000-0000-4000-8000-000000000013')$$, :'box2', :'lot_expiry'),
  '22023', 'A validade após abertura não pode passar da validade do recipiente de origem.',
  'porção de preparação com validade maior continua recusada pela regra da 6.3');
select lives_ok(format($$select pg_temp.portion(%L, %L, now(), 'f7000000-0000-4000-8000-000000000014')$$, :'box2', :'lot_expiry'),
  'porção de preparação com a mesma validade do lote é aceita');
select is((select distinct expiry_date from public.containers where batch_id = :'lote2' and kind = 'derived'), :'lot_expiry'::date,
  'as porções guardam a validade do lote');
-- Porção de porção: a origem é a porção, com a mesma validade do lote.
select id as child from public.containers where batch_id = :'lote2' and kind = 'derived' and position = 1 \gset
select throws_ok(format($$select public.handle_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
    %L, 'portioning', array[1,1]::numeric[], %L::date - 1, 'refrigerated', now(),
    'f1000000-0000-4000-8000-000000000002', 'none', null, null, null, 'f7000000-0000-4000-8000-000000000015')$$, :'child', :'lot_expiry'),
  '22023', 'A porção de preparação própria leva a mesma validade do recipiente de origem.',
  'porção de porção de preparação também leva a mesma validade');
-- "Abrir" continua recusado para preparação (7.1).
select throws_ok(format($$select public.handle_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
    %L, 'opening', array[1]::numeric[], %L, 'refrigerated', now(),
    'f1000000-0000-4000-8000-000000000002', 'sealed', null, null, null, 'f7000000-0000-4000-8000-000000000016')$$, :'box2', :'lot_expiry'),
  '22023', 'Preparação própria não é aberta: use o porcionamento.', 'abrir preparação continua recusado');

-- 3) Recebimento continua aceitando validade menor que a origem (regra da 6.3 inalterada).
select public.receive_batch('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
  'f4000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001','L-1',10,
  (:'sp'::date + 10),'original',(:'sp'::date + 10),'ambient','not_required',null,null,
  'f7000000-0000-4000-8000-000000000003') as rec \gset
select id as rec_box from public.containers where batch_id = :'rec' and kind = 'integral' \gset
select lives_ok(format($$select public.handle_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
    %L, 'opening', array[2]::numeric[], %L::date + 2, 'ambient', now(),
    'f1000000-0000-4000-8000-000000000002', 'sealed', null, null, null, 'f7000000-0000-4000-8000-000000000017')$$, :'rec_box', :'sp'),
  'abrir recebimento com validade menor que a original continua aceito');

-- 4) Métricas do piloto de produções (só leitura, pela RLS).
select pg_temp.produce(3, now() - interval '3 hours', 'Registro esquecido', 'f7000000-0000-4000-8000-000000000004') as lote3 \gset
select public.void_production('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
  (select pg_temp.produce(1, now() - interval '5 minutes', null, 'f7000000-0000-4000-8000-000000000005')),
  'Validade digitada errada', 'f7000000-0000-4000-8000-000000000020');
create function pg_temp.metrics() returns jsonb language sql as $$
  select to_jsonb(m) from public.pilot_metrics('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
    now() - interval '1 day', now() + interval '1 day') m
$$;
grant execute on function pg_temp.metrics() to authenticated;
select is((pg_temp.metrics()->>'productions_total')::int, 4, 'quatro produções no período');
select is((pg_temp.metrics()->>'productions_late')::int, 1, 'uma produção tardia');
select is((pg_temp.metrics()->>'production_delay_max_seconds')::numeric, 10800::numeric, 'maior atraso de registro: 3 horas');
select is((pg_temp.metrics()->>'production_delay_p50_seconds')::numeric, 1200::numeric, 'mediana do atraso: entre 10 e 30 minutos');
select is((pg_temp.metrics()->>'production_voids_total')::int, 1, 'uma anulação de produção');
select is((pg_temp.metrics()->>'production_portionings_total')::int, 2, 'dois porcionamentos de preparação');
select is((pg_temp.metrics()->>'occurrences_late_production')::int, 1, 'uma ocorrência de produção tardia');
select is((pg_temp.metrics()->>'handlings_total')::int, 3, 'as métricas anteriores continuam (manipulações)');
select ok((select not prosecdef from pg_proc where oid = 'public.pilot_metrics(uuid,uuid,timestamptz,timestamptz)'::regprocedure),
  'pilot_metrics continua SECURITY INVOKER');
select ok(not has_function_privilege('anon', 'public.pilot_metrics(uuid,uuid,timestamptz,timestamptz)', 'execute'),
  'anon continua sem ler métricas');

-- Outra empresa não vê as produções de A.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((pg_temp.metrics()->>'productions_total')::int, 0, 'outra empresa não conta as produções de A');

select * from finish();
rollback;
