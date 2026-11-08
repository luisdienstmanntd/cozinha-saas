-- Interface de unidades: confirma no banco os limites que a tela assume.
-- Somente teste; nenhuma migração ou política foi alterada.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id) values
 ('11000000-0000-0000-0000-000000000001'),
 ('11000000-0000-0000-0000-000000000002'),
 ('11000000-0000-0000-0000-000000000003'),
 ('11000000-0000-0000-0000-000000000004');
insert into public.organizations(id,name) values
 ('21000000-0000-0000-0000-000000000001','Empresa A'),
 ('21000000-0000-0000-0000-000000000002','Empresa B');
insert into public.memberships(organization_id,user_id,role,revoked_at) values
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','owner',null),
 ('21000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002','owner',null),
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','member',null),
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000004','owner',now());
insert into public.establishments(id,organization_id,name,timezone) values
 ('31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Unidade A','America/Sao_Paulo'),
 ('31000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','Unidade B','America/Sao_Paulo');

set local role authenticated;
-- Proprietário ativo
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.establishments(organization_id,name,timezone) values ('21000000-0000-0000-0000-000000000001','Cozinha 2','America/Manaus')$$,'owner cria unidade na própria organização');
select is((select count(*) from public.establishments),2::bigint,'owner vê unidade criada e a existente');
with changed as (update public.establishments set name='Unidade A renomeada' where id='31000000-0000-0000-0000-000000000001' returning id)
 select is((select count(*) from changed),1::bigint,'owner renomeia unidade própria');
select is((select name from public.establishments where id='31000000-0000-0000-0000-000000000001'),'Unidade A renomeada','nome persistido');
select throws_ok($$update public.establishments set timezone='Invalid/Zone' where id='31000000-0000-0000-0000-000000000001'$$,'22023','Fuso horário inválido.','fuso inválido recusado também na edição');
with changed as (update public.establishments set name='Ataque' where id='31000000-0000-0000-0000-000000000002' returning id)
 select is((select count(*) from changed),0::bigint,'owner A não renomeia unidade B');
select throws_ok($$insert into public.establishments(id,organization_id,name,timezone) values ('31000000-0000-0000-0000-000000000009','21000000-0000-0000-0000-000000000001','Com id','UTC')$$,'42501',null,'cliente não escolhe id da unidade');
select throws_ok($$update public.establishments set created_at=now() where id='31000000-0000-0000-0000-000000000001'$$,'42501',null,'cliente não altera created_at');
select throws_ok($$delete from public.establishments where id='31000000-0000-0000-0000-000000000001'$$,'42501',null,'sem exclusão física de unidade');
select throws_ok($$insert into public.establishments(organization_id,name,timezone) values ('21000000-0000-0000-0000-000000000001','   ','UTC')$$,'23514',null,'nome só com espaços recusado pelo banco');

-- Colaborador ativo
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
with changed as (update public.establishments set name='Ataque' returning id)
 select is((select count(*) from changed),0::bigint,'member não renomeia unidade');
with changed as (update public.establishments set timezone='UTC' returning id)
 select is((select count(*) from changed),0::bigint,'member não altera fuso');
select is((select count(*) from public.memberships),1::bigint,'member só vê o próprio vínculo (contagem da tela é só do owner)');

-- Proprietário revogado
select set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select throws_ok($$insert into public.establishments(organization_id,name,timezone) values ('21000000-0000-0000-0000-000000000001','Ataque','UTC')$$,'42501',null,'owner revogado não cria unidade');
with changed as (update public.establishments set name='Ataque', timezone='UTC' returning id)
 select is((select count(*) from changed),0::bigint,'owner revogado não edita unidade');
reset role;

select is((select timezone from public.establishments where id='31000000-0000-0000-0000-000000000001'),'America/Sao_Paulo','tentativas negadas não alteraram o fuso');
select is((select name from public.establishments where id='31000000-0000-0000-0000-000000000002'),'Unidade B','unidade B intacta');
select * from finish();
rollback;
