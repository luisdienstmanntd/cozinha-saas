begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_index('public','batch_receipts','batch_receipts_scope_id_idx','índice para paginação por estabelecimento');
insert into auth.users(id) values ('81000000-0000-4000-8000-000000000001'),('81000000-0000-4000-8000-000000000002');
insert into organizations(id,name) values ('82000000-0000-4000-8000-000000000001','A'),('82000000-0000-4000-8000-000000000002','B');
insert into establishments(id,organization_id,name,timezone) values
 ('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','A','America/Sao_Paulo'),
 ('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','B','UTC');
insert into memberships(organization_id,user_id,role) values
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','owner'),
 ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','owner');
insert into products(id,organization_id,establishment_id,name,unit) values
 ('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','Produto','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','Fornecedor');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select receive_batch('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','0001',1.25,'2027-01-01','original','2027-01-01','86000000-0000-4000-8000-000000000001')$$,'recebe lote');
select lives_ok($$select receive_batch('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','0001',1.250,'2027-01-01','original','2027-01-01','86000000-0000-4000-8000-000000000001')$$,'reenvio equivalente');
select is((select count(*) from batch_receipts),1::bigint,'uma única entrada');
select is((select created_by from batch_receipts),'81000000-0000-4000-8000-000000000001'::uuid,'autor vem da sessão');
select lives_ok($$select ensure_container('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',(select id from batch_receipts limit 1))$$,'cria recipiente');
select lives_ok($$select ensure_container('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',(select id from batch_receipts limit 1))$$,'reenvio do recipiente');
select is((select count(*) from containers),1::bigint,'um recipiente integral');
select is((select quantity from batch_receipts),1.25::numeric,'reenvio preserva quantidade');
select throws_ok($$delete from containers$$,'42501',null,'cliente não apaga recipiente');
select throws_ok($$select receive_batch('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','0001',2,'2027-01-01','original','2027-01-01','86000000-0000-4000-8000-000000000001')$$,'23505',null,'replay alterado recusado');
select throws_ok($$select receive_batch('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','0001',1.2345,'2027-01-01','original','2027-01-01','86000000-0000-4000-8000-000000000002')$$,'22023',null,'precisão excessiva negada');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from batch_receipts),0::bigint,'empresa B não lê lote A');
select is((select count(*) from containers),0::bigint,'empresa B não lê recipiente A');
select throws_ok($$select receive_batch('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','0001',1.25,'2027-01-01','original','2027-01-01','86000000-0000-4000-8000-000000000001')$$,'42501',null,'empresa B não acessa replay');
set local role anon;
select throws_ok('select * from batch_receipts','42501',null,'anônimo não lê');
select throws_ok('select * from containers','42501',null,'anônimo não lê recipientes');
select * from finish();
rollback;
