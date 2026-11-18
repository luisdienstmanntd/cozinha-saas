-- Fase 7, fatia 7.8 — etiqueta baixada da produção (base do aviso de produção sem etiqueta).
--
-- Registra QUANDO a etiqueta PDF do recipiente integral de uma produção foi baixada. O painel compara esse
-- horário com o horário da produção e com o limite da unidade (7.6, padrão 1 hora) e avisa "sem etiqueta há X".
--   * É um evento, não estoque: não cria lote, recipiente, saldo nem movimento (D-003).
--   * O banco NÃO bloqueia nada: ele não sabe se a etiqueta foi colada, só que o arquivo foi baixado.
--   * Cada download vira uma linha (append-only). O aviso usa o primeiro download do recipiente.
--   * Quem registra: o proprietário e, quando a unidade deixa o colaborador registrar produção (7.6),
--     o colaborador (D-019 mantido: sem essa configuração só o proprietário escreve).

-- 1) Registro (append-only) -------------------------------------------------------------------------------
create table public.production_label_downloads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null,
  container_id uuid not null,
  downloaded_by uuid not null references auth.users(id),
  downloaded_at timestamptz not null default now(),
  -- Só lote produzido tem registro de produção; o recipiente é do mesmo lote.
  constraint production_label_downloads_production_fk foreign key (batch_id) references public.batch_productions (batch_id),
  constraint production_label_downloads_batch_fk foreign key (organization_id, establishment_id, batch_id)
    references public.batch_receipts (organization_id, establishment_id, id),
  constraint production_label_downloads_container_fk foreign key (container_id) references public.containers (id)
);
create index production_label_downloads_batch_idx on public.production_label_downloads (batch_id, downloaded_at);
create index production_label_downloads_container_idx on public.production_label_downloads (container_id);
create index production_label_downloads_by_idx on public.production_label_downloads (downloaded_by);
create index production_label_downloads_scope_idx on public.production_label_downloads (organization_id, establishment_id);
alter table public.production_label_downloads enable row level security;
revoke all on public.production_label_downloads from public, anon, authenticated, service_role;
grant select on public.production_label_downloads to authenticated, service_role;
create policy production_label_downloads_read on public.production_label_downloads for select to authenticated
  using (organization_id in (select private.member_organizations()));
create trigger production_label_downloads_append_only before update or delete or truncate on public.production_label_downloads
  for each statement execute function private.reject_history_change();
alter table public.production_label_downloads enable always trigger production_label_downloads_append_only;

-- 2) Registrar o download ---------------------------------------------------------------------------------
create function private.record_production_label_download(
  p_organization_id uuid, p_establishment_id uuid, p_container_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owner boolean;
  v_settings public.establishment_settings%rowtype;
  v_batch uuid;
  v_at timestamptz;
begin
  if v_user is null or not private.has_membership(p_organization_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  v_owner := private.has_membership(p_organization_id, true);
  -- Mesma regra de quem registra produção (7.6): padrão só o proprietário.
  v_settings := private.establishment_settings_of(p_organization_id, p_establishment_id);
  if not v_owner and v_settings.production_registrar <> 'member' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  -- Só o recipiente integral de uma produção da cozinha.
  select c.batch_id into v_batch
    from public.containers c
    join public.batch_receipts b on b.id = c.batch_id
   where c.id = p_container_id and c.kind = 'integral'
     and c.organization_id = p_organization_id and c.establishment_id = p_establishment_id
     and b.origin = 'produced';
  if not found then
    raise exception 'Recipiente de produção não encontrado.' using errcode = '23503';
  end if;
  -- Bloqueia o lote: serializa com a anulação da produção.
  perform 1 from public.batch_receipts b where b.id = v_batch for share;
  if exists (select 1 from public.production_voids v where v.batch_id = v_batch) then
    raise exception 'Produção anulada: não há etiqueta a registrar.' using errcode = '22023';
  end if;

  insert into public.production_label_downloads (organization_id, establishment_id, batch_id, container_id, downloaded_by)
  values (p_organization_id, p_establishment_id, v_batch, p_container_id, v_user)
  returning downloaded_at into v_at;
  return v_at;
end;
$$;
revoke all on function private.record_production_label_download(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.record_production_label_download(uuid, uuid, uuid) to authenticated;
create function public.record_production_label_download(
  p_organization_id uuid, p_establishment_id uuid, p_container_id uuid)
returns timestamptz language sql security invoker set search_path = '' as $$
  select private.record_production_label_download(p_organization_id, p_establishment_id, p_container_id);
$$;
revoke all on function public.record_production_label_download(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_production_label_download(uuid, uuid, uuid) to authenticated;

-- 3) Proteção do histórico passa a incluir production_label_downloads --------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef('private.assert_history_protected()'::regprocedure) into v_def;
  v_def := regexp_replace(v_def, '(array\[[^\]]*''production_voids''[^\]]*)\]', '\1, ''production_label_downloads'']', 'g');
  if v_def not like '%production_label_downloads%' then
    raise exception 'Não foi possível incluir production_label_downloads na proteção do histórico.' using errcode = '55000';
  end if;
  execute v_def;
end;
$$;
revoke all on function private.assert_history_protected() from public, anon, authenticated, service_role;

do $$
begin
  perform private.assert_history_protected();
  if exists (select 1 from private.production_problems()) or exists (select 1 from private.stock_conservation_problems()) then
    raise exception 'Coerência de produção ou de saldo quebrada pela migração.' using errcode = '55000';
  end if;
end;
$$;
