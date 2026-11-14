-- Fase 7, fatia 7.6 — configurações da unidade (desenho da Fase 7, seção 16, decisões A e B de luis em
-- 14/11/2026; D-019, D-036, D-049 a D-054). Autorizada por luis em 14/11/2026 (16:53 UTC).
--
-- 1) establishment_settings: uma linha por unidade, criada na primeira gravação; sem linha valem os
--    padrões, que são as regras de hoje (só o proprietário registra produção, janela de 2 horas, 1 hora
--    sem etiqueta, porção de preparação com a mesma validade do lote). O sistema não sugere valores.
-- 2) set_establishment_settings: só o proprietário ativo; cada valor alterado vai para entity_changes
--    (D-036), com o anterior e o novo. Limites técnicos só para recusar o absurdo (15 min a 24 h).
-- 3) register_production lê a configuração: no modo "colaboradores" (decisão A, opção b), quem não é
--    proprietário registra a PRÓPRIA produção, com a validade; decidir ocorrência, anular, porcionar e o
--    resto continuam só do proprietário (D-019). A janela da unidade decide a produção tardia e fica
--    guardada no registro (batch_productions.late_window_minutes); mudar a janela nunca reescreve registro.
-- 4) handle_container: com a regra "igual ou menor", a porção de preparação aceita validade menor que a
--    do lote; maior continua recusada pela regra da 6.3, e congelar continua sem prorrogar (D-021, D-039).
-- 5) O tempo máximo sem etiqueta só é guardado aqui; o aviso é a fatia 7.8.
-- A manipulação de recebimento continua com a janela fixa de 2 horas. Nada aqui afirma conformidade
-- sanitária (Q10 pendente).

-- 1) Configurações --------------------------------------------------------------------------------------
create table public.establishment_settings (
  organization_id uuid not null,
  establishment_id uuid not null,
  production_registrar text not null default 'owner'
    constraint establishment_settings_registrar_check check (production_registrar in ('owner', 'member')),
  production_window_minutes integer not null default 120
    constraint establishment_settings_window_check check (production_window_minutes between 15 and 1440),
  unlabeled_limit_minutes integer not null default 60
    constraint establishment_settings_unlabeled_check check (unlabeled_limit_minutes between 15 and 1440),
  portion_expiry_rule text not null default 'equal'
    constraint establishment_settings_portion_check check (portion_expiry_rule in ('equal', 'equal_or_less')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, establishment_id),
  foreign key (organization_id, establishment_id) references public.establishments (organization_id, id)
);
create index establishment_settings_updated_by_idx on public.establishment_settings (updated_by);
alter table public.establishment_settings enable row level security;
revoke all on public.establishment_settings from public, anon, authenticated, service_role;
grant select on public.establishment_settings to authenticated, service_role;
create policy establishment_settings_read on public.establishment_settings for select to authenticated
  using (organization_id in (select private.member_organizations()));

-- Configuração em vigor: a gravada ou os padrões da tabela.
create function private.establishment_settings_of(p_organization_id uuid, p_establishment_id uuid)
returns public.establishment_settings language plpgsql stable security definer set search_path = '' as $$
declare v_row public.establishment_settings%rowtype;
begin
  select * into v_row from public.establishment_settings s
   where s.organization_id = p_organization_id and s.establishment_id = p_establishment_id;
  if not found then
    v_row.organization_id := p_organization_id;
    v_row.establishment_id := p_establishment_id;
    v_row.production_registrar := 'owner';
    v_row.production_window_minutes := 120;
    v_row.unlabeled_limit_minutes := 60;
    v_row.portion_expiry_rule := 'equal';
  end if;
  return v_row;
end;
$$;
revoke all on function private.establishment_settings_of(uuid, uuid) from public, anon, authenticated, service_role;

-- "2 horas", "1 hora e 30 minutos", "45 minutos": mensagens e tela.
create function private.duration_text(p_minutes integer)
returns text language sql immutable set search_path = '' as $$
  select concat_ws(' e ',
    case when p_minutes / 60 = 1 then '1 hora' when p_minutes / 60 > 1 then (p_minutes / 60) || ' horas' end,
    case when p_minutes % 60 = 1 then '1 minuto' when p_minutes % 60 > 1 then (p_minutes % 60) || ' minutos' end);
$$;
revoke all on function private.duration_text(integer) from public, anon, authenticated, service_role;

-- 2) Auditoria (D-036): por qualquer caminho de escrita, com o padrão como valor anterior da primeira vez.
alter table public.entity_changes drop constraint entity_changes_field_check;
alter table public.entity_changes add constraint entity_changes_field_check
  check (field in ('name', 'timezone', 'display_name', 'storage_condition',
                   'production_registrar', 'production_window_minutes', 'unlabeled_limit_minutes',
                   'portion_expiry_rule'));

create function private.log_establishment_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old public.establishment_settings%rowtype;
begin
  if tg_op = 'INSERT' then
    v_old := private.establishment_settings_of(gen_random_uuid(), gen_random_uuid());
  else
    v_old := old;
  end if;
  insert into public.entity_changes(organization_id, establishment_id, entity, entity_id, field, old_value, new_value, changed_by)
  select new.organization_id, new.establishment_id, 'establishment', new.establishment_id, c.field, c.old_value, c.new_value, auth.uid()
    from (values
      ('production_registrar', v_old.production_registrar, new.production_registrar),
      ('production_window_minutes', v_old.production_window_minutes::text, new.production_window_minutes::text),
      ('unlabeled_limit_minutes', v_old.unlabeled_limit_minutes::text, new.unlabeled_limit_minutes::text),
      ('portion_expiry_rule', v_old.portion_expiry_rule, new.portion_expiry_rule)) as c(field, old_value, new_value)
   where c.old_value is distinct from c.new_value;
  return null;
end;
$$;
revoke all on function private.log_establishment_settings() from public, anon, authenticated, service_role;
create trigger log_establishment_settings after insert or update on public.establishment_settings
  for each row execute function private.log_establishment_settings();
alter table public.establishment_settings enable always trigger log_establishment_settings;

create function private.set_establishment_settings(
  p_organization_id uuid, p_establishment_id uuid, p_production_registrar text,
  p_production_window_minutes integer, p_unlabeled_limit_minutes integer, p_portion_expiry_rule text)
returns public.establishment_settings language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_current public.establishment_settings%rowtype; v_row public.establishment_settings%rowtype;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_production_registrar is null or p_production_registrar not in ('owner', 'member')
     or p_portion_expiry_rule is null or p_portion_expiry_rule not in ('equal', 'equal_or_less')
     or p_production_window_minutes is null or p_unlabeled_limit_minutes is null then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  if p_production_window_minutes not between 15 and 1440 then
    raise exception 'A janela de registro da produção deve ficar entre 15 minutos e 24 horas, em minutos inteiros.'
      using errcode = '22023';
  end if;
  if p_unlabeled_limit_minutes not between 15 and 1440 then
    raise exception 'O tempo máximo sem etiqueta deve ficar entre 15 minutos e 24 horas, em minutos inteiros.'
      using errcode = '22023';
  end if;
  -- A unidade fica travada durante a troca (como o fuso, D-036).
  perform 1 from public.establishments e
   where e.organization_id = p_organization_id and e.id = p_establishment_id for update;
  if not found then
    raise exception 'Unidade não encontrada.' using errcode = '23503';
  end if;
  v_current := private.establishment_settings_of(p_organization_id, p_establishment_id);
  if v_current.production_registrar = p_production_registrar
     and v_current.production_window_minutes = p_production_window_minutes
     and v_current.unlabeled_limit_minutes = p_unlabeled_limit_minutes
     and v_current.portion_expiry_rule = p_portion_expiry_rule then
    return v_current;
  end if;
  insert into public.establishment_settings as s (organization_id, establishment_id, production_registrar,
    production_window_minutes, unlabeled_limit_minutes, portion_expiry_rule, updated_by, updated_at)
  values (p_organization_id, p_establishment_id, p_production_registrar, p_production_window_minutes,
    p_unlabeled_limit_minutes, p_portion_expiry_rule, v_user, now())
  on conflict (organization_id, establishment_id) do update set
    production_registrar = excluded.production_registrar,
    production_window_minutes = excluded.production_window_minutes,
    unlabeled_limit_minutes = excluded.unlabeled_limit_minutes,
    portion_expiry_rule = excluded.portion_expiry_rule,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function private.set_establishment_settings(uuid, uuid, text, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function private.set_establishment_settings(uuid, uuid, text, integer, integer, text) to authenticated;
create function public.set_establishment_settings(
  p_organization_id uuid, p_establishment_id uuid, p_production_registrar text,
  p_production_window_minutes integer, p_unlabeled_limit_minutes integer, p_portion_expiry_rule text)
returns public.establishment_settings language sql security invoker set search_path = '' as $$
  select * from private.set_establishment_settings(p_organization_id, p_establishment_id, p_production_registrar,
    p_production_window_minutes, p_unlabeled_limit_minutes, p_portion_expiry_rule);
$$;
revoke all on function public.set_establishment_settings(uuid, uuid, text, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_establishment_settings(uuid, uuid, text, integer, integer, text) to authenticated;

-- 3) Produção: a janela usada fica no registro ------------------------------------------------------------
-- ADD COLUMN com default constante não reescreve a tabela nem dispara o gatilho append-only; as produções
-- anteriores foram registradas com a janela fixa de 2 horas.
alter table public.batch_productions add column late_window_minutes integer not null default 120
  constraint batch_productions_window_check check (late_window_minutes between 15 and 1440);
alter table public.batch_productions add constraint batch_productions_late_check
  check (late = (created_at - produced_at > make_interval(mins => late_window_minutes)));

create or replace function private.register_production(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_quantity numeric,
  p_expiry_date date, p_produced_at timestamptz, p_handled_by uuid, p_note text, p_late_reason text,
  p_intent_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_note text := private.visible_text(p_note);
  v_late_reason text := private.visible_text(p_late_reason);
  v_timezone text;
  v_unit text;
  v_kind text;
  v_storage text;
  v_existing public.batch_receipts%rowtype;
  v_production public.batch_productions%rowtype;
  v_late boolean;
  v_name text;
  v_id uuid;
  v_owner boolean;
  v_settings public.establishment_settings%rowtype;
  v_window text;
begin
  -- Autorização: vínculo ativo na empresa. Quem não é proprietário só registra se a configuração da
  -- unidade permitir, e só a própria produção (verificado depois da repetição, abaixo).
  if v_user is null or not private.has_membership(p_organization_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  v_owner := private.has_membership(p_organization_id, true);

  -- Forma.
  if p_intent_id is null or p_product_id is null or p_handled_by is null
     or p_quantity is null or p_quantity::text in ('NaN', 'Infinity', '-Infinity') or p_quantity <= 0
     or p_quantity > 1000000000 or p_quantity <> trunc(p_quantity, 3)
     or p_expiry_date is null or p_expiry_date not between date '0001-01-01' and date '9999-12-31'
     or p_produced_at is null or not isfinite(p_produced_at)
     or (p_note is not null and v_note is null) or length(v_note) > 300
     or (p_late_reason is not null and v_late_reason is null) or length(v_late_reason) > 300 then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;

  -- I-11: a unidade é travada; o fuso dela vale para a data de produção e a validade.
  select e.timezone into v_timezone from public.establishments e
   where e.organization_id = p_organization_id and e.id = p_establishment_id for share;
  if not found then
    raise exception 'Preparação inválida para o estabelecimento.' using errcode = '23503';
  end if;
  select p.unit, p.kind, p.storage_condition into v_unit, v_kind, v_storage from public.products p
   where p.organization_id = p_organization_id and p.establishment_id = p_establishment_id and p.id = p_product_id
   for share;
  if not found then
    raise exception 'Preparação inválida para o estabelecimento.' using errcode = '23503';
  end if;
  if v_unit = 'un' and p_quantity <> trunc(p_quantity) then
    raise exception 'Quantidade inválida.' using errcode = '22023';
  end if;

  -- Replay: compara tudo o que foi pedido, exceto o nome copiado (I-4). Antes das regras de estado.
  select * into v_existing from public.batch_receipts b
   where b.organization_id = p_organization_id and b.establishment_id = p_establishment_id and b.intent_id = p_intent_id;
  if found then
    select * into v_production from public.batch_productions p where p.batch_id = v_existing.id;
    if v_existing.origin <> 'produced' or v_existing.created_by is distinct from v_user
       or v_existing.product_id is distinct from p_product_id or v_existing.quantity is distinct from p_quantity
       or v_existing.expiry_date is distinct from p_expiry_date
       or v_production.produced_at is distinct from p_produced_at
       or v_production.handled_by is distinct from p_handled_by
       or v_production.note is distinct from v_note
       or (select o.reason from public.occurrences o where o.batch_id = v_existing.id and o.kind = 'late_production')
          is distinct from v_late_reason then
      raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  -- Fatia 7.6: configuração da unidade (padrão = só o proprietário, janela de 2 horas).
  v_settings := private.establishment_settings_of(p_organization_id, p_establishment_id);
  -- No padrão, a recusa ao colaborador é a mesma da 7.1.
  if not v_owner and v_settings.production_registrar <> 'member' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if not v_owner and p_handled_by <> v_user then
    raise exception 'Quem não é proprietário registra só a própria produção.' using errcode = '42501';
  end if;
  v_window := private.duration_text(v_settings.production_window_minutes);

  -- I-3: identificador de outra operação não vira produção.
  if (select count(*) from public.find_operation(p_organization_id, p_establishment_id, p_intent_id)) > 0 then
    raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
  end if;

  -- Item do catálogo.
  if v_kind <> 'preparation' then
    raise exception 'Só item do catálogo marcado como preparação pode ser produzido.' using errcode = '22023';
  end if;
  if v_storage is null then
    raise exception 'Defina a conservação da preparação antes de registrar a produção.' using errcode = '22023';
  end if;

  -- Horário (D-031): não futuro; acima da janela da unidade (padrão 2 horas) só com justificativa, que
  -- abre ocorrência e bloqueia o lote até a decisão do proprietário.
  if p_produced_at > now() then
    raise exception 'O horário da produção não pode estar no futuro.' using errcode = '22023';
  end if;
  v_late := now() - p_produced_at > make_interval(mins => v_settings.production_window_minutes);
  if v_late and v_late_reason is null then
    raise exception 'Produção registrada mais de % depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
      v_window using errcode = '22023';
  end if;
  if not v_late and v_late_reason is not null then
    raise exception 'Justificativa de atraso só vale para produção registrada mais de % depois de feita.',
      v_window using errcode = '22023';
  end if;

  -- Validade informada pela pessoa (D-004): só se recusa o impossível, nada é calculado.
  if p_expiry_date < (p_produced_at at time zone v_timezone)::date then
    raise exception 'A validade não pode ser anterior à data da produção.' using errcode = '22023';
  end if;
  if p_expiry_date < (now() at time zone v_timezone)::date then
    raise exception 'A validade não pode ser anterior à data do registro.' using errcode = '22023';
  end if;

  -- Quem produziu: vínculo ativo na mesma empresa e nome de exibição definido.
  select m.display_name into v_name from public.memberships m
   where m.organization_id = p_organization_id and m.user_id = p_handled_by and m.revoked_at is null;
  if not found then
    raise exception 'A pessoa que produziu precisa ter vínculo ativo com a empresa.' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Defina o nome de exibição da pessoa que produziu antes de registrar.' using errcode = '22023';
  end if;

  -- Lote, integral (gatilho da 6.1), registro de produção e ocorrência, na mesma transação.
  insert into public.batch_receipts (organization_id, establishment_id, product_id, supplier_id, source_code,
    quantity, unit, expiry_date, expiry_origin, original_expiry_date, storage_condition, temperature_status,
    received_temperature_c, origin, intent_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, p_product_id, null, null, p_quantity, v_unit, p_expiry_date,
    'responsible', null, v_storage, 'not_required', null, 'produced', p_intent_id, v_timezone, v_user)
  returning id into v_id;
  insert into public.batch_productions (organization_id, establishment_id, batch_id, produced_at, late,
    late_window_minutes, handled_by, handled_by_name, note, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_id, p_produced_at, v_late,
    v_settings.production_window_minutes, p_handled_by, v_name, v_note, v_timezone, v_user);
  if v_late then
    insert into public.occurrences (organization_id, establishment_id, batch_id, kind, reason, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_id, 'late_production', v_late_reason, v_timezone, v_user);
  end if;
  return v_id;
end;
$$;

-- 4) Regra da validade da porção de preparação ------------------------------------------------------------
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('private.handle_container(uuid, uuid, uuid, text, numeric[], date, text, timestamptz, uuid, text, text, text, text, uuid)'::regprocedure)
    into v_def;
  v_new := replace(v_def,
    'if v_batch.origin = ''produced'' and p_kind = ''portioning'' and p_expiry_date <> v_source.expiry_date then',
    'if v_batch.origin = ''produced'' and p_kind = ''portioning'' and p_expiry_date <> v_source.expiry_date
     and (private.establishment_settings_of(p_organization_id, p_establishment_id)).portion_expiry_rule = ''equal'' then');
  if v_new = v_def then
    raise exception 'Não foi possível ligar a regra da validade da porção à configuração da unidade.' using errcode = '55000';
  end if;
  execute v_new;
end;
$$;

do $$
begin
  perform private.assert_history_protected();
end;
$$;
