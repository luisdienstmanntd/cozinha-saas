-- Fase 6, fatia 6.11: consumo de recipiente vencido recusado no banco; descarte permitido; métrica de
-- vencidos com saldo. Datas sempre relativas à data de hoje NO FUSO DE CADA UNIDADE (nunca current_date,
-- que é a data em UTC: entre 00:00 e 03:00 UTC ela já é amanhã em São Paulo). Dados sintéticos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id) values
 ('e1000000-0000-4000-8000-000000000001'),('e1000000-0000-4000-8000-000000000002'),('e1000000-0000-4000-8000-000000000003');
insert into organizations(id,name) values
 ('e2000000-0000-4000-8000-00000000000a','A'),('e2000000-0000-4000-8000-00000000000b','B');
-- Kiritimati (UTC+14) e Pago Pago (UTC-11) estão 25 horas separados: a data local de Kiritimati é
-- sempre de 1 a 2 dias depois da de Pago Pago, a qualquer hora em UTC.
insert into establishments(id,organization_id,name,timezone) values
 ('e3000000-0000-4000-8000-0000000000a1','e2000000-0000-4000-8000-00000000000a','SP','America/Sao_Paulo'),
 ('e3000000-0000-4000-8000-0000000000a2','e2000000-0000-4000-8000-00000000000a','KI','Pacific/Kiritimati'),
 ('e3000000-0000-4000-8000-0000000000a3','e2000000-0000-4000-8000-00000000000a','PP','Pacific/Pago_Pago'),
 ('e3000000-0000-4000-8000-0000000000b1','e2000000-0000-4000-8000-00000000000b','UB','America/Sao_Paulo');
insert into memberships(organization_id,user_id,role,display_name) values
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000001','owner','Dona'),
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000002','member','Aux'),
 ('e2000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-000000000003','owner','Outra');
insert into products(id,organization_id,establishment_id,name,unit,storage_condition) values
 ('e4000000-0000-4000-8000-0000000000a1','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','Arroz','kg','ambient'),
 ('e4000000-0000-4000-8000-0000000000a2','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','Leite','l','refrigerated'),
 ('e4000000-0000-4000-8000-0000000000a3','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a2','Feijão','kg','ambient'),
 ('e4000000-0000-4000-8000-0000000000a4','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a3','Feijão','kg','ambient'),
 ('e4000000-0000-4000-8000-0000000000b1','e2000000-0000-4000-8000-00000000000b','e3000000-0000-4000-8000-0000000000b1','Arroz','kg','ambient');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('e5000000-0000-4000-8000-0000000000a1','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','F'),
 ('e5000000-0000-4000-8000-0000000000a2','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a2','F'),
 ('e5000000-0000-4000-8000-0000000000a3','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a3','F'),
 ('e5000000-0000-4000-8000-0000000000b1','e2000000-0000-4000-8000-00000000000b','e3000000-0000-4000-8000-0000000000b1','F');

select (now() at time zone 'America/Sao_Paulo')::date as sp \gset
select (now() at time zone 'Pacific/Kiritimati')::date as ki \gset

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

create function pg_temp.receive(p_est uuid, p_product uuid, p_supplier uuid, p_code text, p_qty numeric, p_expiry date,
  p_storage text, p_status text, p_reason text, p_intent uuid, p_org uuid default 'e2000000-0000-4000-8000-00000000000a')
returns uuid language sql as $$
  select public.ensure_container(p_org, p_est, public.receive_batch(p_org, p_est, p_product, p_supplier, p_code, p_qty,
    p_expiry, 'original', p_expiry, p_storage, p_status, case when p_status = 'measured' then 4.0 end, p_reason, p_intent))
$$;
create function pg_temp.exit(p_container uuid, p_kind text, p_qty numeric, p_reason text, p_intent uuid,
  p_est uuid default 'e3000000-0000-4000-8000-0000000000a1', p_org uuid default 'e2000000-0000-4000-8000-00000000000a')
returns uuid language sql as $$
  select public.record_container_movement(p_org, p_est, p_container, p_kind, p_qty, p_reason, p_intent)
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- São Paulo: vencido ontem, vence hoje, vence amanhã (data local da unidade).
select pg_temp.receive('e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-0000000000a1','e5000000-0000-4000-8000-0000000000a1',
  'V-ONTEM', 10, (:'sp'::date - 1), 'ambient', 'not_required', null, 'e7000000-0000-4000-8000-000000000001') as c_ontem \gset
select pg_temp.receive('e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-0000000000a1','e5000000-0000-4000-8000-0000000000a1',
  'V-HOJE', 10, :'sp'::date, 'ambient', 'not_required', null, 'e7000000-0000-4000-8000-000000000002') as c_hoje \gset
select pg_temp.receive('e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-0000000000a1','e5000000-0000-4000-8000-0000000000a1',
  'V-AMANHA', 10, (:'sp'::date + 1), 'ambient', 'not_required', null, 'e7000000-0000-4000-8000-000000000003') as c_amanha \gset

-- 1) Consumo recusado no vencido, pelas duas assinaturas, com mensagem clara e a data registrada.
select throws_ok(format($$select pg_temp.exit(%L, 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000101')$$, :'c_ontem'),
  '22023', format('Recipiente vencido: a validade registrada (%s) já passou na data da unidade. Consumo recusado; o descarte continua permitido.',
    to_char(:'sp'::date - 1, 'DD/MM/YYYY')),
  'consumo de recipiente vencido é recusado com mensagem clara');
select throws_like(format($$select public.record_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',
    (select batch_id from public.containers where id = %L), 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000102')$$, :'c_ontem'),
  'Recipiente vencido:%', 'assinatura antiga (por recebimento) também recusa o consumo do vencido');
select is((select count(*) from public.stock_movements where container_id = :'c_ontem'::uuid), 0::bigint,
  'consumo recusado não grava nada');

-- 2) Descarte do vencido continua permitido (com motivo, como antes).
select lives_ok(format($$select pg_temp.exit(%L, 'discard', 4, 'Validade passou', 'e7000000-0000-4000-8000-000000000103')$$, :'c_ontem'),
  'descarte de recipiente vencido é permitido');
select is((select balance from public.container_balances where container_id = :'c_ontem'::uuid), 6::numeric,
  'descarte do vencido baixa o saldo');
select throws_ok(format($$select pg_temp.exit(%L, 'discard', 1, null, 'e7000000-0000-4000-8000-000000000104')$$, :'c_ontem'),
  '22023', 'Dados inválidos.', 'descarte do vencido continua exigindo motivo');
-- Anular o descarte é correção do registro, não uso: permitido.
select lives_ok(format($$select public.reverse_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',
    (select id from public.stock_movements where intent_id = 'e7000000-0000-4000-8000-000000000103'), 'Lançado errado',
    'e7000000-0000-4000-8000-000000000105')$$),
  'anulação de descarte em recipiente vencido continua permitida');

-- 3) No dia da validade e antes dela, o consumo vale (como na manipulação, 6.3).
select lives_ok(format($$select pg_temp.exit(%L, 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000106')$$, :'c_hoje'),
  'consumo no próprio dia da validade é permitido');
select lives_ok(format($$select pg_temp.exit(%L, 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000107')$$, :'c_amanha'),
  'consumo antes da validade é permitido');

-- 4) A data de hoje é a da unidade, não a do servidor: a mesma validade vence em Kiritimati e não em Pago Pago.
select pg_temp.receive('e3000000-0000-4000-8000-0000000000a2','e4000000-0000-4000-8000-0000000000a3','e5000000-0000-4000-8000-0000000000a2',
  'KI', 10, (:'ki'::date - 1), 'ambient', 'not_required', null, 'e7000000-0000-4000-8000-000000000004') as c_ki \gset
select pg_temp.receive('e3000000-0000-4000-8000-0000000000a3','e4000000-0000-4000-8000-0000000000a4','e5000000-0000-4000-8000-0000000000a3',
  'PP', 10, (:'ki'::date - 1), 'ambient', 'not_required', null, 'e7000000-0000-4000-8000-000000000005') as c_pp \gset
select throws_like(format($$select pg_temp.exit(%L, 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000108', 'e3000000-0000-4000-8000-0000000000a2')$$, :'c_ki'),
  'Recipiente vencido:%', 'Kiritimati (UTC+14): validade de ontem na data local é vencida');
select lives_ok(format($$select pg_temp.exit(%L, 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000109', 'e3000000-0000-4000-8000-0000000000a3')$$, :'c_pp'),
  'Pago Pago (UTC-11): a mesma data ainda não passou na data local');

-- 5) Vencido e bloqueado por ocorrência: a mensagem do bloqueio vem primeiro; o descarte continua permitido.
select pg_temp.receive('e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-0000000000a2','e5000000-0000-4000-8000-0000000000a1',
  'V-BLOQ', 5, (:'sp'::date - 1), 'refrigerated', 'not_measured', 'Sem termômetro', 'e7000000-0000-4000-8000-000000000006') as c_bloq \gset
select throws_ok(format($$select pg_temp.exit(%L, 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000110')$$, :'c_bloq'),
  '22023', 'Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.',
  'vencido e bloqueado: recusa pelo bloqueio, que vem primeiro');
-- Liberada a ocorrência, o vencimento continua recusando o consumo.
select public.decide_occurrence('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',
  (select id from public.occurrences where batch_id = (select batch_id from public.containers where id = :'c_bloq'::uuid)),
  'released', 'Conferido', 'e7000000-0000-4000-8000-000000000111');
select throws_like(format($$select pg_temp.exit(%L, 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000112')$$, :'c_bloq'),
  'Recipiente vencido:%', 'ocorrência liberada não libera o consumo do vencido');
select lives_ok(format($$select pg_temp.exit(%L, 'discard', 5, 'Validade passou', 'e7000000-0000-4000-8000-000000000113')$$, :'c_bloq'),
  'vencido com ocorrência liberada: descarte permitido');

-- 6) Repetição de um consumo gravado antes de vencer devolve o mesmo registro (não é consumo novo).
-- Simula o consumo gravado ontem, antes do vencimento, e repetido hoje com o mesmo identificador.
reset role;
insert into public.stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by)
select organization_id, establishment_id, batch_id, id, 'e7000000-0000-4000-8000-000000000114', 'consumption', 1, null, timezone,
       'e1000000-0000-4000-8000-000000000001'
  from public.containers where id = :'c_ontem'::uuid;
set local role authenticated;
select is(pg_temp.exit(:'c_ontem', 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000114'),
  (select id from public.stock_movements where intent_id = 'e7000000-0000-4000-8000-000000000114'),
  'repetir um consumo já gravado devolve o mesmo registro, mesmo depois de vencido');
select lives_ok($$select public.reverse_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',
    (select id from public.stock_movements where intent_id = 'e7000000-0000-4000-8000-000000000114'), 'Lançado errado',
    'e7000000-0000-4000-8000-000000000115')$$,
  'anular um consumo em recipiente vencido continua permitido');

-- 7) Derivado: vale a validade do próprio recipiente. Origem que vence hoje gera derivado que vence hoje:
-- consumo permitido hoje; a origem de ontem não é manipulada (regra da 6.3, mantida).
select public.handle_container('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',:'c_hoje'::uuid,
  'opening', array[2]::numeric[], :'sp'::date, 'ambient', now(), 'e1000000-0000-4000-8000-000000000001', 'sealed', null, null, null,
  'e7000000-0000-4000-8000-000000000116');
select id as c_deriv from public.containers where handling_id = (select id from public.container_handlings where intent_id = 'e7000000-0000-4000-8000-000000000116') \gset
select lives_ok(format($$select pg_temp.exit(%L, 'consumption', 1, null, 'e7000000-0000-4000-8000-000000000117')$$, :'c_deriv'),
  'derivado com validade de hoje: consumo permitido');
select throws_like(format($$select public.handle_container('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',%L::uuid,
  'opening', array[1]::numeric[], %L::date, 'ambient', now(), 'e1000000-0000-4000-8000-000000000001', 'sealed', null, null, null,
  'e7000000-0000-4000-8000-000000000118')$$, :'c_ontem', :'sp'::date),
  'Recipiente de origem vencido%', 'manipulação do vencido continua recusada (6.3)');

-- 8) Derivado de manipulação anulada: consumo segue recusado (saldo zerado pela anulação, 6.4).
select public.handle_container('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',:'c_hoje'::uuid,
  'opening', array[2]::numeric[], :'sp'::date, 'ambient', now(), 'e1000000-0000-4000-8000-000000000001', 'sealed', null, null, null,
  'e7000000-0000-4000-8000-000000000122');
select id as c_anulado from public.containers where handling_id = (select id from public.container_handlings where intent_id = 'e7000000-0000-4000-8000-000000000122') \gset
select public.void_handling('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',
  (select id from public.container_handlings where intent_id = 'e7000000-0000-4000-8000-000000000122'), 'Erro de registro',
  'e7000000-0000-4000-8000-000000000119');
select throws_ok(format($$select pg_temp.exit(%L, 'consumption', 0.5, null, 'e7000000-0000-4000-8000-000000000120')$$, :'c_anulado'),
  '22023', null, 'derivado de manipulação anulada: consumo recusado');

-- 9) Métrica: vencidos com saldo agora, na data da unidade; outra empresa não aparece.
create function pg_temp.expired(p_est uuid, p_org uuid default 'e2000000-0000-4000-8000-00000000000a')
returns bigint language sql as $$
  select containers_expired_with_balance from public.pilot_metrics(p_org, p_est, now() - interval '1 day', now() + interval '1 day')
$$;
grant execute on function pg_temp.expired(uuid, uuid) to authenticated;
-- São Paulo: V-ONTEM com saldo conta; V-BLOQ esgotado não conta; V-HOJE e V-AMANHA não estão vencidos.
select is(pg_temp.expired('e3000000-0000-4000-8000-0000000000a1'), 1::bigint, 'métrica conta só vencido com saldo, na data da unidade');
select is(pg_temp.expired('e3000000-0000-4000-8000-0000000000a2'), 1::bigint, 'Kiritimati: vencido com saldo conta');
select is(pg_temp.expired('e3000000-0000-4000-8000-0000000000a3'), 0::bigint, 'Pago Pago: a mesma data ainda não venceu');
select is((select handlings_total from public.pilot_metrics('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',
  now() - interval '1 day', now() + interval '1 day')), 2::bigint, 'as métricas da 6.10 continuam (duas manipulações)');
-- Membro lê o mesmo; outra empresa e anônimo não.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(pg_temp.expired('e3000000-0000-4000-8000-0000000000a1'), 1::bigint, 'membro vê a mesma métrica');
select throws_ok(format($$select pg_temp.exit(%L, 'discard', 1, 'Validade passou', 'e7000000-0000-4000-8000-000000000121')$$, :'c_ontem'),
  '42501', 'Acesso negado.', 'membro continua sem escrita (D-019), inclusive descarte do vencido');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(pg_temp.expired('e3000000-0000-4000-8000-0000000000a1'), 0::bigint, 'outra empresa não conta vencidos de A');
reset role;
select ok(not has_function_privilege('anon', 'public.pilot_metrics(uuid,uuid,timestamptz,timestamptz)', 'execute'), 'anon não lê métricas');
select ok((select not prosecdef from pg_proc where oid = 'public.pilot_metrics(uuid,uuid,timestamptz,timestamptz)'::regprocedure),
  'pilot_metrics continua SECURITY INVOKER');
select lives_ok($$select private.assert_history_protected()$$, 'proteção do histórico continua íntegra');

select * from finish();
rollback;
