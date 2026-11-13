-- Fase 6, fatia 6.0b (P3): RLS por conjunto em vez de função por linha.
-- Parte 1: catálogo — função private.member_organizations e todas as políticas de public usando-a.
-- Parte 2: comportamento — conjunto devolvido por papel, vínculos de colegas e revogados (I-10b),
--          leitura e escrita por política nas tabelas de cadastro.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Parte 1 — catálogo -------------------------------------------------------
select has_function('private', 'member_organizations', array['boolean'],
  'private.member_organizations(boolean) existe');

select is(
  (select format('%s|%s|%s|%s', p.prosecdef, p.provolatile, p.proretset, pg_catalog.format_type(p.prorettype, null))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'member_organizations'),
  't|s|t|uuid', 'member_organizations é SECURITY DEFINER, stable e devolve setof uuid');

select is(
  (select p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'member_organizations'),
  array['search_path=""'], 'member_organizations fixa search_path vazio');

select is(
  (select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'member_organizations'),
  'p_owner_only boolean DEFAULT false', 'único parâmetro é p_owner_only (nenhum ID de usuário vindo do cliente)');

select ok(to_regprocedure('private.member_organizations(boolean)') is not null
  and not has_function_privilege('anon', to_regprocedure('private.member_organizations(boolean)'), 'execute'),
  'anon não executa member_organizations');
select ok(to_regprocedure('private.member_organizations(boolean)') is not null and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'private' and p.proname = 'member_organizations' and a.grantee = 0),
  'PUBLIC não executa member_organizations');
select ok(to_regprocedure('private.member_organizations(boolean)') is not null
  and has_function_privilege('authenticated', to_regprocedure('private.member_organizations(boolean)'), 'execute'),
  'authenticated executa member_organizations (exigido pelas políticas)');

-- Lista fixa: as 13 políticas existentes continuam lá, com o mesmo comando e papel.
select is(
  (select string_agg(format('%s.%s:%s:%s', tablename, policyname, cmd, array_to_string(roles, ',')), ' ' order by tablename, policyname)
    from pg_policies where schemaname = 'public'),
  'batch_receipts.batch_receipts_read:SELECT:authenticated '
  'container_balances.container_balances_read:SELECT:authenticated '
  'container_handlings.container_handlings_read:SELECT:authenticated '
  'containers.containers_read:SELECT:authenticated '
  'entity_changes.entity_changes_read:SELECT:authenticated '
  'establishments.establishments_insert:INSERT:authenticated '
  'establishments.establishments_read:SELECT:authenticated '
  'establishments.establishments_update:UPDATE:authenticated '
  'handling_voids.handling_voids_read:SELECT:authenticated '
  'memberships.memberships_read:SELECT:authenticated '
  'organizations.organizations_read:SELECT:authenticated '
  'organizations.organizations_update:UPDATE:authenticated '
  'products.products_insert:INSERT:authenticated '
  'products.products_read:SELECT:authenticated '
  'stock_movements.stock_movements_read:SELECT:authenticated '
  'suppliers.suppliers_insert:INSERT:authenticated '
  'suppliers.suppliers_read:SELECT:authenticated',
  'conjunto de políticas de public: as 13 anteriores inalteradas, mais entity_changes_read (6.0c), container_balances_read (6.2), container_handlings_read (6.3) e handling_voids_read (6.4)');

select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ',' order by tablename, policyname), '')
    from pg_policies where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%has_membership%'),
  '', 'nenhuma política de public chama has_membership linha a linha');

select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ',' order by tablename, policyname), '')
    from pg_policies where schemaname = 'public'
      and not (coalesce(qual, '') || coalesce(with_check, '')) like '%member_organizations%'),
  '', 'toda política de public usa member_organizations');

-- Escrita exige proprietário: as políticas de INSERT/UPDATE usam a variante p_owner_only.
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ',' order by tablename, policyname), '')
    from pg_policies where schemaname = 'public' and cmd in ('INSERT', 'UPDATE')
      and not ((cmd = 'INSERT' or coalesce(qual, '') like '%member_organizations(true)%')
               and coalesce(with_check, '') like '%member_organizations(true)%')),
  '', 'toda política de escrita usa member_organizations(true) em USING e WITH CHECK');

-- Parte 2 — comportamento ---------------------------------------------------
-- 1: proprietário de A e de B; 2: membro de A; 3: membro revogado de A; 4: proprietário de B;
-- 5: proprietário revogado de A (continua membro ativo de B); 6: sem vínculo.
insert into auth.users(id) values
 ('a1000000-0000-4000-8000-000000000001'), ('a1000000-0000-4000-8000-000000000002'),
 ('a1000000-0000-4000-8000-000000000003'), ('a1000000-0000-4000-8000-000000000004'),
 ('a1000000-0000-4000-8000-000000000005'), ('a1000000-0000-4000-8000-000000000006');
insert into public.organizations(id, name) values
 ('a2000000-0000-4000-8000-00000000000a', 'Empresa A'),
 ('a2000000-0000-4000-8000-00000000000b', 'Empresa B');
insert into public.memberships(organization_id, user_id, role, revoked_at) values
 ('a2000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'owner', null),
 ('a2000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-000000000001', 'owner', null),
 ('a2000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000002', 'member', null),
 ('a2000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000003', 'member', now()),
 ('a2000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-000000000004', 'owner', null),
 ('a2000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000005', 'owner', now()),
 ('a2000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-000000000005', 'member', null);
insert into public.establishments(id, organization_id, name, timezone) values
 ('a3000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-00000000000a', 'Unidade A', 'America/Sao_Paulo'),
 ('a3000000-0000-4000-8000-00000000000b', 'a2000000-0000-4000-8000-00000000000b', 'Unidade B', 'America/Sao_Paulo');
insert into public.products(organization_id, establishment_id, name, unit) values
 ('a2000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-00000000000a', 'Arroz A', 'kg'),
 ('a2000000-0000-4000-8000-00000000000b', 'a3000000-0000-4000-8000-00000000000b', 'Arroz B', 'kg');
insert into public.suppliers(organization_id, establishment_id, name) values
 ('a2000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-00000000000a', 'Fornecedor A'),
 ('a2000000-0000-4000-8000-00000000000b', 'a3000000-0000-4000-8000-00000000000b', 'Fornecedor B');

set local role authenticated;

-- Sem sessão: conjunto vazio, nada visível.
select set_config('request.jwt.claims', '', true);
select is((select count(*) from private.member_organizations()), 0::bigint, 'sem sessão: nenhuma organização');
select is((select count(*) from public.organizations), 0::bigint, 'sem sessão: não vê organizações');

-- Proprietário de A e B.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select array_agg(o order by o) from private.member_organizations() o),
  array['a2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-00000000000b']::uuid[],
  'proprietário de duas empresas: conjunto com as duas');
select is((select array_agg(o order by o) from private.member_organizations(true) o),
  array['a2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-00000000000b']::uuid[],
  'proprietário de duas empresas: variante de proprietário com as duas');
select is((select count(*) from public.memberships where organization_id = 'a2000000-0000-4000-8000-00000000000a'), 2::bigint,
  'proprietário vê vínculos ativos de colegas, sem os revogados');
select is((select count(*) from public.memberships where revoked_at is not null), 0::bigint,
  'proprietário não vê vínculos revogados');
select is((select count(*) from public.products), 2::bigint, 'proprietário de duas empresas vê produtos das duas');
select lives_ok($$insert into public.products(organization_id, establishment_id, name, unit)
  values ('a2000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-00000000000a', 'Feijão A', 'kg')$$,
  'proprietário insere produto');
select lives_ok($$update public.establishments set name = 'Unidade A2' where id = 'a3000000-0000-4000-8000-00000000000a'$$,
  'proprietário altera unidade');

-- Membro ativo de A.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select array_agg(o) from private.member_organizations() o),
  array['a2000000-0000-4000-8000-00000000000a']::uuid[], 'membro: conjunto só com A');
select is((select count(*) from private.member_organizations(true)), 0::bigint, 'membro: variante de proprietário vazia');
select is((select array_agg(user_id) from public.memberships),
  array['a1000000-0000-4000-8000-000000000002']::uuid[], 'membro vê só o próprio vínculo, não o de colegas (I-10b)');
select is((select count(*) from public.organizations), 1::bigint, 'membro vê só A');
select is((select count(*) from public.establishments), 1::bigint, 'membro vê só a unidade de A');
select is((select count(*) from public.products), 2::bigint, 'membro vê produtos de A');
select is((select count(*) from public.suppliers), 1::bigint, 'membro vê fornecedores de A');
select throws_ok($$insert into public.products(organization_id, establishment_id, name, unit)
  values ('a2000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-00000000000a', 'Ataque', 'kg')$$,
  '42501', null, 'membro não insere produto (D-019)');
select throws_ok($$insert into public.suppliers(organization_id, establishment_id, name)
  values ('a2000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-00000000000a', 'Ataque')$$,
  '42501', null, 'membro não insere fornecedor (D-019)');
select throws_ok($$insert into public.establishments(organization_id, name, timezone)
  values ('a2000000-0000-4000-8000-00000000000a', 'Ataque', 'UTC')$$,
  '42501', null, 'membro não cria unidade (D-019)');
with changed as (update public.organizations set name = 'Ataque' returning id)
select is((select count(*) from changed), 0::bigint, 'membro não altera organização');
with changed as (update public.establishments set name = 'Ataque' returning id)
select is((select count(*) from changed), 0::bigint, 'membro não altera unidade');

-- Membro revogado de A.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from private.member_organizations()), 0::bigint, 'revogado: conjunto vazio');
select is((select count(*) from public.memberships), 0::bigint, 'revogado não vê nem o próprio vínculo');
select is((select count(*) from public.organizations), 0::bigint, 'revogado não vê organização');
select is((select count(*) from public.products), 0::bigint, 'revogado não vê produtos');

-- Proprietário revogado de A, ainda membro ativo de B.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select array_agg(o) from private.member_organizations() o),
  array['a2000000-0000-4000-8000-00000000000b']::uuid[], 'proprietário revogado de A: conjunto só com B');
select is((select count(*) from private.member_organizations(true)), 0::bigint,
  'proprietário revogado de A: papel de membro em B não vira proprietário');
select is((select count(*) from public.products where organization_id = 'a2000000-0000-4000-8000-00000000000a'), 0::bigint,
  'proprietário revogado não vê produtos de A');
select throws_ok($$insert into public.products(organization_id, establishment_id, name, unit)
  values ('a2000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-00000000000a', 'Ataque', 'kg')$$,
  '42501', null, 'proprietário revogado não insere em A');
select is((select array_agg(user_id) from public.memberships),
  array['a1000000-0000-4000-8000-000000000005']::uuid[], 'como membro de B vê só o próprio vínculo');

-- Proprietário só de B.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$insert into public.products(organization_id, establishment_id, name, unit)
  values ('a2000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-00000000000a', 'Ataque', 'kg')$$,
  '42501', null, 'proprietário de B não insere em A');
select throws_ok($$update public.establishments set organization_id = 'a2000000-0000-4000-8000-00000000000a'
  where id = 'a3000000-0000-4000-8000-00000000000b'$$, '42501', null, 'proprietário de B não move unidade para A');
select is((select count(*) from public.memberships where organization_id = 'a2000000-0000-4000-8000-00000000000a'), 0::bigint,
  'proprietário de B não vê vínculos de A');

-- Usuário sem vínculo.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is((select count(*) from private.member_organizations()), 0::bigint, 'sem vínculo: conjunto vazio');
select is((select count(*) from public.establishments), 0::bigint, 'sem vínculo: não vê unidades');

select * from finish();
rollback;
