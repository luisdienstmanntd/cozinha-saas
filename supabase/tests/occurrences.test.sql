-- Fase 6, fatia 6.5a: conservação, temperatura e ocorrências no banco (FASE_06_DESENHO.md 4.8, 5.1,
-- 5.2, 5.4 e testes 6 (parte tardia), 14 e 19 (decisão) da seção 8; revisão cruzada B-2, I-3, I-6, S-2).
-- Datas relativas a hoje e a now() (início da transação), para que o teste não envelheça (S-6).
-- Nenhum texto aqui classifica temperatura nem afirma conformidade sanitária.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ------------------------------------------------------------------
select has_table('public', 'occurrences', 'tabela de ocorrências existe');
select has_table('public', 'occurrence_decisions', 'tabela de decisões de ocorrência existe');
select ok((select relrowsecurity from pg_class where oid = 'public.occurrences'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.occurrence_decisions'::regclass), 'ocorrências e decisões têm RLS');
select is(
  (select coalesce(string_agg(t || ':' || r.role || ':' || p.priv, ',' order by t, r.role, p.priv), '')
     from unnest(array['occurrences', 'occurrence_decisions']) t
     cross join unnest(array['anon', 'authenticated', 'service_role']) r(role)
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
    where has_table_privilege(r.role, ('public.' || t)::regclass, p.priv)),
  'occurrence_decisions:authenticated:SELECT,occurrence_decisions:service_role:SELECT,occurrences:authenticated:SELECT,occurrences:service_role:SELECT',
  'ocorrências e decisões: só leitura para authenticated e service_role; nada para anon');
select lives_ok($$select private.assert_history_protected()$$, 'proteção do histórico inclui ocorrências e decisões');
select col_is_null('public', 'batch_receipts', 'storage_condition', 'conservação do recebimento é nula nos recebimentos anteriores');
select col_is_null('public', 'batch_receipts', 'temperature_status', 'situação da medição é nula nos recebimentos anteriores');
select col_type_is('public', 'batch_receipts', 'received_temperature_c', 'numeric(4,1)', 'temperatura aferida em numeric(4,1)');
select col_is_null('public', 'products', 'storage_condition', 'conservação do produto é nula até ser definida');
select ok((select bool_and(not prosecdef) from pg_proc where oid in (
    'public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid)'::regprocedure,
    'public.decide_occurrence(uuid,uuid,uuid,text,text,uuid)'::regprocedure,
    'public.set_product_storage_condition(uuid,uuid,uuid,text)'::regprocedure,
    'public.container_blocks(uuid,uuid,uuid)'::regprocedure)), 'funções públicas novas são SECURITY INVOKER');
select ok((select bool_and(prosecdef) from pg_proc where oid in (
    'private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid)'::regprocedure,
    'private.receive_batch_core(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid)'::regprocedure,
    'private.decide_occurrence(uuid,uuid,uuid,text,text,uuid)'::regprocedure,
    'private.set_product_storage_condition(uuid,uuid,uuid,text)'::regprocedure)), 'núcleos novos são SECURITY DEFINER');
select ok(not has_function_privilege('authenticated', 'private.receive_batch_core(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid)', 'execute'),
  'núcleo comum de recebimento não é executável pelo cliente');
-- 6.5b: a assinatura antiga (sem conservação nem temperatura) foi retirada, nos dois esquemas.
select ok(to_regprocedure('public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid)') is null
      and to_regprocedure('private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid)') is null,
  'assinatura antiga de receive_batch retirada na 6.5b');
select is((select count(*)::int from private.occurrence_problems()), 0, 'nenhuma ocorrência incoerente no início');

-- Dados ---------------------------------------------------------------------
-- u1 owner de A e de B ("Luis"); u2 member de A ("Bia"); u3 owner revogado de A; u4 owner só de B.
insert into auth.users(id) values
 ('c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000002'),
 ('c1000000-0000-4000-8000-000000000003'),('c1000000-0000-4000-8000-000000000004');
insert into organizations(id,name) values
 ('c2000000-0000-4000-8000-00000000000a','A'),('c2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('c3000000-0000-4000-8000-0000000000a1','c2000000-0000-4000-8000-00000000000a','UA','America/Sao_Paulo'),
 ('c3000000-0000-4000-8000-0000000000b1','c2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,revoked_at,display_name) values
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000001','owner',null,'Luis'),
 ('c2000000-0000-4000-8000-00000000000b','c1000000-0000-4000-8000-000000000001','owner',null,'Luis'),
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000002','member',null,'Bia'),
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000003','owner',now(),'Ex'),
 ('c2000000-0000-4000-8000-00000000000b','c1000000-0000-4000-8000-000000000004','owner',null,'Outro');
-- P1 Frango (refrigerado, definido no teste), P2 Arroz (sem conservação definida), P3 Farinha (ambiente,
-- definido no teste), P4 Peixe (sem conservação), P5 Queijo (fixtures antigas); PB Manteiga em B.
insert into products(id,organization_id,establishment_id,name,unit) values
 ('c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','Frango','kg'),
 ('c4000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','Arroz','kg'),
 ('c4000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','Farinha','kg'),
 ('c4000000-0000-4000-8000-000000000004','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','Peixe','kg'),
 ('c4000000-0000-4000-8000-000000000005','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','Queijo','kg'),
 ('c4000000-0000-4000-8000-0000000000b1','c2000000-0000-4000-8000-00000000000b','c3000000-0000-4000-8000-0000000000b1','Manteiga','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('c5000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','FA'),
 ('c5000000-0000-4000-8000-0000000000b1','c2000000-0000-4000-8000-00000000000b','c3000000-0000-4000-8000-0000000000b1','FB');
-- Recebimentos antigos (anteriores à 6.5a: colunas novas nulas), de ontem, Queijo 20 kg, vencem em 10 dias.
-- T1–T4 para manipulação tardia; T5 para anular manipulação tardia.
insert into batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by,created_at)
select ('c6000000-0000-4000-8000-00000000000' || n)::uuid, 'c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
       'c4000000-0000-4000-8000-000000000005','c5000000-0000-4000-8000-000000000001',('c7000000-0000-4000-8000-00000000000' || n)::uuid,
       'Q-T' || n, 20, 'kg', current_date+10, 'original', current_date+10, 'America/Sao_Paulo', 'c1000000-0000-4000-8000-000000000001', now()-interval '1 day'
  from generate_series(1, 5) n;

-- Atalhos.
create function pg_temp.integral(p_batch uuid) returns uuid language sql stable as $$
  select id from public.containers where batch_id = p_batch and kind = 'integral' $$;
create function pg_temp.batch(p_intent uuid) returns uuid language sql stable as $$
  select id from public.batch_receipts where intent_id = p_intent $$;
create function pg_temp.occ(p_batch uuid) returns uuid language sql stable as $$
  select id from public.occurrences where batch_id = p_batch and kind = 'temperature_not_measured' $$;
create function pg_temp.late_occ(p_handling uuid) returns uuid language sql stable as $$
  select id from public.occurrences where handling_id = p_handling and kind = 'late_handling' $$;
create function pg_temp.derived(p_handling uuid, p_position int default 1) returns uuid language sql stable as $$
  select id from public.containers where handling_id = p_handling and position = p_position $$;
-- Recebimento pela assinatura nova (organização A, unidade UA, fornecedor FA, 10 kg, vence em 10 dias).
create function pg_temp.rcv(p_product uuid, p_storage text, p_status text, p_temp numeric, p_reason text, p_intent uuid,
  p_qty numeric default 10, p_org uuid default 'c2000000-0000-4000-8000-00000000000a',
  p_est uuid default 'c3000000-0000-4000-8000-0000000000a1', p_supplier uuid default 'c5000000-0000-4000-8000-000000000001')
returns uuid language sql as $$
  select public.receive_batch(p_org, p_est, p_product, p_supplier, 'L-' || left(p_intent::text, 8), p_qty,
    current_date+10, 'original', current_date+10, p_storage, p_status, p_temp, p_reason, p_intent) $$;
-- Recebimento em ambiente, sem medição exigida: o que a tela anterior à 6.5b gravava pela assinatura
-- antiga (retirada na 6.5b). Os testes abaixo conferem que esse caminho não serve para refrigerado.
create function pg_temp.rcv_old(p_product uuid, p_intent uuid) returns uuid language sql as $$
  select public.receive_batch('c2000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-0000000000a1', p_product,
    'c5000000-0000-4000-8000-000000000001', 'L-' || left(p_intent::text, 8), 10, current_date+10, 'original', current_date+10,
    'ambient', 'not_required', null, null, p_intent) $$;
create function pg_temp.mv(p_container uuid, p_kind text, p_qty numeric, p_reason text, p_intent uuid) returns uuid language sql as $$
  select public.record_container_movement('c2000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-0000000000a1',
    p_container, p_kind, p_qty, p_reason, p_intent) $$;
create function pg_temp.h(p_source uuid, p_q numeric[], p_intent uuid, p_handled_at timestamptz default now(),
  p_late text default null, p_kind text default 'opening', p_remainder text default 'sealed') returns uuid language sql as $$
  select public.handle_container('c2000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-0000000000a1', p_source,
    p_kind, p_q, current_date+5, 'refrigerated', p_handled_at, 'c1000000-0000-4000-8000-000000000002', p_remainder,
    null, null, p_late, p_intent) $$;
create function pg_temp.dec(p_occurrence uuid, p_decision text, p_reason text, p_intent uuid,
  p_org uuid default 'c2000000-0000-4000-8000-00000000000a', p_est uuid default 'c3000000-0000-4000-8000-0000000000a1')
returns uuid language sql as $$
  select public.decide_occurrence(p_org, p_est, p_occurrence, p_decision, p_reason, p_intent) $$;
create function pg_temp.blocks(p_container uuid) returns text language sql stable as $$
  select coalesce(string_agg(kind || ':' || status, ',' order by created_at, occurrence_id), '')
    from public.container_blocks('c2000000-0000-4000-8000-00000000000a', 'c3000000-0000-4000-8000-0000000000a1', p_container) $$;
grant execute on function pg_temp.integral(uuid), pg_temp.batch(uuid), pg_temp.occ(uuid), pg_temp.late_occ(uuid),
  pg_temp.derived(uuid,int), pg_temp.rcv(uuid,text,text,numeric,text,uuid,numeric,uuid,uuid,uuid), pg_temp.rcv_old(uuid,uuid),
  pg_temp.mv(uuid,text,numeric,text,uuid), pg_temp.h(uuid,numeric[],uuid,timestamptz,text,text,text),
  pg_temp.dec(uuid,text,text,uuid,uuid,uuid), pg_temp.blocks(uuid) to authenticated, anon;

set local role authenticated;

-- Matriz de papéis ------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured',4,null,'c7000000-0000-4000-8000-000000000101')$$,'42501',null,'member não recebe');
select throws_ok($$select set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000001','refrigerated')$$,'42501',null,'member não define conservação do produto');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured',4,null,'c7000000-0000-4000-8000-000000000102')$$,'42501',null,'proprietário revogado não recebe');
select throws_ok($$select set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000001','refrigerated')$$,'42501',null,'proprietário revogado não define conservação');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured',4,null,'c7000000-0000-4000-8000-000000000103')$$,'42501',null,'proprietário de outra empresa não recebe em A');
select throws_ok($$select set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000001','refrigerated')$$,'42501',null,'proprietário de outra empresa não define conservação em A');

-- Conservação do produto: definição única e auditada ------------------------
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000001','chilled')$$,'22023','Conservação inválida.','conservação fora da lista recusada');
select throws_ok($$select set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000001',null)$$,'22023','Conservação inválida.','conservação nula recusada');
select throws_ok($$select set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-0000000000b1','frozen')$$,'23503','Produto não encontrado.','produto de outra empresa sob o escopo de A recusado sem revelar existência');
select is(set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000001','refrigerated'),
  'refrigerated', 'proprietário define a conservação do produto');
select is(set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000001','refrigerated'),
  'refrigerated', 'repetir o mesmo valor é idempotente');
select throws_ok($$select set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000001','frozen')$$,
  '22023','A conservação do produto já foi definida e não pode ser trocada.','conservação definida não é trocada');
select is(set_product_storage_condition('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000003','ambient'),
  'ambient', 'proprietário define produto em ambiente');
select results_eq(
  $$select entity, field, old_value, new_value, changed_by, establishment_id from entity_changes
     where entity_id = 'c4000000-0000-4000-8000-000000000001' order by changed_at$$,
  $$values ('product'::text, 'storage_condition'::text, null::text, 'refrigerated'::text, 'c1000000-0000-4000-8000-000000000001'::uuid, 'c3000000-0000-4000-8000-0000000000a1'::uuid)$$,
  'definição auditada em entity_changes, uma única vez (a repetição idempotente não grava)');

-- Recebimento: forma (teste 14) ------------------------------------------------
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002',null,'measured',4,null,'c7000000-0000-4000-8000-000000000201')$$,'22023','Conservação ou temperatura do recebimento inválida.','conservação obrigatória na assinatura nova');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated',null,null,null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'refrigerado sem situação de medição recusado');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','frozen',null,null,null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'congelado sem situação de medição recusado');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','not_required',null,null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'"não exigida" só em ambiente');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','ambient','not_measured',null,'Sem termômetro','c7000000-0000-4000-8000-000000000201')$$,'22023',null,'ambiente não usa "não foi possível medir"');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured',null,null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'"medida" sem temperatura recusada');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured',80.1,null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'temperatura acima de 80 recusada');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','frozen','measured',-50.1,null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'temperatura abaixo de −50 recusada');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured',4.25,null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'temperatura com mais de uma casa decimal recusada (não arredonda em silêncio)');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured','NaN',null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'temperatura NaN recusada');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','ambient','not_required',20,null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'"não exigida" com temperatura recusada');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured',4,'Justificativa','c7000000-0000-4000-8000-000000000201')$$,'22023',null,'justificativa só quando não foi possível medir');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','not_measured',null,null,'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'"não foi possível medir" sem justificativa recusado');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','not_measured',null,U&'\00A0\3000','c7000000-0000-4000-8000-000000000201')$$,'22023',null,'justificativa só com espaços invisíveis recusada');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','not_measured',null,repeat('x',301),'c7000000-0000-4000-8000-000000000201')$$,'22023',null,'justificativa acima de 300 caracteres recusada');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured',4,null,'c7000000-0000-4000-8000-000000000201',p_supplier=>'c5000000-0000-4000-8000-0000000000b1')$$,'23503',null,'fornecedor de outra empresa recusado como antes');
select is((select count(*)::int from batch_receipts where organization_id='c2000000-0000-4000-8000-00000000000a' and created_at = now()), 0, 'nenhuma recusa gravou recebimento');

-- Recebimento: gravação --------------------------------------------------------
select lives_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','refrigerated','measured',4.5,null,'c7000000-0000-4000-8000-000000000211')$$,'refrigerado com temperatura medida aceito');
select results_eq(
  $$select b.storage_condition, b.temperature_status, b.received_temperature_c, c.storage
      from batch_receipts b join containers c on c.batch_id = b.id and c.kind = 'integral'
     where b.intent_id = 'c7000000-0000-4000-8000-000000000211'$$,
  $$values ('refrigerated'::text, 'measured'::text, 4.5::numeric, 'refrigerated'::text)$$,
  'recebimento grava conservação, situação e temperatura; o integral copia a conservação');
select is(pg_temp.blocks(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000211'))), '', 'recebimento medido não bloqueia');
select is((select count(*)::int from occurrences where batch_id = pg_temp.batch('c7000000-0000-4000-8000-000000000211')), 0, 'recebimento medido não abre ocorrência');
select lives_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','frozen','measured',-18,null,'c7000000-0000-4000-8000-000000000212')$$,'congelado com temperatura medida aceito');
select lives_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','ambient','not_required',null,null,'c7000000-0000-4000-8000-000000000213')$$,'ambiente sem medição exigida aceito');
select lives_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000002','ambient','measured',22,null,'c7000000-0000-4000-8000-000000000214')$$,'ambiente com temperatura medida aceito');
select is((select storage from containers where batch_id = pg_temp.batch('c7000000-0000-4000-8000-000000000213') and kind = 'integral'), 'ambient', 'integral em ambiente copia a conservação');

-- Sem medição: ocorrência que bloqueia (Q8, D-029) -----------------------------
select lives_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000004','frozen','not_measured',null,'  Termômetro quebrado  ','c7000000-0000-4000-8000-000000000221')$$,'congelado sem medição aceito com justificativa');
select results_eq(
  $$select kind, handling_id, reason, created_by, timezone from occurrences where batch_id = pg_temp.batch('c7000000-0000-4000-8000-000000000221')$$,
  $$values ('temperature_not_measured'::text, null::uuid, 'Termômetro quebrado'::text, 'c1000000-0000-4000-8000-000000000001'::uuid, 'America/Sao_Paulo'::text)$$,
  'exatamente uma ocorrência, com justificativa sem espaços nas pontas, autoria e fuso');
select is(pg_temp.rcv('c4000000-0000-4000-8000-000000000004','frozen','not_measured',null,'Termômetro quebrado','c7000000-0000-4000-8000-000000000221'),
  pg_temp.batch('c7000000-0000-4000-8000-000000000221'), 'replay devolve o mesmo recebimento');
select is((select count(*)::int from occurrences where batch_id = pg_temp.batch('c7000000-0000-4000-8000-000000000221')), 1, 'replay não cria segunda ocorrência');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000004','frozen','not_measured',null,'Outro motivo','c7000000-0000-4000-8000-000000000221')$$,'23505',null,'replay com outra justificativa recusado');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000004','frozen','measured',-18,null,'c7000000-0000-4000-8000-000000000221')$$,'23505',null,'replay com temperatura em vez de "não medida" recusado');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000004','refrigerated','not_measured',null,'Termômetro quebrado','c7000000-0000-4000-8000-000000000221')$$,'23505',null,'replay com outra conservação recusado');
select throws_ok($$select pg_temp.rcv_old('c4000000-0000-4000-8000-000000000004','c7000000-0000-4000-8000-000000000221')$$,'23505',null,'recebimento em ambiente não reaproveita recebimento que tem situação de medição');

-- Conservação definida no produto ---------------------------------------------
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000001','ambient','not_required',null,null,'c7000000-0000-4000-8000-000000000231')$$,
  '22023','A conservação do recebimento precisa ser a definida no produto.','recebimento com conservação diferente da do produto recusado');
select throws_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000001','frozen','measured',-18,null,'c7000000-0000-4000-8000-000000000231')$$,
  '22023','A conservação do recebimento precisa ser a definida no produto.','congelar não substitui a conservação do produto');
select lives_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000001','refrigerated','measured',3,null,'c7000000-0000-4000-8000-000000000231')$$,'recebimento com a conservação do produto aceito');

-- Caminho sem temperatura (o da assinatura antiga, retirada na 6.5b) -------------
select throws_ok($$select pg_temp.rcv_old('c4000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000241')$$,
  '22023','A conservação do recebimento precisa ser a definida no produto.','produto refrigerado não é recebido como ambiente sem temperatura');
select lives_ok($$select pg_temp.rcv_old('c4000000-0000-4000-8000-000000000003','c7000000-0000-4000-8000-000000000242')$$,'produto em ambiente recebido sem medição exigida');
select results_eq(
  $$select b.storage_condition, b.temperature_status, b.received_temperature_c, c.storage
      from batch_receipts b join containers c on c.batch_id = b.id and c.kind = 'integral'
     where b.intent_id = 'c7000000-0000-4000-8000-000000000242'$$,
  $$values ('ambient'::text, 'not_required'::text, null::numeric, 'ambient'::text)$$,
  'grava ambiente sem medição exigida para produto em ambiente');
select lives_ok($$select pg_temp.rcv_old('c4000000-0000-4000-8000-000000000002','c7000000-0000-4000-8000-000000000243')$$,'produto sem conservação definida recebido com a conservação informada');
select results_eq(
  $$select b.storage_condition, b.temperature_status, b.received_temperature_c, c.storage
      from batch_receipts b join containers c on c.batch_id = b.id and c.kind = 'integral'
     where b.intent_id = 'c7000000-0000-4000-8000-000000000243'$$,
  $$values ('ambient'::text, 'not_required'::text, null::numeric, 'ambient'::text)$$,
  'produto sem conservação definida: o recebimento guarda a conservação informada (não há mais recebimento sem ela)');
select is((select count(*)::int from batch_receipts where id in ('c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000002')
            and storage_condition is null and temperature_status is null and received_temperature_c is null), 2,
  'recebimentos antigos continuam legíveis com os campos novos nulos');

-- Bloqueio por recebimento sem medição -----------------------------------------
-- N1 = Peixe congelado sem medição (intent 221), 10 kg.
select throws_ok($$select pg_temp.mv(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'consumption',1,null,'c7000000-0000-4000-8000-000000000301')$$,
  '22023','Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.','consumo recusado com ocorrência aberta');
select throws_ok($$select record_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',pg_temp.batch('c7000000-0000-4000-8000-000000000221'),'consumption',1,null,'c7000000-0000-4000-8000-000000000302')$$,
  '22023','Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.','consumo pela assinatura antiga também recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'{2}','c7000000-0000-4000-8000-000000000303')$$,
  '22023','Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.','manipulação recusada com ocorrência aberta');
select is(pg_temp.blocks(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221'))), 'temperature_not_measured:pending', 'container_blocks mostra a ocorrência aberta');
select lives_ok($$select pg_temp.mv(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'discard',2,'Descongelado','c7000000-0000-4000-8000-000000000304')$$,'descarte continua permitido (D-029)');
select lives_ok($$select reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000304'),'Descarte errado','c7000000-0000-4000-8000-000000000305')$$,'anular o descarte continua permitido');
select is(pg_temp.blocks(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221'))), 'temperature_not_measured:pending', 'anular o descarte não libera o recipiente');

-- Decisão: forma, escopo e estado ---------------------------------------------
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'approved','Ok','c7000000-0000-4000-8000-000000000401')$$,'22023','Decisão, justificativa ou identificador inválido.','decisão fora da lista recusada');
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released',U&'\2003','c7000000-0000-4000-8000-000000000401')$$,'22023',null,'justificativa só com espaços invisíveis recusada');
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released',null,'c7000000-0000-4000-8000-000000000401')$$,'22023',null,'justificativa obrigatória');
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released',repeat('x',501),'c7000000-0000-4000-8000-000000000401')$$,'22023',null,'justificativa acima de 500 caracteres recusada');
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released','Ok',null)$$,'22023',null,'identificador obrigatório');
select throws_ok($$select pg_temp.dec('c9000000-0000-4000-8000-0000000000ee','released','Ok','c7000000-0000-4000-8000-000000000401')$$,'23503','Ocorrência não encontrada.','ocorrência inexistente recusada');
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released','Ok','c7000000-0000-4000-8000-000000000401',p_org=>'c2000000-0000-4000-8000-00000000000b',p_est=>'c3000000-0000-4000-8000-0000000000b1')$$,
  '23503','Ocorrência não encontrada.','ocorrência de A sob o escopo de B recusada com a mesma mensagem');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released','Ok','c7000000-0000-4000-8000-000000000401')$$,'42501',null,'member não decide');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released','Ok','c7000000-0000-4000-8000-000000000401')$$,'42501',null,'proprietário revogado não decide');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released','Ok','c7000000-0000-4000-8000-000000000401')$$,'42501',null,'proprietário de outra empresa não decide em A');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from occurrence_decisions), 0, 'nenhuma liberação sem decisão registrada');
-- I-3: identificador de baixa ou de manipulação não vira decisão.
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released','Ok','c7000000-0000-4000-8000-000000000304')$$,'23505',null,'identificador de baixa não vira decisão');

select lives_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released','  Medido depois: -19 °C  ','c7000000-0000-4000-8000-000000000402')$$,'proprietário libera com justificativa');
select results_eq(
  $$select decision, reason, created_by, batch_id, timezone from occurrence_decisions where intent_id = 'c7000000-0000-4000-8000-000000000402'$$,
  $$values ('released'::text, 'Medido depois: -19 °C'::text, 'c1000000-0000-4000-8000-000000000001'::uuid, pg_temp.batch('c7000000-0000-4000-8000-000000000221'), 'America/Sao_Paulo'::text)$$,
  'decisão grava liberação, justificativa, autor, recebimento e fuso');
select is(pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released','Medido depois: -19 °C','c7000000-0000-4000-8000-000000000402'),
  (select id from occurrence_decisions where intent_id = 'c7000000-0000-4000-8000-000000000402'), 'teste 19 no banco: replay da decisão devolve o mesmo ID');
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'released','Outra justificativa','c7000000-0000-4000-8000-000000000402')$$,'23505',null,'replay com outra justificativa recusado');
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'rejected','Medido depois: -19 °C','c7000000-0000-4000-8000-000000000402')$$,'23505',null,'replay com outra decisão recusado');
select throws_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'rejected','Mudei de ideia','c7000000-0000-4000-8000-000000000403')$$,'23505','Ocorrência já decidida.','segunda decisão recusada; não há troca');
select is((select count(*)::int from occurrence_decisions), 1, 'uma única decisão gravada');
select is(pg_temp.blocks(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221'))), '', 'liberado: recipiente sem bloqueio');
select lives_ok($$select pg_temp.mv(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'consumption',1,null,'c7000000-0000-4000-8000-000000000306')$$,'consumo aceito depois da liberação');
select lives_ok($$select pg_temp.h(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'{2}','c7000000-0000-4000-8000-000000000307')$$,'manipulação aceita depois da liberação');
-- I-3: identificador de decisão não vira baixa, anulação, manipulação nem anulação de manipulação.
select throws_ok($$select pg_temp.mv(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'consumption',1,null,'c7000000-0000-4000-8000-000000000402')$$,'23505',null,'identificador de decisão não vira baixa');
select throws_ok($$select reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000306'),'Erro','c7000000-0000-4000-8000-000000000402')$$,'23505',null,'identificador de decisão não vira anulação');
select throws_ok($$select pg_temp.h(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'{1}','c7000000-0000-4000-8000-000000000402')$$,'23505',null,'identificador de decisão não vira manipulação');
select throws_ok($$select void_handling('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',(select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000307'),'Erro','c7000000-0000-4000-8000-000000000402')$$,'23505',null,'identificador de decisão não vira anulação de manipulação');

-- Rejeição: bloqueio permanente, descarte permitido (S-2) ----------------------
select lives_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000004','refrigerated','not_measured',null,'Entrega sem conferência','c7000000-0000-4000-8000-000000000222')$$,'refrigerado sem medição aceito');
select lives_ok($$select pg_temp.dec(pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000222')),'rejected','Sem como confirmar a temperatura','c7000000-0000-4000-8000-000000000404')$$,'proprietário rejeita');
select is(pg_temp.blocks(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000222'))), 'temperature_not_measured:rejected', 'container_blocks mostra a rejeição');
select throws_ok($$select pg_temp.mv(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000222')),'consumption',1,null,'c7000000-0000-4000-8000-000000000311')$$,
  '22023','Recipiente bloqueado: ocorrência rejeitada pelo proprietário. Só o descarte é permitido.','consumo recusado depois da rejeição');
select throws_ok($$select pg_temp.h(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000222')),'{1}','c7000000-0000-4000-8000-000000000312')$$,
  '22023','Recipiente bloqueado: ocorrência rejeitada pelo proprietário. Só o descarte é permitido.','manipulação recusada depois da rejeição');
select lives_ok($$select pg_temp.mv(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000222')),'discard',10,'Rejeitado no recebimento','c7000000-0000-4000-8000-000000000313')$$,'descarte do saldo aceito depois da rejeição');
select lives_ok($$select reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000313'),'Descarte lançado errado','c7000000-0000-4000-8000-000000000314')$$,'S-2: anular o descarte de recebimento rejeitado é permitido');
select is((select balance from container_balances where container_id = pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000222'))), 10::numeric, 'S-2: o saldo volta');
select is(pg_temp.blocks(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000222'))), 'temperature_not_measured:rejected', 'S-2: e o recipiente continua bloqueado');
select throws_ok($$select pg_temp.mv(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000222')),'consumption',1,null,'c7000000-0000-4000-8000-000000000315')$$,'22023',null,'S-2: consumo continua recusado');

-- Teste 6 (parte tardia): manipulação registrada mais de 2 horas depois ----------
select throws_ok($$select pg_temp.h(pg_temp.integral('c6000000-0000-4000-8000-000000000001'),'{4}','c7000000-0000-4000-8000-000000000501',now()-interval '3 hours')$$,
  '22023','Manipulação registrada mais de 2 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.','tardia sem justificativa recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('c6000000-0000-4000-8000-000000000001'),'{4}','c7000000-0000-4000-8000-000000000501',now()-interval '3 hours',U&'\00A0')$$,'22023','Dados inválidos.','justificativa de atraso só com espaços invisíveis recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('c6000000-0000-4000-8000-000000000001'),'{4}','c7000000-0000-4000-8000-000000000501',now()-interval '3 hours',repeat('x',301))$$,'22023','Dados inválidos.','justificativa de atraso acima de 300 caracteres recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('c6000000-0000-4000-8000-000000000001'),'{4}','c7000000-0000-4000-8000-000000000501',now()-interval '2 hours','Atraso')$$,
  '22023','Justificativa de atraso só vale para manipulação registrada mais de 2 horas depois de feita.','exatamente 2 horas não é tardia: justificativa recusada');
select is((select count(*)::int from container_handlings where batch_id = 'c6000000-0000-4000-8000-000000000001'), 0, 'nenhuma recusa gravou manipulação');

-- H1: porcionamento tardio de T1 (2 porções de 4 kg, sobra fechada), 2 horas e 1 minuto.
select lives_ok($$select pg_temp.h(pg_temp.integral('c6000000-0000-4000-8000-000000000001'),'{4,4}','c7000000-0000-4000-8000-000000000511',now()-interval '2 hours 1 minute','  Registro esquecido no fim do turno  ','portioning')$$,
  'tardia com justificativa aceita');
select results_eq(
  $$select h.late, o.kind, o.reason, o.created_by, o.batch_id
      from container_handlings h join occurrences o on o.handling_id = h.id where h.intent_id = 'c7000000-0000-4000-8000-000000000511'$$,
  $$values (true, 'late_handling'::text, 'Registro esquecido no fim do turno'::text, 'c1000000-0000-4000-8000-000000000001'::uuid, 'c6000000-0000-4000-8000-000000000001'::uuid)$$,
  'manipulação gravada como tardia, com uma ocorrência de registro tardio');
select is(pg_temp.h(pg_temp.integral('c6000000-0000-4000-8000-000000000001'),'{4,4}','c7000000-0000-4000-8000-000000000511',now()-interval '2 hours 1 minute','Registro esquecido no fim do turno','portioning'),
  (select id from container_handlings where intent_id = 'c7000000-0000-4000-8000-000000000511'), 'replay da manipulação tardia devolve o mesmo ID');
select throws_ok($$select pg_temp.h(pg_temp.integral('c6000000-0000-4000-8000-000000000001'),'{4,4}','c7000000-0000-4000-8000-000000000511',now()-interval '2 hours 1 minute','Outra justificativa','portioning')$$,'23505',null,'replay com outra justificativa de atraso recusado');
select is((select count(*)::int from occurrences where kind = 'late_handling' and handling_id = (select id from container_handlings where intent_id = 'c7000000-0000-4000-8000-000000000511')), 1, 'replay não cria segunda ocorrência tardia');
select is(pg_temp.blocks(pg_temp.derived((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000511'),1)), 'late_handling:pending', 'derivado de manipulação tardia bloqueado');
select is(pg_temp.blocks(pg_temp.derived((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000511'),2)), 'late_handling:pending', 'todos os derivados da manipulação tardia bloqueados');
select is(pg_temp.blocks(pg_temp.integral('c6000000-0000-4000-8000-000000000001')), '', 'a origem da manipulação tardia não fica bloqueada');
select lives_ok($$select pg_temp.mv(pg_temp.integral('c6000000-0000-4000-8000-000000000001'),'consumption',1,null,'c7000000-0000-4000-8000-000000000321')$$,'consumo da sobra fechada na origem continua aceito');
select throws_ok($$select pg_temp.mv(pg_temp.derived((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000511'),1),'consumption',1,null,'c7000000-0000-4000-8000-000000000322')$$,
  '22023','Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.','consumo de derivado tardio recusado até a decisão');
select throws_ok($$select pg_temp.h(pg_temp.derived((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000511'),1),'{4}','c7000000-0000-4000-8000-000000000512',p_remainder=>'none')$$,
  '22023','Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.','manipulação de derivado tardio recusada até a decisão');
select lives_ok($$select pg_temp.mv(pg_temp.derived((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000511'),2),'discard',4,'Caiu no chão','c7000000-0000-4000-8000-000000000323')$$,'descarte de derivado tardio aceito');
select lives_ok($$select pg_temp.dec(pg_temp.late_occ((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000511')),'released','Confirmado com a equipe do turno','c7000000-0000-4000-8000-000000000411')$$,'proprietário libera a manipulação tardia');
select is(pg_temp.blocks(pg_temp.derived((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000511'),1)), '', 'liberada: derivado sem bloqueio');
select lives_ok($$select pg_temp.mv(pg_temp.derived((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000511'),1),'consumption',1,null,'c7000000-0000-4000-8000-000000000324')$$,'consumo de derivado aceito depois da liberação');

-- H2: tardia rejeitada (T2).
select lives_ok($$select pg_temp.h(pg_temp.integral('c6000000-0000-4000-8000-000000000002'),'{5}','c7000000-0000-4000-8000-000000000521',now()-interval '5 hours','Sem registro no horário')$$,'segunda manipulação tardia aceita');
select lives_ok($$select pg_temp.dec(pg_temp.late_occ((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000521')),'rejected','Horário não confirmado','c7000000-0000-4000-8000-000000000412')$$,'proprietário rejeita a manipulação tardia');
select throws_ok($$select pg_temp.mv(pg_temp.derived((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000521')),'consumption',1,null,'c7000000-0000-4000-8000-000000000331')$$,
  '22023','Recipiente bloqueado: ocorrência rejeitada pelo proprietário. Só o descarte é permitido.','consumo de derivado tardio rejeitado recusado');
select lives_ok($$select pg_temp.mv(pg_temp.derived((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000521')),'discard',5,'Rejeitado','c7000000-0000-4000-8000-000000000332')$$,'descarte de derivado tardio rejeitado aceito');

-- H5: anular manipulação tardia com ocorrência aberta (4.10: não impede).
select lives_ok($$select pg_temp.h(pg_temp.integral('c6000000-0000-4000-8000-000000000005'),'{3}','c7000000-0000-4000-8000-000000000551',now()-interval '3 hours','Esqueci')$$,'manipulação tardia para anular');
select lives_ok($$select void_handling('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',(select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000551'),'Registro duplicado','c7000000-0000-4000-8000-000000000552')$$,
  'ocorrência tardia aberta não impede anular a manipulação');
select is((select balance from container_balances where container_id = pg_temp.integral('c6000000-0000-4000-8000-000000000005')), 20::numeric, 'a origem volta ao saldo de antes');
select lives_ok($$select pg_temp.dec(pg_temp.late_occ((select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000551')),'rejected','Registro anulado','c7000000-0000-4000-8000-000000000413')$$,'a ocorrência da manipulação anulada ainda pode ser decidida');

-- RLS: leitura por vínculo ------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from occurrences), 5, 'member de A lê as ocorrências de A');
select is((select count(*)::int from occurrence_decisions), 5, 'member de A lê as decisões de A');
select is(pg_temp.blocks(pg_temp.integral(pg_temp.batch('c7000000-0000-4000-8000-000000000222'))), 'temperature_not_measured:rejected', 'member vê o bloqueio pelo container_blocks');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from occurrences) + (select count(*)::int from occurrence_decisions), 0, 'proprietário só de B não lê nada de A');
select is((select count(*)::int from container_blocks('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  (select c.id from containers c where c.batch_id = 'c6000000-0000-4000-8000-000000000002' and c.kind = 'derived'))), 0, 'container_blocks não devolve nada de A para B');
reset role;
select is((select count(*)::int from container_blocks('c2000000-0000-4000-8000-00000000000b','c3000000-0000-4000-8000-0000000000b1',
  (select c.id from containers c where c.batch_id = 'c6000000-0000-4000-8000-000000000002' and c.kind = 'derived'))), 0, 'container_blocks não mistura escopos: recipiente de A sob o escopo de B não aparece');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from occurrences) + (select count(*)::int from occurrence_decisions), 0, 'vínculo revogado não lê ocorrências nem decisões');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$insert into occurrences(organization_id,establishment_id,batch_id,kind,reason,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c6000000-0000-4000-8000-000000000003','temperature_not_measured','x','UTC','c1000000-0000-4000-8000-000000000002')$$,'42501',null,'cliente não insere ocorrência direto');
select throws_ok($$insert into occurrence_decisions(organization_id,establishment_id,batch_id,occurrence_id,decision,reason,intent_id,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c6000000-0000-4000-8000-000000000003',gen_random_uuid(),'released','x',gen_random_uuid(),'UTC','c1000000-0000-4000-8000-000000000002')$$,'42501',null,'cliente não insere decisão direto');
select throws_ok($$update products set storage_condition = 'frozen' where id = 'c4000000-0000-4000-8000-000000000002'$$,'42501',null,'cliente não altera a conservação do produto direto');

-- Restrições por inserção direta (dono das tabelas) ----------------------------
reset role;
select throws_ok($$update products set storage_condition = 'frozen' where id = 'c4000000-0000-4000-8000-000000000001'$$,'23514','A conservação do produto já foi definida e não pode ser trocada.','conservação definida não muda nem por UPDATE direto');
select lives_ok($$update products set storage_condition = 'frozen' where id = 'c4000000-0000-4000-8000-000000000002'$$,'primeira definição direta (administrativa) aceita');
select is((select count(*)::int from entity_changes where entity = 'product' and entity_id = 'c4000000-0000-4000-8000-000000000002' and new_value = 'frozen'), 1, 'definição direta também é auditada');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select pg_temp.rcv('c4000000-0000-4000-8000-000000000004','refrigerated','not_measured',null,'Sem termômetro','c7000000-0000-4000-8000-000000000223')$$,'recebimento sem medição ainda sem decisão (para as restrições)');
select throws_ok($$insert into batch_receipts(organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,storage_condition,temperature_status,timezone,created_by)
  values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000004','c5000000-0000-4000-8000-000000000001',gen_random_uuid(),'X',1,'kg',current_date+1,'original',current_date+1,'refrigerated','not_required','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'restrição: refrigerado com "não exigida" recusado');
select throws_ok($$insert into batch_receipts(organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,storage_condition,temperature_status,timezone,created_by)
  values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000004','c5000000-0000-4000-8000-000000000001',gen_random_uuid(),'X',1,'kg',current_date+1,'original',current_date+1,'refrigerated','measured','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'restrição: medida sem temperatura recusada');
select throws_ok($$insert into batch_receipts(organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,temperature_status,timezone,created_by)
  values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c4000000-0000-4000-8000-000000000004','c5000000-0000-4000-8000-000000000001',gen_random_uuid(),'X',1,'kg',current_date+1,'original',current_date+1,'not_required','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'restrição: situação de medição sem conservação recusada');
select throws_ok($$insert into occurrences(organization_id,establishment_id,batch_id,kind,reason,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',pg_temp.batch('c7000000-0000-4000-8000-000000000211'),'temperature_not_measured','x','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23514','Ocorrência de temperatura só existe para recebimento sem medição.','ocorrência de temperatura em recebimento medido recusada');
select throws_ok($$insert into occurrences(organization_id,establishment_id,batch_id,kind,reason,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',pg_temp.batch('c7000000-0000-4000-8000-000000000221'),'temperature_not_measured','x','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23505',null,'segunda ocorrência de temperatura no mesmo recebimento recusada');
select throws_ok($$insert into occurrences(organization_id,establishment_id,batch_id,kind,handling_id,reason,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',pg_temp.batch('c7000000-0000-4000-8000-000000000221'),'late_handling',(select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000307'),'x','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23514','Ocorrência de registro tardio só existe para manipulação tardia.','ocorrência tardia em manipulação dentro da janela recusada');
select throws_ok($$insert into occurrences(organization_id,establishment_id,batch_id,kind,handling_id,reason,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c6000000-0000-4000-8000-000000000001','late_handling',(select id from container_handlings where intent_id='c7000000-0000-4000-8000-000000000511'),'x','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23505',null,'segunda ocorrência tardia na mesma manipulação recusada');
select throws_ok($$insert into occurrences(organization_id,establishment_id,batch_id,kind,reason,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c6000000-0000-4000-8000-000000000003','late_handling','x','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'ocorrência tardia sem manipulação recusada pela restrição');
select throws_ok($$insert into occurrences(organization_id,establishment_id,batch_id,kind,reason,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',pg_temp.batch('c7000000-0000-4000-8000-000000000222'),'temperature_not_measured',U&'\00A0','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'justificativa só com espaços recusada pela restrição');
select throws_ok($$insert into occurrence_decisions(organization_id,establishment_id,batch_id,occurrence_id,decision,reason,intent_id,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',pg_temp.batch('c7000000-0000-4000-8000-000000000222'),pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000222')),'released','x',gen_random_uuid(),'America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23505',null,'segunda decisão recusada pelo banco (único)');
select throws_ok($$insert into occurrence_decisions(organization_id,establishment_id,batch_id,occurrence_id,decision,reason,intent_id,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','c6000000-0000-4000-8000-000000000003',pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000223')),'released','x',gen_random_uuid(),'America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23503',null,'decisão com recebimento diferente do da ocorrência recusada pela FK');
select throws_ok($$insert into occurrence_decisions(organization_id,establishment_id,batch_id,occurrence_id,decision,reason,intent_id,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',pg_temp.batch('c7000000-0000-4000-8000-000000000221'),pg_temp.occ(pg_temp.batch('c7000000-0000-4000-8000-000000000221')),'approved','x',gen_random_uuid(),'America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'decisão fora da lista recusada pela restrição');
select throws_ok($$update occurrences set reason = 'outra' where batch_id = pg_temp.batch('c7000000-0000-4000-8000-000000000221')$$,'55000',null,'ocorrências não são alteradas');
select throws_ok($$delete from occurrences$$,'55000',null,'ocorrências não são apagadas');
select throws_ok($$truncate occurrences cascade$$,'55000',null,'ocorrências não são truncadas');
select throws_ok($$update occurrence_decisions set decision = 'rejected'$$,'55000',null,'decisões não são alteradas');
select throws_ok($$delete from occurrence_decisions$$,'55000',null,'decisões não são apagadas');
select throws_ok($$truncate occurrence_decisions$$,'55000',null,'decisões não são truncadas');

-- Invariantes finais ------------------------------------------------------------
select is((select count(*)::int from private.occurrence_problems()), 0, 'ocorrências coerentes com recebimentos e manipulações');
select is((select count(*)::int from private.stock_conservation_problems()), 0, 'conservação do estoque válida');
select is((select count(*)::int from private.container_balance_problems()), 0, 'saldo guardado igual ao histórico');

select * from finish();
rollback;
