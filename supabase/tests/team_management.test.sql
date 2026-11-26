-- D-077 (fatia B da auditoria do PR #79): gestão da equipe pelo site.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- u1: owner de A; u2: member de A; u3: owner de B; u4: conta livre confirmada; u5: conta não confirmada;
-- u6: revogado de A (era owner); u7: segunda conta livre; u8: member de B.
insert into auth.users (id, email, email_confirmed_at) values
 ('b7000000-0000-4000-8000-000000000001', 'dona@equipe.example', now()),
 ('b7000000-0000-4000-8000-000000000002', 'bia@equipe.example', now()),
 ('b7000000-0000-4000-8000-000000000003', 'outra@equipe.example', now()),
 ('b7000000-0000-4000-8000-000000000004', 'Livre@Equipe.example', now()),
 ('b7000000-0000-4000-8000-000000000005', 'pendente@equipe.example', null),
 ('b7000000-0000-4000-8000-000000000006', 'saiu@equipe.example', now()),
 ('b7000000-0000-4000-8000-000000000007', 'livre2@equipe.example', now()),
 ('b7000000-0000-4000-8000-000000000008', 'beto@equipe.example', now());
insert into organizations (id, name) values
 ('b7100000-0000-4000-8000-00000000000a', 'Equipe A'), ('b7100000-0000-4000-8000-00000000000b', 'Equipe B');
insert into memberships (organization_id, user_id, role, display_name, revoked_at) values
 ('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000001', 'owner', 'Ana', null),
 ('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000002', 'member', 'Bia', null),
 ('b7100000-0000-4000-8000-00000000000b', 'b7000000-0000-4000-8000-000000000003', 'owner', 'Ciro', null),
 ('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000006', 'owner', 'Davi', now() - interval '1 day'),
 ('b7100000-0000-4000-8000-00000000000b', 'b7000000-0000-4000-8000-000000000008', 'member', 'Beto', null);

create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Catálogo e privilégios -----------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.list_team_members(uuid)', 'execute'), 'anon não lista a equipe');
select ok(not has_function_privilege('anon', 'public.add_team_member(uuid,text,text,text)', 'execute'), 'anon não vincula');
select ok(not has_function_privilege('anon', 'public.set_team_member_role(uuid,uuid,text)', 'execute'), 'anon não troca papel');
select ok(not has_function_privilege('anon', 'public.revoke_team_member(uuid,uuid)', 'execute'), 'anon não revoga');
select ok(not has_function_privilege('anon', 'public.restore_team_member(uuid,uuid)', 'execute'), 'anon não restaura');
select ok(not has_function_privilege('authenticated', 'private.lock_team(uuid)', 'execute'), 'cadeado da equipe não é chamado pela API');
select ok(not has_function_privilege('authenticated', 'private.log_membership_access()', 'execute'), 'gatilho de auditoria não é chamado pela API');
select is((select count(*)::int from entity_changes), 0, 'dados de teste inseridos sem sessão não geram auditoria de acesso');

set local role authenticated;

-- Colaborador e revogado recebem a mesma recusa -----------------------------------------------------------
select pg_temp.as_user('b7000000-0000-4000-8000-000000000002');
select throws_ok($$select * from list_team_members('b7100000-0000-4000-8000-00000000000a')$$, '42501', 'Acesso negado.', 'colaborador não lista a equipe');
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'livre@equipe.example', 'Lia', 'member')$$, '42501', 'Acesso negado.', 'colaborador não vincula');
select throws_ok($$select set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000002', 'owner')$$, '42501', 'Acesso negado.', 'colaborador não se promove');
select throws_ok($$select revoke_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000001')$$, '42501', 'Acesso negado.', 'colaborador não revoga o proprietário');
select throws_ok($$select restore_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000006')$$, '42501', 'Acesso negado.', 'colaborador não restaura');

select pg_temp.as_user('b7000000-0000-4000-8000-000000000006');
select throws_ok($$select * from list_team_members('b7100000-0000-4000-8000-00000000000a')$$, '42501', 'Acesso negado.', 'proprietário revogado não lista');
select throws_ok($$select restore_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000006')$$, '42501', 'Acesso negado.', 'revogado não restaura a si mesmo');

-- Isolamento entre empresas ------------------------------------------------------------------------------
select pg_temp.as_user('b7000000-0000-4000-8000-000000000003');
select throws_ok($$select * from list_team_members('b7100000-0000-4000-8000-00000000000a')$$, '42501', 'Acesso negado.', 'proprietário de B não lista A');
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'livre@equipe.example', 'Lia', 'member')$$, '42501', 'Acesso negado.', 'proprietário de B não vincula em A');
select throws_ok($$select revoke_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000002')$$, '42501', 'Acesso negado.', 'proprietário de B não revoga em A');
select throws_ok($$select set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000002', 'owner')$$, '42501', 'Acesso negado.', 'proprietário de B não troca papel em A');
select throws_ok($$select revoke_team_member('b7100000-0000-4000-8000-00000000000b', 'b7000000-0000-4000-8000-000000000002')$$, '23503', null, 'pessoa de A não é encontrada pela empresa B');
select throws_ok($$select * from list_team_members(null)$$, '42501', 'Acesso negado.', 'empresa nula recusada');
select throws_ok($$select * from list_team_members('99999999-9999-4999-8999-999999999999')$$, '42501', 'Acesso negado.', 'empresa inexistente recebe a mesma recusa');
select is((select count(*)::int from list_team_members('b7100000-0000-4000-8000-00000000000b')), 2, 'proprietário de B lista só a equipe de B');

-- Listagem do proprietário de A --------------------------------------------------------------------------
select pg_temp.as_user('b7000000-0000-4000-8000-000000000001');
select results_eq(
  $$select display_name, email, role, revoked_at is not null, is_self from list_team_members('b7100000-0000-4000-8000-00000000000a')$$,
  $$values ('Ana'::text, 'dona@equipe.example'::text, 'owner'::text, false, true),
           ('Bia', 'bia@equipe.example', 'member', false, false),
           ('Davi', 'saiu@equipe.example', 'owner', true, false)$$,
  'lista ativos (proprietários primeiro) e depois revogados, com e-mail e "você"');

-- Vincular -------------------------------------------------------------------------------------------------
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'sem-arroba', 'Lia', 'member')$$, '22023', null, 'e-mail inválido recusado');
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'livre@equipe.example', U&'\00A0 ', 'member')$$, '22023', null, 'nome só com espaços recusado');
select throws_ok(format($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'livre@equipe.example', %L, 'member')$$, repeat('a', 41)), '22023', null, 'nome acima de 40 caracteres recusado');
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'livre@equipe.example', 'Lia', 'admin')$$, '22023', null, 'papel inválido recusado');
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'nao-existe@equipe.example', 'Lia', 'member')$$, 'P0002',
  'Não foi possível vincular este e-mail. Confira se a conta foi criada e confirmada e se ela não está em uso em outra empresa.', 'conta inexistente: mensagem genérica');
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'pendente@equipe.example', 'Lia', 'member')$$, 'P0002',
  'Não foi possível vincular este e-mail. Confira se a conta foi criada e confirmada e se ela não está em uso em outra empresa.', 'conta não confirmada: mesma mensagem');
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'beto@equipe.example', 'Beto', 'member')$$, 'P0002',
  'Não foi possível vincular este e-mail. Confira se a conta foi criada e confirmada e se ela não está em uso em outra empresa.', 'conta de outra empresa: mesma mensagem, sem revelar a empresa (D-025)');
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'bia@equipe.example', 'Bia', 'member')$$, '23505', 'Esta pessoa já faz parte da equipe.', 'quem já é da equipe não é vinculado de novo');
select throws_ok($$select add_team_member('b7100000-0000-4000-8000-00000000000a', 'saiu@equipe.example', 'Davi', 'member')$$, '23505', null, 'revogado da própria empresa é orientado a restaurar');
select is((select count(*)::int from entity_changes), 0, 'recusas não gravam auditoria');

select is(add_team_member('b7100000-0000-4000-8000-00000000000a', '  LIVRE@equipe.example ', ' Lia ', 'member'),
  'b7000000-0000-4000-8000-000000000004'::uuid, 'proprietário vincula conta confirmada (e-mail sem diferenciar maiúsculas)');
select is((select display_name || ':' || role from list_team_members('b7100000-0000-4000-8000-00000000000a') where user_id = 'b7000000-0000-4000-8000-000000000004'),
  'Lia:member', 'nova pessoa aparece na lista com nome aparado');
select is(add_team_member('b7100000-0000-4000-8000-00000000000a', 'livre2@equipe.example', 'Rui', 'owner'),
  'b7000000-0000-4000-8000-000000000007'::uuid, 'proprietário pode vincular outro proprietário');
select results_eq(
  $$select field, old_value, new_value, changed_by from entity_changes where entity = 'membership' order by changed_at, new_value$$,
  $$values ('access'::text, null::text, 'ativo'::text, 'b7000000-0000-4000-8000-000000000001'::uuid),
           ('access', null, 'ativo', 'b7000000-0000-4000-8000-000000000001'::uuid)$$,
  'cada vínculo feito pelo site é auditado com autoria');

-- O vinculado entra na hora ------------------------------------------------------------------------------
select pg_temp.as_user('b7000000-0000-4000-8000-000000000004');
select is((select count(*)::int from organizations where id = 'b7100000-0000-4000-8000-00000000000a'), 1, 'pessoa vinculada lê a empresa');
select pg_temp.as_user('b7000000-0000-4000-8000-000000000001');

-- Trocar papel ---------------------------------------------------------------------------------------------
select throws_ok($$select set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000001', 'member')$$, '22023', null, 'ninguém rebaixa a si mesmo');
select throws_ok($$select set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000002', 'gestor')$$, '22023', null, 'papel inexistente recusado');
select throws_ok($$select set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000006', 'member')$$, '23503', null, 'revogado não troca de papel');
select throws_ok($$select set_team_member_role('b7100000-0000-4000-8000-00000000000a', null, 'member')$$, '23503', null, 'pessoa nula recusada');
select is(set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000002', 'owner'), 'owner', 'proprietário promove colaborador');
select is(set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000002', 'owner'), 'owner', 'repetir é idempotente');
select is((select count(*)::int from entity_changes where field = 'role'), 1, 'promoção auditada uma vez só');
select is((select old_value || '>' || new_value from entity_changes where field = 'role'), 'member>owner', 'auditoria guarda antes e depois');

-- A nova proprietária já age; e rebaixa quem a promoveu (há outro proprietário ativo).
select pg_temp.as_user('b7000000-0000-4000-8000-000000000002');
select is(set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000007', 'member'), 'member', 'proprietária promovida já troca papéis');

-- Revogar ----------------------------------------------------------------------------------------------------
select pg_temp.as_user('b7000000-0000-4000-8000-000000000001');
select throws_ok($$select revoke_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000001')$$, '22023', null, 'ninguém revoga a si mesmo');
select throws_ok($$select revoke_team_member('b7100000-0000-4000-8000-00000000000a', '99999999-9999-4999-8999-999999999999')$$, '23503', null, 'pessoa fora da equipe recusada');
select ok(revoke_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000004') is not null, 'proprietário revoga colaboradora');
select is(revoke_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000004'),
  (select revoked_at from list_team_members('b7100000-0000-4000-8000-00000000000a') where user_id = 'b7000000-0000-4000-8000-000000000004'),
  'revogar de novo é idempotente e devolve a data original');
select is((select old_value || '>' || new_value || ':' || changed_by from entity_changes where field = 'access' and old_value = 'ativo'),
  'ativo>revogado:b7000000-0000-4000-8000-000000000001', 'revogação auditada com autoria');

-- A revogação vale na hora para quem estiver logado.
select pg_temp.as_user('b7000000-0000-4000-8000-000000000004');
select is((select count(*)::int from organizations) + (select count(*)::int from establishments) + (select count(*)::int from memberships), 0,
  'revogada não lê mais nada da empresa');
select ok(not private.has_membership('b7100000-0000-4000-8000-00000000000a'), 'revogada perde o vínculo nas funções de escrita');

-- Proprietário revoga outra proprietária (há dois).
select pg_temp.as_user('b7000000-0000-4000-8000-000000000001');
select ok(revoke_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000002') is not null, 'proprietário revoga outra proprietária');

-- Último proprietário: Ana é a única dona ativa de A; a regra "a si mesmo" já a protege, e a contagem é a
-- segunda guarda (corrida entre dois proprietários, serializada pelo cadeado da empresa).
reset role;
select is(private.active_owner_count('b7100000-0000-4000-8000-00000000000a'), 1, 'resta um proprietário ativo');
-- Rui volta a proprietário (fora da API) para o cenário de dois donos que se rebaixam em sequência.
update memberships set role = 'owner' where user_id = 'b7000000-0000-4000-8000-000000000007';
set local role authenticated;
select pg_temp.as_user('b7000000-0000-4000-8000-000000000007');
select is(set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000001', 'member'), 'member', 'com dois proprietários, um rebaixa o outro');
select pg_temp.as_user('b7000000-0000-4000-8000-000000000001');
select throws_ok($$select set_team_member_role('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000007', 'member')$$, '42501', 'Acesso negado.',
  'quem foi rebaixado perde o poder na operação seguinte');
select throws_ok($$select revoke_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000007')$$, '42501', 'Acesso negado.',
  'rebaixado também não revoga quem o rebaixou');
reset role;
select is(private.active_owner_count('b7100000-0000-4000-8000-00000000000a'), 1, 'A continua com exatamente um proprietário ativo');
select ok(position('active_owner_count' in pg_get_functiondef('private.set_team_member_role(uuid,uuid,text)'::regprocedure)) > 0
  and position('active_owner_count' in pg_get_functiondef('private.revoke_team_member(uuid,uuid)'::regprocedure)) > 0,
  'troca de papel e revogação conferem o número de proprietários ativos');
select ok(position('for update' in pg_get_functiondef('private.lock_team(uuid)'::regprocedure)) <
  position('has_membership' in pg_get_functiondef('private.lock_team(uuid)'::regprocedure)),
  'o cadeado da empresa vem antes da conferência de proprietário (corrida entre dois proprietários)');
select is(private.active_owner_count('b7100000-0000-4000-8000-00000000000b'), 1, 'B segue com um proprietário ativo');

-- Restaurar --------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('b7000000-0000-4000-8000-000000000007');
select is(restore_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000006'), 'member', 'restaurar devolve como colaborador');
select is((select role || ':' || (revoked_at is null)::text from list_team_members('b7100000-0000-4000-8000-00000000000a') where user_id = 'b7000000-0000-4000-8000-000000000006'),
  'member:true', 'restaurado na mesma linha, ativo e colaborador');
select is((select count(*)::int from list_team_members('b7100000-0000-4000-8000-00000000000a') where user_id = 'b7000000-0000-4000-8000-000000000006'), 1, 'nenhum vínculo duplicado');
select is(restore_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000006'), 'member', 'restaurar quem está ativo é idempotente');
select is((select string_agg(field || ':' || old_value || '>' || new_value, ',' order by field) from entity_changes
            where entity_id = (select id from memberships where user_id = 'b7000000-0000-4000-8000-000000000006')),
  'access:revogado>ativo,role:owner>member', 'restauração audita acesso e papel');

-- Restaurar quem hoje tem vínculo ativo em outra empresa: recusa genérica.
reset role;
insert into memberships (organization_id, user_id, role) values ('b7100000-0000-4000-8000-00000000000b', 'b7000000-0000-4000-8000-000000000004', 'member');
set local role authenticated;
select pg_temp.as_user('b7000000-0000-4000-8000-000000000007');
select throws_ok($$select restore_team_member('b7100000-0000-4000-8000-00000000000a', 'b7000000-0000-4000-8000-000000000004')$$, 'P0002', null,
  'conta que agora está em outra empresa não é restaurada (D-025)');
select throws_ok($$select restore_team_member('b7100000-0000-4000-8000-00000000000a', '99999999-9999-4999-8999-999999999999')$$, '23503', null, 'pessoa fora da equipe não é restaurada');

-- Caminhos diretos seguem fechados ---------------------------------------------------------------------------
select throws_ok($$update memberships set revoked_at = now() where user_id = 'b7000000-0000-4000-8000-000000000006'$$, '42501', null, 'proprietário não revoga por UPDATE direto');
select throws_ok($$delete from memberships where user_id = 'b7000000-0000-4000-8000-000000000006'$$, '42501', null, 'ninguém apaga vínculo');
select throws_ok($$delete from entity_changes$$, '42501', null, 'auditoria da equipe não é apagada pela API');

-- O colaborador não lê a auditoria da equipe.
select pg_temp.as_user('b7000000-0000-4000-8000-000000000006');
select is((select count(*)::int from entity_changes), 0, 'colaborador não lê a auditoria da equipe');

select * from finish();
rollback;
