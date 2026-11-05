begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id) values
 ('10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000003');
insert into public.organizations(id,name) values
 ('20000000-0000-0000-0000-000000000001','Empresa A'),
 ('20000000-0000-0000-0000-000000000002','Empresa B');
insert into public.memberships(organization_id,user_id,role) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','owner'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','member');
insert into public.establishments(organization_id,name,timezone) values
 ('20000000-0000-0000-0000-000000000001','Unidade A','America/Sao_Paulo'),
 ('20000000-0000-0000-0000-000000000002','Unidade B','America/Sao_Paulo');

select ok((select bool_and(relrowsecurity) from pg_class where oid in
 ('public.organizations'::regclass,'public.establishments'::regclass,'public.memberships'::regclass)), 'RLS nas três tabelas');
select ok(not has_function_privilege('anon','private.has_membership(uuid,boolean)','execute'), 'anônimo não executa helper');
select throws_ok($$insert into public.establishments(organization_id,name,timezone) values ('20000000-0000-0000-0000-000000000001','Inválida','Invalid/Zone')$$, '22023', 'Fuso horário inválido.', 'timezone validado pelo banco');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.organizations),1::bigint,'A vê somente A');
select is((select name from public.organizations),'Empresa A','A não vê B');
select is((select count(*) from public.establishments),1::bigint,'A vê somente unidade A');
select is((select count(*) from public.memberships),2::bigint,'owner A vê vínculos A');
select is((select count(*) from public.organizations o join public.establishments e on o.id=e.organization_id),1::bigint,'join isolado');
select lives_ok($$update public.organizations set name='A editada' where id='20000000-0000-0000-0000-000000000001'$$,'owner edita A');
select is((select name from public.organizations),'A editada','edição persistida');
with changed as (update public.organizations set name='Ataque' where id='20000000-0000-0000-0000-000000000002' returning id) select is((select count(*) from changed),0::bigint,'A não edita B');
select throws_ok($$insert into public.establishments(organization_id,name,timezone) values ('20000000-0000-0000-0000-000000000002','Ataque','UTC')$$,'42501',null,'A não insere unidade B');
select throws_ok($$insert into public.establishments(organization_id,name,timezone) values ('20000000-0000-0000-0000-000000000009','Ataque','UTC')$$,'42501',null,'organização inexistente negada');
select throws_ok($$update public.establishments set organization_id='20000000-0000-0000-0000-000000000002'$$,'42501',null,'não transfere unidade');
select throws_ok($$update public.memberships set role='owner'$$,'42501',null,'não altera papéis');
select throws_ok($$insert into public.memberships(organization_id,user_id,role) values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','owner')$$,'42501',null,'não cria vínculo falso');
select throws_ok($$delete from public.organizations$$,'42501',null,'sem deleção física');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is((select name from public.organizations),'Empresa B','B vê somente B');
select lives_ok($$update public.organizations set name='B editada'$$,'B edita B');
select is((select name from public.organizations),'B editada','B edição persistida');
with changed as (update public.organizations set name='Ataque' where id='20000000-0000-0000-0000-000000000001' returning id) select is((select count(*) from changed),0::bigint,'B não edita A');
select throws_ok($$insert into public.establishments(organization_id,name,timezone) values ('20000000-0000-0000-0000-000000000001','Ataque','UTC')$$,'42501',null,'B não insere unidade A');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.organizations),1::bigint,'member lê A');
select is((select count(*) from public.memberships),1::bigint,'member só vê próprio vínculo');
with changed as (update public.organizations set name='Ataque' returning id) select is((select count(*) from changed),0::bigint,'member não edita organização');
select throws_ok($$insert into public.establishments(organization_id,name,timezone) values ('20000000-0000-0000-0000-000000000001','Ataque','UTC')$$,'42501',null,'member não cria unidade');
select throws_ok($$update public.memberships set role='owner' where user_id='10000000-0000-0000-0000-000000000003'$$,'42501',null,'member não se promove');
reset role;
update public.memberships set revoked_at=now() where user_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select is((select count(*) from public.organizations),0::bigint,'revogação imediata');
select is((select count(*) from public.establishments),0::bigint,'revogado não vê unidades');
select is((select count(*) from public.memberships),0::bigint,'revogado não vê vínculos');
reset role;
set local role anon;
select throws_ok('select * from public.organizations','42501',null,'anônimo sem organizações');
select throws_ok('select * from public.establishments','42501',null,'anônimo sem unidades');
select throws_ok('select * from public.memberships','42501',null,'anônimo sem vínculos');
reset role;
select * from finish();
rollback;
