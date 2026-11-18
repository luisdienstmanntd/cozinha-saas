-- Fase 7, fatia 7.8: registro da etiqueta baixada da produção (base do aviso de produção sem etiqueta).
-- O registro é só um evento de leitura/impressão: não cria estoque, saldo, movimento nem recipiente (D-003).
-- Quem registra: o proprietário e, quando a unidade deixa o colaborador registrar produção (7.6), o
-- colaborador. O banco não bloqueia nada: ele não sabe se a etiqueta foi colada. Dados sintéticos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ----------------------------------------------------------------------------------------
select has_table('public', 'production_label_downloads', 'tabela de etiquetas baixadas');
select ok((select relrowsecurity from pg_class where oid = 'public.production_label_downloads'::regclass), 'com RLS');
select ok(not has_any_column_privilege('authenticated', 'public.production_label_downloads', 'INSERT,UPDATE'),
  'só a função autorizada grava');
select ok(not has_table_privilege('authenticated', 'public.production_label_downloads', 'DELETE'), 'ninguém apaga');
select ok(not has_table_privilege('service_role', 'public.production_label_downloads', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'service_role só lê');
select ok(not has_table_privilege('anon', 'public.production_label_downloads', 'SELECT'), 'anon não lê');
select ok((select not prosecdef from pg_proc
  where oid = 'public.record_production_label_download(uuid,uuid,uuid)'::regprocedure),
  'record_production_label_download público é SECURITY INVOKER');
select ok(not has_function_privilege('anon', 'public.record_production_label_download(uuid,uuid,uuid)', 'execute'),
  'anon não registra');
select is((select count(*)::int from pg_trigger g where g.tgrelid = 'public.production_label_downloads'::regclass
    and g.tgname = 'production_label_downloads_append_only' and g.tgfoid = 'private.reject_history_change()'::regprocedure), 1,
  'histórico append-only');
select lives_ok($$select private.assert_history_protected()$$, 'proteção do histórico completa com a tabela nova');

insert into auth.users(id) values
 ('c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000002'),
 ('c1000000-0000-4000-8000-000000000003'),('c1000000-0000-4000-8000-000000000004');
insert into organizations(id,name) values
 ('c2000000-0000-4000-8000-00000000000a','A'),('c2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('c3000000-0000-4000-8000-0000000000a1','c2000000-0000-4000-8000-00000000000a','Cozinha','America/Sao_Paulo'),
 ('c3000000-0000-4000-8000-0000000000b1','c2000000-0000-4000-8000-00000000000b','UB','America/Sao_Paulo');
insert into memberships(organization_id,user_id,role,display_name,revoked_at) values
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000001','owner','Dona Maria',null),
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000002','member','Ana Souza',null),
 ('c2000000-0000-4000-8000-00000000000b','c1000000-0000-4000-8000-000000000003','owner','Outra',null),
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000004','member','Revogada',now());
insert into products(id,organization_id,establishment_id,name,unit,storage_condition,kind) values
 ('c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','Caldo de legumes','l','refrigerated','preparation'),
 ('c4000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','Arroz','kg','ambient','product');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('c5000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','F');

select (now() at time zone 'America/Sao_Paulo')::date as sp \gset

set local role authenticated;
create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.produce(p_intent uuid) returns uuid language sql as $$
  select public.register_production('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
    'c4000000-0000-4000-8000-000000000001', 6, ((now() at time zone 'America/Sao_Paulo')::date + 3),
    now() - interval '5 minutes', 'c1000000-0000-4000-8000-000000000002', null, null, p_intent)
$$;
create function pg_temp.integral(p_batch uuid) returns uuid language sql as $$
  select id from public.containers where batch_id = p_batch and kind = 'integral'
$$;
create function pg_temp.record(p_container uuid) returns timestamptz language sql as $$
  select public.record_production_label_download('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1', p_container)
$$;
grant execute on all functions in schema pg_temp to authenticated;

select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.produce('c7000000-0000-4000-8000-000000000001') as lote \gset
select pg_temp.integral(:'lote') as box \gset
select (select count(*) from public.batch_receipts) as n_batches, (select count(*) from public.containers) as n_containers,
  (select count(*) from public.stock_movements) as n_movements, (select coalesce(sum(balance),0) from public.container_balances) as saldo \gset

-- 1) Quem registra --------------------------------------------------------------------------------------
select ok(pg_temp.record(:'box') <= now(), 'proprietário registra a etiqueta baixada');
select is((select downloaded_by from public.production_label_downloads where container_id = :'box'),
  'c1000000-0000-4000-8000-000000000001'::uuid, 'o registro guarda quem baixou');
select is((select batch_id from public.production_label_downloads where container_id = :'box'), :'lote'::uuid, 'e o lote da produção');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select throws_ok(format($$select pg_temp.record(%L)$$, :'box'), '42501', 'Acesso negado.',
  'padrão: colaborador não registra (só o proprietário escreve, D-019)');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select throws_ok(format($$select pg_temp.record(%L)$$, :'box'), '42501', 'Acesso negado.', 'outra empresa não registra');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
select throws_ok(format($$select pg_temp.record(%L)$$, :'box'), '42501', 'Acesso negado.', 'vínculo revogado não registra');
-- Modo "colaboradores registram a própria produção" (7.6): o colaborador também registra.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.set_establishment_settings('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  'member', 120, 60, 'equal') is not null as ok \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select ok(pg_temp.record(:'box') <= now(), 'modo colaboradores: o colaborador registra');
select is((select count(*)::int from public.production_label_downloads where container_id = :'box'), 2,
  'cada download vira uma linha (o aviso usa o primeiro)');
select is((select array_agg(downloaded_by order by downloaded_by) from public.production_label_downloads where container_id = :'box'),
  array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002']::uuid[],
  'cada download guarda quem baixou (proprietário e colaborador)');

-- 2) O recipiente certo ------------------------------------------------------------------------------------
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select throws_ok($$select pg_temp.record(gen_random_uuid())$$, '23503', 'Recipiente de produção não encontrado.', 'recipiente inexistente');
select public.receive_batch('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  'c4000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000001','L-1',10,
  (:'sp'::date + 10),'original',(:'sp'::date + 10),'ambient','not_required',null,null,
  'c7000000-0000-4000-8000-000000000003') as rec \gset
select throws_ok(format($$select pg_temp.record(%L)$$, pg_temp.integral(:'rec')), '23503', 'Recipiente de produção não encontrado.',
  'recebimento não é produção: sem registro');
select public.handle_container('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  :'box', 'portioning', array[2,2]::numeric[], (select expiry_date from public.containers where id = :'box'), 'refrigerated', now(),
  'c1000000-0000-4000-8000-000000000002', 'sealed', null, null, null, 'c7000000-0000-4000-8000-000000000004') as handling \gset
select throws_ok(format($$select pg_temp.record(%L)$$, (select id from public.containers where batch_id = :'lote' and kind = 'derived' limit 1)),
  '23503', 'Recipiente de produção não encontrado.', 'porção não é o recipiente da produção');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select throws_ok(format($$select pg_temp.record(%L)$$, :'box'), '42501', 'Acesso negado.', 'outra empresa não vê o recipiente de A');

-- 3) Produção anulada ----------------------------------------------------------------------------------------
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.produce('c7000000-0000-4000-8000-000000000005') as lote2 \gset
select pg_temp.integral(:'lote2') as box2 \gset
select public.void_production('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  :'lote2', 'Validade digitada errada', 'c7000000-0000-4000-8000-000000000006') is not null as ok \gset
select throws_ok(format($$select pg_temp.record(%L)$$, :'box2'), '22023', 'Produção anulada: não há etiqueta a registrar.',
  'produção anulada não registra etiqueta');

-- 4) Sem efeito no estoque (D-003) -------------------------------------------------------------------------------
select is((select count(*) from public.containers) - :n_containers, 4::bigint,
  'recipientes novos: integral do recebimento, integral da segunda produção e duas porções; nenhum pelo registro');
select is((select count(*) from public.batch_receipts) - :n_batches, 2::bigint,
  'lotes novos: só os dois criados no teste (recebimento e segunda produção), nenhum pelo registro');
select is((select coalesce(sum(balance),0) from public.container_balances where batch_id = :'lote'), 6::numeric,
  'o saldo da produção não mudou pelo registro');
select is((select count(*) from public.stock_movements where batch_id = :'lote' and kind in ('consumption','discard')), 0::bigint,
  'nenhum consumo ou descarte pelo registro');

-- 5) Leitura e isolamento -------------------------------------------------------------------------------------------
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select cmp_ok((select count(*) from public.production_label_downloads), '=', 2::bigint, 'colaborador lê os registros da empresa');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select is_empty($$select 1 from public.production_label_downloads$$, 'outra empresa não lê');

reset role;
select throws_ok($$update public.production_label_downloads set downloaded_at = now()$$, '55000', null, 'registro não é alterado');
select throws_ok($$delete from public.production_label_downloads$$, '55000', null, 'registro não é apagado');
select throws_ok($$truncate public.production_label_downloads$$, '55000', null, 'registro não é truncado');

select * from finish();
rollback;
