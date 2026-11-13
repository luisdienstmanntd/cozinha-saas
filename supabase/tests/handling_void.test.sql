-- Fase 6, fatia 6.4: anulação de manipulação no banco (FASE_06_DESENHO.md 4.3, 4.10, 5.4 e testes 9,
-- 10 com anulação, 19 com anulação e 26 da seção 8). Anular é registro novo: devolução na origem,
-- saída em cada derivado e anulação do descarte de sobra, na mesma transação. Datas relativas a hoje e
-- a now() (início da transação), para que o teste não envelheça (S-6).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ------------------------------------------------------------------
select has_table('public', 'handling_voids', 'tabela de anulações de manipulação existe');
select ok((select relrowsecurity from pg_class where oid = 'public.handling_voids'::regclass), 'handling_voids tem RLS');
select is(
  (select coalesce(string_agg(r.role || ':' || p.priv, ',' order by r.role, p.priv), '')
     from unnest(array['anon', 'authenticated', 'service_role']) r(role)
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
    where has_table_privilege(r.role, 'public.handling_voids', p.priv)),
  'authenticated:SELECT,service_role:SELECT', 'anulações: só leitura para authenticated e service_role; nada para anon');
select lives_ok($$select private.assert_history_protected()$$, 'proteção do histórico inclui handling_voids');
select ok((select not prosecdef from pg_proc where oid = 'public.void_handling(uuid,uuid,uuid,text,uuid)'::regprocedure), 'wrapper público de void_handling é SECURITY INVOKER');
select ok((select prosecdef from pg_proc where oid = 'private.void_handling(uuid,uuid,uuid,text,uuid)'::regprocedure), 'núcleo de void_handling é SECURITY DEFINER');
select ok(not has_function_privilege('anon', 'public.void_handling(uuid,uuid,uuid,text,uuid)', 'execute'), 'anon não executa void_handling');
select ok(not has_function_privilege('service_role', 'private.void_handling(uuid,uuid,uuid,text,uuid)', 'execute'), 'service_role não executa o núcleo de void_handling');
select ok(exists (select 1 from pg_constraint where conname = 'handling_voids_handling_key' and contype = 'u'), 'uma anulação por manipulação é restrição do banco');

-- Dados ---------------------------------------------------------------------
-- u1 owner de A e de B; u2 member de A ("Bia"); u3 owner revogado de A; u4 owner só de B.
insert into auth.users(id) values
 ('f1000000-0000-4000-8000-000000000001'),('f1000000-0000-4000-8000-000000000002'),
 ('f1000000-0000-4000-8000-000000000003'),('f1000000-0000-4000-8000-000000000004');
insert into organizations(id,name) values
 ('f2000000-0000-4000-8000-00000000000a','A'),('f2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('f3000000-0000-4000-8000-0000000000a1','f2000000-0000-4000-8000-00000000000a','UA1','America/Sao_Paulo'),
 ('f3000000-0000-4000-8000-0000000000a2','f2000000-0000-4000-8000-00000000000a','UA2','America/Sao_Paulo'),
 ('f3000000-0000-4000-8000-0000000000b1','f2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,revoked_at,display_name) values
 ('f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-000000000001','owner',null,'Luis'),
 ('f2000000-0000-4000-8000-00000000000b','f1000000-0000-4000-8000-000000000001','owner',null,'Luis'),
 ('f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-000000000002','member',null,'Bia'),
 ('f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-000000000003','owner',now(),'Ex'),
 ('f2000000-0000-4000-8000-00000000000b','f1000000-0000-4000-8000-000000000004','owner',null,'Outro');
insert into products(id,organization_id,establishment_id,name,unit) values
 ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Queijo','kg'),
 ('f4000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a2','Leite','l'),
 ('f4000000-0000-4000-8000-000000000004','f2000000-0000-4000-8000-00000000000b','f3000000-0000-4000-8000-0000000000b1','Manteiga','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('f5000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','FA'),
 ('f5000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a2','FA2'),
 ('f5000000-0000-4000-8000-000000000004','f2000000-0000-4000-8000-00000000000b','f3000000-0000-4000-8000-0000000000b1','FB');
-- R1 Queijo 100 kg   R2 Leite (UA2) 5 l   R3 Manteiga (B) 5 kg   R4 Queijo 10 kg (porção de sobra)
-- R5 Queijo 3 kg, recebido há 5 dias, venceu ontem (manipulação preparada por inserção direta)
-- R6 Queijo 10 kg (teste 10)   R7 Queijo 1000 kg (teste 26)   R8 Queijo 20 kg (replay)
insert into batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by,created_at) values
 ('f6000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','Q-1',100,'kg',current_date+10,'original',current_date+10,'America/Sao_Paulo','f1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('f6000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a2','f4000000-0000-4000-8000-000000000003','f5000000-0000-4000-8000-000000000003','f7000000-0000-4000-8000-000000000002','L-1',5,'l',current_date+10,'original',current_date+10,'America/Sao_Paulo','f1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('f6000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-00000000000b','f3000000-0000-4000-8000-0000000000b1','f4000000-0000-4000-8000-000000000004','f5000000-0000-4000-8000-000000000004','f7000000-0000-4000-8000-000000000003','M-1',5,'kg',current_date+10,'original',current_date+10,'UTC','f1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('f6000000-0000-4000-8000-000000000004','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000004','Q-P',10,'kg',current_date+10,'original',current_date+10,'America/Sao_Paulo','f1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('f6000000-0000-4000-8000-000000000005','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000005','Q-V',3,'kg',current_date-1,'original',current_date-1,'America/Sao_Paulo','f1000000-0000-4000-8000-000000000001',now()-interval '5 days'),
 ('f6000000-0000-4000-8000-000000000006','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000006','Q-C',10,'kg',current_date+10,'original',current_date+10,'America/Sao_Paulo','f1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('f6000000-0000-4000-8000-000000000007','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000007','Q-S',1000,'kg',current_date+10,'original',current_date+10,'America/Sao_Paulo','f1000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('f6000000-0000-4000-8000-000000000008','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000008','Q-R',20,'kg',current_date+10,'original',current_date+10,'America/Sao_Paulo','f1000000-0000-4000-8000-000000000001',now()-interval '1 day');

-- R5: manipulação de 3 dias atrás, quando ainda estava dentro da validade, preparada pelo dono das
-- tabelas (a função recusaria o horário fora da janela). A origem venceu ontem.
insert into container_handlings(id,organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by,created_at)
 select 'f9000000-0000-4000-8000-000000000005','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',c.batch_id,c.id,c.expiry_date,'opening',1,2,current_date-1,'refrigerated',now()-interval '3 days','sealed',1,
        'f1000000-0000-4000-8000-000000000002','Bia','f7000000-0000-4000-8000-000000000501','America/Sao_Paulo','f1000000-0000-4000-8000-000000000001',now()-interval '3 days'
   from containers c where c.batch_id='f6000000-0000-4000-8000-000000000005' and c.kind='integral';
insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_id,intent_id,kind,quantity,timezone,created_by)
 select organization_id,establishment_id,batch_id,source_container_id,id,intent_id,'transfer',2,timezone,created_by from container_handlings where id='f9000000-0000-4000-8000-000000000005';
insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,handling_id,position,initial_quantity,expiry_date,storage,handled_at,timezone,created_by)
 select organization_id,establishment_id,batch_id,'derived',source_container_id,id,1,2,expiry_date,storage,handled_at,timezone,created_by from container_handlings where id='f9000000-0000-4000-8000-000000000005';

-- Atalhos.
create function pg_temp.integral(p_batch uuid) returns uuid language sql stable as $$
  select id from public.containers where batch_id = p_batch and kind = 'integral' $$;
create function pg_temp.hid(p_intent uuid) returns uuid language sql stable as $$
  select id from public.container_handlings where intent_id = p_intent $$;
create function pg_temp.der(p_intent uuid, p_position int) returns uuid language sql stable as $$
  select c.id from public.containers c join public.container_handlings h on h.id = c.handling_id
   where h.intent_id = p_intent and c.position = p_position $$;
create function pg_temp.bal(p_container uuid) returns numeric language sql stable as $$
  select balance from public.container_balances where container_id = p_container $$;
create function pg_temp.h(p_source uuid, p_kind text, p_q numeric[], p_expiry date, p_remainder text, p_intent uuid,
  p_reason text default null)
returns uuid language sql as $$
  select public.handle_container('f2000000-0000-4000-8000-00000000000a', 'f3000000-0000-4000-8000-0000000000a1', p_source,
    p_kind, p_q, p_expiry, 'refrigerated', now() - interval '10 minutes', 'f1000000-0000-4000-8000-000000000002',
    p_remainder, p_reason, null, null, p_intent) $$;
create function pg_temp.v(p_handling uuid, p_reason text, p_intent uuid,
  p_org uuid default 'f2000000-0000-4000-8000-00000000000a', p_est uuid default 'f3000000-0000-4000-8000-0000000000a1')
returns uuid language sql as $$
  select public.void_handling(p_org, p_est, p_handling, p_reason, p_intent) $$;
grant execute on function pg_temp.integral(uuid), pg_temp.hid(uuid), pg_temp.der(uuid,int), pg_temp.bal(uuid),
  pg_temp.h(uuid,text,numeric[],date,text,uuid,text), pg_temp.v(uuid,text,uuid,uuid,uuid) to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Manipulações de base (como u1, proprietário de A).
--  H1: abertura de 10 kg do R1, sobra fechada.          H2: porcionamento 3+3 do R1, sobra descartada.
--  H3: abertura de 10 kg do R4 (sem sobra) e H4: porcionamento 3+3 de H3 com a sobra como porção (4 kg).
--  H6: abertura de 5 kg do R1, consumo num derivado.     H7: abertura de 5 kg do R1, consumo anulado.
select lives_ok($$select pg_temp.h(pg_temp.integral('f6000000-0000-4000-8000-000000000001'),'opening','{10}',current_date+5,'sealed','f7000000-0000-4000-8000-000000000101')$$, 'H1 criada');
select lives_ok($$select pg_temp.h(pg_temp.integral('f6000000-0000-4000-8000-000000000001'),'portioning','{3,3}',current_date+5,'discard','f7000000-0000-4000-8000-000000000102','Embalagem rasgada')$$, 'H2 criada (sobra de 84 kg descartada)');
select lives_ok($$select pg_temp.h(pg_temp.integral('f6000000-0000-4000-8000-000000000004'),'opening','{10}',current_date+5,'none','f7000000-0000-4000-8000-000000000103')$$, 'H3 criada');
select lives_ok($$select pg_temp.h(pg_temp.der('f7000000-0000-4000-8000-000000000103',1),'portioning','{3,3}',current_date+4,'portion','f7000000-0000-4000-8000-000000000104')$$, 'H4 criada (porção de sobra de 4 kg)');

-- Teste 3 (matriz de papéis) aplicado à anulação --------------------------------
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000101'),'Engano','f7000000-0000-4000-8000-000000000201')$$,'42501',null,'member não anula manipulação');
select ok((select count(*) from handling_voids) = 0, 'nada gravado pela tentativa do member');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select pg_temp.v('f9000000-0000-4000-8000-0000000000ff','Engano','f7000000-0000-4000-8000-000000000202')$$,'42501',null,'owner revogado não anula');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select pg_temp.v('f9000000-0000-4000-8000-0000000000ff','Engano','f7000000-0000-4000-8000-000000000203')$$,'42501',null,'owner de outra empresa não anula em A');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000101'),'Engano','f7000000-0000-4000-8000-000000000204','f2000000-0000-4000-8000-00000000000b','f3000000-0000-4000-8000-0000000000b1')$$,
  '23503','Manipulação não encontrada.','owner de A e B: manipulação de A pelo escopo de B tem a mesma recusa de inexistente');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000101'),'Engano','f7000000-0000-4000-8000-000000000205','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a2')$$,
  '23503','Manipulação não encontrada.','outra unidade da mesma empresa: mesma recusa');
select throws_ok($$select pg_temp.v('f9000000-0000-4000-8000-0000000000ff','Engano','f7000000-0000-4000-8000-000000000206')$$,
  '23503','Manipulação não encontrada.','manipulação inexistente');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000101'),null,'f7000000-0000-4000-8000-000000000207')$$,'22023',null,'motivo obrigatório');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000101'),U&'\00A0\2003 \FEFF','f7000000-0000-4000-8000-000000000208')$$,'22023',null,'motivo só com espaços invisíveis recusado');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000101'),repeat('x',501),'f7000000-0000-4000-8000-000000000209')$$,'22023',null,'motivo acima de 500 caracteres recusado');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000101'),'Engano',null)$$,'22023',null,'identificador obrigatório');
select throws_ok($$select pg_temp.v(null,'Engano','f7000000-0000-4000-8000-000000000210')$$,'22023',null,'manipulação obrigatória');
select ok((select count(*) from handling_voids) = 0, 'nenhuma recusa gravou anulação');

-- Teste 9: anulação -------------------------------------------------------------
-- H1 (abertura com sobra fechada): a origem volta a 100 − 6 − 84 = 10 + 10 devolvidos.
select is(pg_temp.bal(pg_temp.integral('f6000000-0000-4000-8000-000000000001')), 0::numeric, 'R1 antes: 100 − 10 (H1) − 6 (H2) − 84 (sobra descartada de H2)');
select lives_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000101'),'  Validade digitada errada  ','f7000000-0000-4000-8000-000000000301')$$, 'H1 anulada');
select is(pg_temp.bal(pg_temp.integral('f6000000-0000-4000-8000-000000000001')), 10::numeric, 'R1: a transferência de H1 voltou para a origem');
select is(pg_temp.bal(pg_temp.der('f7000000-0000-4000-8000-000000000101',1)), 0::numeric, 'derivado de H1 zerado');
select is((select reason from handling_voids where intent_id='f7000000-0000-4000-8000-000000000301'), 'Validade digitada errada', 'motivo gravado sem espaços nas pontas');
select is((select created_by from handling_voids where intent_id='f7000000-0000-4000-8000-000000000301'), 'f1000000-0000-4000-8000-000000000001'::uuid, 'quem anulou é o proprietário da sessão');
select is((select timezone from handling_voids where intent_id='f7000000-0000-4000-8000-000000000301'), 'America/Sao_Paulo', 'fuso da manipulação gravado na anulação');
select is(
  (select string_agg(m.kind || ':' || m.quantity, ',' order by m.kind) from stock_movements m
    join handling_voids v on v.id = m.handling_void_id where v.intent_id='f7000000-0000-4000-8000-000000000301'),
  'handling_void:10,transfer_reversal:10', 'H1: uma devolução e uma saída no derivado, ambas de 10 kg');
select is(
  (select m.reverses_id from stock_movements m where m.kind='transfer_reversal' and m.intent_id='f7000000-0000-4000-8000-000000000301'),
  (select m.id from stock_movements m where m.kind='transfer' and m.intent_id='f7000000-0000-4000-8000-000000000101'),
  'a devolução aponta a transferência e usa o identificador da anulação');
select ok((select bool_and(m.reason = 'Validade digitada errada') from stock_movements m
             join handling_voids v on v.id = m.handling_void_id where v.intent_id='f7000000-0000-4000-8000-000000000301'),
  'os eventos levam o motivo da anulação');

-- H2 (porcionamento com sobra descartada): a anulação desfaz também o descarte da sobra.
select lives_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000102'),'Porcionamento registrado no lote errado','f7000000-0000-4000-8000-000000000302')$$, 'H2 anulada');
select is(pg_temp.bal(pg_temp.integral('f6000000-0000-4000-8000-000000000001')), 100::numeric, 'R1 volta a 100: 6 das porções + 84 da sobra descartada');
select is((select sum(pg_temp.bal(c.id)) from containers c where c.handling_id = pg_temp.hid('f7000000-0000-4000-8000-000000000102')), 0::numeric, 'porções de H2 zeradas');
select is(
  (select count(*)::int from stock_movements m
    where m.kind='reversal' and m.handling_void_id is not null
      and m.reverses_id = (select d.id from stock_movements d where d.handling_id = pg_temp.hid('f7000000-0000-4000-8000-000000000102') and d.kind='discard')),
  1, 'exatamente uma anulação do descarte de sobra, ligada à anulação da manipulação');

-- H4 (porção de sobra): 3 derivados zerados, a origem (derivado de H3) volta a 10.
select lives_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000104'),'Engano','f7000000-0000-4000-8000-000000000304')$$, 'H4 anulada');
select is(pg_temp.bal(pg_temp.der('f7000000-0000-4000-8000-000000000103',1)), 10::numeric, 'origem derivada de H4 volta a 10 kg');
select is((select count(*)::int from stock_movements m join containers c on c.id = m.container_id
            where c.handling_id = pg_temp.hid('f7000000-0000-4000-8000-000000000104') and m.kind='handling_void'), 3, 'uma saída de anulação em cada um dos 3 derivados, inclusive a porção de sobra');
-- H3 não pode mais ser anulada: o derivado dela teve transferência (H4) e devolução.
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000103'),'Engano','f7000000-0000-4000-8000-000000000305')$$,
  '22023',null,'manipulação cujo derivado foi manipulado é recusada, mesmo depois de anular a manipulação seguinte');

-- Derivado com movimento: recusado, também quando o movimento foi anulado.
select lives_ok($$select pg_temp.h(pg_temp.integral('f6000000-0000-4000-8000-000000000001'),'opening','{5}',current_date+5,'sealed','f7000000-0000-4000-8000-000000000106')$$, 'H6 criada');
select lives_ok($$select record_container_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',pg_temp.der('f7000000-0000-4000-8000-000000000106',1),'consumption',1,null,'f7000000-0000-4000-8000-000000000116')$$, 'consumo no derivado de H6');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000106'),'Engano','f7000000-0000-4000-8000-000000000306')$$,
  '22023','Algum recipiente desta manipulação já teve movimentação; a manipulação não pode ser anulada.','derivado com consumo: anulação recusada');
select lives_ok($$select pg_temp.h(pg_temp.integral('f6000000-0000-4000-8000-000000000001'),'opening','{5}',current_date+5,'sealed','f7000000-0000-4000-8000-000000000107')$$, 'H7 criada');
select lives_ok($$select record_container_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',pg_temp.der('f7000000-0000-4000-8000-000000000107',1),'discard',1,'Caiu','f7000000-0000-4000-8000-000000000117')$$, 'descarte no derivado de H7');
select lives_ok($$select reverse_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where intent_id='f7000000-0000-4000-8000-000000000117'),'Engano','f7000000-0000-4000-8000-000000000127')$$, 'descarte anulado');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000107'),'Engano','f7000000-0000-4000-8000-000000000307')$$,
  '22023',null,'derivado com descarte já anulado: anulação da manipulação continua recusada');

-- Segunda anulação recusada; derivado anulado não recebe baixa nem manipulação.
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000101'),'Outra vez','f7000000-0000-4000-8000-000000000308')$$,
  '23505','Manipulação já anulada.','segunda anulação recusada');
select throws_ok($$select record_container_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',pg_temp.der('f7000000-0000-4000-8000-000000000101',1),'consumption',1,null,'f7000000-0000-4000-8000-000000000118')$$,
  '22023',null,'derivado anulado não recebe baixa (sem saldo)');
select throws_ok($$select pg_temp.h(pg_temp.der('f7000000-0000-4000-8000-000000000101',1),'opening','{1}',current_date+4,'discard','f7000000-0000-4000-8000-000000000119','x')$$,
  '22023',null,'derivado anulado não é manipulado (sem saldo)');

-- Eventos da anulação não são anulados individualmente.
select throws_ok($$select reverse_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where kind='transfer_reversal' and intent_id='f7000000-0000-4000-8000-000000000301'),'x','f7000000-0000-4000-8000-000000000401')$$,
  '22023',null,'devolução não é anulada por "Anular registro"');
select throws_ok($$select reverse_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where kind='handling_void' and container_id=pg_temp.der('f7000000-0000-4000-8000-000000000101',1)),'x','f7000000-0000-4000-8000-000000000402')$$,
  '22023',null,'saída de anulação do derivado não é anulada');
select throws_ok($$select reverse_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',(select m.id from stock_movements m where m.kind='reversal' and m.handling_void_id is not null limit 1),'x','f7000000-0000-4000-8000-000000000403')$$,
  '22023',null,'anulação do descarte de sobra não é anulada');
select throws_ok($$select reverse_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where kind='transfer' and intent_id='f7000000-0000-4000-8000-000000000101'),'x','f7000000-0000-4000-8000-000000000404')$$,
  '22023',null,'transferência continua sem "Anular registro" (6.3)');

-- Origem vencida no meio do caminho: a anulação devolve o saldo, com a validade dela.
select is(pg_temp.bal(pg_temp.integral('f6000000-0000-4000-8000-000000000005')), 1::numeric, 'R5 antes: 3 − 2 transferidos');
select lives_ok($$select pg_temp.v('f9000000-0000-4000-8000-000000000005','Engano','f7000000-0000-4000-8000-000000000309')$$, 'origem vencida pode receber a devolução');
select is(pg_temp.bal(pg_temp.integral('f6000000-0000-4000-8000-000000000005')), 3::numeric, 'R5 volta a 3 kg');
select is((select expiry_date from containers where id = pg_temp.integral('f6000000-0000-4000-8000-000000000005')), current_date-1, 'a origem continua com a validade dela (vencida), sem prorrogação');
select is((select count(*)::int from list_containers('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','container',pg_temp.integral('f6000000-0000-4000-8000-000000000005'))
            where balance = 3 and expiry_date = current_date-1), 1, 'painel lê a origem devolvida como vencida, com saldo');
select is((select count(*)::int from list_containers('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','with_balance')
            where container_id = pg_temp.der('f7000000-0000-4000-8000-000000000101',1)), 0, 'derivado anulado sai do painel "só com saldo"');

-- Teste 19 (parte no banco): replay e identificador reaproveitado ---------------------
select lives_ok($$select pg_temp.h(pg_temp.integral('f6000000-0000-4000-8000-000000000008'),'portioning','{2,2}',current_date+5,'sealed','f7000000-0000-4000-8000-000000000108')$$, 'H8 criada');
select lives_ok($$select record_container_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',pg_temp.integral('f6000000-0000-4000-8000-000000000008'),'consumption',1,null,'f7000000-0000-4000-8000-000000000128')$$, 'consumo comum no R8');
select lives_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000108'),'Engano','f7000000-0000-4000-8000-000000000310')$$, 'H8 anulada');
select is(pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000108'),' Engano ','f7000000-0000-4000-8000-000000000310'),
  (select id from handling_voids where intent_id='f7000000-0000-4000-8000-000000000310'), 'reenvio idêntico (espaços nas pontas não contam) devolve o mesmo ID, depois de anulada');
select is((select count(*)::int from handling_voids where handling_id = pg_temp.hid('f7000000-0000-4000-8000-000000000108')), 1, 'reenvio não grava segunda anulação');
select is((select count(*)::int from stock_movements m join handling_voids v on v.id = m.handling_void_id where v.intent_id='f7000000-0000-4000-8000-000000000310'), 3, 'reenvio não duplica eventos (1 devolução + 2 saídas)');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000108'),'Outro motivo','f7000000-0000-4000-8000-000000000310')$$,'23505','Identificador já utilizado com outros dados.','mesmo identificador com outro motivo');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000106'),'Engano','f7000000-0000-4000-8000-000000000310')$$,'23505','Identificador já utilizado com outros dados.','mesmo identificador para outra manipulação');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000106'),'Engano','f7000000-0000-4000-8000-000000000128')$$,'23505',null,'identificador de uma baixa não vira anulação de manipulação');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000106'),'Engano','f7000000-0000-4000-8000-000000000108')$$,'23505',null,'identificador de uma manipulação não vira anulação dela');
select throws_ok($$select record_container_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',pg_temp.integral('f6000000-0000-4000-8000-000000000008'),'consumption',1,null,'f7000000-0000-4000-8000-000000000310')$$,'23505',null,'identificador da anulação não vira baixa');
select throws_ok($$select reverse_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where intent_id='f7000000-0000-4000-8000-000000000128'),'x','f7000000-0000-4000-8000-000000000310')$$,'23505',null,'identificador da anulação não vira anulação comum');
select throws_ok($$select pg_temp.h(pg_temp.integral('f6000000-0000-4000-8000-000000000008'),'opening','{1}',current_date+5,'sealed','f7000000-0000-4000-8000-000000000310')$$,'23505',null,'identificador da anulação não vira manipulação');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000108'),'Engano','f7000000-0000-4000-8000-000000000310')$$,'42501',null,'replay é reautorizado: member não recebe o ID');

-- Leitura por RLS ---------------------------------------------------------------
select ok((select count(*) from handling_voids where organization_id='f2000000-0000-4000-8000-00000000000a') >= 5, 'member de A lê as anulações de A');
select is((select count(*)::int from stock_movements where kind in ('transfer_reversal','handling_void') and organization_id='f2000000-0000-4000-8000-00000000000a') > 0, true, 'member de A lê os eventos de anulação');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from handling_voids where organization_id='f2000000-0000-4000-8000-00000000000a'), 0, 'owner de B não lê anulações de A');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Teste 10 com anulação: sequência fixa (R6, 10 kg) ---------------------------------
select lives_ok($$select pg_temp.h(pg_temp.integral('f6000000-0000-4000-8000-000000000006'),'opening','{3}',current_date+5,'sealed','f7000000-0000-4000-8000-000000000601')$$, 'R6: abertura parcial com sobra fechada');
select lives_ok($$select pg_temp.h(pg_temp.integral('f6000000-0000-4000-8000-000000000006'),'portioning','{2,2,2}',current_date+5,'discard','f7000000-0000-4000-8000-000000000602','Sobra danificada')$$, 'R6: porcionamento em 3 com sobra descartada (1 kg)');
select lives_ok($$select record_container_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',pg_temp.der('f7000000-0000-4000-8000-000000000601',1),'consumption',1,null,'f7000000-0000-4000-8000-000000000603')$$, 'R6: consumo no derivado da abertura');
select lives_ok($$select reverse_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',(select id from stock_movements where intent_id='f7000000-0000-4000-8000-000000000603'),'Engano','f7000000-0000-4000-8000-000000000604')$$, 'R6: anulação do consumo');
select lives_ok($$select pg_temp.h(pg_temp.der('f7000000-0000-4000-8000-000000000602',2),'opening','{2}',current_date+4,'none','f7000000-0000-4000-8000-000000000605')$$, 'R6: nova abertura de uma porção');
select lives_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000605'),'Engano','f7000000-0000-4000-8000-000000000606')$$, 'R6: anulação da nova abertura');
select throws_ok($$select pg_temp.v(pg_temp.hid('f7000000-0000-4000-8000-000000000602'),'Engano','f7000000-0000-4000-8000-000000000607')$$, '22023',null, 'R6: o porcionamento não é anulado (uma porção foi manipulada)');
select lives_ok($$select record_container_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',pg_temp.der('f7000000-0000-4000-8000-000000000602',1),'consumption',0.5,null,'f7000000-0000-4000-8000-000000000608')$$, 'R6: consumo de 0,5 kg numa porção');
select is((select sum(balance) from container_balances where batch_id='f6000000-0000-4000-8000-000000000006'), 10 - 1 - 0.5::numeric, 'R6: soma dos saldos = 10 − 1 de sobra descartada − 0,5 consumido');
select is(pg_temp.bal(pg_temp.der('f7000000-0000-4000-8000-000000000602',2)), 2::numeric, 'R6: a porção cuja abertura foi anulada volta a 2 kg');
select is(pg_temp.bal(pg_temp.der('f7000000-0000-4000-8000-000000000605',1)), 0::numeric, 'R6: derivado da abertura anulada zerado');

-- Teste 4 da anulação: restrições por inserção direta (dono das tabelas) ---------
reset role;
create temporary table vx on commit drop as
  select v.id, v.handling_id, v.batch_id from handling_voids v where v.intent_id='f7000000-0000-4000-8000-000000000301';
select throws_ok($$insert into handling_voids(organization_id,establishment_id,batch_id,handling_id,reason,intent_id,timezone,created_by)
  select 'f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',batch_id,handling_id,'x',gen_random_uuid(),'UTC','f1000000-0000-4000-8000-000000000001' from vx$$,
  '23505',null,'segunda anulação da mesma manipulação recusada pelo banco');
select throws_ok($$insert into handling_voids(organization_id,establishment_id,batch_id,handling_id,reason,intent_id,timezone,created_by)
  values ('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f6000000-0000-4000-8000-000000000004',pg_temp.hid('f7000000-0000-4000-8000-000000000106'),'x',gen_random_uuid(),'UTC','f1000000-0000-4000-8000-000000000001')$$,
  '23503',null,'anulação com recebimento diferente do da manipulação recusada');
select throws_ok($$insert into handling_voids(organization_id,establishment_id,batch_id,handling_id,reason,intent_id,timezone,created_by)
  values ('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f6000000-0000-4000-8000-000000000001',pg_temp.hid('f7000000-0000-4000-8000-000000000106'),' x',gen_random_uuid(),'UTC','f1000000-0000-4000-8000-000000000001')$$,
  '23514',null,'motivo com espaço nas pontas recusado pela restrição');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,derived_handling_id,handling_void_id,intent_id,kind,quantity,reason,timezone,created_by)
  select 'f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',batch_id,pg_temp.der('f7000000-0000-4000-8000-000000000106',1),handling_id,id,gen_random_uuid(),'handling_void',1,'x','UTC','f1000000-0000-4000-8000-000000000001' from vx$$,
  '23503',null,'saída de anulação num recipiente que não é derivado da manipulação anulada recusada');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_void_id,intent_id,kind,quantity,reason,timezone,created_by)
  select 'f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',batch_id,pg_temp.der('f7000000-0000-4000-8000-000000000101',1),id,gen_random_uuid(),'handling_void',1,'x','UTC','f1000000-0000-4000-8000-000000000001' from vx$$,
  '23514',null,'saída de anulação sem a manipulação do derivado recusada');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,derived_handling_id,handling_void_id,intent_id,kind,quantity,reason,timezone,created_by)
  select 'f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',batch_id,pg_temp.der('f7000000-0000-4000-8000-000000000101',1),handling_id,id,gen_random_uuid(),'handling_void',1,'x','UTC','f1000000-0000-4000-8000-000000000001' from vx$$,
  '23505',null,'segunda saída de anulação no mesmo derivado recusada');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,derived_handling_id,intent_id,kind,quantity,reason,timezone,created_by)
  select 'f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f6000000-0000-4000-8000-000000000001',pg_temp.der('f7000000-0000-4000-8000-000000000106',1),pg_temp.hid('f7000000-0000-4000-8000-000000000106'),gen_random_uuid(),'handling_void',1,'x','UTC','f1000000-0000-4000-8000-000000000001'$$,
  '23514',null,'saída de anulação sem anulação registrada recusada');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_id,intent_id,kind,quantity,reason,reverses_id,timezone,created_by)
  select 'f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f6000000-0000-4000-8000-000000000001',pg_temp.integral('f6000000-0000-4000-8000-000000000001'),pg_temp.hid('f7000000-0000-4000-8000-000000000106'),gen_random_uuid(),'transfer_reversal',5,'x',
    (select id from stock_movements where kind='transfer' and intent_id='f7000000-0000-4000-8000-000000000106'),'UTC','f1000000-0000-4000-8000-000000000001'$$,
  '23514',null,'devolução sem anulação registrada recusada');
-- Anulação de H7 (não anulada) gravada no mesmo comando, para a devolução não esbarrar nos únicos.
select throws_ok($$with v as (
    insert into handling_voids(organization_id,establishment_id,batch_id,handling_id,reason,intent_id,timezone,created_by)
    values ('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f6000000-0000-4000-8000-000000000001',pg_temp.hid('f7000000-0000-4000-8000-000000000107'),'x',gen_random_uuid(),'UTC','f1000000-0000-4000-8000-000000000001')
    returning id, handling_id, batch_id)
  insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_id,handling_void_id,intent_id,kind,quantity,reason,reverses_id,timezone,created_by)
  select 'f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',batch_id,pg_temp.integral('f6000000-0000-4000-8000-000000000001'),handling_id,id,gen_random_uuid(),'transfer_reversal',5,'x',
    (select id from stock_movements where kind='transfer' and intent_id='f7000000-0000-4000-8000-000000000106'),'UTC','f1000000-0000-4000-8000-000000000001' from v$$,
  '23503',null,'devolução da transferência de outra manipulação recusada');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_id,handling_void_id,intent_id,kind,quantity,reason,timezone,created_by)
  select 'f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',batch_id,pg_temp.integral('f6000000-0000-4000-8000-000000000001'),handling_id,id,gen_random_uuid(),'transfer_reversal',5,'x','UTC','f1000000-0000-4000-8000-000000000001' from vx$$,
  '23514',null,'devolução sem o movimento devolvido recusada');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,handling_void_id,intent_id,kind,quantity,timezone,created_by)
  select 'f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',batch_id,pg_temp.integral('f6000000-0000-4000-8000-000000000001'),id,gen_random_uuid(),'consumption',1,'UTC','f1000000-0000-4000-8000-000000000001' from vx$$,
  '23514',null,'consumo ligado a anulação de manipulação recusado');
select throws_ok($$update handling_voids set reason = 'outro'$$, '55000', null, 'anulação não é alterada');
select throws_ok($$delete from handling_voids$$, '55000', null, 'anulação não é apagada');
select throws_ok($$truncate handling_voids cascade$$, '55000', null, 'anulações não são truncadas');

-- Teste 26: propriedade com semente registrada (R7, 1000 kg) ------------------------------
-- 250 passos aleatórios (semente 0.4242) de baixa, descarte, anulação, manipulação e anulação de
-- manipulação, pelas funções públicas e como o proprietário. Depois de cada passo: nenhum saldo
-- negativo, conservação verdadeira no recebimento e saldo guardado igual ao histórico.
create temporary table prop_log (step int, op text, ok boolean, problems int) on commit drop;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  v_org uuid := 'f2000000-0000-4000-8000-00000000000a';
  v_est uuid := 'f3000000-0000-4000-8000-0000000000a1';
  v_batch uuid := 'f6000000-0000-4000-8000-000000000007';
  v_step int; v_op int; v_ok boolean; v_c record; v_m uuid; v_h uuid; v_q numeric; v_problems int; v_name text; v_kind text; v_qs numeric[]; v_rest numeric; v_rem text;
begin
  perform setseed(0.4242);
  for v_step in 1 .. 250 loop
    v_op := floor(random() * 5)::int;
    v_ok := true;
    begin
      if v_op in (0, 1) then
        v_name := case v_op when 0 then 'consumption' else 'discard' end;
        select c.id, cb.balance into v_c from public.containers c join public.container_balances cb on cb.container_id = c.id
         where c.batch_id = v_batch and cb.balance > 0 order by random() limit 1;
        if v_c.id is null then raise exception 'sem recipiente' using errcode = 'P0001'; end if;
        v_q := greatest(1, floor(v_c.balance * random() * 0.6));
        perform public.record_container_movement(v_org, v_est, v_c.id, v_name, v_q,
          case v_op when 1 then 'Teste de propriedade' end, gen_random_uuid());
      elsif v_op = 2 then
        v_name := 'reversal';
        select m.id into v_m from public.stock_movements m
         where m.batch_id = v_batch and m.kind in ('consumption', 'discard') and m.handling_id is null
           and not exists (select 1 from public.stock_movements r where r.reverses_id = m.id)
         order by random() limit 1;
        if v_m is null then raise exception 'sem movimento' using errcode = 'P0001'; end if;
        perform public.reverse_movement(v_org, v_est, v_m, 'Teste de propriedade', gen_random_uuid());
      elsif v_op = 3 then
        v_name := 'handling';
        select c.id, c.kind, cb.balance into v_c from public.containers c join public.container_balances cb on cb.container_id = c.id
         where c.batch_id = v_batch and cb.balance >= 3 order by random() limit 1;
        if v_c.id is null then raise exception 'sem recipiente' using errcode = 'P0001'; end if;
        v_q := floor(v_c.balance / (2 + floor(random() * 3)));
        v_kind := case when random() < 0.5 then 'opening' else 'portioning' end;
        v_qs := case v_kind when 'opening' then array[v_q] else array[v_q, v_q] end;
        v_rest := v_c.balance - v_q * array_length(v_qs, 1);
        -- Tratamento da sobra sorteado entre os válidos (às vezes inválido, para exercitar a recusa).
        v_rem := case
          when random() < 0.1 then 'none'
          when v_rest = 0 then 'none'
          when v_c.kind = 'integral' and random() < 0.4 then 'sealed'
          when v_kind = 'portioning' and random() < 0.5 then 'portion'
          else 'discard' end;
        perform public.handle_container(v_org, v_est, v_c.id, v_kind, v_qs,
          current_date + 5, 'refrigerated', now() - interval '10 minutes', 'f1000000-0000-4000-8000-000000000002',
          v_rem, case when v_rem = 'discard' then 'Sobra do teste' end, null, null, gen_random_uuid());
      else
        v_name := 'void';
        select h.id into v_h from public.container_handlings h
         where h.batch_id = v_batch and not exists (select 1 from public.handling_voids v where v.handling_id = h.id)
         order by random() limit 1;
        perform public.void_handling(v_org, v_est, v_h, 'Teste de propriedade', gen_random_uuid());
      end if;
    exception when others then
      -- Recusas esperadas (saldo, sobra, derivado movimentado, forma). Qualquer outro erro falha abaixo.
      if sqlstate not in ('22023', '23505', 'P0001') then
        raise;
      end if;
      v_ok := false;
    end;
    select (select count(*) from private.stock_conservation_problems() p where p.batch_id = v_batch)
         + (select count(*) from private.container_balance_problems())
      into v_problems;
    insert into prop_log values (v_step, coalesce(v_name, v_op::text), v_ok, v_problems);
  end loop;
end;
$$;
select diag('teste 26, passos por operação (ok/recusado): ' || (select string_agg(op || ' ' || n_ok || '/' || n_no, ', ' order by op)
  from (select op, count(*) filter (where ok) n_ok, count(*) filter (where not ok) n_no from prop_log group by op) x));
select is((select count(*)::int from prop_log where problems > 0), 0, 'teste 26: conservação e saldo válidos depois de cada um dos 250 passos (semente 0.4242)');
select is((select min(balance) from container_balances where batch_id='f6000000-0000-4000-8000-000000000007') >= 0, true, 'teste 26: nenhum saldo negativo');
select ok((select count(*) from prop_log where op = 'void' and ok) >= 5, 'teste 26: a sequência inclui anulações de manipulação bem-sucedidas');
select ok((select count(*) from prop_log where op = 'void' and not ok) >= 1, 'teste 26: e anulações recusadas (derivado movimentado)');
select ok((select count(*) from prop_log where op = 'handling' and ok) >= 10, 'teste 26: e manipulações bem-sucedidas');
select ok((select count(*) from prop_log where op in ('consumption','discard','reversal') and ok) >= 20, 'teste 26: e baixas e anulações comuns');

-- Conservação final --------------------------------------------------------------------
select is((select count(*)::int from private.stock_conservation_problems() where batch_id in (
  select id from batch_receipts where organization_id in ('f2000000-0000-4000-8000-00000000000a','f2000000-0000-4000-8000-00000000000b'))), 0,
  'conservação verdadeira em todos os recebimentos, inclusive manipulações anuladas (4.3)');
select is((select count(*)::int from private.container_balance_problems()), 0, 'saldo guardado igual ao histórico em todos os recipientes');

select * from finish();
rollback;
