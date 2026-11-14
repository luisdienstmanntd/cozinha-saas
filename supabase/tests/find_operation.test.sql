-- Fase 6, fatia 6.8: find_operation confere pelo servidor se uma tentativa pendente chegou a ser gravada.
-- Só lê, pela RLS: membro vê o que o proprietário gravou; outra empresa não vê nada.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_function('public', 'find_operation', array['uuid','uuid','uuid'], 'find_operation existe');
select ok((select not prosecdef from pg_proc where oid = 'public.find_operation(uuid,uuid,uuid)'::regprocedure),
  'find_operation é SECURITY INVOKER (a RLS filtra)');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.find_operation(uuid,uuid,uuid)'::regprocedure),
  'find_operation fixa search_path vazio');
select ok(has_function_privilege('authenticated', 'public.find_operation(uuid,uuid,uuid)', 'execute'), 'authenticated confere tentativas');
select ok(not has_function_privilege('anon', 'public.find_operation(uuid,uuid,uuid)', 'execute'), 'anon não confere tentativas');

insert into auth.users(id) values
 ('e1000000-0000-4000-8000-000000000001'),('e1000000-0000-4000-8000-000000000002'),('e1000000-0000-4000-8000-000000000003');
insert into organizations(id,name) values
 ('e2000000-0000-4000-8000-00000000000a','A'),('e2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('e3000000-0000-4000-8000-0000000000a1','e2000000-0000-4000-8000-00000000000a','UA','America/Sao_Paulo'),
 ('e3000000-0000-4000-8000-0000000000b1','e2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,display_name) values
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000001','owner','Luis'),
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000002','member','Bia'),
 ('e2000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-000000000003','owner','Outro');
insert into products(id,organization_id,establishment_id,name,unit,storage_condition) values
 ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','Frango','kg','refrigerated'),
 ('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','Arroz','kg','ambient');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','FA');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

create function pg_temp.find(p_intent uuid, p_org uuid default 'e2000000-0000-4000-8000-00000000000a',
  p_est uuid default 'e3000000-0000-4000-8000-0000000000a1') returns text language sql stable as $$
  select kind from public.find_operation(p_org, p_est, p_intent) $$;
grant execute on function pg_temp.find(uuid,uuid,uuid) to authenticated;

-- Recebimento (Arroz ambiente) e recebimento sem medição (Frango) que abre ocorrência.
select public.receive_batch('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',
  'e4000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001','L-A',10,current_date+30,'original',current_date+30,
  'ambient','not_required',null,null,'e7000000-0000-4000-8000-000000000001') as batch \gset
select public.receive_batch('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',
  'e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','L-F',5,current_date+30,'original',current_date+30,
  'refrigerated','not_measured',null,'Sem termômetro','e7000000-0000-4000-8000-000000000002') as fbatch \gset
select is(pg_temp.find('e7000000-0000-4000-8000-000000000001'), 'receipt', 'recebimento é encontrado pelo identificador');
select is(pg_temp.find('e7000000-0000-4000-8000-0000000000ff'), null, 'identificador desconhecido não encontra nada');
select is(pg_temp.find(null), null, 'identificador nulo não encontra nada');

-- Movimento.
select public.record_movement('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',:'batch',
  'consumption',1,null,'e7000000-0000-4000-8000-000000000003');
select is(pg_temp.find('e7000000-0000-4000-8000-000000000003'), 'movement', 'movimento é encontrado');

-- Manipulação e anulação.
select public.ensure_container('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',:'batch') as box \gset
select public.handle_container('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',:'box'::uuid,
  'opening', array[2]::numeric[], current_date+5, 'ambient', now(), 'e1000000-0000-4000-8000-000000000001', 'sealed', null, null, null,
  'e7000000-0000-4000-8000-000000000004') as handling \gset
select is(pg_temp.find('e7000000-0000-4000-8000-000000000004'), 'handling', 'manipulação é encontrada');
select public.void_handling('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',:'handling'::uuid,
  'Lançado por engano','e7000000-0000-4000-8000-000000000005');
select is(pg_temp.find('e7000000-0000-4000-8000-000000000005'), 'handling_void', 'anulação de manipulação é encontrada');

-- Decisão de ocorrência.
select id as occ from public.occurrences where batch_id = :'fbatch' and kind = 'temperature_not_measured' \gset
select public.decide_occurrence('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1',:'occ'::uuid,
  'released','Medido com termômetro reserva','e7000000-0000-4000-8000-000000000006');
select is(pg_temp.find('e7000000-0000-4000-8000-000000000006'), 'decision', 'decisão de ocorrência é encontrada');

-- Escopo: unidade ou empresa trocadas não encontram; membro encontra; outra empresa não.
select is(pg_temp.find('e7000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-00000000000b','e3000000-0000-4000-8000-0000000000b1'),
  null, 'mesma tentativa consultada com o escopo de outra empresa não aparece');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(pg_temp.find('e7000000-0000-4000-8000-000000000004'), 'handling', 'membro da mesma empresa vê a operação gravada pelo proprietário');
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(pg_temp.find('e7000000-0000-4000-8000-000000000004'), null, 'proprietário de B não vê a operação de A, nem com o escopo de A');
select is(pg_temp.find('e7000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1'),
  null, 'proprietário de B não vê o recebimento de A');
reset role;
set local role anon;
select throws_ok($$select * from public.find_operation('e2000000-0000-4000-8000-00000000000a','e3000000-0000-4000-8000-0000000000a1','e7000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'anônimo não executa find_operation');
reset role;
select * from finish();
rollback;
