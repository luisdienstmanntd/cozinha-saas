-- Fatia 8.4a (D-067): preparação do ambiente hospedado de testes. Três peças administrativas, todas no schema
-- private (fora da API), executáveis só por quem abre uma sessão de administração do banco (SQL Editor do
-- Supabase, papel postgres). Nenhuma delas é chamável por anon, authenticated ou service_role, e cada uma
-- confere o papel da SESSÃO (session_user), não só o privilégio de execução.
--
--   1. private.environment_marker: declara se este banco é "testes" ou "producao". A produção é irreversível.
--   2. private.bootstrap_owner_organization / private.add_member_to_organization: criam a primeira empresa,
--      a primeira unidade e o vínculo do proprietário (ou de um colaborador) para uma conta que JÁ existe
--      em Authentication. Sem chave de serviço fora do Supabase; tudo ou nada.
--   3. private.reset_test_environment: apaga os dados do ambiente de testes, e só dele.
--
-- Nada aqui altera regra de negócio, RLS, histórico existente ou o que o aplicativo enxerga.

-- 1) Marcador do ambiente -------------------------------------------------------------------------
create table private.environment_marker (
  singleton boolean primary key default true check (singleton),
  kind text not null check (kind in ('testes', 'producao')),
  declared_at timestamptz not null default now()
);
revoke all on private.environment_marker from public, anon, authenticated, service_role;

-- Uma vez "producao", sempre "producao": não muda para "testes" nem pode ser apagado.
create function private.protect_environment_marker()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'O marcador do ambiente não pode ser apagado.' using errcode = '55000';
  end if;
  if old.kind = 'producao' then
    raise exception 'Ambiente de produção não volta a ser testes.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_environment_marker() from public, anon, authenticated, service_role;
create trigger environment_marker_protect before update or delete on private.environment_marker
  for each row execute function private.protect_environment_marker();
create trigger environment_marker_no_truncate before truncate on private.environment_marker
  for each statement execute function private.protect_environment_marker();

-- Quem pode administrar: sessão aberta como postgres ou supabase_admin (SQL Editor, CLI). Uma chamada pela
-- API chega com session_user = authenticator e é recusada mesmo que alguém conceda EXECUTE por engano.
create function private.assert_admin_session()
returns void language plpgsql set search_path = '' as $$
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Operação administrativa: só em sessão de administração do banco.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_admin_session() from public, anon, authenticated, service_role;

-- Uma operação administrativa por vez: bootstrap, vínculo de colaborador, declaração do ambiente e reset
-- disputam o mesmo cadeado (advisory lock de transação). Quem chega com outra em andamento é recusado na
-- hora (55P03), em vez de esperar e rodar em cima do estado que a outra deixou.
create function private.acquire_admin_lock()
returns void language plpgsql set search_path = '' as $$
begin
  perform private.assert_admin_session();
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('cozinha.administracao', 0)) then
    raise exception 'Outra operação administrativa está em andamento; tente novamente em instantes.' using errcode = '55P03';
  end if;
end;
$$;
revoke all on function private.acquire_admin_lock() from public, anon, authenticated, service_role;

-- "producao" exige a frase de confirmação. Ela NÃO verifica nada tecnicamente: é o reconhecimento humano de
-- que o MFA obrigatório para proprietários, a revisão de segurança independente, o backup com teste de
-- restauração e a conferência da nutricionista RT (Q10) estão resolvidos antes do lançamento comercial.
create function private.declare_environment(p_kind text, p_confirmation text default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.acquire_admin_lock();
  if p_kind is null or p_kind not in ('testes', 'producao') then
    raise exception 'Informe testes ou producao.' using errcode = '22023';
  end if;
  if p_kind = 'producao' and p_confirmation is distinct from 'PRODUCAO COM MFA OBRIGATORIO' then
    raise exception 'Produção exige a frase de confirmação (MFA obrigatório para proprietários, revisão de segurança, backup e Q10 resolvidos).' using errcode = '22023';
  end if;
  insert into private.environment_marker (kind) values (p_kind)
  on conflict (singleton) do update set kind = excluded.kind, declared_at = now();
  return 'Ambiente declarado: ' || p_kind;
end;
$$;
revoke all on function private.declare_environment(text, text) from public, anon, authenticated, service_role;

-- 2) Primeira empresa, primeira unidade e proprietário -----------------------------------------------
create function private.find_confirmed_user(p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_user auth.users%rowtype;
begin
  if v_email = '' then
    raise exception 'Informe o e-mail da conta.' using errcode = '22023';
  end if;
  select * into v_user from auth.users where lower(email) = v_email and deleted_at is null;
  if not found then
    raise exception 'Não existe conta com este e-mail. Crie primeiro em Authentication > Users (Add user, com "Auto Confirm User").'
      using errcode = 'P0002';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'A conta ainda não está confirmada. Crie-a com "Auto Confirm User" ou confirme o e-mail.'
      using errcode = '22023';
  end if;
  return v_user.id;
end;
$$;
revoke all on function private.find_confirmed_user(text) from public, anon, authenticated, service_role;

create function private.bootstrap_owner_organization(
  p_owner_email text, p_owner_display_name text, p_organization_name text, p_establishment_name text,
  p_timezone text default 'America/Sao_Paulo'
) returns table(organization_id uuid, establishment_id uuid, owner_user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid; v_org uuid; v_est uuid;
  v_org_name text := private.visible_text(p_organization_name);
  v_est_name text := private.visible_text(p_establishment_name);
  v_display text := private.visible_text(p_owner_display_name);
begin
  perform private.acquire_admin_lock();
  if v_org_name is null or length(v_org_name) > 80 then
    raise exception 'Nome da empresa: de 1 a 80 caracteres.' using errcode = '22023';
  end if;
  if v_est_name is null or length(v_est_name) > 80 then
    raise exception 'Nome da unidade: de 1 a 80 caracteres.' using errcode = '22023';
  end if;
  if v_display is null or length(v_display) > 40 then
    raise exception 'Nome de exibição: de 1 a 40 caracteres, curto e sem sobrenome completo.' using errcode = '22023';
  end if;
  if p_timezone is null or private.visible_text(p_timezone) is null then
    raise exception 'Informe o fuso horário (nome IANA, por exemplo America/Sao_Paulo).' using errcode = '22023';
  end if;
  v_user := private.find_confirmed_user(p_owner_email);
  if exists (select 1 from public.organizations o where lower(o.name) = lower(v_org_name)) then
    raise exception 'Já existe uma empresa com este nome; nada foi alterado.' using errcode = '23505';
  end if;
  if exists (select 1 from public.memberships m where m.user_id = v_user and m.revoked_at is null) then
    raise exception 'Esta conta já tem vínculo com uma empresa; nada foi alterado.' using errcode = '23505';
  end if;
  insert into public.organizations (name) values (v_org_name) returning id into v_org;
  -- O gatilho do banco valida o fuso (nome IANA) e o torna imutável depois do primeiro recebimento (6.0c).
  insert into public.establishments (organization_id, name, timezone)
  values (v_org, v_est_name, p_timezone) returning id into v_est;
  insert into public.memberships (organization_id, user_id, role, display_name)
  values (v_org, v_user, 'owner', v_display);
  return query select v_org, v_est, v_user;
end;
$$;
revoke all on function private.bootstrap_owner_organization(text, text, text, text, text) from public, anon, authenticated, service_role;

create function private.add_member_to_organization(
  p_organization_id uuid, p_email text, p_display_name text, p_role text default 'member'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_display text := private.visible_text(p_display_name);
begin
  perform private.acquire_admin_lock();
  if p_role is null or p_role not in ('owner', 'member') then
    raise exception 'Papel: owner ou member.' using errcode = '22023';
  end if;
  if v_display is null or length(v_display) > 40 then
    raise exception 'Nome de exibição: de 1 a 40 caracteres, curto e sem sobrenome completo.' using errcode = '22023';
  end if;
  if p_organization_id is null or not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
  v_user := private.find_confirmed_user(p_email);
  -- Uma conta por pessoa e um vínculo ativo por conta (V2/D-025): evita misturar empresas numa conta.
  if exists (select 1 from public.memberships m where m.user_id = v_user and m.revoked_at is null) then
    raise exception 'Esta conta já tem vínculo com uma empresa; nada foi alterado.' using errcode = '23505';
  end if;
  insert into public.memberships (organization_id, user_id, role, display_name)
  values (p_organization_id, v_user, p_role, v_display);
  return v_user;
end;
$$;
revoke all on function private.add_member_to_organization(uuid, text, text, text) from public, anon, authenticated, service_role;

-- 3) Zerar o ambiente de testes ------------------------------------------------------------------------
-- Travas, todas obrigatórias: (a) sessão de administração e cadeado administrativo (uma operação por vez);
-- (b) o marcador do ambiente existe e é "testes" (sem marcador, ou "producao", recusa); (c) escopo e frase
-- de confirmação exatos (nulo ou desconhecido é recusado); (d) LISTA EXPLÍCITA de tabelas: o que não está
-- nas duas listas abaixo faz o reset recusar (fail-closed) até alguém classificar a tabela nova; (e) a
-- proteção do histórico é verificada de novo no fim e a operação inteira é uma transação.
-- Escopos: 'operational' apaga o que a operação da cozinha gerou e MANTÉM a configuração (empresas, unidades,
-- vínculos, catálogo, fornecedores, locais e configurações); 'everything' apaga também a configuração.
-- Nunca toca em auth.users, auth.sessions, private.session_activity (V2) nem no marcador do ambiente: contas e
-- sessões seguem valendo (a V2 só mede inatividade; sem dados de negócio ali) e as pessoas continuam entrando.
-- Os gatilhos append-only são suspensos só dentro desta função e restaurados exatamente como estavam.
create function private.reset_test_environment(p_scope text, p_confirmation text)
returns table(table_name text, rows_removed bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_operational constant text[] := array[
    'batch_receipts', 'container_balances', 'container_handlings', 'containers', 'entity_changes',
    'handling_voids', 'location_moves', 'occurrence_decisions', 'occurrences', 'batch_productions',
    'production_label_downloads', 'production_temperatures', 'production_voids', 'stock_movements'];
  v_configuration constant text[] := array[
    'establishment_settings', 'establishments', 'memberships', 'organizations', 'products',
    'storage_locations', 'suppliers'];
  v_actual text[];
  v_unknown text[];
  v_missing text[];
  v_tables text[];
  v_rels text[]; v_names text[]; v_enabled text[]; v_counts bigint[];
  v_count bigint; i int;
begin
  perform private.acquire_admin_lock();
  select kind into v_kind from private.environment_marker where singleton;
  if v_kind is distinct from 'testes' then
    raise exception 'Recusado: este banco não está declarado como ambiente de testes.' using errcode = '55000';
  end if;
  if p_scope is null or p_scope not in ('operational', 'everything') then
    raise exception 'Escopo: operational ou everything.' using errcode = '22023';
  end if;
  if p_confirmation is distinct from 'ZERAR AMBIENTE DE TESTES' then
    raise exception 'Confirmação incorreta; nada foi apagado.' using errcode = '22023';
  end if;
  -- Espera no máximo 15 s por uma tabela em uso; passado isso, desiste sem apagar nada.
  perform pg_catalog.set_config('lock_timeout', '15s', true);

  select coalesce(array_agg(c.relname::text order by c.relname), '{}') into v_actual
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p');
  select coalesce(array_agg(t order by t), '{}') into v_unknown
    from unnest(v_actual) t where t <> all (v_operational || v_configuration);
  select coalesce(array_agg(t order by t), '{}') into v_missing
    from unnest(v_operational || v_configuration) t where t <> all (v_actual);
  if cardinality(v_unknown) > 0 or cardinality(v_missing) > 0 then
    raise exception 'Recusado: listas do reset desatualizadas (sem classificação: %; inexistentes: %). Nada foi apagado.',
      coalesce(nullif(array_to_string(v_unknown, ', '), ''), '-'), coalesce(nullif(array_to_string(v_missing, ', '), ''), '-')
      using errcode = '55000';
  end if;
  v_tables := case p_scope when 'operational' then v_operational else v_operational || v_configuration end;

  select coalesce(array_agg(g.tgrelid::regclass::text order by g.oid), '{}'),
         coalesce(array_agg(g.tgname::text order by g.oid), '{}'),
         coalesce(array_agg(g.tgenabled::text order by g.oid), '{}')
    into v_rels, v_names, v_enabled
  from pg_catalog.pg_trigger g
  where not g.tgisinternal and g.tgrelid::regclass::text = any (select 'public.' || t from unnest(v_tables) t);

  v_counts := array_fill(0::bigint, array[cardinality(v_tables)]);
  for i in 1 .. cardinality(v_tables) loop
    execute format('select count(*) from public.%I', v_tables[i]) into v_count;
    v_counts[i] := v_count;
  end loop;

  for i in 1 .. coalesce(cardinality(v_rels), 0) loop
    execute format('alter table %s disable trigger %I', v_rels[i], v_names[i]);
  end loop;
  -- Sem CASCADE: se uma tabela mantida referenciar uma apagada, falha em vez de apagar mais do que o pedido.
  execute 'truncate table ' || (select string_agg(format('public.%I', t), ', ') from unnest(v_tables) t);
  for i in 1 .. coalesce(cardinality(v_rels), 0) loop
    execute format('alter table %s %s trigger %I', v_rels[i],
      case v_enabled[i] when 'A' then 'enable always' when 'R' then 'enable replica' when 'D' then 'disable' else 'enable' end,
      v_names[i]);
  end loop;
  perform private.assert_history_protected();
  return query select t.name, t.n from unnest(v_tables, v_counts) as t(name, n) order by t.name;
end;
$$;
revoke all on function private.reset_test_environment(text, text) from public, anon, authenticated, service_role;
