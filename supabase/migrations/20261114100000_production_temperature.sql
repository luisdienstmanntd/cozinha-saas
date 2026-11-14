-- Fase 7, fatia 7.9 — temperatura opcional da produção (fim do resfriamento, reaquecimento).
--
-- Registro do que a pessoa mediu, quando quiser. Nada é obrigatório e nada é avaliado:
--   * o sistema não diz se a temperatura está conforme, não cria ocorrência e não bloqueia o lote
--     (a D-027 classifica só a temperatura de RECEBIMENTO; aqui não há faixa aprovada pela nutricionista RT);
--   * não é estoque: não cria lote, recipiente, saldo nem movimento (D-003);
--   * cada medição é uma linha append-only; repetir a medição cria outra linha.
--   * Quem registra: o proprietário e, quando a unidade deixa o colaborador registrar produção (7.6), o
--     colaborador só da própria produção (D-019 mantido: sem essa configuração só o proprietário escreve).

create table public.production_temperatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null,
  moment text not null check (moment in ('cooling_end', 'reheating')),
  temperature_c numeric(4,1) not null check (temperature_c between -50 and 80),
  measured_at timestamptz not null,
  recorded_by uuid not null references auth.users(id),
  -- Nome de exibição copiado no registro (I-4): a leitura do colaborador não alcança os outros vínculos.
  recorded_by_name text not null check (length(recorded_by_name) between 1 and 80),
  created_at timestamptz not null default now(),
  constraint production_temperatures_production_fk foreign key (batch_id) references public.batch_productions (batch_id),
  constraint production_temperatures_batch_fk foreign key (organization_id, establishment_id, batch_id)
    references public.batch_receipts (organization_id, establishment_id, id)
);
create index production_temperatures_batch_idx on public.production_temperatures (batch_id, measured_at);
create index production_temperatures_by_idx on public.production_temperatures (recorded_by);
create index production_temperatures_scope_idx on public.production_temperatures (organization_id, establishment_id);
alter table public.production_temperatures enable row level security;
revoke all on public.production_temperatures from public, anon, authenticated, service_role;
grant select on public.production_temperatures to authenticated, service_role;
create policy production_temperatures_read on public.production_temperatures for select to authenticated
  using (organization_id in (select private.member_organizations()));
create trigger production_temperatures_append_only before update or delete or truncate on public.production_temperatures
  for each statement execute function private.reject_history_change();
alter table public.production_temperatures enable always trigger production_temperatures_append_only;

create function private.record_production_temperature(
  p_organization_id uuid, p_establishment_id uuid, p_batch_id uuid, p_moment text,
  p_temperature_c numeric, p_measured_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owner boolean;
  v_settings public.establishment_settings%rowtype;
  v_batch public.batch_receipts%rowtype;
  v_production public.batch_productions%rowtype;
  v_name text;
  v_id uuid;
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

  if p_batch_id is null or p_moment is null or p_moment not in ('cooling_end', 'reheating')
     or p_temperature_c is null or p_temperature_c::text in ('NaN', 'Infinity', '-Infinity')
     or p_temperature_c < -50 or p_temperature_c > 80 or p_temperature_c <> round(p_temperature_c, 1)
     or p_measured_at is null or not isfinite(p_measured_at) then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;

  -- Lote produzido pela cozinha, no escopo, bloqueado: serializa com a anulação da produção.
  select * into v_batch from public.batch_receipts b
   where b.organization_id = p_organization_id and b.establishment_id = p_establishment_id
     and b.id = p_batch_id and b.origin = 'produced'
   for share;
  if not found then
    raise exception 'Lote de produção não encontrado.' using errcode = '23503';
  end if;
  select * into strict v_production from public.batch_productions p where p.batch_id = p_batch_id;
  if not v_owner and v_production.handled_by is distinct from v_user then
    raise exception 'Quem não é proprietário registra só a temperatura da própria produção.' using errcode = '42501';
  end if;
  if exists (select 1 from public.production_voids v where v.batch_id = p_batch_id) then
    raise exception 'Produção anulada: não há temperatura a registrar.' using errcode = '22023';
  end if;
  if p_measured_at > now() then
    raise exception 'O horário da medição não pode estar no futuro.' using errcode = '22023';
  end if;
  if p_measured_at < v_production.produced_at then
    raise exception 'O horário da medição não pode ser anterior à produção.' using errcode = '22023';
  end if;

  select nullif(btrim(m.display_name), '') into v_name from public.memberships m
   where m.organization_id = p_organization_id and m.user_id = v_user and m.revoked_at is null;
  if v_name is null then
    raise exception 'Defina o nome de exibição de quem registra a temperatura antes de registrar.' using errcode = '22023';
  end if;

  insert into public.production_temperatures (organization_id, establishment_id, batch_id, moment, temperature_c,
    measured_at, recorded_by, recorded_by_name)
  values (p_organization_id, p_establishment_id, p_batch_id, p_moment, p_temperature_c, p_measured_at, v_user, v_name)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.record_production_temperature(uuid, uuid, uuid, text, numeric, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.record_production_temperature(uuid, uuid, uuid, text, numeric, timestamptz) to authenticated;
create function public.record_production_temperature(
  p_organization_id uuid, p_establishment_id uuid, p_batch_id uuid, p_moment text,
  p_temperature_c numeric, p_measured_at timestamptz)
returns uuid language sql security invoker set search_path = '' as $$
  select private.record_production_temperature(p_organization_id, p_establishment_id, p_batch_id, p_moment,
    p_temperature_c, p_measured_at);
$$;
revoke all on function public.record_production_temperature(uuid, uuid, uuid, text, numeric, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_production_temperature(uuid, uuid, uuid, text, numeric, timestamptz) to authenticated;

-- Proteção do histórico passa a incluir production_temperatures -------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef('private.assert_history_protected()'::regprocedure) into v_def;
  v_def := regexp_replace(v_def, '(array\[[^\]]*''production_label_downloads''[^\]]*)\]', '\1, ''production_temperatures'']', 'g');
  if v_def not like '%production_temperatures%' then
    raise exception 'Não foi possível incluir production_temperatures na proteção do histórico.' using errcode = '55000';
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
