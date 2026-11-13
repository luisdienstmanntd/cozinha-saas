-- Fase 6, fatia 6.1: saldo por recipiente.
-- Todo recebimento tem exatamente um recipiente integral, criado no banco junto com o recebimento;
-- todo movimento pertence a um recipiente do mesmo recebimento; o saldo é calculado por recipiente.
-- Os casos de movements.test.sql são repetidos aqui com um recipiente derivado (inserido pelo dono das
-- tabelas, porque a função de manipulação só chega na 6.3).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ------------------------------------------------------------------
select has_column('public', 'containers', 'kind', 'containers.kind existe');
select col_not_null('public', 'containers', 'kind', 'kind obrigatório');
select col_not_null('public', 'containers', 'initial_quantity', 'quantidade inicial obrigatória');
select col_not_null('public', 'containers', 'expiry_date', 'validade do recipiente obrigatória');
select col_not_null('public', 'containers', 'expiry_origin', 'origem da validade do recipiente obrigatória');
select col_not_null('public', 'containers', 'short_code', 'código curto obrigatório');
select col_not_null('public', 'containers', 'timezone', 'fuso do recipiente obrigatório');
select col_is_null('public', 'containers', 'parent_container_id', 'pai é nulo no integral');
select col_not_null('public', 'stock_movements', 'container_id', 'todo movimento tem recipiente');
select is(
  (select count(*)::int from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'containers_one_integral_idx' and i.indisunique and i.indpred is not null),
  1, 'um integral por recebimento: índice único parcial (kind = integral)');
select hasnt_index('public', 'containers', 'containers_batch_id_key', 'unique (batch_id) antigo foi substituído');
select lives_ok($$select private.assert_history_protected()$$, 'proteção do histórico completa depois do backfill');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'stock_movements_kind_check')
    = $$CHECK ((kind = ANY (ARRAY['consumption'::text, 'discard'::text, 'reversal'::text, 'transfer'::text])))$$,
  'tipos de movimento conhecidos pelo cálculo de saldo e pela conservação (novo tipo exige atualizar os dois; transfer entrou na 6.3)');

-- Dados ---------------------------------------------------------------------
-- u1: owner de A; u2: member de A; u3: owner de B; u4: owner revogado de A.
insert into auth.users(id) values
 ('c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000002'),
 ('c1000000-0000-4000-8000-000000000003'),('c1000000-0000-4000-8000-000000000004');
insert into organizations(id,name) values
 ('c2000000-0000-4000-8000-00000000000a','A'),('c2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('c3000000-0000-4000-8000-00000000000a','c2000000-0000-4000-8000-00000000000a','UA1','America/Sao_Paulo'),
 ('c3000000-0000-4000-8000-00000000000c','c2000000-0000-4000-8000-00000000000a','UA2','America/Manaus'),
 ('c3000000-0000-4000-8000-00000000000b','c2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,revoked_at) values
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000001','owner',null),
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000002','member',null),
 ('c2000000-0000-4000-8000-00000000000b','c1000000-0000-4000-8000-000000000003','owner',null),
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000004','owner',now());
insert into products(id,organization_id,establishment_id,name,unit) values
 ('c4000000-0000-4000-8000-00000000000a','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','PA','kg'),
 ('c4000000-0000-4000-8000-00000000000c','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c','PA2','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('c5000000-0000-4000-8000-00000000000a','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','FA'),
 ('c5000000-0000-4000-8000-00000000000c','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c','FA2');

-- Recebimento inserido direto (como as fixtures antigas): o integral nasce pelo gatilho.
insert into batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by) values
 ('c6000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c4000000-0000-4000-8000-00000000000a','c5000000-0000-4000-8000-00000000000a','c7000000-0000-4000-8000-000000000001','L1',10,'kg','2027-01-01','original','2027-01-01','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001'),
 ('c6000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c','c4000000-0000-4000-8000-00000000000c','c5000000-0000-4000-8000-00000000000c','c7000000-0000-4000-8000-000000000002','L2',5,'kg','2026-12-20','responsible',null,'America/Manaus','c1000000-0000-4000-8000-000000000001');

select is((select count(*)::int from containers where batch_id='c6000000-0000-4000-8000-000000000001'), 1, 'inserção direta de recebimento cria exatamente um recipiente');
select results_eq(
  $$select kind, parent_container_id, initial_quantity, expiry_date, expiry_origin, timezone, created_by
    from containers where batch_id='c6000000-0000-4000-8000-000000000002'$$,
  $$values ('integral'::text, null::uuid, 5::numeric, '2026-12-20'::date, 'receipt'::text, 'America/Manaus'::text, 'c1000000-0000-4000-8000-000000000001'::uuid)$$,
  'integral copia quantidade, validade, fuso e autor do recebimento');
select ok((select short_code ~ '^C-[0-9]{6,}$' from containers where batch_id='c6000000-0000-4000-8000-000000000001'), 'código curto no formato C-000000');
select ok(
  (select c1.short_code < c2.short_code from containers c1, containers c2
    where c1.batch_id='c6000000-0000-4000-8000-000000000001' and c2.batch_id='c6000000-0000-4000-8000-000000000002'),
  'códigos curtos crescem na ordem de criação');

-- Restrições por inserção direta (dono das tabelas).
-- Fatia 6.3: todo derivado pertence a uma manipulação (mesma validade, conservação e horário). Esta
-- manipulação de teste, inserida pelo dono das tabelas e sem transferência, só dá aos derivados abaixo
-- os campos que a 6.3 exige; as verificações continuam as mesmas.
insert into container_handlings(id,organization_id,establishment_id,batch_id,source_container_id,source_expiry_date,kind,portion_count,total_quantity,expiry_date,storage,handled_at,remainder,remainder_quantity,handled_by,handled_by_name,intent_id,timezone,created_by) values
 ('c9000000-0000-4000-8000-0000000000a1','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001',
  (select id from containers where batch_id='c6000000-0000-4000-8000-000000000001' and kind='integral'),'2027-01-01','opening',1,4,'2026-12-01','refrigerated','2026-11-01 12:00+00','sealed',6,
  'c1000000-0000-4000-8000-000000000001','Ana','c7000000-0000-4000-8000-0000000000a1','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001')$$,
  '23505', null, 'segundo integral do mesmo recebimento recusado');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,initial_quantity,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c','c6000000-0000-4000-8000-000000000002','integral',4,'c1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'integral com quantidade diferente do recebimento recusado');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,initial_quantity,expiry_date,handling_id,position,handled_at,storage,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','derived',1,'2026-12-01','c9000000-0000-4000-8000-0000000000a1',1,'2026-11-01 12:00+00','refrigerated','c1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'derivado sem recipiente de origem recusado');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,initial_quantity,expiry_date,handling_id,position,handled_at,storage,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','derived',(select id from containers where batch_id='c6000000-0000-4000-8000-000000000002'),1,'2026-12-01','c9000000-0000-4000-8000-0000000000a1',1,'2026-11-01 12:00+00','refrigerated','c1000000-0000-4000-8000-000000000001')$$,
  '23503', null, 'derivado com origem de outro recebimento recusado');
select throws_ok($$insert into containers(id,organization_id,establishment_id,batch_id,kind,parent_container_id,initial_quantity,expiry_date,handling_id,position,handled_at,storage,created_by) values ('c9000000-0000-4000-8000-0000000000ff','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','derived','c9000000-0000-4000-8000-0000000000ff',1,'2026-12-01','c9000000-0000-4000-8000-0000000000a1',1,'2026-11-01 12:00+00','refrigerated','c1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'derivado não pode ser a própria origem');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,initial_quantity,expiry_date,expiry_origin,handling_id,position,handled_at,storage,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','derived',(select id from containers where batch_id='c6000000-0000-4000-8000-000000000001'),1,'2026-12-01','receipt','c9000000-0000-4000-8000-0000000000a1',1,'2026-11-01 12:00+00','refrigerated','c1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'derivado não usa a validade do recebimento como origem');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,kind,parent_container_id,initial_quantity,expiry_date,handling_id,position,handled_at,storage,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','derived',(select id from containers where batch_id='c6000000-0000-4000-8000-000000000001'),0.0001,'2026-12-01','c9000000-0000-4000-8000-0000000000a1',1,'2026-11-01 12:00+00','refrigerated','c1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'quantidade inicial com mais de 3 casas recusada');
select throws_ok($$insert into containers(organization_id,establishment_id,batch_id,short_code,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','C-999999','c1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'código curto não é informado por quem insere (só a sequência gera)');

-- Recipiente derivado de teste (4 kg do integral de L1), sem manipulação: só para exercitar o saldo
-- por recipiente. A conservação deste recebimento fica propositalmente quebrada (verificado abaixo).
insert into containers(id,organization_id,establishment_id,batch_id,kind,parent_container_id,initial_quantity,expiry_date,handling_id,position,handled_at,storage,created_by) values
 ('c9000000-0000-4000-8000-0000000000d1','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','derived',
  (select id from containers where batch_id='c6000000-0000-4000-8000-000000000001' and kind='integral'),4,'2026-12-01','c9000000-0000-4000-8000-0000000000a1',1,'2026-11-01 12:00+00','refrigerated','c1000000-0000-4000-8000-000000000001');
select results_eq(
  $$select expiry_origin, timezone from containers where id='c9000000-0000-4000-8000-0000000000d1'$$,
  $$values ('handling'::text, 'America/Sao_Paulo'::text)$$, 'derivado tem validade de manipulação e o fuso do recebimento');

-- Movimento inserido sem recipiente (fixture antiga): recebe o integral.
insert into stock_movements(id,organization_id,establishment_id,batch_id,intent_id,kind,quantity,timezone,created_by) values
 ('c8000000-0000-4000-8000-0000000000a2','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c','c6000000-0000-4000-8000-000000000002','c7000000-0000-4000-8000-000000000010','consumption',1,'America/Manaus','c1000000-0000-4000-8000-000000000001');
select is((select container_id from stock_movements where id='c8000000-0000-4000-8000-0000000000a2'),
  (select id from containers where batch_id='c6000000-0000-4000-8000-000000000002'), 'movimento sem recipiente vai para o integral do recebimento');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c','c6000000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-0000000000d1','c7000000-0000-4000-8000-000000000011','consumption',1,'America/Manaus','c1000000-0000-4000-8000-000000000001')$$,
  '23503', null, 'movimento não aponta para recipiente de outro recebimento');
select throws_ok($$insert into stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,reverses_id,timezone,created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-0000000000d1','c7000000-0000-4000-8000-000000000012','reversal',1,'x','c8000000-0000-4000-8000-0000000000a2','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001')$$,
  '23503', null, 'anulação fica no mesmo recipiente do movimento anulado');

-- As funções informam o recipiente: nenhuma depende do preenchimento automático das fixtures.
savepoint no_fill;
alter table stock_movements disable trigger stock_movements_fill_container;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c',(select id from containers where batch_id='c6000000-0000-4000-8000-000000000002'),'consumption',1,null,'c7000000-0000-4000-8000-000000000020')$$,'record_container_movement grava o recipiente sem o gatilho');
select lives_ok($$select record_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c','c6000000-0000-4000-8000-000000000002','consumption',1,null,'c7000000-0000-4000-8000-000000000021')$$,'record_movement (assinatura antiga) grava o integral sem o gatilho');
select lives_ok($$select reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c','c8000000-0000-4000-8000-0000000000a2','Erro','c7000000-0000-4000-8000-000000000022')$$,'reverse_movement herda o recipiente sem o gatilho');
reset role;
rollback to savepoint no_fill;
select is((select count(*)::int from stock_movements where batch_id='c6000000-0000-4000-8000-000000000002'), 1, 'ensaio sem gatilho desfeito');

-- Conservação (4.3) ----------------------------------------------------------
select is((select count(*)::int from private.stock_conservation_problems() p where p.batch_id='c6000000-0000-4000-8000-000000000002'), 0, 'conservação verdadeira no recebimento só com integral');
select ok(exists(select 1 from private.stock_conservation_problems() p where p.batch_id='c6000000-0000-4000-8000-000000000001'), 'conservação acusa derivado criado sem saída da origem');

-- Assinatura antiga opera no integral -----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select record_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','consumption',2,null,'c7000000-0000-4000-8000-000000000030')$$,'assinatura antiga registra consumo');
select is((select c.kind from stock_movements m join containers c on c.id=m.container_id where m.intent_id='c7000000-0000-4000-8000-000000000030'), 'integral', 'assinatura antiga grava no integral');
reset role;
select is(private.container_balance('c9000000-0000-4000-8000-0000000000d1'), 4::numeric, 'saldo do derivado não muda com baixa no integral');
set local role authenticated;
reset role;
select is((select private.container_balance(id) from containers where batch_id='c6000000-0000-4000-8000-000000000001' and kind='integral'), 8::numeric, 'saldo do integral');
set local role authenticated;
select throws_ok($$select record_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','consumption',8.001,null,'c7000000-0000-4000-8000-000000000031')$$,'22023',null,'assinatura antiga limita ao saldo do integral');
select is((select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a',(select id from containers where batch_id='c6000000-0000-4000-8000-000000000001' and kind='integral'),'consumption',2,null,'c7000000-0000-4000-8000-000000000030')),
  (select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000030'), 'replay pela assinatura nova no integral devolve o mesmo registro');

-- Casos de movements.test.sql repetidos com o derivado (saldo 4) ---------------
select lives_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',3,null,'c7000000-0000-4000-8000-000000000040')$$,'derivado: registra consumo');
select lives_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',3,null,'c7000000-0000-4000-8000-000000000040')$$,'derivado: reenvio idempotente');
select is((select count(*)::int from stock_movements where container_id='c9000000-0000-4000-8000-0000000000d1'),1,'derivado: um evento');
select is((select created_by from stock_movements where container_id='c9000000-0000-4000-8000-0000000000d1'),'c1000000-0000-4000-8000-000000000001'::uuid,'derivado: autor da sessão');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',1.5,null,'c7000000-0000-4000-8000-000000000041')$$,'22023',null,'derivado: excesso sobre o saldo do recipiente recusado (o recebimento ainda tem saldo)');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',0,null,'c7000000-0000-4000-8000-000000000041')$$,'22023',null,'derivado: zero recusado');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption','NaN'::numeric,null,'c7000000-0000-4000-8000-000000000041')$$,'22023',null,'derivado: NaN recusado');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',0.0001,null,'c7000000-0000-4000-8000-000000000041')$$,'22023',null,'derivado: precisão excessiva recusada');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','discard',1,null,'c7000000-0000-4000-8000-000000000041')$$,'22023',null,'derivado: descarte exige motivo');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','discard',1,E'\t','c7000000-0000-4000-8000-000000000041')$$,'22023',null,'derivado: motivo invisível não é motivo');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','transfer',1,null,'c7000000-0000-4000-8000-000000000041')$$,'22023',null,'derivado: tipo desconhecido recusado');
select lives_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','discard',1,'dano','c7000000-0000-4000-8000-000000000041')$$,'derivado: descarte encerra saldo');
reset role;
select is(private.container_balance('c9000000-0000-4000-8000-0000000000d1'), 0::numeric, 'derivado: saldo exato zero');
set local role authenticated;
select lives_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',3,null,'c7000000-0000-4000-8000-000000000040')$$,'derivado: reenvio permitido mesmo após saldo zero');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a',(select id from containers where batch_id='c6000000-0000-4000-8000-000000000001' and kind='integral'),'consumption',3,null,'c7000000-0000-4000-8000-000000000040')$$,'23505',null,'mesmo identificador em outro recipiente recusado');
select throws_ok($$select record_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-000000000001','consumption',3,null,'c7000000-0000-4000-8000-000000000040')$$,'23505',null,'assinatura antiga não reaproveita identificador de movimento do derivado');
select throws_ok($$select reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a',(select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000040'),U&'\00A0','c7000000-0000-4000-8000-000000000050')$$,'22023',null,'derivado: espaço não separável não é justificativa');
select lives_ok($$select reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a',(select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000040'),'Erro de registro','c7000000-0000-4000-8000-000000000050')$$,'derivado: estorno');
select lives_ok($$select reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a',(select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000040'),'Erro de registro','c7000000-0000-4000-8000-000000000050')$$,'derivado: replay do estorno é idempotente');
select throws_ok($$select reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a',(select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000040'),'Erro de registro','c7000000-0000-4000-8000-000000000051')$$,'23505',null,'derivado: não estorna duas vezes');
select is((select container_id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000050'),'c9000000-0000-4000-8000-0000000000d1'::uuid,'derivado: estorno herda o recipiente');
select is((select count(*)::int from stock_movements where container_id='c9000000-0000-4000-8000-0000000000d1'),3,'derivado: original preservado junto ao estorno');
reset role;
select is(private.container_balance('c9000000-0000-4000-8000-0000000000d1'), 3::numeric, 'derivado: estorno devolve saldo ao próprio recipiente');
set local role authenticated;
select is((select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',3,null,'c7000000-0000-4000-8000-000000000040')),(select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000040'),'derivado: replay da saída anulada preserva identidade sem nova baixa');
select lives_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',3,null,'c7000000-0000-4000-8000-000000000042')$$,'derivado: saldo compensado permite nova baixa');
select throws_ok($$select reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a',(select id from stock_movements where intent_id='c7000000-0000-4000-8000-000000000050'),'Erro','c7000000-0000-4000-8000-000000000052')$$,'22023',null,'derivado: não estorna estorno');
reset role;
select is((select private.container_balance(id) from containers where batch_id='c6000000-0000-4000-8000-000000000001' and kind='integral'), 8::numeric, 'baixas no derivado não mexem no integral');
set local role authenticated;
select throws_ok($$insert into stock_movements(organization_id) values ('c2000000-0000-4000-8000-00000000000a')$$,'42501',null,'cliente não insere evento diretamente');
select throws_ok($$update containers set initial_quantity=100$$,'42501',null,'cliente não altera recipiente');

-- Escopo: unidade de A com recipiente de outra unidade de A; recipiente inexistente.
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000c','c9000000-0000-4000-8000-0000000000d1','consumption',1,null,'c7000000-0000-4000-8000-000000000060')$$,'23503','Recipiente não encontrado.','recipiente de outra unidade da mesma empresa recusado');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000ee','consumption',1,null,'c7000000-0000-4000-8000-000000000060')$$,'23503','Recipiente não encontrado.','recipiente inexistente recusado com a mesma mensagem');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',1,null,null)$$,'22023',null,'identificador da tentativa obrigatório');

-- Leitura por membro: vê as colunas novas dos recipientes da própria empresa.
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from containers where organization_id='c2000000-0000-4000-8000-00000000000a'), 3, 'member lê recipientes da própria empresa');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',1,null,'c7000000-0000-4000-8000-000000000061')$$,'42501',null,'member não registra saída em recipiente');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from containers), 0, 'revogado não lê recipientes');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',1,null,'c7000000-0000-4000-8000-000000000062')$$,'42501',null,'revogado não registra saída em recipiente');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from containers) + (select count(*)::int from stock_movements), 0, 'empresa B não lê recipientes nem movimentos de A');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',3,null,'c7000000-0000-4000-8000-000000000040')$$,'42501',null,'empresa B não acessa replay de A');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000b','c3000000-0000-4000-8000-00000000000b','c9000000-0000-4000-8000-0000000000d1','consumption',1,null,'c7000000-0000-4000-8000-000000000063')$$,'23503','Recipiente não encontrado.','recipiente de A não recebe saída pelo escopo de B (mesma mensagem de inexistente)');
set local role anon;
select throws_ok($$select * from containers$$,'42501',null,'anônimo não lê recipientes');
select throws_ok($$select record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c9000000-0000-4000-8000-0000000000d1','consumption',1,null,'c7000000-0000-4000-8000-000000000064')$$,'42501',null,'anônimo não executa a função');
reset role;

-- Depois de tudo: histórico continua append-only e a conservação do recebimento só com integral fecha.
select throws_ok($$update containers set short_code=short_code where false$$,'55000',null,'dono não altera recipiente depois da 6.1');
select throws_ok($$update stock_movements set container_id=container_id where false$$,'55000',null,'dono não altera movimento depois da 6.1');
select is((select count(*)::int from private.stock_conservation_problems() p where p.batch_id='c6000000-0000-4000-8000-000000000002'), 0, 'conservação continua verdadeira');

select * from finish();
rollback;
