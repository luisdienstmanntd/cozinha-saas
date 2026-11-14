-- Fase 6, fatia 6.10: pilot_metrics só lê, pela RLS, e conta o que o banco consegue medir.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_function('public', 'pilot_metrics', array['uuid','uuid','timestamptz','timestamptz'], 'pilot_metrics existe');
select ok((select not prosecdef from pg_proc where oid = 'public.pilot_metrics(uuid,uuid,timestamptz,timestamptz)'::regprocedure),
  'pilot_metrics é SECURITY INVOKER (a RLS filtra)');
select ok(not has_function_privilege('anon', 'public.pilot_metrics(uuid,uuid,timestamptz,timestamptz)', 'execute'), 'anon não lê métricas');

insert into auth.users(id) values
 ('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002'),('d1000000-0000-4000-8000-000000000003');
insert into organizations(id,name) values
 ('d2000000-0000-4000-8000-00000000000a','A'),('d2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('d3000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-00000000000a','UA','America/Sao_Paulo'),
 ('d3000000-0000-4000-8000-0000000000b1','d2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,display_name) values
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000001','owner','Luis'),
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000002','member','Bia'),
 ('d2000000-0000-4000-8000-00000000000b','d1000000-0000-4000-8000-000000000003','owner','Outro');
insert into products(id,organization_id,establishment_id,name,unit,storage_condition) values
 ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','Frango','kg','refrigerated');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','FA');

-- Recebimento de ontem (anterior à 6.5a, colunas de conservação nulas): permite manipulação "de 3 horas atrás".
insert into batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by,created_at)
values ('d6000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
 'd4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000001',
 'L-1',20,'kg',current_date+10,'original',current_date+10,'America/Sao_Paulo','d1000000-0000-4000-8000-000000000001',now()-interval '1 day');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

create function pg_temp.metrics(p_org uuid default 'd2000000-0000-4000-8000-00000000000a',
  p_est uuid default 'd3000000-0000-4000-8000-0000000000a1',
  p_from timestamptz default now() - interval '1 day', p_to timestamptz default now() + interval '1 day')
returns jsonb language sql as $$ select to_jsonb(m) from public.pilot_metrics(p_org, p_est, p_from, p_to) m $$;
grant execute on function pg_temp.metrics(uuid,uuid,timestamptz,timestamptz) to authenticated;

select is((pg_temp.metrics()->>'handlings_total')::numeric, 0::numeric, 'sem movimento, tudo zero');
select is((pg_temp.metrics()->>'handling_delay_p50_seconds')::numeric, null, 'sem manipulação, sem mediana');

-- Um recebimento medido (manipulação no horário e outra com a mesma validade) e um sem medição (ocorrência).
select 'd6000000-0000-4000-8000-000000000001'::uuid as b1 \gset
select public.receive_batch('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  'd4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','L-2',5,current_date+10,'original',current_date+10,
  'refrigerated','not_measured',null,'Sem termômetro','d7000000-0000-4000-8000-000000000002') as b2 \gset
select public.ensure_container('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',:'b1') as c1 \gset
-- Manipulação no horário, com validade menor que a da origem.
select public.handle_container('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',:'c1'::uuid,
  'opening', array[4]::numeric[], current_date+5, 'refrigerated', now(), 'd1000000-0000-4000-8000-000000000001', 'sealed', null, null, null,
  'd7000000-0000-4000-8000-000000000011');
-- Manipulação 3 horas depois de feita: tardia, com justificativa, validade igual à da origem.
select public.handle_container('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',:'c1'::uuid,
  'opening', array[4]::numeric[], current_date+10, 'refrigerated', now() - interval '3 hours', 'd1000000-0000-4000-8000-000000000001', 'sealed', null, null, 'Registro esquecido',
  'd7000000-0000-4000-8000-000000000012') as lateh \gset

select is((pg_temp.metrics()->>'handlings_total')::numeric, 2::numeric, 'duas manipulações no período');
select is((pg_temp.metrics()->>'handlings_same_expiry')::numeric, 1::numeric, 'uma com validade igual à da origem');
select is((pg_temp.metrics()->>'handlings_shorter_expiry')::numeric, 1::numeric, 'uma com validade menor que a da origem');
select is((pg_temp.metrics()->>'handlings_late')::numeric, 1::numeric, 'uma tardia');
select is((pg_temp.metrics()->>'handling_delay_max_seconds')::numeric, 10800::numeric, 'atraso máximo de 3 horas');
select is((pg_temp.metrics()->>'handling_delay_p50_seconds')::numeric, 5400::numeric, 'mediana do atraso entre as duas');
select is((pg_temp.metrics()->>'occurrences_total')::numeric, 2::numeric, 'ocorrência de temperatura e a tardia');
select is((pg_temp.metrics()->>'occurrences_late_handling')::numeric, 1::numeric, 'uma ocorrência tardia');
select is((pg_temp.metrics()->>'occurrences_undecided')::numeric, 2::numeric, 'duas ocorrências sem decisão');

-- Decisão de uma ocorrência: sai das sem decisão e entra no tempo até a decisão.
select id as occ from public.occurrences where batch_id = :'b2' and kind = 'temperature_not_measured' \gset
select public.decide_occurrence('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',:'occ'::uuid,
  'released','Medido com termômetro reserva','d7000000-0000-4000-8000-000000000021');
select is((pg_temp.metrics()->>'decisions_total')::numeric, 1::numeric, 'uma decisão');
select is((pg_temp.metrics()->>'occurrences_undecided')::numeric, 1::numeric, 'uma ocorrência sem decisão');
select isnt((pg_temp.metrics()->>'decision_wait_p50_seconds')::numeric, null, 'tempo até a decisão é medido');

-- Anulação e período.
select public.void_handling('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',:'lateh'::uuid,
  'Lançado por engano','d7000000-0000-4000-8000-000000000031');
select is((pg_temp.metrics()->>'handling_voids_total')::numeric, 1::numeric, 'uma anulação');
select is((pg_temp.metrics(p_from => now() + interval '1 hour', p_to => now() + interval '2 hours')->>'handlings_total')::numeric, 0::numeric,
  'período sem registros não conta nada');

-- Período e escopo inválidos.
select throws_ok($$select * from public.pilot_metrics('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',now(),now())$$,
  '22023', null, 'fim igual ao início é recusado');
select throws_ok($$select * from public.pilot_metrics('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',now()-interval '400 days',now())$$,
  '22023', null, 'período acima de 366 dias é recusado');
select throws_ok($$select * from public.pilot_metrics(null,'d3000000-0000-4000-8000-0000000000a1',now()-interval '1 day',now())$$,
  '22023', null, 'escopo nulo é recusado');

-- RLS: membro da mesma empresa conta o mesmo; outra empresa não conta nada, nem com o escopo de A.
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((pg_temp.metrics()->>'handlings_total')::numeric, 2::numeric, 'membro da mesma empresa vê os mesmos números');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((pg_temp.metrics()->>'handlings_total')::numeric, 0::numeric, 'outra empresa não conta manipulações de A');
select is((pg_temp.metrics()->>'occurrences_total')::numeric, 0::numeric, 'outra empresa não conta ocorrências de A');
reset role;
set local role anon;
select throws_ok($$select * from public.pilot_metrics('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',now()-interval '1 day',now())$$,
  '42501', null, 'anônimo não lê métricas');
reset role;
select * from finish();
rollback;
