-- Fase 7, fatia 7.6: configurações da unidade (decisões A e B de luis, 14/11/2026). Quem registra
-- produção, janela de registro da produção, tempo máximo sem etiqueta e regra da validade da porção
-- de preparação. Padrões = regras de hoje. Matriz de papéis do modo "colaboradores registram a
-- própria produção". Dados sintéticos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catálogo ----------------------------------------------------------------------------------------
select has_table('public', 'establishment_settings', 'tabela de configurações da unidade');
select ok((select relrowsecurity from pg_class where oid = 'public.establishment_settings'::regclass), 'configurações com RLS');
select ok(not has_any_column_privilege('authenticated', 'public.establishment_settings', 'INSERT,UPDATE'),
  'configurações só mudam pela função autorizada');
select ok(not has_table_privilege('authenticated', 'public.establishment_settings', 'DELETE'), 'configurações não são apagadas');
select ok(not has_table_privilege('service_role', 'public.establishment_settings', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'service_role só lê as configurações');
select ok((select not prosecdef from pg_proc
  where oid = 'public.set_establishment_settings(uuid,uuid,text,integer,integer,text)'::regprocedure),
  'set_establishment_settings público é SECURITY INVOKER');
select ok(not has_function_privilege('anon', 'public.set_establishment_settings(uuid,uuid,text,integer,integer,text)', 'execute'),
  'anon não muda configurações');
select col_default_is('public', 'batch_productions', 'late_window_minutes', '120',
  'produção anterior à 7.6 guarda a janela de 2 horas que valia');

-- Texto da duração (mensagens e tela).
select is(private.duration_text(120), '2 horas', '120 minutos = 2 horas');
select is(private.duration_text(60), '1 hora', '60 minutos = 1 hora');
select is(private.duration_text(90), '1 hora e 30 minutos', '90 minutos');
select is(private.duration_text(61), '1 hora e 1 minuto', '61 minutos');
select is(private.duration_text(45), '45 minutos', '45 minutos');
select is(private.duration_text(1440), '24 horas', '24 horas');

insert into auth.users(id) values
 ('a1000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002'),
 ('a1000000-0000-4000-8000-000000000003'),('a1000000-0000-4000-8000-000000000004'),
 ('a1000000-0000-4000-8000-000000000005');
insert into organizations(id,name) values
 ('a2000000-0000-4000-8000-00000000000a','A'),('a2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('a3000000-0000-4000-8000-0000000000a1','a2000000-0000-4000-8000-00000000000a','Cozinha','America/Sao_Paulo'),
 ('a3000000-0000-4000-8000-0000000000a2','a2000000-0000-4000-8000-00000000000a','Cozinha 2','America/Sao_Paulo'),
 ('a3000000-0000-4000-8000-0000000000b1','a2000000-0000-4000-8000-00000000000b','UB','America/Sao_Paulo');
insert into memberships(organization_id,user_id,role,display_name,revoked_at) values
 ('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000001','owner','Dona Maria',null),
 ('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000002','member','Ana Souza',null),
 ('a2000000-0000-4000-8000-00000000000b','a1000000-0000-4000-8000-000000000003','owner','Outra',null),
 ('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000004','member','Revogada',now()),
 ('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000005','member',null,null);
insert into products(id,organization_id,establishment_id,name,unit,storage_condition,kind) values
 ('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-0000000000a1','Caldo de legumes','l','refrigerated','preparation'),
 ('a4000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-0000000000a2','Molho','l','refrigerated','preparation');

set local role authenticated;
create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
-- Produz na unidade 1 com validade daqui a 3 dias.
create function pg_temp.produce(p_by uuid, p_produced timestamptz, p_late text, p_intent uuid) returns uuid language sql as $$
  select public.register_production('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-0000000000a1',
    'a4000000-0000-4000-8000-000000000001', 6, ((now() at time zone 'America/Sao_Paulo')::date + 3),
    p_produced, p_by, null, p_late, p_intent)
$$;
create function pg_temp.settings(p_registrar text, p_window int, p_unlabeled int, p_rule text) returns text language sql as $$
  select to_jsonb(s)::text from public.set_establishment_settings('a2000000-0000-4000-8000-00000000000a',
    'a3000000-0000-4000-8000-0000000000a1', p_registrar, p_window, p_unlabeled, p_rule) s
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1) Padrões: sem configuração gravada, valem as regras de hoje ------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
select is_empty($$select 1 from public.establishment_settings$$, 'nenhuma configuração gravada ainda');
select throws_ok($$select pg_temp.produce('a1000000-0000-4000-8000-000000000002', now() - interval '5 minutes', null,
    'a7000000-0000-4000-8000-000000000001')$$,
  '42501', 'Acesso negado.', 'padrão: colaborador não registra produção');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select throws_ok($$select pg_temp.produce('a1000000-0000-4000-8000-000000000002', now() - interval '150 minutes', null,
    'a7000000-0000-4000-8000-000000000002')$$,
  '22023', 'Produção registrada mais de 2 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
  'padrão: janela de 2 horas');
select pg_temp.produce('a1000000-0000-4000-8000-000000000002', now() - interval '5 minutes', null,
  'a7000000-0000-4000-8000-000000000003') as owner_lot \gset
select is((select late_window_minutes from public.batch_productions where batch_id = :'owner_lot'), 120,
  'a produção guarda a janela usada (2 horas)');

-- 2) Quem muda: só o proprietário ativo da mesma empresa -------------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
select throws_ok($$select pg_temp.settings('member', 120, 60, 'equal')$$, '42501', 'Acesso negado.',
  'colaborador não muda configurações');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000003');
select throws_ok($$select pg_temp.settings('member', 120, 60, 'equal')$$, '42501', 'Acesso negado.',
  'proprietário de outra empresa não muda configurações');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000004');
select throws_ok($$select pg_temp.settings('member', 120, 60, 'equal')$$, '42501', 'Acesso negado.',
  'vínculo revogado não muda configurações');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select throws_ok($$select public.set_establishment_settings('a2000000-0000-4000-8000-00000000000a',
    'a3000000-0000-4000-8000-0000000000b1', 'member', 120, 60, 'equal')$$, '23503', 'Unidade não encontrada.',
  'unidade de outra empresa é recusada');

-- 3) Valores: limites só para recusar o absurdo ----------------------------------------------------
select throws_ok($$select pg_temp.settings('member', 14, 60, 'equal')$$, '22023',
  'A janela de registro da produção deve ficar entre 15 minutos e 24 horas, em minutos inteiros.', 'janela abaixo de 15 minutos');
select throws_ok($$select pg_temp.settings('member', 1441, 60, 'equal')$$, '22023',
  'A janela de registro da produção deve ficar entre 15 minutos e 24 horas, em minutos inteiros.', 'janela acima de 24 horas');
select throws_ok($$select pg_temp.settings('member', 120, 14, 'equal')$$, '22023',
  'O tempo máximo sem etiqueta deve ficar entre 15 minutos e 24 horas, em minutos inteiros.', 'tempo sem etiqueta abaixo de 15 minutos');
select throws_ok($$select pg_temp.settings('member', 120, 1441, 'equal')$$, '22023',
  'O tempo máximo sem etiqueta deve ficar entre 15 minutos e 24 horas, em minutos inteiros.', 'tempo sem etiqueta acima de 24 horas');
select throws_ok($$select pg_temp.settings('anyone', 120, 60, 'equal')$$, '22023', 'Dados inválidos.', 'quem registra desconhecido');
select throws_ok($$select pg_temp.settings('member', 120, 60, 'greater')$$, '22023', 'Dados inválidos.',
  'não existe regra de porção com validade maior');
select throws_ok($$select pg_temp.settings(null, 120, 60, 'equal')$$, '22023', 'Dados inválidos.', 'valor ausente');
select is_empty($$select 1 from public.establishment_settings$$, 'recusas não gravam configuração');
select is((select count(*)::int from public.entity_changes where entity = 'establishment'
    and entity_id = 'a3000000-0000-4000-8000-0000000000a1'), 0, 'recusas não gravam auditoria');

-- 4) Gravação auditada -------------------------------------------------------------------------------
select is(pg_temp.settings('member', 90, 45, 'equal_or_less')::jsonb - 'updated_at',
  jsonb_build_object('organization_id','a2000000-0000-4000-8000-00000000000a','establishment_id','a3000000-0000-4000-8000-0000000000a1',
    'production_registrar','member','production_window_minutes',90,'unlabeled_limit_minutes',45,
    'portion_expiry_rule','equal_or_less','updated_by','a1000000-0000-4000-8000-000000000001'),
  'proprietário grava as configurações da unidade');
select is(
  (select string_agg(field || ':' || old_value || '>' || new_value, ',' order by field) from public.entity_changes
    where entity = 'establishment' and entity_id = 'a3000000-0000-4000-8000-0000000000a1'
      and changed_by = 'a1000000-0000-4000-8000-000000000001'),
  'portion_expiry_rule:equal>equal_or_less,production_registrar:owner>member,production_window_minutes:120>90,unlabeled_limit_minutes:60>45',
  'cada configuração alterada fica em entity_changes, com o valor anterior (padrão) e o novo');
select lives_ok($$select pg_temp.settings('member', 90, 45, 'equal_or_less')$$, 'repetir os mesmos valores é aceito');
select is((select count(*)::int from public.entity_changes where entity = 'establishment'
    and entity_id = 'a3000000-0000-4000-8000-0000000000a1'), 4, 'repetir os mesmos valores não gera auditoria');
select is((select count(*)::int from public.establishment_settings), 1, 'uma linha por unidade; a outra unidade segue o padrão');

-- Colaborador lê as configurações da própria empresa; outra empresa não.
select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
select is((select production_registrar from public.establishment_settings), 'member', 'colaborador lê as configurações');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000003');
select is_empty($$select 1 from public.establishment_settings$$, 'outra empresa não lê as configurações de A');

-- 5) Colaborador registra a própria produção (com a validade) --------------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
select pg_temp.produce('a1000000-0000-4000-8000-000000000002', now() - interval '10 minutes', null,
  'a7000000-0000-4000-8000-000000000010') as member_lot \gset
select is((select created_by::text || '|' || handled_by::text || '|' || handled_by_name || '|' || late_window_minutes
    from public.batch_productions where batch_id = :'member_lot'),
  'a1000000-0000-4000-8000-000000000002|a1000000-0000-4000-8000-000000000002|Ana Souza|90',
  'colaborador registrou a própria produção; a janela usada (90 min) fica no registro');
select is(pg_temp.produce('a1000000-0000-4000-8000-000000000002', now() - interval '10 minutes', null,
    'a7000000-0000-4000-8000-000000000010'), :'member_lot'::uuid, 'repetir a mesma tentativa devolve o mesmo lote');
select throws_ok($$select pg_temp.produce('a1000000-0000-4000-8000-000000000001', now() - interval '10 minutes', null,
    'a7000000-0000-4000-8000-000000000011')$$,
  '42501', 'Quem não é proprietário registra só a própria produção.', 'colaborador não registra em nome de outra pessoa');
-- Janela da unidade: 90 minutos.
select throws_ok($$select pg_temp.produce('a1000000-0000-4000-8000-000000000002', now() - interval '100 minutes', null,
    'a7000000-0000-4000-8000-000000000012')$$,
  '22023', 'Produção registrada mais de 1 hora e 30 minutos depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
  'acima da janela configurada exige justificativa');
select throws_ok($$select pg_temp.produce('a1000000-0000-4000-8000-000000000002', now() - interval '80 minutes', 'Atraso',
    'a7000000-0000-4000-8000-000000000013')$$,
  '22023', 'Justificativa de atraso só vale para produção registrada mais de 1 hora e 30 minutos depois de feita.',
  'dentro da janela configurada não aceita justificativa');
select pg_temp.produce('a1000000-0000-4000-8000-000000000002', now() - interval '100 minutes', 'Registro esquecido',
  'a7000000-0000-4000-8000-000000000014') as late_lot \gset
select is((select late from public.batch_productions where batch_id = :'late_lot'), true, 'produção tardia pela janela da unidade');
select is((select created_by from public.occurrences where batch_id = :'late_lot' and kind = 'late_production'),
  'a1000000-0000-4000-8000-000000000002'::uuid, 'a ocorrência de produção tardia é aberta na mesma transação');
-- O resto continua só do proprietário (D-019).
select throws_ok(format($$select public.decide_occurrence('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-0000000000a1',
    (select id from public.occurrences where batch_id = %L), 'released', 'Conferido', 'a7000000-0000-4000-8000-000000000015')$$, :'late_lot'),
  '42501', null, 'colaborador não decide a ocorrência');
select throws_ok(format($$select public.void_production('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-0000000000a1',
    %L, 'Erro', 'a7000000-0000-4000-8000-000000000016')$$, :'member_lot'),
  '42501', null, 'colaborador não anula produção');
select throws_ok(format($$select public.handle_container('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-0000000000a1',
    (select id from public.containers where batch_id = %L and kind = 'integral'), 'portioning', array[2,2]::numeric[],
    ((now() at time zone 'America/Sao_Paulo')::date + 3), 'refrigerated', now(),
    'a1000000-0000-4000-8000-000000000002', 'sealed', null, null, null, 'a7000000-0000-4000-8000-000000000017')$$, :'member_lot'),
  '42501', null, 'colaborador não porciona');
-- Colaborador sem nome de exibição, vínculo revogado, outra unidade e outra empresa.
select pg_temp.as_user('a1000000-0000-4000-8000-000000000005');
select throws_ok($$select pg_temp.produce('a1000000-0000-4000-8000-000000000005', now() - interval '5 minutes', null,
    'a7000000-0000-4000-8000-000000000018')$$,
  '22023', 'Defina o nome de exibição da pessoa que produziu antes de registrar.', 'colaborador sem nome de exibição não registra');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000004');
select throws_ok($$select pg_temp.produce('a1000000-0000-4000-8000-000000000004', now() - interval '5 minutes', null,
    'a7000000-0000-4000-8000-000000000019')$$, '42501', 'Acesso negado.', 'vínculo revogado não registra produção');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000003');
select throws_ok($$select pg_temp.produce('a1000000-0000-4000-8000-000000000003', now() - interval '5 minutes', null,
    'a7000000-0000-4000-8000-000000000020')$$, '42501', 'Acesso negado.', 'outra empresa não registra produção em A');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
select throws_ok($$select public.register_production('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-0000000000a2',
    'a4000000-0000-4000-8000-000000000002', 1, ((now() at time zone 'America/Sao_Paulo')::date + 3), now(),
    'a1000000-0000-4000-8000-000000000002', null, null, 'a7000000-0000-4000-8000-000000000021')$$,
  '42501', 'Acesso negado.', 'a configuração é por unidade: a outra segue só do proprietário');

-- 6) Validade da porção de preparação: "igual ou menor", nunca maior -------------------------------
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select id as box from public.containers where batch_id = :'owner_lot' and kind = 'integral' \gset
select expiry_date as lot_expiry from public.containers where id = :'box' \gset
create function pg_temp.portion(p_container uuid, p_expiry date, p_intent uuid) returns uuid language sql as $$
  select public.handle_container('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-0000000000a1',
    p_container, 'portioning', array[1,1]::numeric[], p_expiry, 'refrigerated', now(),
    'a1000000-0000-4000-8000-000000000002', 'sealed', null, null, null, p_intent)
$$;
grant execute on function pg_temp.portion(uuid, date, uuid) to authenticated;
select throws_ok(format($$select pg_temp.portion(%L, %L::date + 1, 'a7000000-0000-4000-8000-000000000030')$$, :'box', :'lot_expiry'),
  '22023', 'A validade após abertura não pode passar da validade do recipiente de origem.', '"igual ou menor" nunca aceita maior');
select lives_ok(format($$select pg_temp.portion(%L, %L::date - 1, 'a7000000-0000-4000-8000-000000000031')$$, :'box', :'lot_expiry'),
  '"igual ou menor" aceita validade menor que a do lote');
select lives_ok($$select pg_temp.settings('member', 90, 45, 'equal')$$, 'volta para "igual à do lote"');
select throws_ok(format($$select pg_temp.portion(%L, %L::date - 1, 'a7000000-0000-4000-8000-000000000032')$$, :'box', :'lot_expiry'),
  '22023', 'A porção de preparação própria leva a mesma validade do recipiente de origem.', '"igual à do lote" recusa menor');
select is((select count(*)::int from public.entity_changes where entity = 'establishment'
    and entity_id = 'a3000000-0000-4000-8000-0000000000a1' and field = 'portion_expiry_rule'), 2, 'a volta também é auditada');

-- 7) Voltar para "só o proprietário": vale para os registros novos; o histórico fica ---------------
select lives_ok($$select pg_temp.settings('owner', 120, 60, 'equal')$$, 'proprietário volta às regras padrão');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
select throws_ok($$select pg_temp.produce('a1000000-0000-4000-8000-000000000002', now() - interval '5 minutes', null,
    'a7000000-0000-4000-8000-000000000040')$$,
  '42501', 'Acesso negado.', 'colaborador volta a não registrar');
select is((select late_window_minutes from public.batch_productions where batch_id = :'late_lot'), 90,
  'produção antiga continua com a janela que valia quando foi registrada');
select is((select late from public.batch_productions where batch_id = :'late_lot'), true, 'e continua tardia');

select * from finish();
rollback;
