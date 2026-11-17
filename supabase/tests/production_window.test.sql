-- Fase 7, fatia 7.7: janela de registro da produção por preparação (decisão de luis, 14/11/2026,
-- resposta 5 do questionário: "janela de 2 h adequada, com possibilidade de alterar para alguns
-- alimentos"). Substitui a janela da unidade só para aquela preparação, é definida pelo proprietário e é
-- auditada. O registro de produção guarda a janela usada. Dados sintéticos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ----------------------------------------------------------------------------------------
select has_column('public', 'products', 'production_window_minutes', 'janela própria da preparação');
select col_is_null('public', 'products', 'production_window_minutes', 'sem janela própria, vale a da unidade');
select ok(not has_column_privilege('authenticated', 'public.products', 'production_window_minutes', 'INSERT'),
  'a janela não é gravada pelo cadastro');
select ok(not has_column_privilege('authenticated', 'public.products', 'production_window_minutes', 'UPDATE'),
  'a janela só muda pela função autorizada');
select ok(not has_column_privilege('service_role', 'public.products', 'production_window_minutes', 'UPDATE'),
  'nem o service_role muda a janela direto');
select ok((select not prosecdef from pg_proc
  where oid = 'public.set_preparation_window(uuid,uuid,uuid,integer)'::regprocedure),
  'set_preparation_window público é SECURITY INVOKER');
select ok(not has_function_privilege('anon', 'public.set_preparation_window(uuid,uuid,uuid,integer)', 'execute'),
  'anon não muda a janela');

insert into auth.users(id) values
 ('b1000000-0000-4000-8000-000000000001'),('b1000000-0000-4000-8000-000000000002'),
 ('b1000000-0000-4000-8000-000000000003'),('b1000000-0000-4000-8000-000000000004');
insert into organizations(id,name) values
 ('b2000000-0000-4000-8000-00000000000a','A'),('b2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('b3000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-00000000000a','Cozinha','America/Sao_Paulo'),
 ('b3000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-00000000000b','UB','America/Sao_Paulo');
insert into memberships(organization_id,user_id,role,display_name,revoked_at) values
 ('b2000000-0000-4000-8000-00000000000a','b1000000-0000-4000-8000-000000000001','owner','Dona Maria',null),
 ('b2000000-0000-4000-8000-00000000000a','b1000000-0000-4000-8000-000000000002','member','Ana Souza',null),
 ('b2000000-0000-4000-8000-00000000000b','b1000000-0000-4000-8000-000000000003','owner','Outra',null),
 ('b2000000-0000-4000-8000-00000000000a','b1000000-0000-4000-8000-000000000004','member','Revogada',now());
insert into products(id,organization_id,establishment_id,name,unit,storage_condition,kind) values
 ('b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-0000000000a1','Caldo de legumes','l','refrigerated','preparation'),
 ('b4000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-0000000000a1','Arroz','kg','ambient','product'),
 ('b4000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-0000000000a1','Molho branco','l','refrigerated','preparation');
-- Só preparação tem janela própria (a regra do banco vale para qualquer caminho de escrita).
select throws_ok($$update public.products set production_window_minutes = 60 where id = 'b4000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'produto recebido não tem janela de produção');
select throws_ok($$update public.products set production_window_minutes = 14 where id = 'b4000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'o banco recusa janela abaixo de 15 minutos mesmo sem passar pela função');

set local role authenticated;
create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.window(p_product uuid, p_minutes integer) returns integer language sql as $$
  select public.set_preparation_window('b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-0000000000a1', p_product, p_minutes)
$$;
create function pg_temp.produce(p_product uuid, p_by uuid, p_produced timestamptz, p_late text, p_intent uuid) returns uuid language sql as $$
  select public.register_production('b2000000-0000-4000-8000-00000000000a','b3000000-0000-4000-8000-0000000000a1',
    p_product, 6, ((now() at time zone 'America/Sao_Paulo')::date + 3), p_produced, p_by, null, p_late, p_intent)
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1) Quem muda: só o proprietário ativo da empresa ------------------------------------------------------
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select throws_ok($$select pg_temp.window('b4000000-0000-4000-8000-000000000001', 45)$$, '42501', 'Acesso negado.', 'colaborador não muda a janela');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select throws_ok($$select pg_temp.window('b4000000-0000-4000-8000-000000000001', 45)$$, '42501', 'Acesso negado.', 'proprietário de outra empresa não muda a janela');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000004');
select throws_ok($$select pg_temp.window('b4000000-0000-4000-8000-000000000001', 45)$$, '42501', 'Acesso negado.', 'vínculo revogado não muda a janela');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select throws_ok($$select pg_temp.window('b4000000-0000-4000-8000-000000000002', 45)$$, '22023',
  'Só preparação própria tem janela de produção própria.', 'produto recebido não tem janela própria');
select throws_ok($$select pg_temp.window(gen_random_uuid(), 45)$$, '23503', 'Preparação não encontrada.', 'preparação inexistente');
select throws_ok($$select pg_temp.window('b4000000-0000-4000-8000-000000000001', 14)$$, '22023',
  'A janela de registro da produção deve ficar entre 15 minutos e 24 horas, em minutos inteiros.', 'abaixo de 15 minutos');
select throws_ok($$select pg_temp.window('b4000000-0000-4000-8000-000000000001', 1441)$$, '22023',
  'A janela de registro da produção deve ficar entre 15 minutos e 24 horas, em minutos inteiros.', 'acima de 24 horas');
select is(pg_temp.window('b4000000-0000-4000-8000-000000000001', null), null::integer, 'sem janela própria já é o padrão: voltar não muda nada');
select is((select count(*)::int from public.entity_changes where entity = 'product' and field = 'production_window_minutes'), 0,
  'recusas e repetições não gravam auditoria');

-- 2) Janela da unidade vale enquanto a preparação não tem a sua ----------------------------------------
select throws_ok($$select pg_temp.produce('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
    now() - interval '150 minutes', null, 'b7000000-0000-4000-8000-000000000001')$$, '22023',
  'Produção registrada mais de 2 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
  'sem janela própria, vale a da unidade (2 horas)');

-- 3) Gravação auditada ------------------------------------------------------------------------------------
select is(pg_temp.window('b4000000-0000-4000-8000-000000000001', 240), 240, 'proprietário define a janela do caldo: 4 horas');
select is((select production_window_minutes from public.products where id = 'b4000000-0000-4000-8000-000000000001'), 240, 'a janela fica no cadastro da preparação');
select is((select (old_value is null)::text || '>' || new_value from public.entity_changes
    where entity = 'product' and field = 'production_window_minutes' and entity_id = 'b4000000-0000-4000-8000-000000000001'),
  'true>240', 'auditoria: anterior (nenhum = a da unidade), novo, no cadastro da preparação');
select is((select changed_by from public.entity_changes where entity = 'product' and field = 'production_window_minutes'),
  'b1000000-0000-4000-8000-000000000001'::uuid, 'auditoria: quem mudou');
select is(pg_temp.window('b4000000-0000-4000-8000-000000000001', 240), 240, 'repetir o mesmo valor é aceito');
select is((select count(*)::int from public.entity_changes where entity = 'product' and field = 'production_window_minutes'), 1,
  'repetir o mesmo valor não gera auditoria');
select is(pg_temp.window('b4000000-0000-4000-8000-000000000001', 180), 180, 'trocar o valor');
select is((select old_value || '>' || new_value from public.entity_changes where entity = 'product' and field = 'production_window_minutes'
    and new_value = '180'), '240>180', 'auditoria da troca: 240 → 180');
select is((select production_window_minutes from public.products where id = 'b4000000-0000-4000-8000-000000000003'), null::integer,
  'a outra preparação segue com a janela da unidade');

-- 4) A janela da preparação vale no registro da produção --------------------------------------------------
-- Caldo: 180 minutos. 150 minutos atrás está dentro dela (na unidade, 120, seria tardia).
select pg_temp.produce('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
  now() - interval '150 minutes', null, 'b7000000-0000-4000-8000-000000000002') as dentro \gset
select is((select late::text || '|' || late_window_minutes from public.batch_productions where batch_id = :'dentro'), 'false|180',
  'dentro da janela do caldo: não é tardia, e o registro guarda a janela usada (180)');
select throws_ok($$select pg_temp.produce('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
    now() - interval '200 minutes', null, 'b7000000-0000-4000-8000-000000000003')$$, '22023',
  'Produção registrada mais de 3 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
  'acima da janela do caldo exige justificativa, com a duração dela na mensagem');
select throws_ok($$select pg_temp.produce('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
    now() - interval '170 minutes', 'Atraso', 'b7000000-0000-4000-8000-000000000004')$$, '22023',
  'Justificativa de atraso só vale para produção registrada mais de 3 horas depois de feita.',
  'dentro da janela do caldo não aceita justificativa');
select pg_temp.produce('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
  now() - interval '200 minutes', 'Registro esquecido', 'b7000000-0000-4000-8000-000000000005') as tarde \gset
select is((select late::text || '|' || late_window_minutes from public.batch_productions where batch_id = :'tarde'), 'true|180',
  'acima da janela do caldo: tardia, com a janela usada');
select is((select count(*)::int from public.occurrences where batch_id = :'tarde' and kind = 'late_production'), 1,
  'a ocorrência de produção tardia é aberta na mesma transação');
-- Molho branco continua com a janela da unidade (120).
select throws_ok($$select pg_temp.produce('b4000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000002',
    now() - interval '150 minutes', null, 'b7000000-0000-4000-8000-000000000006')$$, '22023',
  'Produção registrada mais de 2 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
  'a janela de uma preparação não vale para a outra');

-- 5) Mudar a janela nunca reescreve registro antigo --------------------------------------------------------
select is(pg_temp.window('b4000000-0000-4000-8000-000000000001', 20), 20, 'janela encurtada para 20 minutos');
select is((select late::text || '|' || late_window_minutes from public.batch_productions where batch_id = :'dentro'), 'false|180',
  'produção antiga continua com a janela e a marcação de quando foi registrada');
select is((select late::text || '|' || late_window_minutes from public.batch_productions where batch_id = :'tarde'), 'true|180',
  'produção tardia antiga continua tardia');
-- Repetir a tentativa antiga devolve o mesmo lote, sem reavaliar a janela (idempotência).
select is(pg_temp.produce('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
    now() - interval '150 minutes', null, 'b7000000-0000-4000-8000-000000000002'), :'dentro'::uuid,
  'repetir a mesma tentativa devolve o mesmo lote depois de a janela mudar');

-- 6) Voltar à janela da unidade ------------------------------------------------------------------------------
select is(pg_temp.window('b4000000-0000-4000-8000-000000000001', null), null::integer, 'volta a usar a janela da unidade');
select is((select old_value || '>' || coalesce(new_value, 'unidade') from public.entity_changes
    where entity = 'product' and field = 'production_window_minutes' and old_value = '20'), '20>unidade',
  'a volta é auditada (novo valor vazio = janela da unidade)');
select throws_ok($$select pg_temp.produce('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
    now() - interval '150 minutes', null, 'b7000000-0000-4000-8000-000000000007')$$, '22023',
  'Produção registrada mais de 2 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
  'sem janela própria, vale a da unidade de novo');

-- 7) Leitura e isolamento ----------------------------------------------------------------------------------------
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select is((select production_window_minutes from public.products where id = 'b4000000-0000-4000-8000-000000000001'), null::integer,
  'colaborador lê a janela da preparação (hoje sem janela própria)');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select is_empty($$select 1 from public.products where production_window_minutes is not null$$, 'outra empresa não lê janelas de A');

select * from finish();
rollback;
