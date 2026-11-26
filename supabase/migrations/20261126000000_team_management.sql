-- Fatia B da auditoria do PR #79 (D-077): gestão da equipe pelo site.
-- Até aqui só dava para vincular pessoas pelo SQL Editor (private.add_member_to_organization, D-067) e
-- nenhum caminho gravava memberships.revoked_at: um ex-funcionário continuava entrando.
-- Esta migração dá ao proprietário ativo da empresa: listar a equipe, vincular uma conta já criada e
-- confirmada no Supabase Auth, trocar o papel, revogar e restaurar o acesso. Regras no banco:
--   * só o proprietário ativo da própria empresa (sessão ativa, V2) age; o resto recebe "Acesso negado";
--   * ninguém troca o próprio papel nem revoga o próprio acesso pela tela, e a empresa nunca fica sem
--     proprietário ativo (o cadeado na linha da empresa serializa dois proprietários agindo juntos);
--   * uma conta tem um único vínculo ativo (D-025). Conta inexistente, não confirmada ou já vinculada a
--     outra empresa recebem a MESMA mensagem, para não revelar dados de outra empresa;
--   * nada é apagado: revogar grava revoked_at, restaurar limpa revoked_at na mesma linha (autoria antiga
--     preservada). Papel e acesso ficam em entity_changes por gatilho, qualquer que seja o caminho.
-- Criar a conta ou convidar por e-mail continua fora (exige função de servidor e e-mail configurado no
-- projeto hospedado, fatia C). Reversível: ver o bloco "Reversão" no fim.

-- 1) Auditoria de papel e acesso ------------------------------------------------------------------------
alter table public.entity_changes drop constraint entity_changes_field_check;
alter table public.entity_changes add constraint entity_changes_field_check
  check (field in ('name', 'timezone', 'display_name', 'storage_condition',
                   'production_registrar', 'production_window_minutes', 'unlabeled_limit_minutes',
                   'portion_expiry_rule', 'role', 'access'));

create function private.access_text(p_revoked_at timestamptz)
returns text language sql immutable set search_path = '' as $$
  select case when p_revoked_at is null then 'ativo' else 'revogado' end;
$$;
revoke all on function private.access_text(timestamptz) from public, anon, authenticated, service_role;

create function private.log_membership_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.entity_changes (organization_id, entity, entity_id, field, old_value, new_value, changed_by)
    values (new.organization_id, 'membership', new.id, 'access', null, private.access_text(new.revoked_at), auth.uid());
    return null;
  end if;
  if new.role is distinct from old.role then
    insert into public.entity_changes (organization_id, entity, entity_id, field, old_value, new_value, changed_by)
    values (new.organization_id, 'membership', new.id, 'role', old.role, new.role, auth.uid());
  end if;
  if (new.revoked_at is null) is distinct from (old.revoked_at is null) then
    insert into public.entity_changes (organization_id, entity, entity_id, field, old_value, new_value, changed_by)
    values (new.organization_id, 'membership', new.id, 'access',
            private.access_text(old.revoked_at), private.access_text(new.revoked_at), auth.uid());
  end if;
  return null;
end;
$$;
revoke all on function private.log_membership_access() from public, anon, authenticated, service_role;
-- O INSERT só é auditado quando parte de uma sessão (vínculo feito pelo site); o provisionamento pelo
-- SQL Editor (D-067) e os dados de teste seguem como antes.
create trigger log_membership_access_insert after insert on public.memberships
  for each row when (auth.uid() is not null) execute function private.log_membership_access();
create trigger log_membership_access_update after update of role, revoked_at on public.memberships
  for each row execute function private.log_membership_access();

-- 2) Guarda comum -----------------------------------------------------------------------------------------
-- Tranca a empresa (uma operação de equipe por vez) e SÓ DEPOIS confere que quem chama ainda é proprietário
-- ativo: em READ COMMITTED a consulta seguinte ao cadeado enxerga o que o outro proprietário gravou.
create function private.lock_team(p_organization_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or p_organization_id is null then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  perform 1 from public.organizations o where o.id = p_organization_id for update;
  if not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return v_user;
end;
$$;
revoke all on function private.lock_team(uuid) from public, anon, authenticated, service_role;

create function private.active_owner_count(p_organization_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.memberships m
   where m.organization_id = p_organization_id and m.role = 'owner' and m.revoked_at is null;
$$;
revoke all on function private.active_owner_count(uuid) from public, anon, authenticated, service_role;

-- 3) Listar a equipe ------------------------------------------------------------------------------------
-- Inclui os revogados (para restaurar) e o e-mail da conta; nada de outras empresas.
create function private.list_team_members(p_organization_id uuid)
returns table (user_id uuid, display_name text, email text, role text, created_at timestamptz,
               revoked_at timestamptz, is_self boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or p_organization_id is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
    select m.user_id, m.display_name, u.email::text, m.role, m.created_at, m.revoked_at, m.user_id = v_user
      from public.memberships m
      join auth.users u on u.id = m.user_id
     where m.organization_id = p_organization_id
     order by (m.revoked_at is not null), (m.role <> 'owner'), lower(coalesce(m.display_name, u.email)), m.created_at;
end;
$$;
revoke all on function private.list_team_members(uuid) from public, anon, authenticated, service_role;
grant execute on function private.list_team_members(uuid) to authenticated;

-- 4) Vincular uma conta já criada -------------------------------------------------------------------------
create function private.add_team_member(p_organization_id uuid, p_email text, p_display_name text, p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(private.visible_text(p_email));
  v_display text := private.visible_text(p_display_name);
  v_target uuid;
  v_existing public.memberships%rowtype;
begin
  perform private.lock_team(p_organization_id);
  if v_email is null or length(v_email) > 254 or position('@' in v_email) < 2 then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;
  if v_display is null or length(v_display) > 40 then
    raise exception 'Nome de exibição: de 1 a 40 caracteres.' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('owner', 'member') then
    raise exception 'Escolha o papel: proprietário ou colaborador.' using errcode = '22023';
  end if;

  select u.id into v_target from auth.users u
   where lower(u.email) = v_email and u.deleted_at is null and u.email_confirmed_at is not null;
  if found then
    select * into v_existing from public.memberships m
     where m.organization_id = p_organization_id and m.user_id = v_target;
    if found and v_existing.revoked_at is null then
      raise exception 'Esta pessoa já faz parte da equipe.' using errcode = '23505';
    elsif found then
      raise exception 'Esta pessoa teve o acesso revogado. Use "Restaurar acesso" na lista da equipe.'
        using errcode = '23505';
    end if;
  end if;
  -- Mesma resposta para conta inexistente, não confirmada ou vinculada a outra empresa (D-025).
  if v_target is null or exists (select 1 from public.memberships m where m.user_id = v_target and m.revoked_at is null) then
    raise exception 'Não foi possível vincular este e-mail. Confira se a conta foi criada e confirmada e se ela não está em uso em outra empresa.'
      using errcode = 'P0002';
  end if;

  insert into public.memberships (organization_id, user_id, role, display_name)
  values (p_organization_id, v_target, p_role, v_display);
  return v_target;
end;
$$;
revoke all on function private.add_team_member(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function private.add_team_member(uuid, text, text, text) to authenticated;

-- 5) Trocar papel ----------------------------------------------------------------------------------------
create function private.set_team_member_role(p_organization_id uuid, p_user_id uuid, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.lock_team(p_organization_id); v_membership public.memberships%rowtype;
begin
  if p_role is null or p_role not in ('owner', 'member') then
    raise exception 'Escolha o papel: proprietário ou colaborador.' using errcode = '22023';
  end if;
  if p_user_id is null then
    raise exception 'Pessoa não encontrada na equipe.' using errcode = '23503';
  end if;
  if p_user_id = v_user then
    raise exception 'Você não pode alterar o próprio papel. Peça a outro proprietário.' using errcode = '22023';
  end if;
  select * into v_membership from public.memberships m
   where m.organization_id = p_organization_id and m.user_id = p_user_id and m.revoked_at is null
   for update;
  if not found then
    raise exception 'Pessoa não encontrada na equipe.' using errcode = '23503';
  end if;
  if v_membership.role = p_role then
    return p_role; -- idempotente, sem nova auditoria
  end if;
  if v_membership.role = 'owner' and private.active_owner_count(p_organization_id) <= 1 then
    raise exception 'A empresa precisa de pelo menos um proprietário ativo.' using errcode = '23514';
  end if;
  update public.memberships set role = p_role where id = v_membership.id;
  return p_role;
end;
$$;
revoke all on function private.set_team_member_role(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.set_team_member_role(uuid, uuid, text) to authenticated;

-- 6) Revogar acesso -------------------------------------------------------------------------------------
-- Vale na hora: has_membership e member_organizations já exigem revoked_at nulo, inclusive para quem
-- está com o site aberto. Os registros que a pessoa fez continuam com a autoria dela.
create function private.revoke_team_member(p_organization_id uuid, p_user_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.lock_team(p_organization_id); v_membership public.memberships%rowtype; v_at timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'Pessoa não encontrada na equipe.' using errcode = '23503';
  end if;
  if p_user_id = v_user then
    raise exception 'Você não pode revogar o próprio acesso. Peça a outro proprietário.' using errcode = '22023';
  end if;
  select * into v_membership from public.memberships m
   where m.organization_id = p_organization_id and m.user_id = p_user_id
   for update;
  if not found then
    raise exception 'Pessoa não encontrada na equipe.' using errcode = '23503';
  end if;
  if v_membership.revoked_at is not null then
    return v_membership.revoked_at; -- já revogado: idempotente
  end if;
  if v_membership.role = 'owner' and private.active_owner_count(p_organization_id) <= 1 then
    raise exception 'A empresa precisa de pelo menos um proprietário ativo.' using errcode = '23514';
  end if;
  update public.memberships set revoked_at = v_at where id = v_membership.id;
  return v_at;
end;
$$;
revoke all on function private.revoke_team_member(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.revoke_team_member(uuid, uuid) to authenticated;

-- 7) Restaurar acesso ------------------------------------------------------------------------------------
-- Volta SEMPRE como colaborador (quem restaura decide depois se promove), na mesma linha de vínculo.
create function private.restore_team_member(p_organization_id uuid, p_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.lock_team(p_organization_id); v_membership public.memberships%rowtype;
begin
  if p_user_id is null then
    raise exception 'Pessoa não encontrada na equipe.' using errcode = '23503';
  end if;
  select * into v_membership from public.memberships m
   where m.organization_id = p_organization_id and m.user_id = p_user_id
   for update;
  if not found then
    raise exception 'Pessoa não encontrada na equipe.' using errcode = '23503';
  end if;
  if v_membership.revoked_at is null then
    return v_membership.role; -- já ativo: idempotente
  end if;
  if exists (select 1 from public.memberships m where m.user_id = p_user_id and m.revoked_at is null)
     or not exists (select 1 from auth.users u where u.id = p_user_id and u.deleted_at is null) then
    raise exception 'Não foi possível restaurar este acesso. A conta pode ter sido removida ou estar em uso em outra empresa.'
      using errcode = 'P0002';
  end if;
  update public.memberships set revoked_at = null, role = 'member' where id = v_membership.id;
  return 'member';
end;
$$;
revoke all on function private.restore_team_member(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.restore_team_member(uuid, uuid) to authenticated;

-- 8) Fachada da API (SECURITY INVOKER; a autorização está nas funções privadas) ---------------------------
create function public.list_team_members(p_organization_id uuid)
returns table (user_id uuid, display_name text, email text, role text, created_at timestamptz,
               revoked_at timestamptz, is_self boolean)
language sql stable security invoker set search_path = '' as $$
  select * from private.list_team_members(p_organization_id);
$$;
create function public.add_team_member(p_organization_id uuid, p_email text, p_display_name text, p_role text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.add_team_member(p_organization_id, p_email, p_display_name, p_role);
$$;
create function public.set_team_member_role(p_organization_id uuid, p_user_id uuid, p_role text)
returns text language sql security invoker set search_path = '' as $$
  select private.set_team_member_role(p_organization_id, p_user_id, p_role);
$$;
create function public.revoke_team_member(p_organization_id uuid, p_user_id uuid)
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.revoke_team_member(p_organization_id, p_user_id);
$$;
create function public.restore_team_member(p_organization_id uuid, p_user_id uuid)
returns text language sql security invoker set search_path = '' as $$
  select private.restore_team_member(p_organization_id, p_user_id);
$$;
revoke all on function public.list_team_members(uuid) from public, anon, authenticated, service_role;
revoke all on function public.add_team_member(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.set_team_member_role(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_team_member(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.restore_team_member(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_team_members(uuid) to authenticated;
grant execute on function public.add_team_member(uuid, text, text, text) to authenticated;
grant execute on function public.set_team_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.revoke_team_member(uuid, uuid) to authenticated;
grant execute on function public.restore_team_member(uuid, uuid) to authenticated;

-- Reversão (manual, só com autorização): drop das funções public.* e private.* acima, dos gatilhos
-- log_membership_access_insert/update e de private.log_membership_access/access_text/lock_team/
-- active_owner_count; recriar entity_changes_field_check sem 'role' e 'access' só depois de confirmar que
-- não há linhas com esses campos (a auditoria é append-only e não deve ser apagada). revoked_at gravados
-- continuam valendo; nenhuma coluna foi criada.
