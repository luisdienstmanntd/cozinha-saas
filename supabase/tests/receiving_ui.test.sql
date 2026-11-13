-- Fase 6, fatia 6.5b: leitura de ocorrências para a tela (list_occurrences) e retirada da assinatura
-- antiga de receive_batch. A regra de bloqueio é uma só (container_blocks); aqui se confere que a lista
-- da tela mostra exatamente os recipientes que o banco bloqueia. Datas relativas a hoje (S-6).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ------------------------------------------------------------------
select has_function('public', 'list_occurrences', array['uuid','uuid','text','integer'], 'list_occurrences existe');
select ok((select not prosecdef from pg_proc where oid = 'public.list_occurrences(uuid,uuid,text,integer)'::regprocedure),
  'list_occurrences é SECURITY INVOKER (a RLS filtra)');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.list_occurrences(uuid,uuid,text,integer)'::regprocedure),
  'list_occurrences fixa search_path vazio');
select ok(has_function_privilege('authenticated', 'public.list_occurrences(uuid,uuid,text,integer)', 'execute'), 'authenticated lê ocorrências');
select ok(not has_function_privilege('anon', 'public.list_occurrences(uuid,uuid,text,integer)', 'execute'), 'anon não lê ocorrências');
select ok(to_regprocedure('public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid)') is null,
  'public.receive_batch sem conservação não existe mais');
select ok(to_regprocedure('private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid)') is null,
  'private.receive_batch sem conservação não existe mais');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where p.proname = 'receive_batch_core' and n.nspname = 'private'), 1, 'um único núcleo de recebimento');
select ok(not has_function_privilege('authenticated',
  'private.receive_batch_core(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid)', 'execute'),
  'núcleo de recebimento não é executável pelo cliente');

-- Dados ---------------------------------------------------------------------
-- u1 owner de A; u2 member de A; u3 owner de B.
insert into auth.users(id) values
 ('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002'),('d1000000-0000-4000-8000-000000000003');
insert into organizations(id,name) values
 ('d2000000-0000-4000-8000-00000000000a','A'),('d2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('d3000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-00000000000a','UA','America/Sao_Paulo'),
 ('d3000000-0000-4000-8000-0000000000a2','d2000000-0000-4000-8000-00000000000a','UA2','America/Sao_Paulo'),
 ('d3000000-0000-4000-8000-0000000000b1','d2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,display_name) values
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000001','owner','Luis'),
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000002','member','Bia'),
 ('d2000000-0000-4000-8000-00000000000b','d1000000-0000-4000-8000-000000000003','owner','Outro');
insert into products(id,organization_id,establishment_id,name,unit) values
 ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','Frango','kg'),
 ('d4000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','Arroz','kg'),
 ('d4000000-0000-4000-8000-0000000000b1','d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-0000000000b1','Manteiga','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','FA'),
 ('d5000000-0000-4000-8000-0000000000b1','d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-0000000000b1','FB');

-- R3: Frango refrigerado medido, recebido ontem (para a manipulação tardia, que precisa de origem anterior).
insert into batch_receipts(organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,storage_condition,temperature_status,received_temperature_c,timezone,created_by,created_at)
values ('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000003','L-R3',10,'kg',current_date+10,'original',current_date+10,'refrigerated','measured',4,'America/Sao_Paulo','d1000000-0000-4000-8000-000000000001',now()-interval '1 day');
create function pg_temp.rcv(p_storage text, p_status text, p_temp numeric, p_reason text, p_intent uuid,
  p_product uuid default 'd4000000-0000-4000-8000-000000000001') returns uuid language sql as $$
  select public.receive_batch('d2000000-0000-4000-8000-00000000000a', 'd3000000-0000-4000-8000-0000000000a1', p_product,
    'd5000000-0000-4000-8000-000000000001', 'L-' || left(p_intent::text, 8), 10, current_date+10, 'original', current_date+10,
    p_storage, p_status, p_temp, p_reason, p_intent) $$;
create function pg_temp.integral(p_batch uuid) returns uuid language sql stable as $$
  select id from public.containers where batch_id = p_batch and kind = 'integral' $$;
create function pg_temp.occ(p_batch uuid) returns uuid language sql stable as $$
  select id from public.occurrences where batch_id = p_batch and kind = 'temperature_not_measured' $$;
create function pg_temp.lo(p_scope text default 'open', p_est uuid default 'd3000000-0000-4000-8000-0000000000a1',
  p_org uuid default 'd2000000-0000-4000-8000-00000000000a')
returns setof record language sql stable as $$
  select occurrence_id, status, jsonb_array_length(containers) from public.list_occurrences(p_org, p_est, p_scope, 200) $$;
-- Recipientes bloqueados segundo a lista da tela e segundo container_blocks (a regra do banco).
create function pg_temp.listed() returns setof uuid language sql stable as $$
  select (c->>'container_id')::uuid
    from public.list_occurrences('d2000000-0000-4000-8000-00000000000a', 'd3000000-0000-4000-8000-0000000000a1', 'open', 200) o,
         jsonb_array_elements(o.containers) c
   where o.status in ('pending', 'rejected') $$;
create function pg_temp.blocked() returns setof uuid language sql stable as $$
  select distinct c.id from public.containers c join public.container_balances cb on cb.container_id = c.id
   where c.establishment_id = 'd3000000-0000-4000-8000-0000000000a1' and cb.balance > 0
     and exists (select 1 from public.container_blocks(c.organization_id, c.establishment_id, c.id)) $$;
grant execute on function pg_temp.rcv(text,text,numeric,text,uuid,uuid), pg_temp.integral(uuid), pg_temp.occ(uuid),
  pg_temp.lo(text,uuid,uuid), pg_temp.listed(), pg_temp.blocked() to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select set_product_storage_condition('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','d4000000-0000-4000-8000-000000000001','refrigerated')$$,
  'proprietário define a conservação do Frango');

-- Validação de parâmetros ------------------------------------------------------
select throws_ok($$select * from list_occurrences(null,'d3000000-0000-4000-8000-0000000000a1','open',10)$$,'22023','Escopo obrigatório.','escopo obrigatório');
select throws_ok($$select * from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','pending',10)$$,'22023','Filtro inválido.','filtro desconhecido recusado');
select throws_ok($$select * from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','open',0)$$,'22023','Limite deve estar entre 1 e 200.','limite zero recusado');
select throws_ok($$select * from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','open',201)$$,'22023','Limite deve estar entre 1 e 200.','limite acima de 200 recusado');
select is((select count(*)::int from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1')), 0, 'sem ocorrências, lista vazia');

-- Recebimentos: R1 sem medição, R2 sem medição, R3 medido (de ontem, livre), R4 arroz em ambiente (livre).
select lives_ok($$select pg_temp.rcv('refrigerated','not_measured',null,'Termômetro sem pilha','d7000000-0000-4000-8000-000000000001')$$,'R1 sem medição');
select lives_ok($$select pg_temp.rcv('refrigerated','not_measured',null,'Entrega fora do horário','d7000000-0000-4000-8000-000000000002')$$,'R2 sem medição');
select isnt(pg_temp.integral((select id from batch_receipts where intent_id = 'd7000000-0000-4000-8000-000000000003')), null,
  'R3 medido, de ontem, tem recipiente integral');
select lives_ok($$select pg_temp.rcv('ambient','not_required',null,null,'d7000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000002')$$,'R4 ambiente');
select results_eq(
  $$select kind, product_name, source_code, unit, reason, status, decision_reason, decided_at, timezone
      from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','open',10)
     order by reason$$,
  $$values ('temperature_not_measured'::text, 'Frango'::text, 'L-d7000000'::text, 'kg'::text, 'Entrega fora do horário'::text, 'pending'::text, null::text, null::timestamptz, 'America/Sao_Paulo'::text),
           ('temperature_not_measured', 'Frango', 'L-d7000000', 'kg', 'Termômetro sem pilha', 'pending', null, null, 'America/Sao_Paulo')$$,
  'duas ocorrências abertas, com produto, lote, motivo e fuso');
select is((select containers from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','open',10)
            where batch_id = (select id from batch_receipts where intent_id = 'd7000000-0000-4000-8000-000000000001')),
  (select jsonb_build_array(jsonb_build_object('container_id', c.id, 'short_code', c.short_code, 'kind', 'integral', 'balance', 10))
     from containers c where c.batch_id = (select id from batch_receipts where intent_id = 'd7000000-0000-4000-8000-000000000001')),
  'ocorrência aberta lista o recipiente integral com saldo');
select set_eq($$select * from pg_temp.listed()$$, $$select * from pg_temp.blocked()$$, 'tela e banco bloqueiam os mesmos recipientes (2 abertas)');
select is((select count(*)::int from pg_temp.listed()), 2, 'dois recipientes bloqueados');
select is((select count(*)::int from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','open',1)), 1, 'limite respeitado');

-- Escopo: outra unidade da mesma empresa, outra empresa, membro ----------------------
select is((select count(*)::int from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a2','all',10)), 0, 'outra unidade de A não vê as ocorrências de UA');
select is((select count(*)::int from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000b1','all',10)), 0, 'unidade de B sob empresa A não devolve nada');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','open',10)), 2, 'membro vê as ocorrências abertas (consulta)');
select throws_ok($$select decide_occurrence('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',pg_temp.occ((select id from batch_receipts where intent_id='d7000000-0000-4000-8000-000000000001')),'released','Medido depois','d7000000-0000-4000-8000-000000000101')$$,
  '42501',null,'membro não decide');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','all',10)), 0, 'proprietário de B não vê ocorrências de A');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Liberação tira da lista aberta; rejeição fica até o descarte do saldo ------------------
select lives_ok($$select decide_occurrence('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',pg_temp.occ((select id from batch_receipts where intent_id='d7000000-0000-4000-8000-000000000001')),'released','Temperatura conferida com o fornecedor','d7000000-0000-4000-8000-000000000102')$$,'R1 liberado');
select lives_ok($$select decide_occurrence('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',pg_temp.occ((select id from batch_receipts where intent_id='d7000000-0000-4000-8000-000000000002')),'rejected','Embalagem morna','d7000000-0000-4000-8000-000000000103')$$,'R2 rejeitado');
select results_eq(
  $$select reason, status, decision_reason, decided_at is not null from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','open',10)$$,
  $$values ('Entrega fora do horário'::text, 'rejected'::text, 'Embalagem morna'::text, true)$$,
  'aberta = só a rejeitada com saldo; liberada sai da lista');
select results_eq(
  $$select reason, status, decision_reason from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','all',10) order by created_at, occurrence_id$$,
  $$select o.reason, coalesce(d.decision, 'pending'), d.reason from occurrences o left join occurrence_decisions d on d.occurrence_id = o.id
     where o.establishment_id = 'd3000000-0000-4000-8000-0000000000a1' order by o.created_at, o.id$$,
  '"all" devolve todas, com a decisão');
select set_eq($$select * from pg_temp.listed()$$, $$select * from pg_temp.blocked()$$, 'tela e banco concordam depois das decisões');
select is((select count(*)::int from pg_temp.listed()), 1, 'só o recipiente rejeitado segue bloqueado');
select lives_ok($$select record_container_movement('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',pg_temp.integral((select id from batch_receipts where intent_id='d7000000-0000-4000-8000-000000000002')),'discard',10,'Rejeitado no recebimento','d7000000-0000-4000-8000-000000000201')$$,
  'descarte do saldo rejeitado');
select is((select count(*)::int from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','open',10)), 0, 'rejeitada sem saldo sai da lista aberta');
select is((select count(*)::int from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','all',10)), 2, 'continua no histórico ("all")');
select set_eq($$select * from pg_temp.listed()$$, $$select * from pg_temp.blocked()$$, 'tela e banco concordam depois do descarte');
select is((select containers from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','all',10) where status = 'rejected'),
  '[]'::jsonb, 'rejeitada sem saldo não lista recipiente');

-- Manipulação tardia: só os derivados da manipulação aparecem -------------------------------
select lives_ok($$select handle_container('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
    pg_temp.integral((select id from batch_receipts where intent_id='d7000000-0000-4000-8000-000000000003')),
    'portioning', '{2,3}', current_date+5, 'refrigerated', now()-interval '3 hours', 'd1000000-0000-4000-8000-000000000002', 'sealed',
    null, null, 'Registro esquecido no fim do turno', 'd7000000-0000-4000-8000-000000000301')$$, 'porcionamento tardio com justificativa');
select results_eq(
  $$select kind, reason, status, jsonb_array_length(containers), (select bool_and(c->>'kind' = 'derived') from jsonb_array_elements(containers) c)
      from list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','open',10)$$,
  $$values ('late_handling'::text, 'Registro esquecido no fim do turno'::text, 'pending'::text, 2, true)$$,
  'tardia lista as duas porções, não a origem');
select set_eq($$select * from pg_temp.listed()$$, $$select * from pg_temp.blocked()$$, 'tela e banco concordam na manipulação tardia');

reset role;
select is((select count(*)::int from private.occurrence_problems()), 0, 'nenhuma ocorrência incoerente');
select is((select count(*)::int from private.container_balance_problems()), 0, 'saldo guardado igual ao histórico');
select * from finish();
rollback;
