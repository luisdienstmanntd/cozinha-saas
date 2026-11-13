-- Fase 6, fatia 6.2: painel e QR com saldo calculado no servidor (FASE_06_DESENHO 4.4, 7.3, 7.4; teste 11).
-- list_containers e container_expiry_summary são SECURITY INVOKER: a RLS é a única barreira.
-- O saldo lido vem de container_balances (plano B da 4.4), mantido por gatilho e conferido com o histórico.
-- Datas fixas e data de referência passada como parâmetro: o teste não envelhece (S-6).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ------------------------------------------------------------------
select has_function('public', 'list_containers', array['uuid','uuid','text','uuid','text','date','uuid','integer'], 'list_containers existe');
select has_function('public', 'container_expiry_summary', array['uuid','uuid','date'], 'container_expiry_summary existe');
select is(
  (select string_agg(p.proname || ':' || p.prosecdef || ':' || p.provolatile::text, ',' order by p.proname) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('list_containers', 'container_expiry_summary')),
  'container_expiry_summary:false:s,list_containers:false:s',
  'as duas funções são SECURITY INVOKER e stable (a RLS continua sendo a barreira)');
select ok(has_function_privilege('authenticated', 'public.list_containers(uuid,uuid,text,uuid,text,date,uuid,integer)', 'execute'), 'authenticated executa list_containers');
select ok(not has_function_privilege('anon', 'public.list_containers(uuid,uuid,text,uuid,text,date,uuid,integer)', 'execute'), 'anon não executa list_containers');
select ok(has_function_privilege('authenticated', 'public.container_expiry_summary(uuid,uuid,date)', 'execute'), 'authenticated executa container_expiry_summary');
select ok(not has_function_privilege('anon', 'public.container_expiry_summary(uuid,uuid,date)', 'execute'), 'anon não executa container_expiry_summary');
-- Plano B (4.4): saldo mantido na escrita em container_balances.
select has_table('public', 'container_balances', 'container_balances existe');
select ok((select relrowsecurity from pg_class where oid = 'public.container_balances'::regclass), 'container_balances tem RLS');
select is(
  (select coalesce(string_agg(r || ':' || p, ',' order by r, p), '')
     from unnest(array['anon','authenticated','service_role']) r
     cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    where has_table_privilege(r, 'public.container_balances', p)),
  'authenticated:SELECT,service_role:SELECT', 'container_balances: só leitura, e nada para anon');
select is(
  (select count(*)::int from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'container_balances_live_idx' and i.indpred is not null),
  1, 'índice parcial do painel só com saldo');
select has_index('public', 'container_balances', 'container_balances_scope_expiry_idx', array['organization_id','establishment_id','expiry_date','container_id'], 'índice do painel com esgotados');
select is(
  (select string_agg(g.tgname || ':' || g.tgenabled::text, ',' order by g.tgname) from pg_trigger g
    where g.tgname in ('container_balances_guard', 'containers_init_balance', 'stock_movements_apply_balance')),
  'container_balances_guard:A,containers_init_balance:A,stock_movements_apply_balance:A',
  'gatilhos do saldo existem e estão ENABLE ALWAYS');
select is_empty($$select * from private.container_balance_problems()$$, 'saldo registrado coincide com o histórico antes dos dados de teste');

-- Dados ---------------------------------------------------------------------
-- u1: owner de A; u2: member de A; u3: owner de B; u4: owner revogado de A.
insert into auth.users(id) values
 ('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002'),
 ('d1000000-0000-4000-8000-000000000003'),('d1000000-0000-4000-8000-000000000004');
insert into organizations(id,name) values
 ('d2000000-0000-4000-8000-00000000000a','A'),('d2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('d3000000-0000-4000-8000-00000000000a','d2000000-0000-4000-8000-00000000000a','UA1','America/Sao_Paulo'),
 ('d3000000-0000-4000-8000-00000000000c','d2000000-0000-4000-8000-00000000000a','UA2','America/Manaus'),
 ('d3000000-0000-4000-8000-00000000000b','d2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,revoked_at) values
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000001','owner',null),
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000002','member',null),
 ('d2000000-0000-4000-8000-00000000000b','d1000000-0000-4000-8000-000000000003','owner',null),
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000004','owner',now());
insert into products(id,organization_id,establishment_id,name,unit) values
 ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','Arroz agulhinha','kg'),
 ('d4000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','Feijão preto','kg'),
 ('d4000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000c','Arroz UA2','kg'),
 ('d4000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-00000000000b','Arroz B','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','FA'),
 ('d5000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000c','FA2'),
 ('d5000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-00000000000b','FB');

-- UA1 (data de referência 2026-11-13):
--  R1 Arroz 10 kg, vence 2026-11-10 (vencido), com derivado D1 de 4 kg que vence 2026-11-09 e teve descarte de 1.
--  R2 Feijão 5 kg, vence hoje.
--  R3 Arroz 2 kg, vence amanhã, consumido inteiro (sem saldo).
--  R4 Feijão 3 kg, vence 2026-11-20, consumo de 1 anulado (saldo 3).
--  R5 Arroz 1 kg, vence 2026-11-01, descartado inteiro (sem saldo).
insert into batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by) values
 ('d6000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000001','LOTE-A_1',10,'kg','2026-11-10','original','2026-11-10','America/Sao_Paulo','d1000000-0000-4000-8000-000000000001'),
 ('d6000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d4000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000002','F-77',5,'kg','2026-11-13','responsible',null,'America/Sao_Paulo','d1000000-0000-4000-8000-000000000001'),
 ('d6000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000003','LOTE-B',2,'kg','2026-11-14','original','2026-11-14','America/Sao_Paulo','d1000000-0000-4000-8000-000000000001'),
 ('d6000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d4000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000004','F-78',3,'kg','2026-11-20','original','2026-11-20','America/Sao_Paulo','d1000000-0000-4000-8000-000000000001'),
 ('d6000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000005','LOTE-C',1,'kg','2026-11-01','original','2026-11-01','America/Sao_Paulo','d1000000-0000-4000-8000-000000000001'),
 ('d6000000-0000-4000-8000-000000000006','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000c','d4000000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000003','d7000000-0000-4000-8000-000000000006','UA2-1',7,'kg','2026-11-10','original','2026-11-10','America/Manaus','d1000000-0000-4000-8000-000000000001'),
 ('d6000000-0000-4000-8000-000000000007','d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-00000000000b','d4000000-0000-4000-8000-000000000004','d5000000-0000-4000-8000-000000000004','d7000000-0000-4000-8000-000000000007','B-1',9,'kg','2026-11-10','original','2026-11-10','UTC','d1000000-0000-4000-8000-000000000003');

-- Derivado de teste (como em container_balance.test.sql: sem manipulação, inserido pelo dono das tabelas).
insert into containers(id,organization_id,establishment_id,batch_id,kind,parent_container_id,initial_quantity,expiry_date,created_by) values
 ('d9000000-0000-4000-8000-0000000000d1','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d6000000-0000-4000-8000-000000000001','derived',
  (select id from containers where batch_id='d6000000-0000-4000-8000-000000000001' and kind='integral'),4,'2026-11-09','d1000000-0000-4000-8000-000000000001');

insert into stock_movements(id,organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by,reverses_id) values
 ('d8000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d6000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-0000000000d1','d7000000-0000-4000-8000-000000000101','discard',1,'Teste','America/Sao_Paulo','d1000000-0000-4000-8000-000000000001',null),
 ('d8000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d6000000-0000-4000-8000-000000000003',(select id from containers where batch_id='d6000000-0000-4000-8000-000000000003'),'d7000000-0000-4000-8000-000000000103','consumption',2,null,'America/Sao_Paulo','d1000000-0000-4000-8000-000000000001',null),
 ('d8000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d6000000-0000-4000-8000-000000000004',(select id from containers where batch_id='d6000000-0000-4000-8000-000000000004'),'d7000000-0000-4000-8000-000000000104','consumption',1,null,'America/Sao_Paulo','d1000000-0000-4000-8000-000000000001',null),
 ('d8000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d6000000-0000-4000-8000-000000000005',(select id from containers where batch_id='d6000000-0000-4000-8000-000000000005'),'d7000000-0000-4000-8000-000000000105','discard',1,'Vencido','America/Sao_Paulo','d1000000-0000-4000-8000-000000000001',null);
insert into stock_movements(id,organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by,reverses_id) values
 ('d8000000-0000-4000-8000-000000000014','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d6000000-0000-4000-8000-000000000004',(select id from containers where batch_id='d6000000-0000-4000-8000-000000000004'),'d7000000-0000-4000-8000-000000000114','reversal',1,'Engano','America/Sao_Paulo','d1000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000004');

-- Saldo igual ao de private.container_balance (6.1) para todo recipiente, inclusive os sem saldo.
select is(
  (select count(*)::int from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','all',null,null,null,null,200) l
    where l.balance is distinct from private.container_balance(l.container_id)),
  0, 'saldo de list_containers coincide com private.container_balance em todos os recipientes');
select is(
  (select count(*)::int from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','all',null,null,null,null,200)),
  6, 'todos os recipientes da unidade aparecem com o filtro all (5 integrais e 1 derivado)');

-- Saldo mantido: coincide com o histórico; só os gatilhos escrevem.
select is_empty($$select * from private.container_balance_problems()$$, 'saldo registrado coincide com o histórico depois de recebimentos, derivado, saídas e anulação');
select is(
  (select balance from container_balances where container_id = 'd9000000-0000-4000-8000-0000000000d1'),
  3::numeric, 'derivado: 4 iniciais menos 1 descartado');
select throws_ok($$update container_balances set balance = 99 where container_id = 'd9000000-0000-4000-8000-0000000000d1'$$, '55000', null, 'dono das tabelas não altera saldo diretamente');
select throws_ok($$delete from container_balances where container_id = 'd9000000-0000-4000-8000-0000000000d1'$$, '55000', null, 'dono das tabelas não apaga saldo');
select throws_ok($$truncate container_balances$$, '55000', null, 'TRUNCATE de saldo recusado');
select throws_ok($$insert into container_balances(container_id,organization_id,establishment_id,batch_id,expiry_date,balance)
  select id,organization_id,establishment_id,batch_id,expiry_date,1 from containers where id='d9000000-0000-4000-8000-0000000000d1'$$, '55000', null, 'INSERT direto de saldo recusado');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,timezone,created_by) values
  ('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d6000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-0000000000d1','d7000000-0000-4000-8000-0000000001ff','consumption',3.001,'America/Sao_Paulo','d1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'movimento inserido direto acima do saldo é recusado pela restrição (saldo nunca negativo)');
select is(
  (select balance from container_balances where container_id = 'd9000000-0000-4000-8000-0000000000d1'),
  3::numeric, 'tentativas recusadas não mudaram o saldo');
set local role service_role;
select throws_ok($$update container_balances set balance = 99$$, '42501', null, 'service_role não altera saldo');
select throws_ok($$delete from container_balances$$, '42501', null, 'service_role não apaga saldo');
reset role;

-- Proprietário de A ----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select results_eq(
  $$select container_id, balance from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a')$$,
  $$values ('d9000000-0000-4000-8000-0000000000d1'::uuid, 3::numeric),
           ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000001' and kind='integral'), 10::numeric),
           ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000002'), 5::numeric),
           ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000004'), 3::numeric)$$,
  'padrão: só recipientes com saldo, do mais urgente para o mais distante (vencidos primeiro)');
select results_eq(
  $$select container_id, balance from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','all')$$,
  $$values ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000005'), 0::numeric),
           ('d9000000-0000-4000-8000-0000000000d1'::uuid, 3::numeric),
           ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000001' and kind='integral'), 10::numeric),
           ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000002'), 5::numeric),
           ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000003'), 0::numeric),
           ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000004'), 3::numeric)$$,
  'all: inclui esgotados, na mesma ordem por validade');
select results_eq(
  $$select short_code ~ '^C-[0-9]{6,}$', kind, parent_container_id is not null, batch_id, product_name, unit, source_code,
           expiry_date, expiry_origin, batch_expiry_origin, initial_quantity, timezone
      from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','batch','d6000000-0000-4000-8000-000000000001')$$,
  $$values (true, 'derived'::text, true, 'd6000000-0000-4000-8000-000000000001'::uuid, 'Arroz agulhinha'::text, 'kg'::text, 'LOTE-A_1'::text,
            '2026-11-09'::date, 'handling'::text, 'original'::text, 4::numeric, 'America/Sao_Paulo'::text),
           (true, 'integral'::text, false, 'd6000000-0000-4000-8000-000000000001'::uuid, 'Arroz agulhinha'::text, 'kg'::text, 'LOTE-A_1'::text,
            '2026-11-10'::date, 'receipt'::text, 'original'::text, 10::numeric, 'America/Sao_Paulo'::text)$$,
  'filtro batch: recipientes do recebimento com produto, lote, tipo, validade efetiva e origem dela');
select results_eq(
  $$select container_id, balance from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','container',(select id from containers where batch_id='d6000000-0000-4000-8000-000000000003'))$$,
  $$values ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000003'), 0::numeric)$$,
  'filtro container (rota do QR): devolve o recipiente mesmo sem saldo, com saldo 0');

select throws_ok($$update container_balances set balance = 99$$, '42501', null, 'proprietário não altera saldo pela API');
select throws_ok($$insert into container_balances(container_id,organization_id,establishment_id,batch_id,expiry_date,balance) values (gen_random_uuid(),'d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','d6000000-0000-4000-8000-000000000001','2026-11-09',1)$$, '42501', null, 'proprietário não insere saldo pela API');
select is((select count(*)::int from container_balances), 7, 'proprietário de A lê os saldos das duas unidades de A, e só eles');

-- Paginação por (validade, id), sem repetição nem salto.
select results_eq(
  $$select container_id from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,null,null,null,2)$$,
  $$values ('d9000000-0000-4000-8000-0000000000d1'::uuid), ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000001' and kind='integral'))$$,
  'primeira página respeita o limite');
select results_eq(
  $$select container_id from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,null,'2026-11-10',
      (select id from containers where batch_id='d6000000-0000-4000-8000-000000000001' and kind='integral'),2)$$,
  $$values ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000002')), ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000004'))$$,
  'página seguinte começa depois do cursor');
select is_empty(
  $$select 1 from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,null,'2026-11-20',
      (select id from containers where batch_id='d6000000-0000-4000-8000-000000000004'),2)$$,
  'depois do último, página vazia');

-- Busca no servidor (produto, lote, código curto, ID do recipiente), sem curingas do usuário.
select results_eq(
  $$select batch_id from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,'  FEIJ ')$$,
  $$values ('d6000000-0000-4000-8000-000000000002'::uuid), ('d6000000-0000-4000-8000-000000000004'::uuid)$$,
  'busca por produto ignora maiúsculas e espaços nas pontas');
select results_eq(
  $$select batch_id from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,'f-78')$$,
  $$values ('d6000000-0000-4000-8000-000000000004'::uuid)$$, 'busca por lote');
select results_eq(
  $$select container_id from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,
      (select short_code from containers where batch_id='d6000000-0000-4000-8000-000000000002'))$$,
  $$values ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000002'))$$, 'busca por código curto');
select results_eq(
  $$select container_id from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,
      (select upper(id::text) from containers where batch_id='d6000000-0000-4000-8000-000000000004'))$$,
  $$values ((select id from containers where batch_id='d6000000-0000-4000-8000-000000000004'))$$, 'busca pelo ID do recipiente (D-037)');
select results_eq(
  $$select batch_id from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,'a_1')$$,
  $$values ('d6000000-0000-4000-8000-000000000001'::uuid), ('d6000000-0000-4000-8000-000000000001'::uuid)$$,
  'sublinhado da busca é literal (casa LOTE-A_1)');
select is_empty(
  $$select 1 from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,'%')$$,
  'percentual da busca é literal, não curinga');
select is_empty(
  $$select 1 from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,'LOTE-B')$$,
  'busca sem esgotados não encontra recebimento consumido');
select is(
  (select count(*)::int from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','all',null,'LOTE-B')),
  1, 'busca com esgotados encontra');

-- Validação de parâmetros.
select throws_ok($$select * from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,null,null,null,0)$$, '22023', null, 'limite 0 recusado');
select throws_ok($$select * from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,null,null,null,201)$$, '22023', null, 'limite acima de 200 recusado');
select lives_ok($$select * from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,null,null,null,200)$$, 'limite 200 aceito');
select throws_ok($$select * from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','tudo')$$, '22023', null, 'filtro desconhecido recusado');
select throws_ok($$select * from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','batch')$$, '22023', null, 'filtro batch sem identificador recusado');
select throws_ok($$select * from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance','d6000000-0000-4000-8000-000000000001')$$, '22023', null, 'identificador sem filtro batch/container recusado');
select throws_ok($$select * from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,null,'2026-11-10',null)$$, '22023', null, 'cursor incompleto recusado');
select throws_ok($$select * from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','with_balance',null,repeat('a',121))$$, '22023', null, 'busca acima de 120 caracteres recusada');
select throws_ok($$select * from list_containers(null,'d3000000-0000-4000-8000-00000000000a')$$, '22023', null, 'escopo obrigatório');
select throws_ok($$select * from container_expiry_summary('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a',null)$$, '22023', null, 'resumo exige data de referência');

-- Contagens só sobre recipientes com saldo.
select results_eq(
  $$select overdue, due_today, due_tomorrow, later from container_expiry_summary('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','2026-11-13')$$,
  $$values (2::bigint, 1::bigint, 0::bigint, 1::bigint)$$,
  'contagens só com saldo: R3 (amanhã) e R5 (vencido) esgotados ficam fora');
select results_eq(
  $$select overdue, due_today, due_tomorrow, later from container_expiry_summary('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','2026-11-19')$$,
  $$values (3::bigint, 0::bigint, 1::bigint, 0::bigint)$$,
  'contagens seguem a data de referência informada');

-- Escopo: outra unidade da mesma empresa e mistura de escopos.
select results_eq(
  $$select batch_id from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000c')$$,
  $$values ('d6000000-0000-4000-8000-000000000006'::uuid)$$, 'outra unidade da mesma empresa só vê o que é dela');
select is_empty(
  $$select 1 from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000c','container','d9000000-0000-4000-8000-0000000000d1')$$,
  'recipiente de UA1 não aparece pelo escopo de UA2');
select is_empty(
  $$select 1 from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000b')$$,
  'empresa A com unidade de B: nada');
select is_empty(
  $$select 1 from list_containers('d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-00000000000b')$$,
  'owner de A não lê B');
reset role;

-- Member de A: leitura igual à do proprietário (D-019 restringe só a escrita).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a')), 4, 'member lê o painel da unidade');
select results_eq(
  $$select overdue, due_today, due_tomorrow, later from container_expiry_summary('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','2026-11-13')$$,
  $$values (2::bigint, 1::bigint, 0::bigint, 1::bigint)$$, 'member lê as contagens');
reset role;

-- Owner de B com IDs de A: nada, inclusive pelo ID do recipiente e do recebimento (teste 11).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from container_balances), 1, 'B lê só o próprio saldo na tabela (RLS)');
select is_empty($$select 1 from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','all')$$, 'B não lista A');
select is_empty($$select 1 from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','container','d9000000-0000-4000-8000-0000000000d1')$$, 'B não lê recipiente de A pelo ID');
select is_empty($$select 1 from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','batch','d6000000-0000-4000-8000-000000000001')$$, 'B não lê recebimento de A pelo ID');
select is_empty($$select 1 from list_containers('d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-00000000000a','all')$$, 'B com unidade de A: nada');
select is_empty($$select 1 from list_containers('d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-00000000000b','container','d9000000-0000-4000-8000-0000000000d1')$$, 'recipiente de A pelo escopo de B: nada');
select results_eq(
  $$select overdue, due_today, due_tomorrow, later from container_expiry_summary('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','2026-11-13')$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$, 'B não vê contagens de A');
select results_eq(
  $$select batch_id, balance from list_containers('d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-00000000000b')$$,
  $$values ('d6000000-0000-4000-8000-000000000007'::uuid, 9::numeric)$$, 'B lê o próprio painel');
reset role;

-- Owner revogado de A: nada.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from container_balances), 0, 'revogado não lê saldo na tabela');
select is_empty($$select 1 from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','all')$$, 'revogado não lista');
select results_eq(
  $$select overdue, due_today, due_tomorrow, later from container_expiry_summary('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','2026-11-13')$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$, 'revogado não vê contagens');
reset role;

-- Anônimo: não executa.
set local role anon;
select throws_ok($$select * from container_balances$$, '42501', null, 'anon não lê saldo');
select throws_ok($$select * from list_containers('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a')$$, '42501', null, 'anon não executa list_containers');
select throws_ok($$select * from container_expiry_summary('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-00000000000a','2026-11-13')$$, '42501', null, 'anon não executa container_expiry_summary');
reset role;

select * from finish();
rollback;
