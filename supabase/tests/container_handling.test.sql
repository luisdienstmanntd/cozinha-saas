-- Fase 6, fatia 6.3: manipulação no banco (FASE_06_DESENHO.md 4.1–4.5, 5.1 e testes 3 a 8 e 10 da
-- seção 8). Abrir ou porcionar retira saldo da origem e cria recipientes derivados do mesmo
-- recebimento, numa única operação auditada. Datas relativas a hoje e a now() (início da transação),
-- para que o teste não envelheça (S-6).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ------------------------------------------------------------------
select has_table('public', 'container_handlings', 'tabela de manipulações existe');
select ok((select relrowsecurity from pg_class where oid = 'public.container_handlings'::regclass), 'container_handlings tem RLS');
select is(
  (select coalesce(string_agg(r.role || ':' || p.priv, ',' order by r.role, p.priv), '')
     from unnest(array['anon', 'authenticated', 'service_role']) r(role)
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
    where has_table_privilege(r.role, 'public.container_handlings', p.priv)),
  'authenticated:SELECT,service_role:SELECT', 'manipulações: só leitura para authenticated e service_role; nada para anon');
select lives_ok($$select private.assert_history_protected()$$, 'proteção do histórico inclui container_handlings');
select ok((select not prosecdef from pg_proc where oid = 'public.handle_container(uuid,uuid,uuid,text,numeric[],date,text,timestamptz,uuid,text,text,text,text,uuid)'::regprocedure), 'wrapper público de handle_container é SECURITY INVOKER');
select ok((select prosecdef from pg_proc where oid = 'private.handle_container(uuid,uuid,uuid,text,numeric[],date,text,timestamptz,uuid,text,text,text,text,uuid)'::regprocedure), 'núcleo de handle_container é SECURITY DEFINER');
select ok(not has_function_privilege('anon', 'public.handle_container(uuid,uuid,uuid,text,numeric[],date,text,timestamptz,uuid,text,text,text,text,uuid)', 'execute'), 'anon não executa handle_container');
select ok(not has_function_privilege('anon', 'public.set_member_display_name(uuid,uuid,text)', 'execute'), 'anon não executa set_member_display_name');
select is(private.handling_late_window(), interval '2 hours', 'janela provisória de 2 horas num único lugar (D-031)');
select col_is_null('public', 'memberships', 'display_name', 'nome de exibição é opcional no vínculo');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'container_handlings_expiry_not_after_source_check')
    = 'CHECK ((expiry_date <= source_expiry_date))', 'validade após abertura nunca posterior à da origem é restrição do banco (I-2c)');

-- Dados ---------------------------------------------------------------------
-- u1 owner de A e de B; u2 member de A ("Bia"); u3 owner revogado de A; u4 owner só de B;
-- u5 member de A sem nome; u6 member revogado de A ("Rui"); u7 member de B ("Zeca"); u8 member de A ("Caio").
insert into auth.users(id) values
 ('e1000000-0000-4000-8000-000000000001'),('e1000000-0000-4000-8000-000000000002'),('e1000000-0000-4000-8000-000000000003'),
 ('e1000000-0000-4000-8000-000000000004'),('e1000000-0000-4000-8000-000000000005'),('e1000000-0000-4000-8000-000000000006'),
 ('e1000000-0000-4000-8000-000000000007'),('e1000000-0000-4000-8000-000000000008');
insert into organizations(id,name) values
 ('e2000000-0000-4000-8000-00000000000a','A'),('e2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('e3000000-0000-4000-8000-0000000000a1','e2000000-0000-4000-8000-00000000000a','UA1','America/Sao_Paulo'),
 ('e3000000-0000-4000-8000-0000000000a2','e2000000-0000-4000-8000-00000000000a','UA2','America/Sao_Paulo'),
 ('e3000000-0000-4000-8000-0000000000b1','e2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,revoked_at,display_name) values
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000001','owner',null,'Luis'),
 ('e2000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-000000000001','owner',null,'Luis'),
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000002','member',null,'Bia'),
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000003','owner',now(),'Ex'),
 ('e2000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-000000000004','owner',null,'Outro'),
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000005','member',null,null),
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000006','member',now(),'Rui'),
 ('e2000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-000000000007','member',null,'Zeca'),
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000008','member',null,'Caio');
insert into products(id,organization_id,establishment_id,name,unit) values
 ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','Queijo','kg'),
 ('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','Ovo','un'),
 ('e4000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a2','Leite','l'),
 ('e4000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-00000000000b','e3000000-0000-4000-8000-0000000000b1','Manteiga','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','FA'),
 ('e5000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a2','FA2'),
 ('e5000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-00000000000b','e3000000-0000-4000-8000-0000000000b1','FB');
-- Recebimentos de ontem (os integrais nascem pelo gatilho com a mesma data):
--  R1 Queijo 100 kg, vence em 10 dias   R2 Ovo 12 un, vence em 10 dias   R3 Leite (UA2) 5 l
--  R4 Manteiga (B) 5 kg                  R5 Queijo 3 kg, venceu ontem      R6 Queijo 2 kg, recebido há 1 hora
--  R7 Queijo 4 kg, recebido há 5 dias, vence em 1 dia                      R8 Queijo 10 kg (conservação)
insert into batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by,created_at) values
 ('e6000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001','Q-1',100,'kg',current_date+10,'original',current_date+10,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('e6000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000002','O-1',12,'un',current_date+10,'original',current_date+10,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('e6000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a2','e4000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000003','e7000000-0000-4000-8000-000000000003','L-1',5,'l',current_date+10,'original',current_date+10,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('e6000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-00000000000b','e3000000-0000-4000-8000-0000000000b1','e4000000-0000-4000-8000-000000000004','e5000000-0000-4000-8000-000000000004','e7000000-0000-4000-8000-000000000004','M-1',5,'kg',current_date+10,'original',current_date+10,'UTC','e1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('e6000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000005','Q-V',3,'kg',current_date-1,'original',current_date-1,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('e6000000-0000-4000-8000-000000000006','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000006','Q-H',2,'kg',current_date+10,'original',current_date+10,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001',now()-interval '1 hour'),
 ('e6000000-0000-4000-8000-000000000007','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000007','Q-A',4,'kg',current_date+1,'original',current_date+1,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001',now()-interval '5 days'),
 ('e6000000-0000-4000-8000-000000000008','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000008','Q-C',10,'kg',current_date+10,'original',current_date+10,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001',now()-interval '1 day');
-- Uma baixa comum em R1 (para o teste de identificador reaproveitado).
insert into stock_movements(id,organization_id,establishment_id,batch_id,intent_id,kind,quantity,timezone,created_by) values
 ('e8000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000101','consumption',1,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001');

-- Atalhos: integral de um recebimento e chamada com valores comuns (organização A, unidade UA1,
-- manipulado por Bia há 10 minutos, refrigerado).
create function pg_temp.integral(p_batch uuid) returns uuid language sql stable as $$
  select id from public.containers where batch_id = p_batch and kind = 'integral' $$;
create function pg_temp.h(p_source uuid, p_kind text, p_q numeric[], p_expiry date, p_remainder text, p_intent uuid,
  p_handled_at timestamptz default now() - interval '10 minutes',
  p_by uuid default 'e1000000-0000-4000-8000-000000000002', p_storage text default 'refrigerated',
  p_reason text default null, p_note text default null, p_late text default null,
  p_org uuid default 'e2000000-0000-4000-8000-00000000000a', p_est uuid default 'e3000000-0000-4000-8000-0000000000a1')
returns uuid language sql as $$
  select public.handle_container(p_org, p_est, p_source, p_kind, p_q, p_expiry, p_storage, p_handled_at, p_by,
    p_remainder, p_reason, p_note, p_late, p_intent) $$;
grant execute on function pg_temp.integral(uuid), pg_temp.h(uuid,text,numeric[],date,text,uuid,timestamptz,uuid,text,text,text,text,uuid,uuid) to authenticated, anon;

set local role authenticated;

-- Teste 3: matriz de papéis ------------------------------------------------
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000201')$$,'42501',null,'member não manipula');
select throws_ok($$select set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000002','Bia')$$,'42501',null,'member não define nome de exibição');
select is((select count(*) from memberships where organization_id='e2000000-0000-4000-8000-00000000000a'), 1::bigint, 'member vê só o próprio vínculo (e nome), não o dos colegas (I-10b)');
select is((select display_name from memberships where organization_id='e2000000-0000-4000-8000-00000000000a'), 'Bia', 'member lê o próprio nome de exibição');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000202')$$,'42501',null,'owner revogado não manipula');
select throws_ok($$select set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000002','Bia')$$,'42501',null,'owner revogado não define nome');

select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select pg_temp.h('e9000000-0000-4000-8000-0000000000ff','opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000203')$$,'42501',null,'owner de outra empresa não manipula em A');
select throws_ok($$select set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000002','Bia')$$,'42501',null,'owner de outra empresa não define nome em A');

-- u1 é owner de A e de B: mistura de escopos recebe a mesma recusa, sem revelar existência.
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000204',p_org=>'e2000000-0000-4000-8000-00000000000b',p_est=>'e3000000-0000-4000-8000-0000000000b1')$$,
  '23503','Recipiente não encontrado.','recipiente de A não é manipulado sob B');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000205',p_est=>'e3000000-0000-4000-8000-0000000000a2')$$,
  '23503','Recipiente não encontrado.','recipiente de UA1 não é manipulado sob UA2 (mesma empresa)');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000206',p_est=>'e3000000-0000-4000-8000-0000000000b1')$$,
  '23503','Recipiente não encontrado.','unidade de B sob a empresa A');
select throws_ok($$select pg_temp.h('e9000000-0000-4000-8000-0000000000ff','opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000207')$$,
  '23503','Recipiente não encontrado.','recipiente inexistente: mesma mensagem');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000004'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000208',p_by=>'e1000000-0000-4000-8000-000000000002',p_org=>'e2000000-0000-4000-8000-00000000000b',p_est=>'e3000000-0000-4000-8000-0000000000b1')$$,
  '22023',null,'pessoa de A não manipula em B (vínculo de outra empresa)');
select is((select count(*) from container_handlings), 0::bigint, 'nenhuma manipulação criada pelas recusas');

-- Nome de exibição -----------------------------------------------------------
select is(set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000005', U&'\00A0 Duda  '), 'Duda', 'owner define nome de exibição (espaços invisíveis aparados)');
select is(set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000005','Duda'), 'Duda', 'mesmo nome de novo: aceito sem nova auditoria');
select results_eq(
  $$select entity, field, old_value, new_value, changed_by from entity_changes where entity='membership' order by changed_at$$,
  $$values ('membership'::text, 'display_name'::text, null::text, 'Duda'::text, 'e1000000-0000-4000-8000-000000000001'::uuid)$$,
  'definição do nome é auditada em entity_changes (uma vez)');
select throws_ok($$select set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000005',U&'\3000\00A0')$$,'22023',null,'nome só com espaços invisíveis recusado');
select throws_ok($$select set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000005',repeat('a',41))$$,'22023',null,'nome com mais de 40 caracteres recusado');
select throws_ok($$select set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000006','Rui 2')$$,'23503',null,'vínculo revogado não recebe nome');
select throws_ok($$select set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000007','Zeca 2')$$,'23503',null,'pessoa de outra empresa não recebe nome por A');
select throws_ok($$update memberships set display_name='X' where user_id='e1000000-0000-4000-8000-000000000002'$$,'42501',null,'owner não altera vínculo diretamente');
-- Volta o nome nulo de u5 para os testes de "sem nome" (como dono das tabelas).
reset role;
update memberships set display_name = null where user_id = 'e1000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from entity_changes), 0::bigint, 'member não lê a auditoria de nomes');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Teste 5: abertura ----------------------------------------------------------
select lives_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{4}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000301',p_note=>'  Abertura da peça 1  ')$$,
  'abertura parcial do integral com sobra fechada');
select results_eq(
  $$select kind, portion_count, total_quantity, expiry_date, storage, remainder, remainder_quantity, remainder_intent_id, handled_by, handled_by_name, created_by, note, late, source_expiry_date, timezone
      from container_handlings where intent_id='e7000000-0000-4000-8000-000000000301'$$,
  $$values ('opening'::text, 1::smallint, 4::numeric, current_date+5, 'refrigerated'::text, 'sealed'::text, 95::numeric, null::uuid,
            'e1000000-0000-4000-8000-000000000002'::uuid, 'Bia'::text, 'e1000000-0000-4000-8000-000000000001'::uuid, 'Abertura da peça 1'::text, false, current_date+10, 'America/Sao_Paulo'::text)$$,
  'manipulação guarda tipo, quantidades, validade, conservação, sobra, quem manipulou (com nome copiado) e quem registrou');
select results_eq(
  $$select c.kind, c.parent_container_id, c.position, c.initial_quantity, c.expiry_date, c.expiry_origin, c.storage, c.handled_at = h.handled_at, c.short_code ~ '^C-[0-9]{6,}$', c.batch_id
      from containers c join container_handlings h on h.id = c.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000301'$$,
  $$values ('derived'::text, pg_temp.integral('e6000000-0000-4000-8000-000000000001'), 1::smallint, 4::numeric, current_date+5, 'handling'::text, 'refrigerated'::text, true, true, 'e6000000-0000-4000-8000-000000000001'::uuid)$$,
  'um derivado do mesmo recebimento, com ID e código curto próprios, validade e horário da manipulação');
select results_eq(
  $$select m.kind, m.container_id, m.quantity, m.intent_id, m.reason from stock_movements m join container_handlings h on h.id = m.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000301'$$,
  $$values ('transfer'::text, pg_temp.integral('e6000000-0000-4000-8000-000000000001'), 4::numeric, 'e7000000-0000-4000-8000-000000000301'::uuid, null::text)$$,
  'uma transferência na origem, com o mesmo identificador da manipulação (I-3)');
select results_eq(
  $$select balance from container_balances where container_id = pg_temp.integral('e6000000-0000-4000-8000-000000000001')
    union all select balance from container_balances cb join containers c on c.id = cb.container_id join container_handlings h on h.id = c.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000301'$$,
  $$values (95::numeric), (4::numeric)$$, 'origem fica com 95 kg (100 − 1 consumido − 4) e o derivado com 4 kg');

-- Porcionamento de derivado: sobra precisa virar porção ou descarte.
create temporary table d1 on commit drop as
  select c.id from containers c join container_handlings h on h.id = c.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000301';
select throws_ok($$select pg_temp.h((select id from d1),'portioning','{1.5,1.5}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000302')$$,
  '22023','Só a embalagem original fechada mantém a sobra na origem; inclua a sobra como porção ou descarte.','teste 7: sobra fechada em origem derivada recusada');
select throws_ok($$select pg_temp.h((select id from d1),'portioning','{1.5,1.5}',current_date+5,'none','e7000000-0000-4000-8000-000000000302')$$,
  '22023','Informe o que acontece com a sobra.','teste 7: sobra sem tratamento recusada');
select throws_ok($$select pg_temp.h((select id from d1),'portioning','{1.5,1.5}',current_date+5,'discard','e7000000-0000-4000-8000-000000000302',p_reason=>U&'\00A0\2003')$$,
  '22023',null,'descarte de sobra com motivo só de espaços invisíveis recusado');
select throws_ok($$select pg_temp.h((select id from d1),'portioning','{1.5,1.5}',current_date+5,'discard','e7000000-0000-4000-8000-000000000302',p_reason=>'Sobra',p_handled_at=>now()-interval '20 minutes')$$,
  '22023','O horário da manipulação não pode ser anterior ao do recipiente de origem.','derivado não é manipulado antes do horário da manipulação que o criou');
select lives_ok($$select pg_temp.h((select id from d1),'portioning','{1.5,1.5}',current_date+5,'discard','e7000000-0000-4000-8000-000000000302',p_reason=>'Sobra pequena')$$,
  'porcionamento de derivado com descarte da sobra');
select results_eq(
  $$select m.kind, m.container_id, m.quantity, m.reason, m.intent_id = h.remainder_intent_id, m.created_by from stock_movements m join container_handlings h on h.id = m.handling_id
     where h.intent_id='e7000000-0000-4000-8000-000000000302' order by m.kind$$,
  $$values ('discard'::text, (select id from d1), 1::numeric, 'Sobra pequena'::text, true, 'e1000000-0000-4000-8000-000000000001'::uuid),
           ('transfer'::text, (select id from d1), 3::numeric, null::text, false, 'e1000000-0000-4000-8000-000000000001'::uuid)$$,
  'teste 7: descarte de sobra cria exatamente um discard na origem com o remainder_intent_id');
select is((select balance from container_balances where container_id=(select id from d1)), 0::numeric, 'origem derivada zerada (3 em porções + 1 descartado)');
select results_eq(
  $$select c.position, c.initial_quantity, c.parent_container_id from containers c join container_handlings h on h.id=c.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000302' order by c.position$$,
  $$values (1::smallint, 1.5::numeric, (select id from d1)), (2::smallint, 1.5::numeric, (select id from d1))$$,
  'porções numeradas ("porção 1 de 2") e filhas do derivado');
select throws_ok($$select pg_temp.h((select id from d1),'opening','{0.5}',current_date+5,'none','e7000000-0000-4000-8000-000000000303')$$,
  '22023','Recipiente sem saldo registrado.','origem sem saldo não é manipulada');

-- Limites de porções e quantidades.
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'portioning',array_fill(0.5::numeric, array[21]),current_date+5,'sealed','e7000000-0000-4000-8000-000000000304')$$,
  '22023',null,'21 porções pedidas recusadas (limite de 20 por operação)');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'portioning','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000304')$$,
  '22023',null,'porcionamento com uma porção recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1,1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000304')$$,
  '22023',null,'abertura com duas quantidades recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'portion','e7000000-0000-4000-8000-000000000304')$$,
  '22023',null,'sobra como porção só no porcionamento');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{95.001}',current_date+5,'none','e7000000-0000-4000-8000-000000000304')$$,
  '22023','Quantidade excede saldo registrado.','soma acima do saldo recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'portioning','{1,0}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000304')$$,
  '22023',null,'porção zero recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'portioning','{1,null}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000304')$$,
  '22023',null,'porção nula recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{0.0001}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000304')$$,
  '22023',null,'precisão acima de 3 casas recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000304',p_storage=>'quente')$$,
  '22023',null,'conservação desconhecida recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000002'),'opening','{1.5}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000304')$$,
  '22023','Quantidade inválida.','quantidade fracionária em un recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000002'),'opening','{12}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000304')$$,
  '22023','Não há sobra: as porções levam todo o saldo.','sobra declarada sem sobra real recusada');
select lives_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000002'),'portioning',array_fill(1::numeric, array[11]),current_date+5,'portion','e7000000-0000-4000-8000-000000000305')$$,
  'porcionamento em un: 11 porções de 1 e a sobra (1) como porção 12');
select results_eq(
  $$select h.portion_count, h.remainder, h.remainder_quantity, h.total_quantity, (select count(*)::int from containers c where c.handling_id=h.id), (select initial_quantity from containers c where c.handling_id=h.id and c.position=12)
      from container_handlings h where h.intent_id='e7000000-0000-4000-8000-000000000305'$$,
  $$values (11::smallint, 'portion'::text, 1::numeric, 12::numeric, 12, 1::numeric)$$,
  'sobra como porção: conta no total e ocupa a posição seguinte');

-- 20 porções aceitas, e a 21ª só como sobra (R8, 10 kg).
select lives_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000003'),'portioning',array_fill(0.2::numeric, array[20]),current_date+5,'portion','e7000000-0000-4000-8000-000000000306',p_est=>'e3000000-0000-4000-8000-0000000000a2')$$,
  '20 porções aceitas, com a sobra como 21ª (UA2)');
select results_eq(
  $$select count(*)::int, max(c.position)::int, sum(c.initial_quantity) from containers c join container_handlings h on h.id=c.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000306'$$,
  $$values (21, 21, 5::numeric)$$, '21 derivados: 20 porções de 0,2 l e a sobra de 1 l na posição 21');
select is((select balance from container_balances where container_id=pg_temp.integral('e6000000-0000-4000-8000-000000000003')), 0::numeric, 'origem zerada pelo porcionamento');

-- Validade -------------------------------------------------------------------
select lives_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+10,'sealed','e7000000-0000-4000-8000-000000000401')$$,
  'validade igual à da origem aceita');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+11,'sealed','e7000000-0000-4000-8000-000000000402')$$,
  '22023','A validade após abertura não pode passar da validade do recipiente de origem.','validade posterior à origem recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+11,'sealed','e7000000-0000-4000-8000-000000000402',p_storage=>'frozen')$$,
  '22023','A validade após abertura não pode passar da validade do recipiente de origem.','congelar não prorroga validade (Q2)');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date-1,'sealed','e7000000-0000-4000-8000-000000000402')$$,
  '22023','A validade após abertura não pode ser anterior à data da manipulação nem à do registro.','validade anterior ao registro recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000005'),'opening','{1}',current_date,'sealed','e7000000-0000-4000-8000-000000000402')$$,
  '22023','Recipiente de origem vencido na data da manipulação; manipular não recupera validade.','origem vencida na data da manipulação recusada');

-- Teste 6: horário ----------------------------------------------------------
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000501',p_handled_at=>now()+interval '1 minute')$$,
  '22023','O horário da manipulação não pode estar no futuro.','horário futuro recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000006'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000501',p_handled_at=>now()-interval '90 minutes')$$,
  '22023','O horário da manipulação não pode ser anterior ao do recipiente de origem.','horário anterior ao recebimento recusado');
select lives_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000502',p_handled_at=>now()-interval '2 hours')$$,
  'exatamente 2 horas antes do registro: aceito');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000503',p_handled_at=>now()-interval '2 hours 1 minute')$$,
  '22023','Manipulação registrada mais de 2 horas depois de feita ainda não é aceita. Siga o procedimento da cozinha.','2 horas e 1 minuto: recusado nesta fatia (ocorrência só na 6.5a)');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000503',p_handled_at=>now()-interval '3 hours',p_late=>'Esqueci de registrar')$$,
  '22023',null,'justificativa de atraso ainda não é aceita');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000503',p_late=>'Justificativa')$$,
  '22023',null,'justificativa de atraso dentro da janela também é recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000503',p_handled_at=>'infinity')$$,
  '22023',null,'horário infinito recusado');

-- Quem manipulou -------------------------------------------------------------
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000601',p_by=>'e1000000-0000-4000-8000-000000000004')$$,
  '22023','A pessoa que manipulou precisa ter vínculo ativo com a empresa.','pessoa sem vínculo com a empresa recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000601',p_by=>'e1000000-0000-4000-8000-000000000007')$$,
  '22023','A pessoa que manipulou precisa ter vínculo ativo com a empresa.','membro de outra empresa recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000601',p_by=>'e1000000-0000-4000-8000-000000000006')$$,
  '22023','A pessoa que manipulou precisa ter vínculo ativo com a empresa.','vínculo revogado recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000601',p_by=>'e1000000-0000-4000-8000-000000000005')$$,
  '22023','Defina o nome de exibição da pessoa que manipulou antes de registrar.','pessoa sem nome de exibição recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000601',p_note=>U&'\00A0\3000')$$,
  '22023',null,'observação só com espaços invisíveis recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000601',p_note=>repeat('x',201))$$,
  '22023',null,'observação acima de 200 caracteres recusada');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000601',p_reason=>'Motivo sem descarte')$$,
  '22023',null,'motivo de descarte sem descarte de sobra recusado');
select lives_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{2}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000602',p_by=>'e1000000-0000-4000-8000-000000000008')$$,
  'manipulado por Caio (member) e registrado pelo owner');
-- Caio muda de nome e depois perde o vínculo: a manipulação guarda o nome do momento.
select is(set_member_display_name('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000008','Caio S.'), 'Caio S.', 'nome de Caio alterado');
select is((select handled_by_name from container_handlings where intent_id='e7000000-0000-4000-8000-000000000602'), 'Caio', 'manipulação mantém o nome copiado depois da troca');
select is(pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{2}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000602',p_by=>'e1000000-0000-4000-8000-000000000008'),
  (select id from container_handlings where intent_id='e7000000-0000-4000-8000-000000000602'), 'teste 8: replay depois de mudar o nome devolve o mesmo ID');
reset role;
update memberships set revoked_at = now() where user_id = 'e1000000-0000-4000-8000-000000000008';
set local role authenticated;
select is((select handled_by_name from container_handlings where intent_id='e7000000-0000-4000-8000-000000000602'), 'Caio', 'nome copiado preservado depois de revogar o vínculo');
select is(pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{2}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000602',p_by=>'e1000000-0000-4000-8000-000000000008'),
  (select id from container_handlings where intent_id='e7000000-0000-4000-8000-000000000602'), 'replay depois de revogar quem manipulou devolve o mesmo ID');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{2}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000603',p_by=>'e1000000-0000-4000-8000-000000000008')$$,
  '22023','A pessoa que manipulou precisa ter vínculo ativo com a empresa.','nova manipulação com quem perdeu o vínculo recusada');

-- Teste 8: idempotência --------------------------------------------------------
select is(pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{4}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000301',p_note=>'Abertura da peça 1'),
  (select id from container_handlings where intent_id='e7000000-0000-4000-8000-000000000301'), 'replay idêntico devolve o mesmo ID');
select is((select count(*)::int from containers c join container_handlings h on h.id=c.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000301'), 1, 'replay não cria derivado novo');
select is((select count(*)::int from stock_movements where intent_id='e7000000-0000-4000-8000-000000000301'), 1, 'replay não cria transferência nova');
select is(pg_temp.h((select id from d1),'portioning','{1.5,1.5}',current_date+5,'discard','e7000000-0000-4000-8000-000000000302',p_reason=>'Sobra pequena'),
  (select id from container_handlings where intent_id='e7000000-0000-4000-8000-000000000302'), 'replay depois de a origem zerar devolve o mesmo ID');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{4.5}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000301',p_note=>'Abertura da peça 1')$$,'23505',null,'mesmo identificador com outra quantidade recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{4}',current_date+4,'sealed','e7000000-0000-4000-8000-000000000301',p_note=>'Abertura da peça 1')$$,'23505',null,'mesmo identificador com outra validade recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{4}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000301',p_note=>'Outra nota')$$,'23505',null,'mesmo identificador com outra observação recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{4}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000301',p_note=>'Abertura da peça 1',p_by=>'e1000000-0000-4000-8000-000000000001')$$,'23505',null,'mesmo identificador com outra pessoa recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{4}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000301',p_note=>'Abertura da peça 1',p_storage=>'frozen')$$,'23505',null,'mesmo identificador com outra conservação recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{4}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000301',p_note=>'Abertura da peça 1',p_handled_at=>now()-interval '11 minutes')$$,'23505',null,'mesmo identificador com outro horário recusado');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000008'),'opening','{4}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000301',p_note=>'Abertura da peça 1')$$,'23505',null,'mesmo identificador em outra origem recusado');
select throws_ok($$select pg_temp.h((select id from d1),'portioning','{1.5,1.5}',current_date+5,'discard','e7000000-0000-4000-8000-000000000302',p_reason=>'Outro motivo')$$,'23505',null,'mesmo identificador com outro motivo de sobra recusado');
select throws_ok($$select record_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001','consumption',1,null,'e7000000-0000-4000-8000-000000000301')$$,'23505',null,'record_movement com o identificador de uma manipulação: 23505 (I-3)');
select throws_ok($$select record_container_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'consumption',1,null,'e7000000-0000-4000-8000-000000000301')$$,'23505',null,'record_container_movement com o identificador de uma manipulação: 23505');
select throws_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000001'),'opening','{1}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000101')$$,'23505',null,'manipulação com o identificador de uma baixa: 23505');
select is((select count(*) from container_handlings where intent_id='e7000000-0000-4000-8000-000000000101'), 0::bigint, 'nada criado com identificador de baixa');

-- Replay depois da janela e da meia-noite: manipulação registrada há 3 dias (inserida pelo dono das
-- tabelas, coerente: manipulação, derivado e transferência) é reenviada hoje com os mesmos dados.
reset role;
insert into container_handlings(id,organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by,created_at) values
 ('e9000000-0000-4000-8000-0000000000a7','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000007',
  pg_temp.integral('e6000000-0000-4000-8000-000000000007'),current_date+1,'opening',1,1,current_date-2,'ambient',now()-interval '3 days 1 hour','sealed',3,
  'e1000000-0000-4000-8000-000000000002','Bia','e7000000-0000-4000-8000-000000000701','America/Sao_Paulo','e1000000-0000-4000-8000-000000000001',now()-interval '3 days');
insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_id,intent_id,kind,quantity,timezone,created_by,created_at) values
 ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000007',pg_temp.integral('e6000000-0000-4000-8000-000000000007'),
  'e9000000-0000-4000-8000-0000000000a7','e7000000-0000-4000-8000-000000000701','transfer',1,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001',now()-interval '3 days');
insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,created_by,created_at) values
 ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000007','derived',pg_temp.integral('e6000000-0000-4000-8000-000000000007'),
  'e9000000-0000-4000-8000-0000000000a7',1,1,current_date-2,'ambient',now()-interval '3 days 1 hour','e1000000-0000-4000-8000-000000000001',now()-interval '3 days');
set local role authenticated;
select is(pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000007'),'opening','{1}',current_date-2,'sealed','e7000000-0000-4000-8000-000000000701',p_handled_at=>now()-interval '3 days 1 hour',p_storage=>'ambient'),
  'e9000000-0000-4000-8000-0000000000a7'::uuid, 'teste 8: replay depois da janela de 2 horas e da meia-noite (validade hoje já passada) devolve o mesmo ID');

-- Anulação comum não desfaz movimentos de manipulação (fica para a anulação da manipulação, 6.4).
select throws_ok($$select reverse_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where intent_id='e7000000-0000-4000-8000-000000000301'),'Erro','e7000000-0000-4000-8000-000000000801')$$,
  '22023','Movimento de manipulação só é desfeito pela anulação da manipulação.','transferência não é anulada por reverse_movement');
select throws_ok($$select reverse_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',(select m.id from stock_movements m join container_handlings h on h.id=m.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000302' and m.kind='discard'),'Erro','e7000000-0000-4000-8000-000000000802')$$,
  '22023','Movimento de manipulação só é desfeito pela anulação da manipulação.','descarte de sobra não é anulado por reverse_movement');

-- Leitura por RLS ---------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok((select count(*) from container_handlings) > 0, 'member de A lê as manipulações de A');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*) from container_handlings where organization_id='e2000000-0000-4000-8000-00000000000a'), 0::bigint, 'owner de B não lê manipulações de A');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from container_handlings), 0::bigint, 'owner revogado não lê manipulações');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Teste 10: conservação numa sequência fixa (R8, 10 kg) ---------------------------
select lives_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000008'),'opening','{3}',current_date+5,'sealed','e7000000-0000-4000-8000-000000000901')$$, 'R8: abertura parcial com sobra fechada');
select lives_ok($$select pg_temp.h(pg_temp.integral('e6000000-0000-4000-8000-000000000008'),'portioning','{2,2,2}',current_date+5,'discard','e7000000-0000-4000-8000-000000000902',p_reason=>'Sobra danificada')$$, 'R8: porcionamento em 3 com sobra descartada');
select lives_ok($$select record_container_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',(select c.id from containers c join container_handlings h on h.id=c.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000902' and c.position=1),'consumption',1,null,'e7000000-0000-4000-8000-000000000903')$$, 'R8: consumo numa porção');
select lives_ok($$select reverse_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where intent_id='e7000000-0000-4000-8000-000000000903'),'Engano','e7000000-0000-4000-8000-000000000904')$$, 'R8: anulação do consumo');
select lives_ok($$select record_container_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',(select c.id from containers c join container_handlings h on h.id=c.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000901'),'consumption',0.5,null,'e7000000-0000-4000-8000-000000000905')$$, 'R8: consumo no derivado da abertura');
select lives_ok($$select pg_temp.h((select c.id from containers c join container_handlings h on h.id=c.handling_id where h.intent_id='e7000000-0000-4000-8000-000000000902' and c.position=2),'opening','{2}',current_date+4,'none','e7000000-0000-4000-8000-000000000906',p_handled_at=>now()-interval '5 minutes')$$, 'R8: nova abertura de uma porção (derivado de derivado)');
select is(
  (select sum(balance) from container_balances where batch_id='e6000000-0000-4000-8000-000000000008'),
  10 - 1 - 0.5::numeric, 'R8: soma dos saldos = 10 − 1 de sobra descartada − 0,5 consumido (o consumo anulado volta)');
select is((select count(*)::int from containers where batch_id='e6000000-0000-4000-8000-000000000008'), 6, 'R8: integral, derivado da abertura, 3 porções e o derivado da porção');
reset role;
select is((select count(*)::int from private.stock_conservation_problems() where batch_id in (
  'e6000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000002','e6000000-0000-4000-8000-000000000003',
  'e6000000-0000-4000-8000-000000000007','e6000000-0000-4000-8000-000000000008')), 0, 'conservação verdadeira em todos os recebimentos manipulados (4.3)');
select is((select count(*)::int from private.container_balance_problems()), 0, 'saldo guardado igual ao histórico em todos os recipientes');

-- Teste 4: restrições por inserção direta (dono das tabelas) ---------------------
create temporary table hx on commit drop as
  select h.id, h.source_container_id, h.expiry_date, h.storage, h.handled_at, h.batch_id from container_handlings h where h.intent_id='e7000000-0000-4000-8000-000000000301';
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,'derived',(select id from d1),id,9,1,expiry_date,storage,handled_at,'e1000000-0000-4000-8000-000000000001' from hx$$,
  '23503',null,'derivado com pai diferente da origem da manipulação recusado (I-2a)');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,'derived',source_container_id,id,9,1,expiry_date-1,storage,handled_at,'e1000000-0000-4000-8000-000000000001' from hx$$,
  '23503',null,'derivado com validade diferente da manipulação recusado');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,'derived',source_container_id,id,9,1,expiry_date,'frozen',handled_at,'e1000000-0000-4000-8000-000000000001' from hx$$,
  '23503',null,'derivado com conservação diferente da manipulação recusado');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,'derived',source_container_id,id,9,1,expiry_date,storage,handled_at-interval '1 second','e1000000-0000-4000-8000-000000000001' from hx$$,
  '23503',null,'derivado com horário diferente da manipulação recusado');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000008','derived',source_container_id,id,9,1,expiry_date,storage,handled_at,'e1000000-0000-4000-8000-000000000001' from hx$$,
  '23503',null,'derivado de outro recebimento recusado');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,'derived',source_container_id,id,1,1,expiry_date,storage,handled_at,'e1000000-0000-4000-8000-000000000001' from hx$$,
  '23505',null,'posição repetida na mesma manipulação recusada');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,'derived',source_container_id,id,22,1,expiry_date,storage,handled_at,'e1000000-0000-4000-8000-000000000001' from hx$$,
  '23514',null,'posição acima de 21 recusada');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,'derived',source_container_id,null,9,1,expiry_date,storage,handled_at,'e1000000-0000-4000-8000-000000000001' from hx$$,
  '23514',null,'derivado sem manipulação recusado');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_id,intent_id,kind,quantity,reason,timezone,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,(select c.id from containers c where c.handling_id=hx.id),id,gen_random_uuid(),'discard',1,'Sobra','America/Sao_Paulo','e1000000-0000-4000-8000-000000000001' from hx$$,
  '23503',null,'movimento de manipulação fora da origem recusado (descarte de sobra no derivado)');
-- Manipulação sem transferência (dono das tabelas) para provar a FK da transferência.
insert into container_handlings(id,organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by) values
 ('e9000000-0000-4000-8000-0000000000b1','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',
  pg_temp.integral('e6000000-0000-4000-8000-000000000001'),current_date+10,'opening',1,1,current_date+5,'ambient',now(),'sealed',1,'e1000000-0000-4000-8000-000000000002','Bia',gen_random_uuid(),'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_id,intent_id,kind,quantity,timezone,created_by)
  values ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',(select id from containers where batch_id='e6000000-0000-4000-8000-000000000001' and kind='derived' limit 1),'e9000000-0000-4000-8000-0000000000b1',gen_random_uuid(),'transfer',1,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001')$$,
  '23503',null,'transferência fora da origem da manipulação recusada (I-2a)');
select ok(exists (select 1 from private.stock_conservation_problems() where problem like 'manipulação com derivados, transferência ou sobra divergentes%'), 'conservação acusa manipulação sem derivados nem transferência');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_id,intent_id,kind,quantity,timezone,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,source_container_id,id,gen_random_uuid(),'transfer',1,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001' from hx$$,
  '23505',null,'segunda transferência para a mesma manipulação recusada (I-2b)');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,timezone,created_by)
  values ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',pg_temp.integral('e6000000-0000-4000-8000-000000000001'),gen_random_uuid(),'transfer',1,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'transferência sem manipulação recusada');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_id,intent_id,kind,quantity,timezone,created_by)
  select 'e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',batch_id,source_container_id,id,gen_random_uuid(),'consumption',1,'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001' from hx$$,
  '23514',null,'consumo ligado a manipulação recusado');
select throws_ok($$insert into container_handlings(organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by)
  values ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',pg_temp.integral('e6000000-0000-4000-8000-000000000001'),current_date+10,'opening',1,1,current_date+11,'ambient',now(),'sealed',1,'e1000000-0000-4000-8000-000000000002','Bia',gen_random_uuid(),'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'validade da manipulação posterior à origem recusada pela restrição (I-2c)');
select throws_ok($$insert into container_handlings(organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by)
  values ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',pg_temp.integral('e6000000-0000-4000-8000-000000000001'),current_date+20,'opening',1,1,current_date+15,'ambient',now(),'sealed',1,'e1000000-0000-4000-8000-000000000002','Bia',gen_random_uuid(),'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001')$$,
  '23503',null,'validade da origem copiada diferente da real recusada pela FK');
select throws_ok($$insert into container_handlings(organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by)
  values ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',pg_temp.integral('e6000000-0000-4000-8000-000000000001'),current_date+10,'opening',1,1,current_date+5,'ambient',now(),'sealed',1,'e1000000-0000-4000-8000-000000000007','Zeca',gen_random_uuid(),'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001')$$,
  '23503',null,'quem manipulou sem vínculo com a empresa recusado pela FK');
select throws_ok($$insert into container_handlings(organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,late,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by)
  values ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',pg_temp.integral('e6000000-0000-4000-8000-000000000001'),current_date+10,'opening',1,1,current_date+5,'ambient',now(),true,'sealed',1,'e1000000-0000-4000-8000-000000000002','Bia',gen_random_uuid(),'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'manipulação tardia não existe antes da 6.5a');
select throws_ok($$insert into container_handlings(organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by)
  values ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',pg_temp.integral('e6000000-0000-4000-8000-000000000001'),current_date+10,'opening',1,1,current_date+5,'ambient',now()+interval '1 minute','sealed',1,'e1000000-0000-4000-8000-000000000002','Bia',gen_random_uuid(),'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'horário da manipulação depois do registro recusado pela restrição');
select throws_ok($$insert into container_handlings(organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by)
  values ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',pg_temp.integral('e6000000-0000-4000-8000-000000000001'),current_date+10,'opening',1,1,current_date+5,'ambient',now(),'discarded',1,'e1000000-0000-4000-8000-000000000002','Bia',gen_random_uuid(),'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'sobra descartada sem identificador do descarte recusada');
select throws_ok($$insert into container_handlings(organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by)
  values ('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e6000000-0000-4000-8000-000000000001',pg_temp.integral('e6000000-0000-4000-8000-000000000001'),current_date+10,'portioning',21,1,current_date+5,'ambient',now(),'none',0,'e1000000-0000-4000-8000-000000000002','Bia',gen_random_uuid(),'America/Sao_Paulo','e1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'21 porções pedidas recusadas pela restrição');
select throws_ok($$update container_handlings set note = 'x'$$, '55000', null, 'manipulação não é alterada (append-only)');
select throws_ok($$delete from container_handlings$$, '55000', null, 'manipulação não é apagada');
select throws_ok($$truncate container_handlings cascade$$, '55000', null, 'manipulações não são truncadas');
set local role service_role;
select throws_ok($$update container_handlings set note = 'x'$$, '42501', null, 'service_role não altera manipulação');

select * from finish();
rollback;
