-- Fase 6, fatia 6.0c (P6): fuso imutável depois do primeiro recebimento e auditoria de nome/fuso.
-- Testes 13 do desenho (seção 8). A corrida fuso x recebimento (teste 21) fica em
-- tests/integration/timezone-race.test.mjs, porque precisa de duas sessões.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- u1 owner de A; u2 member de A; u3 owner de B.
insert into auth.users(id) values
 ('c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000002'),('c1000000-0000-4000-8000-000000000003');
insert into organizations(id,name) values
 ('c2000000-0000-4000-8000-00000000000a','Org A'),('c2000000-0000-4000-8000-00000000000b','Org B');
insert into establishments(id,organization_id,name,timezone) values
 ('c3000000-0000-4000-8000-00000000000a','c2000000-0000-4000-8000-00000000000a','Com recebimento','America/Sao_Paulo'),
 ('c3000000-0000-4000-8000-00000000000c','c2000000-0000-4000-8000-00000000000a','Sem recebimento','America/Sao_Paulo'),
 ('c3000000-0000-4000-8000-00000000000b','c2000000-0000-4000-8000-00000000000b','Unidade B','America/Sao_Paulo');
insert into memberships(organization_id,user_id,role) values
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000001','owner'),
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000002','member'),
 ('c2000000-0000-4000-8000-00000000000b','c1000000-0000-4000-8000-000000000003','owner');
insert into products(id,organization_id,establishment_id,name,unit) values
 ('c4000000-0000-4000-8000-00000000000a','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','PA','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('c5000000-0000-4000-8000-00000000000a','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','FA');

-- Catálogo -------------------------------------------------------------------
select has_table('public','entity_changes','tabela de auditoria existe');
select ok((select relrowsecurity from pg_class where oid = 'public.entity_changes'::regclass),'entity_changes tem RLS');
select is(
  (select coalesce(string_agg(r.role || ':' || p.priv, ',' order by r.role, p.priv), '')
    from unnest(array['anon','authenticated','service_role']) r(role)
    cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv)
    where has_table_privilege(r.role, 'public.entity_changes', p.priv)),
  '', 'nenhum papel da aplicação escreve em entity_changes');
select ok(not has_table_privilege('anon','public.entity_changes','SELECT'),'anon não lê entity_changes');
select lives_ok($$select private.assert_history_protected()$$,'verificação do histórico aceita o estado instalado');
select is(
  (select count(*) from pg_trigger g where g.tgrelid='public.entity_changes'::regclass and g.tgname='entity_changes_append_only' and g.tgenabled='A'),
  1::bigint,'entity_changes é append-only (gatilho ENABLE ALWAYS)');

-- Fuso sem recebimento: pode mudar e é auditado ---------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$update establishments set timezone='America/Manaus' where id='c3000000-0000-4000-8000-00000000000c'$$,
  'fuso muda em unidade sem recebimento');
select is((select timezone from establishments where id='c3000000-0000-4000-8000-00000000000c'),'America/Manaus','novo fuso gravado');
select is(
  (select format('%s|%s|%s|%s|%s', entity, field, old_value, new_value, changed_by)
    from entity_changes where entity_id='c3000000-0000-4000-8000-00000000000c' and field='timezone'),
  'establishment|timezone|America/Sao_Paulo|America/Manaus|c1000000-0000-4000-8000-000000000001',
  'mudança de fuso auditada com valor anterior, novo e autor');
select throws_ok($$update establishments set timezone='Invalid/Zone' where id='c3000000-0000-4000-8000-00000000000c'$$,
  '22023','Fuso horário inválido.','fuso inválido continua recusado com 22023 (unidade sem recebimento)');

-- Nome: auditado --------------------------------------------------------------
select lives_ok($$update establishments set name='Cozinha central' where id='c3000000-0000-4000-8000-00000000000c'$$,'renomear unidade');
select lives_ok($$update organizations set name='Org A renomeada' where id='c2000000-0000-4000-8000-00000000000a'$$,'renomear organização');
select is(
  (select format('%s|%s|%s|%s', field, old_value, new_value, establishment_id)
    from entity_changes where entity='establishment' and field='name' and entity_id='c3000000-0000-4000-8000-00000000000c'),
  'name|Sem recebimento|Cozinha central|c3000000-0000-4000-8000-00000000000c','renomeação de unidade auditada');
select is(
  (select format('%s|%s|%s|%s', field, old_value, new_value, coalesce(establishment_id::text,'-'))
    from entity_changes where entity='organization' and entity_id='c2000000-0000-4000-8000-00000000000a'),
  'name|Org A|Org A renomeada|-','renomeação de organização auditada');
select lives_ok($$update establishments set name='Cozinha central' where id='c3000000-0000-4000-8000-00000000000c'$$,'repetir o mesmo nome');
select lives_ok($$update establishments set timezone='America/Manaus' where id='c3000000-0000-4000-8000-00000000000c'$$,'repetir o mesmo fuso');
select is((select count(*) from entity_changes where entity_id='c3000000-0000-4000-8000-00000000000c'),2::bigint,
  'atualização sem mudança de valor não gera linha de auditoria');
reset role;

-- Recebimento torna o fuso imutável ----------------------------------------------
insert into batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by) values
 ('c6000000-0000-4000-8000-00000000000a','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','c4000000-0000-4000-8000-00000000000a','c5000000-0000-4000-8000-00000000000a','c7000000-0000-4000-8000-000000000001','L1',10,'kg','2027-01-01','original','2027-01-01','America/Sao_Paulo','c1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$update establishments set timezone='America/Manaus' where id='c3000000-0000-4000-8000-00000000000a'$$,
  '55000',null,'fuso recusado depois do primeiro recebimento (proprietário)');
select throws_ok($$update establishments set timezone='Invalid/Zone' where id='c3000000-0000-4000-8000-00000000000a'$$,
  '22023','Fuso horário inválido.','fuso inválido mantém o código 22023 também em unidade com recebimento');
select lives_ok($$update establishments set timezone='America/Sao_Paulo', name='Cozinha 1' where id='c3000000-0000-4000-8000-00000000000a'$$,
  'reenviar o mesmo fuso junto com outro campo não é mudança');
select is((select timezone from establishments where id='c3000000-0000-4000-8000-00000000000a'),'America/Sao_Paulo','fuso intacto');
select is((select count(*) from entity_changes where entity_id='c3000000-0000-4000-8000-00000000000a' and field='timezone'),0::bigint,
  'tentativa recusada não gerou auditoria de fuso');
select is((select count(*) from entity_changes where entity_id='c3000000-0000-4000-8000-00000000000a' and field='name'),1::bigint,
  'renomear unidade com recebimento continua permitido e auditado');
reset role;

-- A regra vale para qualquer papel, inclusive o dono das tabelas e a chave de serviço.
select throws_ok($$update establishments set timezone='UTC' where id='c3000000-0000-4000-8000-00000000000a'$$,
  '55000',null,'dono das tabelas também não muda o fuso');
set local role service_role;
select throws_ok($$update establishments set timezone='UTC' where id='c3000000-0000-4000-8000-00000000000a'$$,
  '55000',null,'service_role também não muda o fuso');
reset role;
-- Mudança administrativa de nome (sem sessão): auditada com autor nulo.
select set_config('request.jwt.claims','',true);
update establishments set name='Ajuste administrativo' where id='c3000000-0000-4000-8000-00000000000a';
select is((select changed_by from entity_changes where new_value='Ajuste administrativo'),null::uuid,'mudança sem sessão é auditada sem autor');

-- Visibilidade e imutabilidade da auditoria ---------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select cmp_ok((select count(*) from entity_changes),'>=',4::bigint,'proprietário de A lê a auditoria de A');
select is((select count(*) from entity_changes where organization_id <> 'c2000000-0000-4000-8000-00000000000a'),0::bigint,'proprietário de A não lê auditoria de B');
select throws_ok($$insert into entity_changes(organization_id,entity,entity_id,field,old_value,new_value) values ('c2000000-0000-4000-8000-00000000000a','organization','c2000000-0000-4000-8000-00000000000a','name','x','y')$$,
  '42501',null,'proprietário não insere auditoria direto');
select throws_ok($$update entity_changes set new_value='x'$$,'42501',null,'proprietário não altera auditoria');
select throws_ok($$delete from entity_changes$$,'42501',null,'proprietário não apaga auditoria');

select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from entity_changes),0::bigint,'membro não lê auditoria');
select is((select count(*) from establishments where id='c3000000-0000-4000-8000-00000000000a'),1::bigint,'membro continua lendo a unidade');

select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from entity_changes),0::bigint,'proprietário de outra empresa não lê auditoria de A');
update organizations set name='Org B renomeada' where id='c2000000-0000-4000-8000-00000000000b';
select is((select count(*) from entity_changes),1::bigint,'proprietário de B lê só a própria auditoria');
reset role;

select throws_ok($$update entity_changes set new_value='x'$$,'55000',null,'dono das tabelas não altera auditoria');
select throws_ok($$delete from entity_changes$$,'55000',null,'dono das tabelas não apaga auditoria');
select throws_ok($$truncate entity_changes$$,'55000',null,'dono das tabelas não trunca auditoria');

select * from finish();
rollback;
