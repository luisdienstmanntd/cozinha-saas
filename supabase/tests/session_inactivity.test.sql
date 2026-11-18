-- V2 (D-025): sessão expira por inatividade no banco. Cobre private.session_state, a atividade
-- registrada e a integração com as políticas RLS (member_organizations / has_membership).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email) values
  ('c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v2a@example.invalid'),
  ('c0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v2b@example.invalid');
insert into auth.sessions (id, user_id, created_at) values
  ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', now()),
  ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001', now() - interval '31 minutes'),
  ('d0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000002', now());
insert into public.organizations (id, name) values ('c1000000-0000-0000-0000-000000000001','Org V2');
insert into public.memberships (organization_id, user_id, role)
  values ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','owner');

create function pg_temp.as_session(p_user text, p_session text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', p_session)::text, true);
$$;
set local role authenticated;

select pg_temp.as_session('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001');
select is(private.session_state(), 'ok', 'sessão recém-criada vale');
select is((select count(*)::int from public.organizations), 1, 'sessão válida enxerga a empresa do vínculo');
select ok(private.has_membership('c1000000-0000-0000-0000-000000000001', true), 'proprietário com sessão válida passa em has_membership');

select pg_temp.as_session('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002');
select is(private.session_state(), 'idle', 'sessão criada há 31 min e sem atividade está parada');
select is((select count(*)::int from public.organizations), 0, 'sessão parada não lê nada pela RLS');
select ok(not private.has_membership('c1000000-0000-0000-0000-000000000001', false), 'sessão parada falha em has_membership');
select throws_ok($$select private.touch_session()$$, '28000', 'Sessão expirada. Entre novamente.', 'sessão parada não se reativa');

select pg_temp.as_session('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001');
select isnt(private.touch_session(), null, 'touch_session devolve o novo prazo');
reset role;
select is(
  (select last_seen_at > now() - interval '5 seconds' from private.session_activity where session_id='d0000000-0000-0000-0000-000000000001'),
  true, 'atividade registrada');

set local role authenticated;

-- Sessão de outro usuário com o session_id de alguém: recusada.
select pg_temp.as_session('c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001');
select is(private.session_state(), 'revoked', 'session_id de outro usuário não vale');
select pg_temp.as_session('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-0000000000ff');
select is(private.session_state(), 'revoked', 'sessão inexistente (já encerrada por Sair) não vale');
select pg_temp.as_session('c0000000-0000-0000-0000-000000000001','nao-e-uuid');
select is(private.session_state(), 'revoked', 'session_id malformado é recusado sem erro');

-- Atividade de um usuário não renova a sessão de outro.
select pg_temp.as_session('c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000003');
select isnt(private.touch_session(), null, 'segundo usuário registra a própria atividade');

-- A API não expõe a tabela nem o guarda a quem não precisa.
select ok(not has_table_privilege('authenticated','private.session_activity','select'), 'authenticated não lê a tabela de atividade');
reset role;
select is((select count(*)::int from private.session_activity where user_id = 'c0000000-0000-0000-0000-000000000001'), 1, 'atividade do primeiro usuário não foi alterada');
select ok(not has_function_privilege('anon','public.touch_session()','execute'), 'anon não executa touch_session');
select ok(has_function_privilege('anon','session_guard.check_request()','execute'), 'o guarda executa para anon (precisa, e não faz nada para anon)');
select is(
  (select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='session_guard'),
  'check_request', 'schema session_guard só tem o guarda');
select is(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='session_guard' and p.proname='check_request'),
  false, 'o guarda é security invoker');
select ok(
  exists (select 1 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole
    where r.rolname='authenticator' and 'pgrst.db_pre_request=session_guard.check_request' = any(s.setconfig)),
  'PostgREST chama o guarda antes de cada requisição');
select ok(private.session_inactivity_limit() = interval '30 minutes', 'limite de inatividade é 30 minutos');

select * from finish();
rollback;
