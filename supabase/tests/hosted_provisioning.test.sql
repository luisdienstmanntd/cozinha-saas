-- Fatia 8.4a (D-066): provisionamento do ambiente hospedado e reset do banco de testes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at) values
 ('a0000000-0000-0000-0000-000000000001', 'dono@teste.example', now()),
 ('a0000000-0000-0000-0000-000000000002', 'colab@teste.example', now()),
 ('a0000000-0000-0000-0000-000000000003', 'outro@teste.example', now()),
 ('a0000000-0000-0000-0000-000000000004', 'pendente@teste.example', null);

-- Privilégios: nenhuma função administrativa é executável pela API ---------------------------------------
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text || ':' || r.rolname, ',' order by p.oid::regprocedure::text), '')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
    where n.nspname = 'private'
      and p.proname in ('assert_admin_session', 'declare_environment', 'find_confirmed_user', 'bootstrap_owner_organization',
                        'add_member_to_organization', 'reset_test_environment', 'protect_environment_marker')
      and has_function_privilege(r.rolname, p.oid, 'execute')),
  '', 'anon, authenticated e service_role não executam nenhuma função administrativa');
select is(
  (select count(*) from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')
    and has_table_privilege(r.rolname, 'private.environment_marker', 'select,insert,update,delete,truncate')),
  0::bigint, 'ninguém da API toca o marcador do ambiente');

-- Sessão de administração: a função confere o papel da SESSÃO (session_user), além do privilégio. O papel postgres
-- do Supabase não pode trocar de sessão, então o teste confere o comportamento aqui e a definição acima.
select lives_ok($$select private.assert_admin_session()$$, 'sessão de administração aceita');
select matches(pg_get_functiondef('private.assert_admin_session()'::regprocedure), 'session_user not in \(''postgres'', ''supabase_admin''\)',
  'a guarda confere session_user (a API chega como authenticator)');

-- Primeira empresa, unidade e proprietário ------------------------------------------------------------
select throws_ok($$select * from private.bootstrap_owner_organization('nao-existe@teste.example', 'Ana', 'Empresa Um', 'Cozinha Central')$$,
  'P0002', null, 'conta inexistente recusada');
select throws_ok($$select * from private.bootstrap_owner_organization('pendente@teste.example', 'Ana', 'Empresa Um', 'Cozinha Central')$$,
  '22023', null, 'conta não confirmada recusada');
select throws_ok($$select * from private.bootstrap_owner_organization('dono@teste.example', 'Ana', 'Empresa Um', 'Cozinha Central', 'Fuso/Invalido')$$,
  '22023', null, 'fuso inválido recusado');
select throws_ok($$select * from private.bootstrap_owner_organization('dono@teste.example', ' ', 'Empresa Um', 'Cozinha Central')$$,
  '22023', null, 'nome de exibição vazio recusado');
select throws_ok(format($$select * from private.bootstrap_owner_organization('dono@teste.example', 'Ana', %L, 'Cozinha Central')$$, repeat('x', 81)),
  '22023', null, 'nome da empresa acima de 80 caracteres recusado');
select is((select count(*) from public.organizations), 0::bigint, 'nenhuma recusa deixou empresa pela metade');

select lives_ok($$create temporary table boot1 as select * from private.bootstrap_owner_organization('  DONO@teste.example ', 'Ana', 'Empresa Um', 'Cozinha Central')$$,
  'bootstrap cria empresa, unidade e proprietário');
select is((select count(*) from public.organizations where name = 'Empresa Um'), 1::bigint, 'empresa criada');
select is((select e.timezone from public.establishments e join boot1 b on b.establishment_id = e.id), 'America/Sao_Paulo', 'fuso padrão São Paulo');
select is((select m.role || ':' || m.display_name from public.memberships m join boot1 b on b.owner_user_id = m.user_id), 'owner:Ana', 'proprietário vinculado com nome de exibição');
select throws_ok($$select * from private.bootstrap_owner_organization('dono@teste.example', 'Ana', 'Outra', 'Cozinha')$$, '23505', null, 'conta com vínculo não cria segunda empresa');
select throws_ok($$select * from private.bootstrap_owner_organization('outro@teste.example', 'Beto', 'empresa um', 'Cozinha')$$, '23505', null, 'nome de empresa repetido (sem diferenciar maiúsculas) recusado');

-- Colaborador ---------------------------------------------------------------------------------------
select throws_ok(format($$select private.add_member_to_organization(%L, 'colab@teste.example', 'Bia', 'admin')$$, (select organization_id from boot1)),
  '22023', null, 'papel inválido recusado');
select throws_ok($$select private.add_member_to_organization('99999999-9999-9999-9999-999999999999', 'colab@teste.example', 'Bia')$$,
  'P0002', null, 'empresa inexistente recusada');
select lives_ok(format($$select private.add_member_to_organization(%L, 'colab@teste.example', 'Bia')$$, (select organization_id from boot1)), 'colaborador vinculado');
select is((select role from public.memberships where user_id = 'a0000000-0000-0000-0000-000000000002'), 'member', 'colaborador entra como member');
select throws_ok(format($$select private.add_member_to_organization(%L, 'colab@teste.example', 'Bia')$$, (select organization_id from boot1)),
  '23505', null, 'mesma conta não ganha segundo vínculo');

-- Isolamento: segunda empresa, e cada proprietário só enxerga a sua -------------------------------------------
select lives_ok($$select * from private.bootstrap_owner_organization('outro@teste.example', 'Beto', 'Empresa Dois', 'Cozinha Dois')$$, 'segunda empresa criada');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select string_agg(name, ',') from public.organizations), 'Empresa Um', 'proprietário da primeira vê só a sua empresa');
select is((select count(*) from public.establishments), 1::bigint, 'e só a sua unidade');
select throws_ok($$insert into public.organizations (name) values ('Autocadastro')$$, '42501', null, 'API não cria empresa');
select throws_ok($$insert into public.memberships (organization_id, user_id, role) select id, 'a0000000-0000-0000-0000-000000000001', 'owner' from public.organizations$$,
  '42501', null, 'API não cria vínculo');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.organizations) + (select count(*) from public.establishments) + (select count(*) from public.memberships), 0::bigint,
  'conta autocadastrada sem vínculo não enxerga empresa, unidade nem vínculo');
reset role;

-- Reset do ambiente de testes ------------------------------------------------------------------------
select throws_ok($$select * from private.reset_test_environment('operational', 'ZERAR AMBIENTE DE TESTES')$$, '55000',
  'Recusado: este banco não está declarado como ambiente de testes.', 'sem marcador, o reset é recusado');
select throws_ok($$select private.declare_environment('homologacao')$$, '22023', null, 'tipo de ambiente inválido');
select lives_ok($$select private.declare_environment('testes')$$, 'declara ambiente de testes');
select throws_ok($$select * from private.reset_test_environment('operational', 'zerar')$$, '22023', 'Confirmação incorreta; nada foi apagado.', 'frase errada recusada');
select throws_ok($$select * from private.reset_test_environment('tudo', 'ZERAR AMBIENTE DE TESTES')$$, '22023', null, 'escopo inválido recusado');
update public.organizations set name = 'Empresa Um Editada' where name = 'Empresa Um';
select cmp_ok((select count(*) from public.entity_changes), '>=', 1::bigint, 'há auditoria antes do reset');
select throws_ok($$delete from public.entity_changes$$, '55000', null, 'histórico segue protegido antes do reset');

select lives_ok($$create temporary table reset1 as select * from private.reset_test_environment('operational', 'ZERAR AMBIENTE DE TESTES')$$, 'reset operacional roda');
select cmp_ok((select rows_removed from reset1 where table_name = 'entity_changes'), '>=', 1::bigint, 'o resultado informa o que foi removido');
select is((select count(*) from public.entity_changes), 0::bigint, 'auditoria zerada');
select is((select count(*) from public.organizations) + (select count(*) from public.memberships), 5::bigint, 'empresas e vínculos mantidos no reset operacional');
select is((select tgenabled::text from pg_trigger where tgname = 'entity_changes_append_only'), 'A', 'gatilho append-only restaurado como ENABLE ALWAYS');
update public.organizations set name = 'Empresa Um Final' where name = 'Empresa Um Editada';
select throws_ok($$delete from public.entity_changes$$, '55000', null, 'histórico volta a recusar apagar depois do reset');
select lives_ok($$select private.assert_history_protected()$$, 'proteção do histórico íntegra');

select lives_ok($$select * from private.reset_test_environment('everything', 'ZERAR AMBIENTE DE TESTES')$$, 'reset completo roda');
select is((select count(*) from public.organizations) + (select count(*) from public.establishments) + (select count(*) from public.memberships), 0::bigint, 'reset completo apaga empresas, unidades e vínculos');
select is((select count(*) from auth.users), 4::bigint, 'contas de acesso não são tocadas');

-- Produção é irreversível ---------------------------------------------------------------------------
select lives_ok($$select private.declare_environment('producao')$$, 'declara produção');
select throws_ok($$select * from private.reset_test_environment('operational', 'ZERAR AMBIENTE DE TESTES')$$, '55000', null, 'produção recusa reset');
select throws_ok($$select private.declare_environment('testes')$$, '55000', 'Ambiente de produção não volta a ser testes.', 'produção não volta a testes');
select throws_ok($$delete from private.environment_marker$$, '55000', null, 'marcador de produção não é apagado');
select throws_ok($$truncate private.environment_marker$$, '55000', null, 'marcador de produção não é truncado');

select * from finish();
rollback;
