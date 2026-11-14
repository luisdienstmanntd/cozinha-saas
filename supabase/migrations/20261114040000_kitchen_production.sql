-- Fase 7, fatia 7.1 — preparação própria no banco (D-049, desenho em docs/FASE_07_DESENHO.md).
--
-- O lote de preparação é um batch_receipts de origem 'produced', com recipiente integral criado pelo
-- mesmo gatilho do recebimento. Saldo, consumo, descarte, porcionamento, ocorrências, vencido (6.11),
-- locais e find_operation continuam sendo os mesmos. Nada calcula nem sugere validade (D-004).
--   * products.kind: 'product' (recebido) ou 'preparation' (produzido); definido na criação.
--   * batch_receipts.origin: 'received' (todo dado existente) ou 'produced'; sem fornecedor, lote do
--     fabricante, validade do fabricante ou temperatura de recebimento na produção.
--   * batch_productions (append-only): produzido em, por quem (nome curto copiado), observação.
--   * register_production: só o proprietário (D-019), idempotente pelo intent_id; janela de 2 horas
--     com ocorrência 'late_production' acima dela (D-031, D-041).
--   * "abrir" não vale para preparação (ponto 3 aceito em 14/11/2026); porcionar sim.

-- 1) Catálogo: tipo do item -----------------------------------------------------------------------------
alter table public.products add column kind text not null default 'product'
  constraint products_kind_check check (kind in ('product', 'preparation'));
-- O cliente escolhe o tipo só ao criar (sem UPDATE para authenticated, teste do pgTAP de segurança).
grant insert (kind) on public.products to authenticated;

-- 2) Lote: origem ---------------------------------------------------------------------------------------
-- ADD COLUMN com default constante não reescreve a tabela nem dispara o gatilho append-only.
alter table public.batch_receipts add column origin text not null default 'received'
  constraint batch_receipts_origin_check check (origin in ('received', 'produced'));
alter table public.batch_receipts alter column supplier_id drop not null, alter column source_code drop not null;
alter table public.batch_receipts add constraint batch_receipts_origin_shape_check check (
  (origin = 'received' and supplier_id is not null and source_code is not null) or
  (origin = 'produced' and supplier_id is null and source_code is null
     and expiry_origin = 'responsible' and original_expiry_date is null));
-- Temperatura: o recebimento segue a regra da 6.5a; a produção não tem conferência de recebimento.
alter table public.batch_receipts drop constraint batch_receipts_temperature_check;
alter table public.batch_receipts add constraint batch_receipts_temperature_check check (
  (origin = 'received' and (
    (storage_condition is null and temperature_status is null and received_temperature_c is null) or
    (storage_condition is not null and temperature_status is not null
      and ((storage_condition = 'ambient' and temperature_status in ('measured', 'not_required')) or
           (storage_condition in ('refrigerated', 'frozen') and temperature_status in ('measured', 'not_measured')))
      and ((temperature_status = 'measured') = (received_temperature_c is not null))))) or
  (origin = 'produced' and storage_condition is not null and temperature_status = 'not_required'
     and received_temperature_c is null));

-- Recebimento só de produto; produção só de preparação (vale também para inserção de teste).
create function private.check_batch_product_kind()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text;
begin
  select p.kind into v_kind from public.products p
   where p.organization_id = new.organization_id and p.establishment_id = new.establishment_id
     and p.id = new.product_id;
  if not found then
    return new; -- a FK recusa com 23503
  end if;
  if new.origin = 'received' and v_kind <> 'product' then
    raise exception 'Preparação própria não é recebida: registre a produção.' using errcode = '22023';
  end if;
  if new.origin = 'produced' and v_kind <> 'preparation' then
    raise exception 'Só item do catálogo marcado como preparação pode ser produzido.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.check_batch_product_kind() from public, anon, authenticated, service_role;
create trigger batch_receipts_product_kind before insert on public.batch_receipts
  for each row execute function private.check_batch_product_kind();
alter table public.batch_receipts enable always trigger batch_receipts_product_kind;

-- 3) Produção (append-only) -----------------------------------------------------------------------------
create table public.batch_productions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null unique,
  produced_at timestamptz not null check (isfinite(produced_at)),
  late boolean not null,
  handled_by uuid not null,
  handled_by_name text not null check (
    length(handled_by_name) between 1 and 40
    and handled_by_name = btrim(handled_by_name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  note text check (
    note is null or (length(note) between 1 and 300
    and note = btrim(note, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))),
  timezone text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint batch_productions_batch_fk foreign key (organization_id, establishment_id, batch_id)
    references public.batch_receipts (organization_id, establishment_id, id),
  constraint batch_productions_handled_by_fk foreign key (organization_id, handled_by)
    references public.memberships (organization_id, user_id),
  constraint batch_productions_produced_before_created_check check (produced_at <= created_at)
);
create index batch_productions_scope_idx on public.batch_productions (organization_id, establishment_id, produced_at desc);
create index batch_productions_handled_by_idx on public.batch_productions (organization_id, handled_by);
create index batch_productions_created_by_idx on public.batch_productions (created_by);
alter table public.batch_productions enable row level security;
revoke all on public.batch_productions from public, anon, authenticated, service_role;
grant select on public.batch_productions to authenticated, service_role;
create policy batch_productions_read on public.batch_productions for select to authenticated
  using (organization_id in (select private.member_organizations()));
create trigger batch_productions_append_only before update or delete or truncate on public.batch_productions
  for each statement execute function private.reject_history_change();
alter table public.batch_productions enable always trigger batch_productions_append_only;

-- Produção só para lote produzido, com o fuso e o autor do lote.
create function private.check_production_batch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.batch_receipts b
                  where b.organization_id = new.organization_id and b.establishment_id = new.establishment_id
                    and b.id = new.batch_id and b.origin = 'produced'
                    and b.timezone = new.timezone and b.created_by = new.created_by) then
    raise exception 'Registro de produção só existe para lote produzido.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_production_batch() from public, anon, authenticated, service_role;
create trigger batch_productions_check_batch before insert on public.batch_productions
  for each row execute function private.check_production_batch();
alter table public.batch_productions enable always trigger batch_productions_check_batch;

-- 4) Ocorrência de produção registrada fora da janela --------------------------------------------------
alter table public.occurrences drop constraint occurrences_kind_check;
alter table public.occurrences add constraint occurrences_kind_check
  check (kind in ('temperature_not_measured', 'late_handling', 'late_production'));
create unique index occurrences_one_late_production_idx on public.occurrences (batch_id) where kind = 'late_production';

create or replace function private.check_occurrence_cause()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'temperature_not_measured' and new.handling_id is null and not exists (
       select 1 from public.batch_receipts b where b.id = new.batch_id and b.temperature_status = 'not_measured') then
    raise exception 'Ocorrência de temperatura só existe para recebimento sem medição.' using errcode = '23514';
  end if;
  if new.kind = 'late_handling' and new.handling_id is not null and not exists (
       select 1 from public.container_handlings h where h.id = new.handling_id and h.late) then
    raise exception 'Ocorrência de registro tardio só existe para manipulação tardia.' using errcode = '23514';
  end if;
  if new.kind = 'late_production' and not exists (
       select 1 from public.batch_productions p where p.batch_id = new.batch_id and p.late) then
    raise exception 'Ocorrência de produção tardia só existe para produção registrada fora da janela.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- A ocorrência de produção alcança todos os recipientes do lote, como a de temperatura. As duas
-- funções de leitura trocam só a condição de ligação (verificado abaixo).
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.container_blocks(uuid, uuid, uuid)'::regprocedure) into v_def;
  v_new := replace(v_def, 'o.kind = ''temperature_not_measured'' or (o.kind = ''late_handling''',
                          'o.kind in (''temperature_not_measured'', ''late_production'') or (o.kind = ''late_handling''');
  if v_new = v_def then
    raise exception 'Não foi possível incluir late_production em container_blocks.' using errcode = '55000';
  end if;
  execute v_new;
  select pg_get_functiondef('public.list_occurrences(uuid, uuid, text, integer)'::regprocedure) into v_def;
  v_new := replace(v_def, 'o.kind = ''temperature_not_measured'' or c.handling_id = o.handling_id',
                          'o.kind in (''temperature_not_measured'', ''late_production'') or c.handling_id = o.handling_id');
  if v_new = v_def then
    raise exception 'Não foi possível incluir late_production em list_occurrences.' using errcode = '55000';
  end if;
  execute v_new;
end;
$$;

create or replace function private.occurrence_problems()
returns table (batch_id uuid, problem text) language sql stable set search_path = '' as $$
  select b.id, 'recebimento sem medição sem exatamente uma ocorrência'
    from public.batch_receipts b
   where b.temperature_status = 'not_measured'
     and (select count(*) from public.occurrences o where o.batch_id = b.id and o.kind = 'temperature_not_measured') <> 1
  union all
  select o.batch_id, 'ocorrência de temperatura em recebimento com medição ou sem exigência: ' || o.id
    from public.occurrences o join public.batch_receipts b on b.id = o.batch_id
   where o.kind = 'temperature_not_measured' and b.temperature_status is distinct from 'not_measured'
  union all
  select h.batch_id, 'manipulação tardia sem exatamente uma ocorrência: ' || h.id
    from public.container_handlings h
   where h.late and (select count(*) from public.occurrences o where o.handling_id = h.id and o.kind = 'late_handling') <> 1
  union all
  select o.batch_id, 'ocorrência de registro tardio em manipulação dentro da janela: ' || o.id
    from public.occurrences o join public.container_handlings h on h.id = o.handling_id
   where o.kind = 'late_handling' and not h.late
  union all
  select c.batch_id, 'conservação do integral difere do recebimento: ' || c.id
    from public.containers c join public.batch_receipts b on b.id = c.batch_id
   where c.kind = 'integral' and c.storage is distinct from b.storage_condition
  union all
  -- 7.1: produção tardia com exatamente uma ocorrência; dentro da janela, nenhuma.
  select p.batch_id, 'produção tardia sem exatamente uma ocorrência'
    from public.batch_productions p
   where p.late and (select count(*) from public.occurrences o where o.batch_id = p.batch_id and o.kind = 'late_production') <> 1
  union all
  select o.batch_id, 'ocorrência de produção tardia em produção dentro da janela: ' || o.id
    from public.occurrences o left join public.batch_productions p on p.batch_id = o.batch_id
   where o.kind = 'late_production' and not coalesce(p.late, false);
$$;
revoke all on function private.occurrence_problems() from public, anon, authenticated, service_role;

-- Coerência lote produzido x registro de produção (pgTAP). Vazio = tudo certo.
create function private.production_problems()
returns table (batch_id uuid, problem text) language sql stable set search_path = '' as $$
  select b.id, 'lote produzido sem registro de produção'
    from public.batch_receipts b
   where b.origin = 'produced' and not exists (select 1 from public.batch_productions p where p.batch_id = b.id)
  union all
  select p.batch_id, 'registro de produção em lote que não é produzido'
    from public.batch_productions p join public.batch_receipts b on b.id = p.batch_id
   where b.origin <> 'produced'
  union all
  select b.id, 'lote de origem diferente do tipo do item do catálogo'
    from public.batch_receipts b join public.products pr on pr.id = b.product_id
   where (b.origin = 'received') <> (pr.kind = 'product');
$$;
revoke all on function private.production_problems() from public, anon, authenticated, service_role;

-- 5) "Abrir" não vale para preparação -------------------------------------------------------------------
create function private.check_handling_origin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'opening' and exists (select 1 from public.batch_receipts b
                                       where b.id = new.batch_id and b.origin = 'produced') then
    raise exception 'Preparação própria não é aberta: use o porcionamento.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.check_handling_origin() from public, anon, authenticated, service_role;
create trigger container_handlings_origin before insert on public.container_handlings
  for each row execute function private.check_handling_origin();
alter table public.container_handlings enable always trigger container_handlings_origin;

-- 6) Registrar produção ---------------------------------------------------------------------------------
create function private.register_production(
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
begin
  -- Autorização: proprietário ativo (D-019).
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

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

  -- Horário (D-031): não futuro; mais de 2 horas antes do registro só com justificativa, que abre
  -- ocorrência e bloqueia o lote até a decisão do proprietário.
  if p_produced_at > now() then
    raise exception 'O horário da produção não pode estar no futuro.' using errcode = '22023';
  end if;
  v_late := now() - p_produced_at > private.handling_late_window();
  if v_late and v_late_reason is null then
    raise exception 'Produção registrada mais de 2 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.'
      using errcode = '22023';
  end if;
  if not v_late and v_late_reason is not null then
    raise exception 'Justificativa de atraso só vale para produção registrada mais de 2 horas depois de feita.'
      using errcode = '22023';
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
    handled_by, handled_by_name, note, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_id, p_produced_at, v_late, p_handled_by, v_name, v_note,
    v_timezone, v_user);
  if v_late then
    insert into public.occurrences (organization_id, establishment_id, batch_id, kind, reason, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_id, 'late_production', v_late_reason, v_timezone, v_user);
  end if;
  return v_id;
end;
$$;
revoke all on function private.register_production(uuid, uuid, uuid, numeric, date, timestamptz, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.register_production(uuid, uuid, uuid, numeric, date, timestamptz, uuid, text, text, uuid)
  to authenticated;
create function public.register_production(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_quantity numeric,
  p_expiry_date date, p_produced_at timestamptz, p_handled_by uuid, p_note text, p_late_reason text,
  p_intent_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.register_production(p_organization_id, p_establishment_id, p_product_id, p_quantity,
    p_expiry_date, p_produced_at, p_handled_by, p_note, p_late_reason, p_intent_id);
$$;
revoke all on function public.register_production(uuid, uuid, uuid, numeric, date, timestamptz, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.register_production(uuid, uuid, uuid, numeric, date, timestamptz, uuid, text, text, uuid)
  to authenticated;

-- 7) Recuperação de tentativa (D-045): a produção aparece como 'production' -------------------------------
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.find_operation(uuid, uuid, uuid)'::regprocedure) into v_def;
  v_new := replace(v_def, 'select ''receipt'', r.id, r.created_at, 2',
    'select case r.origin when ''produced'' then ''production'' else ''receipt'' end, r.id, r.created_at, 2');
  if v_new = v_def then
    raise exception 'Não foi possível incluir a produção em find_operation.' using errcode = '55000';
  end if;
  execute v_new;
end;
$$;

-- 8) Proteção do histórico passa a incluir batch_productions -----------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef('private.assert_history_protected()'::regprocedure) into v_def;
  v_def := regexp_replace(v_def, '(array\[[^\]]*''location_moves''[^\]]*)\]', '\1, ''batch_productions'']', 'g');
  if v_def not like '%batch_productions%' then
    raise exception 'Não foi possível incluir batch_productions na proteção do histórico.' using errcode = '55000';
  end if;
  execute v_def;
end;
$$;
revoke all on function private.assert_history_protected() from public, anon, authenticated, service_role;

do $$
begin
  perform private.assert_history_protected();
  if exists (select 1 from private.production_problems()) or exists (select 1 from private.occurrence_problems()) then
    raise exception 'Coerência de produção ou ocorrências quebrada pela migração.' using errcode = '55000';
  end if;
end;
$$;
