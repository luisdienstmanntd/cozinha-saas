-- V2 (D-025, definições de luis em 16/11/2026): sessão persistente com inatividade máxima de 30 minutos.
-- O navegador guarda a sessão, mas quem decide se ela ainda vale é o banco:
--   1. o JWT do Supabase Auth traz session_id; a sessão precisa existir em auth.sessions (Sair apaga a
--      linha, então um token copiado antes do Sair deixa de valer na hora, sem esperar o vencimento do JWT);
--   2. a última atividade registrada (private.session_activity, ou a criação da sessão) precisa ser de
--      menos de 30 minutos;
--   3. a checagem roda antes de toda requisição da API (pgrst.db_pre_request) e também dentro de
--      private.member_organizations e private.has_membership, que sustentam as políticas RLS e as
--      funções de escrita. Uma sessão expirada não lê nem grava, mesmo com a tela aberta.
-- Token sem session_id (só pode ser emitido com a chave secreta do projeto, fora do Supabase Auth) não
-- tem sessão para conferir e segue as regras de antes; ver docs/V2_SESSAO.md, limitações.

create table private.session_activity (
  session_id uuid primary key,
  user_id uuid not null,
  last_seen_at timestamptz not null default now()
);
alter table private.session_activity enable row level security;
revoke all on private.session_activity from public, anon, authenticated, service_role;
create index session_activity_user_idx on private.session_activity (user_id, last_seen_at);

create function private.session_inactivity_limit()
returns interval language sql immutable set search_path = '' as $$
  select interval '30 minutes';
$$;
revoke all on function private.session_inactivity_limit() from public, anon, authenticated, service_role;

-- 'ok' | 'revoked' (sessão encerrada, inexistente ou de outro usuário) | 'idle' (inatividade).
create function private.session_state()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  v_sid text := v_claims ->> 'session_id';
  v_uid uuid := (select auth.uid());
  v_created timestamptz;
  v_not_after timestamptz;
  v_last timestamptz;
begin
  if v_uid is null or coalesce(v_claims ->> 'role', '') <> 'authenticated' then
    return 'ok'; -- sem usuário: as políticas já não devolvem nada
  end if;
  if v_sid is null then
    return 'ok'; -- token sem sessão do Supabase Auth (ver limitações)
  end if;
  if v_sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return 'revoked';
  end if;
  select s.created_at, s.not_after into v_created, v_not_after
  from auth.sessions s
  where s.id = v_sid::uuid and s.user_id = v_uid;
  if not found then
    return 'revoked';
  end if;
  if v_not_after is not null and v_not_after <= now() then
    return 'revoked';
  end if;
  select a.last_seen_at into v_last
  from private.session_activity a
  where a.session_id = v_sid::uuid and a.user_id = v_uid;
  if coalesce(v_last, v_created) <= now() - private.session_inactivity_limit() then
    return 'idle';
  end if;
  return 'ok';
end;
$$;
revoke all on function private.session_state() from public, anon, authenticated, service_role;
grant execute on function private.session_state() to authenticated;

create function private.session_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.session_state() = 'ok';
$$;
revoke all on function private.session_active() from public, anon, authenticated, service_role;
grant execute on function private.session_active() to authenticated;

-- Registra atividade da pessoa. Sessão expirada não se reativa: precisa entrar de novo.
create function private.touch_session()
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_sid text := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'session_id';
  v_state text;
begin
  if v_uid is null then
    raise exception 'Sessão ausente. Entre novamente.' using errcode = '28000';
  end if;
  v_state := private.session_state();
  if v_state <> 'ok' then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = '28000', hint = 'SESSION_EXPIRED';
  end if;
  if v_sid is null then
    return null;
  end if;
  insert into private.session_activity (session_id, user_id, last_seen_at)
  values (v_sid::uuid, v_uid, now())
  on conflict (session_id) do update
    set last_seen_at = greatest(private.session_activity.last_seen_at, excluded.last_seen_at)
    where private.session_activity.user_id = excluded.user_id;
  -- Limpeza das sessões antigas da mesma pessoa (já expiradas há mais de um dia).
  delete from private.session_activity a
  where a.user_id = v_uid and a.session_id <> v_sid::uuid
    and a.last_seen_at < now() - interval '1 day';
  return now() + private.session_inactivity_limit();
end;
$$;
revoke all on function private.touch_session() from public, anon, authenticated, service_role;
grant execute on function private.touch_session() to authenticated;

create function public.touch_session()
returns timestamptz language sql volatile security invoker set search_path = '' as $$
  select private.touch_session();
$$;
revoke all on function public.touch_session() from public, anon, authenticated, service_role;
grant execute on function public.touch_session() to authenticated;

-- Executada pela API antes de cada requisição, com o papel de quem chamou (inclusive anon). Por isso
-- fica em schema próprio: o guarda de segurança proíbe qualquer função de public/private executável por
-- anon. O schema não é exposto pela API e só contém esta função. Resposta 401 com código
-- SESSION_EXPIRED, que o aplicativo reconhece para voltar à tela de entrada.
create schema session_guard;
revoke all on schema session_guard from public;
grant usage on schema session_guard to anon, authenticated, service_role;

create function session_guard.check_request()
returns void language plpgsql stable security invoker set search_path = '' as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  -- Só sessões de usuário (papel authenticated) têm o que conferir; anon e service_role passam.
  if coalesce(v_claims, '') = '' or (v_claims::jsonb ->> 'role') is distinct from 'authenticated' then
    return;
  end if;
  if not private.session_active() then
    raise sqlstate 'PGRST' using
      message = '{"code":"SESSION_EXPIRED","message":"Sessão expirada. Entre novamente."}',
      detail = '{"status":401,"headers":{}}';
  end if;
end;
$$;
revoke all on function session_guard.check_request() from public;
grant execute on function session_guard.check_request() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'session_guard.check_request';
notify pgrst, 'reload config';

-- Mesma regra de antes (vínculo ativo, proprietário quando exigido) mais a sessão ativa.
create or replace function private.has_membership(target_organization uuid, owner_required boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.session_active() and exists (
    select 1 from public.memberships m
    where m.organization_id = target_organization and m.user_id = (select auth.uid())
      and m.revoked_at is null and (not owner_required or m.role = 'owner')
  );
$$;

create or replace function private.member_organizations(p_owner_only boolean default false)
returns setof uuid language sql stable security definer set search_path = '' rows 10 as $$
  select m.organization_id from public.memberships m
  where m.user_id = (select auth.uid())
    and m.revoked_at is null
    and (not p_owner_only or m.role = 'owner')
    and private.session_active();
$$;
