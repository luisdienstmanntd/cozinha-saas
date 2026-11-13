-- Fase 6, fatia 6.0a (P5): o histórico de recebimentos, recipientes e movimentos é append-only
-- para TODOS os papéis da aplicação, inclusive service_role e o dono das tabelas.
-- Também exercita o caminho B-1 previsto para a 6.1: suspensão controlada de um gatilho dentro
-- de uma transação e a verificação final private.assert_history_protected(), que precisa recusar
-- qualquer proteção ausente, desabilitada ou enfraquecida.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Dados mínimos (inseridos pelo dono das tabelas; INSERT continua permitido).
insert into auth.users(id) values ('b1000000-0000-4000-8000-000000000001');
insert into organizations(id,name) values ('b2000000-0000-4000-8000-00000000000a','A');
insert into establishments(id,organization_id,name,timezone) values
 ('b3000000-0000-4000-8000-00000000000a','b2000000-0000-4000-8000-00000000000a','UA','UTC');
insert into memberships(organization_id,user_id,role) values
 ('b2000000-0000-4000-8000-00000000000a','b1000000-0000-4000-8000-000000000001','owner');
insert into products(id,organization_id,establishment_id,name,unit) values
 ('b4000000-0000-4000-8000-00000000000a','b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-00000000000a','PA','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('b5000000-0000-4000-8000-00000000000a','b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-00000000000a','FA');
insert into batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by) values
 ('b6000000-0000-4000-8000-00000000000a','b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-00000000000a','b4000000-0000-4000-8000-00000000000a','b5000000-0000-4000-8000-00000000000a','b7000000-0000-4000-8000-000000000001','L1',10,'kg','2027-01-01','original','2027-01-01','UTC','b1000000-0000-4000-8000-000000000001');
insert into containers(id,organization_id,establishment_id,batch_id,created_by) values
 ('b9000000-0000-4000-8000-00000000000a','b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-00000000000a','b6000000-0000-4000-8000-00000000000a','b1000000-0000-4000-8000-000000000001');
insert into stock_movements(id,organization_id,establishment_id,batch_id,intent_id,kind,quantity,timezone,created_by) values
 ('b8000000-0000-4000-8000-00000000000a','b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-00000000000a','b6000000-0000-4000-8000-00000000000a','b7000000-0000-4000-8000-000000000002','consumption',1,'UTC','b1000000-0000-4000-8000-000000000001');

-- 1) Dono das tabelas (o papel que roda migrações): o gatilho recusa com 55000, sem depender de privilégio.
select throws_ok($$update batch_receipts set source_code='X' where id='b6000000-0000-4000-8000-00000000000a'$$,'55000',null,'dono não altera recebimento');
select throws_ok($$delete from batch_receipts where id='b6000000-0000-4000-8000-00000000000a'$$,'55000',null,'dono não apaga recebimento');
select throws_ok($$truncate batch_receipts cascade$$,'55000',null,'dono não trunca recebimentos');
select throws_ok($$update containers set created_at=now() where id='b9000000-0000-4000-8000-00000000000a'$$,'55000',null,'dono não altera recipiente');
select throws_ok($$delete from containers where id='b9000000-0000-4000-8000-00000000000a'$$,'55000',null,'dono não apaga recipiente');
select throws_ok($$truncate containers$$,'55000',null,'dono não trunca recipientes');
select throws_ok($$update stock_movements set quantity=2 where id='b8000000-0000-4000-8000-00000000000a'$$,'55000',null,'dono não altera movimento');
select throws_ok($$delete from stock_movements where id='b8000000-0000-4000-8000-00000000000a'$$,'55000',null,'dono não apaga movimento');
select throws_ok($$truncate stock_movements$$,'55000',null,'dono não trunca movimentos');
-- A recusa vale para o comando, mesmo que nenhuma linha seja atingida (gatilho por comando).
select throws_ok($$delete from stock_movements where false$$,'55000',null,'comando de apagar é recusado mesmo sem linhas');
select throws_ok($$update containers set created_at=created_at where false$$,'55000',null,'comando de alterar é recusado mesmo sem linhas');
-- Nem com replicação lógica simulada o gatilho é ignorado (ENABLE ALWAYS).
select throws_ok($$set local session_replication_role = replica; delete from stock_movements where id='b8000000-0000-4000-8000-00000000000a'$$,'55000',null,'modo réplica não contorna a proteção');
reset session_replication_role;
select is((select count(*) from stock_movements where id='b8000000-0000-4000-8000-00000000000a'), 1::bigint, 'movimento continua registrado');
select is((select quantity from stock_movements where id='b8000000-0000-4000-8000-00000000000a'), 1::numeric, 'movimento continua inalterado');

-- 2) service_role (chave de serviço da API): sem privilégio e sem como desligar o gatilho.
set local role service_role;
select throws_ok($$update batch_receipts set source_code='X'$$,'42501',null,'service_role não altera recebimento');
select throws_ok($$delete from batch_receipts$$,'42501',null,'service_role não apaga recebimento');
select throws_ok($$truncate batch_receipts cascade$$,'42501',null,'service_role não trunca recebimentos');
select throws_ok($$update containers set created_at=now()$$,'42501',null,'service_role não altera recipiente');
select throws_ok($$delete from containers$$,'42501',null,'service_role não apaga recipiente');
select throws_ok($$truncate containers$$,'42501',null,'service_role não trunca recipientes');
select throws_ok($$update stock_movements set quantity=2$$,'42501',null,'service_role não altera movimento');
select throws_ok($$delete from stock_movements$$,'42501',null,'service_role não apaga movimento');
select throws_ok($$truncate stock_movements$$,'42501',null,'service_role não trunca movimentos');
select throws_ok($$alter table stock_movements disable trigger stock_movements_append_only$$,'42501',null,'service_role não desliga a proteção');
select throws_ok($$set session_replication_role = replica$$,'42501',null,'service_role não entra em modo réplica');
select is((select count(*) from stock_movements where id='b8000000-0000-4000-8000-00000000000a'), 1::bigint, 'service_role continua lendo o histórico');
reset role;

-- 3) authenticated (proprietário com sessão): mesma recusa.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$delete from stock_movements$$,'42501',null,'proprietário não apaga movimento');
select throws_ok($$truncate containers$$,'42501',null,'proprietário não trunca recipientes');
select throws_ok($$alter table batch_receipts disable trigger batch_receipts_append_only$$,'42501',null,'proprietário não desliga a proteção');
reset role;

-- 4) Caminho B-1 (backfill da 6.1): suspensão nominal dentro da transação e verificação final.
select lives_ok($$select private.assert_history_protected()$$,'verificação aceita o estado instalado');

savepoint b1_disabled;
alter table containers disable trigger containers_append_only;
select lives_ok($$update containers set created_at=created_at where id='b9000000-0000-4000-8000-00000000000a'$$,'com o gatilho suspenso o backfill consegue atualizar');
select throws_ok($$select private.assert_history_protected()$$,'55000',null,'verificação recusa gatilho desabilitado');
alter table containers enable always trigger containers_append_only;
select lives_ok($$select private.assert_history_protected()$$,'verificação aceita depois de reabilitar');
select throws_ok($$update containers set created_at=created_at where false$$,'55000',null,'depois de reabilitar a proteção volta a recusar');
rollback to savepoint b1_disabled;

savepoint b1_origin;
alter table stock_movements enable trigger stock_movements_append_only;
select throws_ok($$select private.assert_history_protected()$$,'55000',null,'verificação recusa gatilho reabilitado sem ALWAYS (ignorado em modo réplica)');
rollback to savepoint b1_origin;

savepoint b1_dropped;
drop trigger batch_receipts_append_only on batch_receipts;
select throws_ok($$select private.assert_history_protected()$$,'55000',null,'verificação recusa gatilho ausente');
rollback to savepoint b1_dropped;

savepoint b1_weaker;
drop trigger stock_movements_append_only on stock_movements;
create trigger stock_movements_append_only before update or delete on stock_movements
  for each statement execute function private.reject_history_change();
alter table stock_movements enable always trigger stock_movements_append_only;
select throws_ok($$select private.assert_history_protected()$$,'55000',null,'verificação recusa gatilho sem TRUNCATE');
rollback to savepoint b1_weaker;

savepoint b1_other_function;
drop trigger containers_append_only on containers;
create function pg_temp.noop() returns trigger language plpgsql as $f$ begin return null; end; $f$;
create trigger containers_append_only before update or delete or truncate on containers
  for each statement execute function pg_temp.noop();
alter table containers enable always trigger containers_append_only;
select throws_ok($$select private.assert_history_protected()$$,'55000',null,'verificação recusa gatilho que chama outra função');
rollback to savepoint b1_other_function;

savepoint b1_service_role;
grant delete on stock_movements to service_role;
select throws_ok($$select private.assert_history_protected()$$,'55000',null,'verificação recusa privilégio de apagar devolvido a service_role');
rollback to savepoint b1_service_role;

select lives_ok($$select private.assert_history_protected()$$,'estado final protegido');

select * from finish();
rollback;
