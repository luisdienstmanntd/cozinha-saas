-- Fase 6, fatia 6.5a: conservação, temperatura e ocorrências no banco (FASE_06_DESENHO.md 3, 4.8, 5,
-- 5.1, 5.2, 5.4, 6 e seção 10; revisão cruzada B-2, I-3, I-4, I-6, S-2). Sem tela nova: recebimento com
-- temperatura, página de decisão e faixa "Bloqueado" são da 6.5b.
--
-- O que entra:
--   * produtos.storage_condition: conservação exigida, definida uma única vez pelo proprietário por
--     função auditada (entity_changes), que bloqueia a linha do produto;
--   * batch_receipts.storage_condition, temperature_status e received_temperature_c: obrigatórios nos
--     recebimentos pela assinatura nova de receive_batch. Refrigerado ou congelado exige temperatura
--     medida ou "não foi possível medir" com justificativa (Q8, D-029). A temperatura é só registrada;
--     o sistema não a classifica;
--   * occurrences: 'temperature_not_measured' (recebimento sem medição) e 'late_handling' (manipulação
--     registrada mais de 2 horas depois de feita, B-2/D-031), criadas na mesma transação da operação;
--   * occurrence_decisions: liberação ou rejeição pelo proprietário, com justificativa, uma por
--     ocorrência, sem troca. decide_occurrence bloqueia a linha do recebimento (I-6);
--   * bloqueio: recipiente com ocorrência aberta ou rejeitada não é consumido nem manipulado; descarte
--     continua permitido (D-029). Anular um descarte devolve saldo a um recipiente que continua
--     bloqueado (S-2). Ocorrência tardia aberta não impede anular a manipulação (4.10);
--   * handle_container aceita manipulação fora da janela somente com justificativa de atraso, gravando
--     late = true e a ocorrência.
--
-- Compatibilidade até a 6.5b: a assinatura antiga de receive_batch (a da tela atual) continua existindo.
-- Para produto sem conservação definida ela grava as colunas novas nulas, como os recebimentos
-- anteriores; para produto em ambiente grava 'ambient'/'not_required'; para produto refrigerado ou
-- congelado ela RECUSA, porque não tem como receber a temperatura. A 6.5b migra a tela e retira a
-- assinatura antiga.
--
-- Nenhum dado existente muda: colunas novas anuláveis, sem backfill, nenhum gatilho de proteção é
-- suspenso. A liberação nunca acontece sozinha nem por prazo. Nada aqui afirma conformidade sanitária;
-- a decisão segue o procedimento da cozinha, ainda sem conferência por nutricionista RT (Q10).

-- 1) Conservação exigida pelo produto -------------------------------------------------------------
alter table public.products add column storage_condition text
  check (storage_condition in ('ambient', 'refrigerated', 'frozen'));

-- Definição única: depois de definida, não muda por nenhum caminho (nem pelo service_role).
create function private.lock_product_storage_condition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.storage_condition is not null and new.storage_condition is distinct from old.storage_condition then
    raise exception 'A conservação do produto já foi definida e não pode ser trocada.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_product_storage_condition() from public, anon, authenticated, service_role;
create trigger products_lock_storage_condition before update of storage_condition on public.products
  for each row execute function private.lock_product_storage_condition();
alter table public.products enable always trigger products_lock_storage_condition;

-- Auditoria em entity_changes (6.0c), por qualquer caminho de escrita.
alter table public.entity_changes drop constraint entity_changes_entity_check;
alter table public.entity_changes add constraint entity_changes_entity_check
  check (entity in ('organization', 'establishment', 'membership', 'product'));
alter table public.entity_changes drop constraint entity_changes_field_check;
alter table public.entity_changes add constraint entity_changes_field_check
  check (field in ('name', 'timezone', 'display_name', 'storage_condition'));

create function private.log_product_storage_condition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.storage_condition is distinct from old.storage_condition then
    insert into public.entity_changes(organization_id, establishment_id, entity, entity_id, field, old_value, new_value, changed_by)
    values (new.organization_id, new.establishment_id, 'product', new.id, 'storage_condition',
      old.storage_condition, new.storage_condition, auth.uid());
  end if;
  return null;
end;
$$;
revoke all on function private.log_product_storage_condition() from public, anon, authenticated, service_role;
create trigger log_product_storage_condition after update of storage_condition on public.products
  for each row execute function private.log_product_storage_condition();

-- Só o proprietário ativo define, uma vez, com o produto bloqueado. Repetir o mesmo valor devolve o
-- valor (idempotente); outro valor é recusado.
create function private.set_product_storage_condition(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_storage_condition text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_current text;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_product_id is null or p_storage_condition is null or p_storage_condition not in ('ambient', 'refrigerated', 'frozen') then
    raise exception 'Conservação inválida.' using errcode = '22023';
  end if;
  select p.storage_condition into v_current from public.products p
   where p.organization_id = p_organization_id and p.establishment_id = p_establishment_id and p.id = p_product_id
   for update;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = '23503';
  end if;
  if v_current is null then
    update public.products set storage_condition = p_storage_condition where id = p_product_id;
  elsif v_current <> p_storage_condition then
    raise exception 'A conservação do produto já foi definida e não pode ser trocada.' using errcode = '22023';
  end if;
  return p_storage_condition;
end;
$$;
revoke all on function private.set_product_storage_condition(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.set_product_storage_condition(uuid, uuid, uuid, text) to authenticated;
create function public.set_product_storage_condition(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_storage_condition text)
returns text language sql security invoker set search_path = '' as $$
  select private.set_product_storage_condition(p_organization_id, p_establishment_id, p_product_id, p_storage_condition);
$$;
revoke all on function public.set_product_storage_condition(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_product_storage_condition(uuid, uuid, uuid, text) to authenticated;

-- 2) Conservação e temperatura no recebimento (4.8) ------------------------------------------------
-- Nulas nos recebimentos anteriores (e nos da assinatura antiga para produto sem conservação).
alter table public.batch_receipts
  add column storage_condition text check (storage_condition in ('ambient', 'refrigerated', 'frozen')),
  add column temperature_status text check (temperature_status in ('measured', 'not_measured', 'not_required')),
  add column received_temperature_c numeric(4,1) check (received_temperature_c between -50 and 80);
alter table public.batch_receipts add constraint batch_receipts_temperature_check check (
  (storage_condition is null and temperature_status is null and received_temperature_c is null) or
  (storage_condition is not null and temperature_status is not null
    -- Ambiente: medida ou não exigida. Refrigerado e congelado: medida ou "não foi possível medir".
    and ((storage_condition = 'ambient' and temperature_status in ('measured', 'not_required')) or
         (storage_condition in ('refrigerated', 'frozen') and temperature_status in ('measured', 'not_measured')))
    and ((temperature_status = 'measured') = (received_temperature_c is not null))));

-- O integral copia a conservação do recebimento (6.1 deixou a coluna nula até aqui).
create or replace function private.prepare_container()
returns trigger language plpgsql set search_path = '' as $$
declare v_batch public.batch_receipts%rowtype;
begin
  if new.short_code is not null then
    raise exception 'O código curto é gerado pelo banco.' using errcode = '23514';
  end if;
  new.kind := coalesce(new.kind, 'integral');
  select * into v_batch from public.batch_receipts b
   where b.organization_id = new.organization_id and b.establishment_id = new.establishment_id and b.id = new.batch_id;
  if found then
    new.timezone := coalesce(new.timezone, v_batch.timezone);
    if new.kind = 'integral' then
      new.initial_quantity := coalesce(new.initial_quantity, v_batch.quantity);
      new.expiry_date := coalesce(new.expiry_date, v_batch.expiry_date);
      new.expiry_origin := coalesce(new.expiry_origin, 'receipt');
      new.storage := coalesce(new.storage, v_batch.storage_condition);
      if new.initial_quantity <> v_batch.quantity or new.expiry_date <> v_batch.expiry_date
         or new.timezone <> v_batch.timezone then
        raise exception 'O recipiente integral precisa ter a quantidade, a validade e o fuso do recebimento.'
          using errcode = '23514';
      end if;
      if new.storage is distinct from v_batch.storage_condition then
        raise exception 'O recipiente integral precisa ter a conservação do recebimento.' using errcode = '23514';
      end if;
    else
      new.expiry_origin := coalesce(new.expiry_origin, 'handling');
      if new.timezone <> v_batch.timezone then
        raise exception 'O recipiente precisa ter o fuso do recebimento.' using errcode = '23514';
      end if;
    end if;
  end if; -- recebimento inexistente: a FK recusa com 23503
  new.short_code := private.format_container_short_code(nextval('private.container_short_code_seq'));
  return new;
end;
$$;

create or replace function private.create_integral_container()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.containers (organization_id, establishment_id, batch_id, storage, created_by, created_at)
  values (new.organization_id, new.establishment_id, new.id, new.storage_condition, new.created_by, new.created_at);
  return null;
end;
$$;

-- 3) Manipulação tardia (B-2, D-031) ----------------------------------------------------------------
-- "late" deixa de ser sempre falso. Marcada como tardia só se registrada mais de 2 horas depois de feita
-- (mesma função de janela de handle_container); a ocorrência é conferida por occurrence_problems().
-- A recíproca (fora da janela => late) é garantida pela função, não pelo CHECK: as fixtures de teste
-- inserem manipulações antigas diretamente com created_at = now().
alter table public.container_handlings drop constraint container_handlings_late_check;
alter table public.container_handlings add constraint container_handlings_late_check
  check (not late or created_at - handled_at > private.handling_late_window());

-- 4) Ocorrências e decisões (4.8) ------------------------------------------------------------------
create table public.occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null,
  kind text not null check (kind in ('temperature_not_measured', 'late_handling')),
  handling_id uuid,
  reason text not null check (
    length(reason) between 1 and 300
    and reason = btrim(reason, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  timezone text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint occurrences_scope_batch_id_key unique (organization_id, establishment_id, batch_id, id),
  constraint occurrences_batch_fk foreign key (organization_id, establishment_id, batch_id)
    references public.batch_receipts (organization_id, establishment_id, id),
  -- Manipulação do mesmo recebimento (e portanto do mesmo escopo).
  constraint occurrences_handling_fk foreign key (organization_id, establishment_id, batch_id, handling_id)
    references public.container_handlings (organization_id, establishment_id, batch_id, id),
  constraint occurrences_kind_handling_check check ((kind = 'late_handling') = (handling_id is not null))
);
-- Uma ocorrência por recebimento sem medição e uma por manipulação tardia.
create unique index occurrences_one_temperature_idx on public.occurrences (batch_id) where kind = 'temperature_not_measured';
create unique index occurrences_one_late_idx on public.occurrences (handling_id) where kind = 'late_handling';
create index occurrences_handling_idx on public.occurrences (organization_id, establishment_id, batch_id, handling_id) where handling_id is not null;
create index occurrences_created_by_idx on public.occurrences (created_by);
alter table public.occurrences enable row level security;
revoke all on public.occurrences from public, anon, authenticated, service_role;
grant select on public.occurrences to authenticated, service_role;
create policy occurrences_read on public.occurrences for select to authenticated
  using (organization_id in (select private.member_organizations()));
create trigger occurrences_append_only before update or delete or truncate on public.occurrences
  for each statement execute function private.reject_history_change();
alter table public.occurrences enable always trigger occurrences_append_only;

-- A ocorrência corresponde à situação que a causou (por qualquer caminho de inserção). Gatilhos BEFORE
-- rodam antes dos CHECK: com dados nulos ou incoerentes de forma, quem recusa é a restrição (23514).
create function private.check_occurrence_cause()
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
  return new;
end;
$$;
revoke all on function private.check_occurrence_cause() from public, anon, authenticated, service_role;
create trigger occurrences_check_cause before insert on public.occurrences
  for each row execute function private.check_occurrence_cause();
alter table public.occurrences enable always trigger occurrences_check_cause;

-- E o contrário (recebimento sem medição e manipulação tardia sempre com a ocorrência) é garantido pelas
-- funções, que gravam as duas linhas na mesma transação, e conferido por private.occurrence_problems()
-- no fim desta migração e no pgTAP, como a soma por manipulação (4.3). Um gatilho adiado até o commit
-- foi testado e descartado: deixa eventos pendentes que mudam o erro de TRUNCATE dos testes de proteção.

create table public.occurrence_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null,
  occurrence_id uuid not null,
  decision text not null check (decision in ('released', 'rejected')),
  reason text not null check (
    length(reason) between 1 and 500
    and reason = btrim(reason, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  intent_id uuid not null,
  timezone text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- Uma decisão por ocorrência; não há troca (o banco recusa, não só a função).
  constraint occurrence_decisions_occurrence_key unique (occurrence_id),
  constraint occurrence_decisions_intent_key unique (organization_id, establishment_id, intent_id),
  constraint occurrence_decisions_occurrence_fk foreign key (organization_id, establishment_id, batch_id, occurrence_id)
    references public.occurrences (organization_id, establishment_id, batch_id, id)
);
create index occurrence_decisions_created_by_idx on public.occurrence_decisions (created_by);
create index occurrence_decisions_scope_idx on public.occurrence_decisions (organization_id, establishment_id, batch_id);
alter table public.occurrence_decisions enable row level security;
revoke all on public.occurrence_decisions from public, anon, authenticated, service_role;
grant select on public.occurrence_decisions to authenticated, service_role;
create policy occurrence_decisions_read on public.occurrence_decisions for select to authenticated
  using (organization_id in (select private.member_organizations()));
create trigger occurrence_decisions_append_only before update or delete or truncate on public.occurrence_decisions
  for each statement execute function private.reject_history_change();
alter table public.occurrence_decisions enable always trigger occurrence_decisions_append_only;

-- 5) Bloqueio de uso (4.8) ----------------------------------------------------------------------------
-- Um recipiente está bloqueado quando o recebimento dele tem ocorrência sem decisão ou rejeitada, ou
-- quando a manipulação que o criou tem ocorrência sem decisão ou rejeitada. Uma única definição:
-- SECURITY INVOKER, então pela API a RLS filtra (nada de outra empresa) e dentro das funções de escrita
-- (dono das tabelas) vê tudo. Vazio = livre.
create function public.container_blocks(p_organization_id uuid, p_establishment_id uuid, p_container_id uuid)
returns table (occurrence_id uuid, kind text, status text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select o.id, o.kind, case when d.id is null then 'pending' else 'rejected' end, o.created_at
    from public.containers c
    join public.occurrences o on o.organization_id = c.organization_id and o.establishment_id = c.establishment_id
     and o.batch_id = c.batch_id
     and (o.kind = 'temperature_not_measured' or (o.kind = 'late_handling' and o.handling_id = c.handling_id))
    left join public.occurrence_decisions d on d.occurrence_id = o.id
   where c.organization_id = p_organization_id and c.establishment_id = p_establishment_id and c.id = p_container_id
     and (d.id is null or d.decision = 'rejected')
   order by o.created_at, o.id;
$$;
revoke all on function public.container_blocks(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.container_blocks(uuid, uuid, uuid) to authenticated;

create function private.raise_if_blocked(p_organization_id uuid, p_establishment_id uuid, p_container_id uuid)
returns void language plpgsql stable set search_path = '' as $$
declare v_status text;
begin
  select b.status into v_status from public.container_blocks(p_organization_id, p_establishment_id, p_container_id) b
   order by b.status = 'rejected' desc limit 1;
  if v_status = 'rejected' then
    raise exception 'Recipiente bloqueado: ocorrência rejeitada pelo proprietário. Só o descarte é permitido.' using errcode = '22023';
  elsif v_status = 'pending' then
    raise exception 'Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.raise_if_blocked(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- Identificador de decisão de ocorrência já usado (I-3). Usado pelas outras funções de escrita.
create function private.decision_intent_used(p_organization_id uuid, p_establishment_id uuid, p_intent_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.occurrence_decisions d
                  where d.organization_id = p_organization_id and d.establishment_id = p_establishment_id and d.intent_id = p_intent_id);
$$;
revoke all on function private.decision_intent_used(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- 6) receive_batch com conservação e temperatura ------------------------------------------------------
-- Núcleo comum às duas assinaturas. Ordem: autorização → forma → unidade (FOR SHARE, 6.0c) → produto
-- (FOR SHARE: serializa com a definição da conservação, I-6) e fornecedor → gravação com replay.
create function private.receive_batch_core(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_legacy boolean, p_storage_condition text, p_temperature_status text,
  p_received_temperature_c numeric, p_temperature_reason text, p_intent_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_unit text; v_timezone text; v_id uuid; v_existing public.batch_receipts%rowtype;
  v_product_storage text; v_storage text := p_storage_condition; v_status text := p_temperature_status;
  v_reason text := private.visible_text(p_temperature_reason);
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_intent_id is null or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000
      or p_quantity <> trunc(p_quantity, 3) then
    raise exception 'Quantidade ou identificação inválida.' using errcode='22023';
  end if;
  if not p_legacy and (
       v_storage is null or v_storage not in ('ambient', 'refrigerated', 'frozen')
       or v_status is null or v_status not in ('measured', 'not_measured', 'not_required')
       or (v_storage = 'ambient' and v_status not in ('measured', 'not_required'))
       or (v_storage <> 'ambient' and v_status not in ('measured', 'not_measured'))
       or ((v_status = 'measured') <> (p_received_temperature_c is not null))
       or (p_received_temperature_c is not null and (p_received_temperature_c::text in ('NaN', 'Infinity', '-Infinity')
           or p_received_temperature_c < -50 or p_received_temperature_c > 80
           or p_received_temperature_c <> round(p_received_temperature_c, 1)))
       or ((v_status = 'not_measured') <> (v_reason is not null))
       or (p_temperature_reason is not null and v_reason is null)
       or length(v_reason) > 300) then
    raise exception 'Conservação ou temperatura do recebimento inválida.' using errcode='22023';
  end if;
  -- I-11: a unidade é travada antes do recebimento; mudar o fuso espera este recebimento confirmar.
  select e.timezone into v_timezone from public.establishments e
    where e.organization_id=p_organization_id and e.id=p_establishment_id for share;
  if not found then
    raise exception 'Produto ou fornecedor inválido para o estabelecimento.' using errcode='23503';
  end if;
  select p.unit, p.storage_condition into v_unit, v_product_storage from public.products p
    where p.organization_id=p_organization_id and p.establishment_id=p_establishment_id and p.id=p_product_id
    for share;
  if not found or not exists (select 1 from public.suppliers s where s.organization_id=p_organization_id
      and s.establishment_id=p_establishment_id and s.id=p_supplier_id) then
    raise exception 'Produto ou fornecedor inválido para o estabelecimento.' using errcode='23503';
  end if;
  -- Regras de estado só para recebimento novo: o reenvio de um recebimento já gravado vai ao replay
  -- mesmo que a conservação do produto tenha sido definida depois.
  if not exists (select 1 from public.batch_receipts b where b.organization_id=p_organization_id
                  and b.establishment_id=p_establishment_id and b.intent_id=p_intent_id) then
    if p_legacy then
      if v_product_storage in ('refrigerated', 'frozen') then
        raise exception 'Este produto exige conservação e temperatura no recebimento.' using errcode='22023';
      elsif v_product_storage = 'ambient' then
        v_storage := 'ambient'; v_status := 'not_required';
      else
        v_storage := null; v_status := null;
      end if;
    elsif v_product_storage is not null and v_product_storage <> v_storage then
      raise exception 'A conservação do recebimento precisa ser a definida no produto.' using errcode='22023';
    end if;
  end if;
  insert into public.batch_receipts (organization_id, establishment_id, product_id, supplier_id, source_code,
    quantity, unit, expiry_date, expiry_origin, original_expiry_date, storage_condition, temperature_status,
    received_temperature_c, intent_id, timezone, created_by)
  values (p_organization_id,p_establishment_id,p_product_id,p_supplier_id,btrim(p_source_code),p_quantity,
    v_unit,p_expiry_date,p_expiry_origin,p_original_expiry_date,v_storage,v_status,
    case when p_legacy then null else p_received_temperature_c end,p_intent_id,v_timezone,v_user)
  on conflict (organization_id, establishment_id, intent_id) do nothing returning id into v_id;
  if v_id is not null then
    -- Q8/D-029: sem medição, a ocorrência nasce na mesma transação e bloqueia o uso até a decisão.
    if v_status = 'not_measured' then
      insert into public.occurrences (organization_id, establishment_id, batch_id, kind, reason, timezone, created_by)
      values (p_organization_id, p_establishment_id, v_id, 'temperature_not_measured', v_reason, v_timezone, v_user);
    end if;
    return v_id;
  end if;
  select * into strict v_existing from public.batch_receipts where organization_id=p_organization_id
    and establishment_id=p_establishment_id and intent_id=p_intent_id;
  if v_existing.created_by is distinct from v_user or v_existing.product_id is distinct from p_product_id
    or v_existing.supplier_id is distinct from p_supplier_id or v_existing.source_code is distinct from btrim(p_source_code)
    or v_existing.quantity is distinct from p_quantity or v_existing.expiry_date is distinct from p_expiry_date
    or v_existing.expiry_origin is distinct from p_expiry_origin or v_existing.original_expiry_date is distinct from p_original_expiry_date
    -- A assinatura antiga não informa temperatura: não reaproveita um recebimento que a tem.
    or (p_legacy and v_existing.temperature_status in ('measured', 'not_measured'))
    or (not p_legacy and (v_existing.storage_condition is distinct from p_storage_condition
        or v_existing.temperature_status is distinct from p_temperature_status
        or v_existing.received_temperature_c is distinct from p_received_temperature_c
        or (select o.reason from public.occurrences o where o.batch_id = v_existing.id and o.kind = 'temperature_not_measured')
           is distinct from v_reason)) then
      raise exception 'Identificador já utilizado com outros dados.' using errcode='23505';
  end if;
  return v_existing.id;
end;
$$;
revoke all on function private.receive_batch_core(uuid,uuid,uuid,uuid,text,numeric,date,text,date,boolean,text,text,numeric,text,uuid)
  from public, anon, authenticated, service_role;

-- Assinatura antiga (tela atual até a 6.5b): mesmos parâmetros, mensagens e códigos.
create or replace function private.receive_batch(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_intent_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return private.receive_batch_core(p_organization_id, p_establishment_id, p_product_id, p_supplier_id,
    p_source_code, p_quantity, p_expiry_date, p_expiry_origin, p_original_expiry_date, true,
    null, null, null, null, p_intent_id);
end;
$$;

-- Assinatura nova: conservação e situação da medição obrigatórias.
create function private.receive_batch(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_storage_condition text, p_temperature_status text,
  p_received_temperature_c numeric, p_temperature_reason text, p_intent_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return private.receive_batch_core(p_organization_id, p_establishment_id, p_product_id, p_supplier_id,
    p_source_code, p_quantity, p_expiry_date, p_expiry_origin, p_original_expiry_date, false,
    p_storage_condition, p_temperature_status, p_received_temperature_c, p_temperature_reason, p_intent_id);
end;
$$;
revoke all on function private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid) to authenticated;
create function public.receive_batch(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_storage_condition text, p_temperature_status text,
  p_received_temperature_c numeric, p_temperature_reason text, p_intent_id uuid
) returns uuid language sql security invoker set search_path = '' as $$
  select private.receive_batch(p_organization_id, p_establishment_id, p_product_id, p_supplier_id,
    p_source_code, p_quantity, p_expiry_date, p_expiry_origin, p_original_expiry_date, p_storage_condition,
    p_temperature_status, p_received_temperature_c, p_temperature_reason, p_intent_id);
$$;
revoke all on function public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid) to authenticated;

-- 7) Baixas: consumo recusado em recipiente bloqueado; descarte permitido (D-029) ------------------
create or replace function private.apply_stock_exit(p_organization_id uuid, p_establishment_id uuid, p_batch_id uuid,
  p_container_id uuid, p_by_container boolean, p_kind text, p_quantity numeric, p_reason text, p_intent_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare v_user uuid := auth.uid(); v_batch public.batch_receipts%rowtype; v_existing public.stock_movements%rowtype;
  v_container_id uuid; v_batch_id uuid; v_id uuid; v_timezone text;
  v_reason text := nullif(btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'');
begin
 if v_user is null or not private.has_membership(p_organization_id,true) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_intent_id is null or p_kind is null or p_kind not in ('consumption','discard') or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity <= 0 or p_quantity > 1000000000 or p_quantity <> trunc(p_quantity,3) or (p_kind='discard' and v_reason is null) or length(v_reason)>500 or (p_by_container and p_container_id is null) then raise exception 'Dados inválidos.' using errcode='22023'; end if;
 if not p_by_container then
   -- Assinatura antiga: o recipiente é o integral do recebimento.
   select c.id, c.batch_id into v_container_id, v_batch_id from public.containers c
    where c.organization_id=p_organization_id and c.establishment_id=p_establishment_id and c.batch_id=p_batch_id and c.kind='integral';
   if not found then raise exception 'Recebimento não encontrado.' using errcode='23503'; end if;
 else
   select c.id, c.batch_id into v_container_id, v_batch_id from public.containers c
    where c.organization_id=p_organization_id and c.establishment_id=p_establishment_id and c.id=p_container_id;
   if not found then raise exception 'Recipiente não encontrado.' using errcode='23503'; end if;
 end if;
 select * into strict v_batch from public.batch_receipts where id=v_batch_id and organization_id=p_organization_id and establishment_id=p_establishment_id for update;
 if v_batch.unit='un' and p_quantity <> trunc(p_quantity) then raise exception 'Quantidade inválida.' using errcode='22023'; end if;
 select * into v_existing from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id;
 if found then
   if v_existing.created_by is distinct from v_user or v_existing.batch_id is distinct from v_batch_id or v_existing.container_id is distinct from v_container_id or v_existing.kind is distinct from p_kind or v_existing.quantity is distinct from p_quantity or v_existing.reason is distinct from v_reason then raise exception 'Identificador já utilizado com outros dados.' using errcode='23505'; end if;
   return v_existing.id;
 end if;
 -- I-3: o identificador de uma decisão de ocorrência não vira baixa.
 if private.decision_intent_used(p_organization_id, p_establishment_id, p_intent_id) then
   raise exception 'Identificador já utilizado com outros dados.' using errcode='23505';
 end if;
 -- 6.5a: consumo exige recipiente livre de ocorrência aberta ou rejeitada (sob o bloqueio do recebimento).
 if p_kind='consumption' then perform private.raise_if_blocked(p_organization_id, p_establishment_id, v_container_id); end if;
 if p_quantity > private.container_balance(v_container_id) then raise exception 'Quantidade excede saldo registrado.' using errcode='22023'; end if;
 select timezone into strict v_timezone from public.establishments where id=p_establishment_id and organization_id=p_organization_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by)
 values(p_organization_id,p_establishment_id,v_batch_id,v_container_id,p_intent_id,p_kind,p_quantity,v_reason,v_timezone,v_user) returning id into v_id;
 return v_id;
end;
$$;

-- 8) Anulação comum: igual à 6.4, mais o cruzamento com identificadores de decisão (I-3) -------------
-- Anular um descarte em recipiente bloqueado continua permitido e o recipiente continua bloqueado (S-2).
create or replace function private.reverse_movement(p_organization_id uuid,p_establishment_id uuid,p_movement_id uuid,p_reason text,p_intent_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_original public.stock_movements%rowtype; v_existing public.stock_movements%rowtype; v_batch_id uuid; v_reason text:=nullif(btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),''); v_timezone text; v_id uuid;
begin
 if v_user is null or not private.has_membership(p_organization_id,true) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_intent_id is null or v_reason is null or length(v_reason)>500 then raise exception 'Motivo ou identificador inválido.' using errcode='22023'; end if;
 select batch_id into v_batch_id from public.stock_movements where id=p_movement_id and organization_id=p_organization_id and establishment_id=p_establishment_id;
 if not found then raise exception 'Movimento não encontrado.' using errcode='23503'; end if;
 perform 1 from public.batch_receipts where id=v_batch_id and organization_id=p_organization_id and establishment_id=p_establishment_id for update;
 select * into strict v_original from public.stock_movements where id=p_movement_id and organization_id=p_organization_id and establishment_id=p_establishment_id and batch_id=v_batch_id;
 if v_original.kind='reversal' then raise exception 'Estorno de estorno não é permitido.' using errcode='22023'; end if;
 if v_original.kind in ('transfer','transfer_reversal','handling_void') or v_original.handling_id is not null or v_original.handling_void_id is not null then raise exception 'Movimento de manipulação só é desfeito pela anulação da manipulação.' using errcode='22023'; end if;
 select * into v_existing from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id;
 if found then
   if v_existing.kind is distinct from 'reversal' or v_existing.reverses_id is distinct from p_movement_id or v_existing.created_by is distinct from v_user or v_existing.reason is distinct from v_reason then raise exception 'Identificador já utilizado com outros dados.' using errcode='23505'; end if;
   return v_existing.id;
 end if;
 -- I-3: o identificador de uma manipulação, anulação de manipulação ou decisão não vira anulação comum.
 if exists(select 1 from public.container_handlings where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id)
    or exists(select 1 from public.handling_voids where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id)
    or private.decision_intent_used(p_organization_id, p_establishment_id, p_intent_id) then
   raise exception 'Identificador já utilizado com outros dados.' using errcode='23505';
 end if;
 if exists(select 1 from public.stock_movements where reverses_id=p_movement_id) then raise exception 'Movimento já estornado.' using errcode='23505'; end if;
 select timezone into strict v_timezone from public.establishments where organization_id=p_organization_id and id=p_establishment_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by,reverses_id) values(p_organization_id,p_establishment_id,v_batch_id,v_original.container_id,p_intent_id,'reversal',v_original.quantity,v_reason,v_timezone,v_user,p_movement_id) returning id into v_id;
 return v_id;
end;
$$;

-- 9) handle_container: origem bloqueada recusada; fora da janela, só com justificativa e ocorrência ---
create or replace function private.handle_container(
  p_organization_id uuid, p_establishment_id uuid, p_source_container_id uuid, p_kind text,
  p_quantities numeric[], p_expiry_date date, p_storage text, p_handled_at timestamptz, p_handled_by uuid,
  p_remainder text, p_remainder_reason text, p_note text, p_late_reason text, p_intent_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_remainder_reason text := private.visible_text(p_remainder_reason);
  v_note text := private.visible_text(p_note);
  v_late_reason text := private.visible_text(p_late_reason);
  v_late boolean;
  v_count integer;
  v_sum numeric := 0;
  v_q numeric;
  v_source public.containers%rowtype;
  v_batch public.batch_receipts%rowtype;
  v_existing public.container_handlings%rowtype;
  v_balance numeric;
  v_rest numeric;
  v_remainder text;
  v_name text;
  v_handled_day date;
  v_today date;
  v_id uuid;
  v_remainder_intent uuid;
  i integer;
begin
  -- Autorização: proprietário ativo (D-019).
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  -- Forma.
  v_count := coalesce(array_length(p_quantities, 1), 0);
  if p_intent_id is null or p_source_container_id is null or p_kind is null or p_kind not in ('opening', 'portioning')
     or p_quantities is null or array_ndims(p_quantities) is distinct from 1
     or (p_kind = 'opening' and v_count <> 1) or (p_kind = 'portioning' and (v_count < 2 or v_count > 20))
     or p_expiry_date is null or p_expiry_date not between date '0001-01-01' and date '9999-12-31'
     or p_storage is null or p_storage not in ('ambient', 'refrigerated', 'frozen')
     or p_handled_at is null or not isfinite(p_handled_at) or p_handled_by is null
     or p_remainder is null or p_remainder not in ('none', 'sealed', 'discard', 'portion')
     or (p_remainder = 'portion' and p_kind <> 'portioning')
     or (p_remainder = 'discard' and v_remainder_reason is null)
     or (p_remainder <> 'discard' and p_remainder_reason is not null)
     or length(v_remainder_reason) > 500 or length(v_note) > 200
     or (p_note is not null and v_note is null)
     or (p_late_reason is not null and v_late_reason is null) or length(v_late_reason) > 300 then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  foreach v_q in array p_quantities loop
    if v_q is null or v_q::text in ('NaN', 'Infinity', '-Infinity') or v_q <= 0 or v_q > 1000000000 or v_q <> trunc(v_q, 3) then
      raise exception 'Dados inválidos.' using errcode = '22023';
    end if;
    v_sum := v_sum + v_q;
  end loop;

  -- Origem no escopo (mesma mensagem para inexistente, outra unidade e outra empresa).
  select * into v_source from public.containers c
   where c.organization_id = p_organization_id and c.establishment_id = p_establishment_id and c.id = p_source_container_id;
  if not found then
    raise exception 'Recipiente não encontrado.' using errcode = '23503';
  end if;

  -- Bloqueio do recebimento: serializa manipulações, baixas e decisões do mesmo lote.
  select * into strict v_batch from public.batch_receipts b
   where b.organization_id = p_organization_id and b.establishment_id = p_establishment_id and b.id = v_source.batch_id
   for update;
  if v_batch.unit = 'un' and exists (select 1 from unnest(p_quantities) q where q <> trunc(q)) then
    raise exception 'Quantidade inválida.' using errcode = '22023';
  end if;

  -- Replay: compara tudo o que foi pedido, exceto o nome copiado (I-4), agora com a justificativa de
  -- atraso. Antes das regras de estado (inclusive do bloqueio por ocorrência).
  select * into v_existing from public.container_handlings h
   where h.organization_id = p_organization_id and h.establishment_id = p_establishment_id and h.intent_id = p_intent_id;
  if found then
    if v_existing.created_by is distinct from v_user
       or v_existing.source_container_id is distinct from p_source_container_id
       or v_existing.kind is distinct from p_kind
       or v_existing.portion_count is distinct from v_count
       or (select array_agg(c.initial_quantity order by c.position) from public.containers c
            where c.handling_id = v_existing.id and c.position <= v_existing.portion_count) is distinct from p_quantities
       or v_existing.expiry_date is distinct from p_expiry_date
       or v_existing.storage is distinct from p_storage
       or v_existing.handled_at is distinct from p_handled_at
       or v_existing.handled_by is distinct from p_handled_by
       or v_existing.remainder is distinct from (case p_remainder when 'discard' then 'discarded' else p_remainder end)
       or v_existing.note is distinct from v_note
       or (select m.reason from public.stock_movements m where m.handling_id = v_existing.id and m.kind = 'discard')
          is distinct from v_remainder_reason
       or (select o.reason from public.occurrences o where o.handling_id = v_existing.id and o.kind = 'late_handling')
          is distinct from v_late_reason then
      raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  -- I-3: o identificador de uma baixa ou de uma decisão de ocorrência não vira manipulação.
  if exists (select 1 from public.stock_movements m
              where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id and m.intent_id = p_intent_id)
     or private.decision_intent_used(p_organization_id, p_establishment_id, p_intent_id) then
    raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
  end if;

  -- Estado: saldo da origem pelo histórico, sob o bloqueio.
  v_balance := private.container_balance(v_source.id);
  if v_balance <= 0 then
    raise exception 'Recipiente sem saldo registrado.' using errcode = '22023';
  end if;
  -- 6.5a: origem com ocorrência aberta ou rejeitada não é manipulada (D-029, B-2).
  perform private.raise_if_blocked(p_organization_id, p_establishment_id, v_source.id);

  -- Horário (B-2, D-031): não futuro, não anterior à origem; mais de 2 horas antes do registro só com
  -- justificativa de atraso, que abre ocorrência e bloqueia os derivados até a decisão.
  if p_handled_at > now() then
    raise exception 'O horário da manipulação não pode estar no futuro.' using errcode = '22023';
  end if;
  if (v_source.kind = 'integral' and p_handled_at < v_source.created_at)
     or (v_source.kind = 'derived' and p_handled_at < v_source.handled_at) then
    raise exception 'O horário da manipulação não pode ser anterior ao do recipiente de origem.' using errcode = '22023';
  end if;
  v_late := now() - p_handled_at > private.handling_late_window();
  if v_late and v_late_reason is null then
    raise exception 'Manipulação registrada mais de 2 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.'
      using errcode = '22023';
  end if;
  if not v_late and v_late_reason is not null then
    raise exception 'Justificativa de atraso só vale para manipulação registrada mais de 2 horas depois de feita.'
      using errcode = '22023';
  end if;

  -- Validade: origem vencida na data da manipulação não é manipulada; a nova validade vai de
  -- max(data da manipulação, data do registro) até a validade da origem, inclusive (fuso da unidade).
  v_handled_day := (p_handled_at at time zone v_batch.timezone)::date;
  v_today := (now() at time zone v_batch.timezone)::date;
  if v_source.expiry_date < v_handled_day then
    raise exception 'Recipiente de origem vencido na data da manipulação; manipular não recupera validade.' using errcode = '22023';
  end if;
  if p_expiry_date > v_source.expiry_date then
    raise exception 'A validade após abertura não pode passar da validade do recipiente de origem.' using errcode = '22023';
  end if;
  if p_expiry_date < greatest(v_handled_day, v_today) then
    raise exception 'A validade após abertura não pode ser anterior à data da manipulação nem à do registro.' using errcode = '22023';
  end if;

  -- Quantidades e sobra.
  if v_sum > v_balance then
    raise exception 'Quantidade excede saldo registrado.' using errcode = '22023';
  end if;
  v_rest := v_balance - v_sum;
  if v_rest = 0 then
    if p_remainder <> 'none' then
      raise exception 'Não há sobra: as porções levam todo o saldo.' using errcode = '22023';
    end if;
    v_remainder := 'none';
  else
    if p_remainder = 'none' then
      raise exception 'Informe o que acontece com a sobra.' using errcode = '22023';
    end if;
    if p_remainder = 'sealed' and v_source.kind <> 'integral' then
      raise exception 'Só a embalagem original fechada mantém a sobra na origem; inclua a sobra como porção ou descarte.'
        using errcode = '22023';
    end if;
    v_remainder := case p_remainder when 'discard' then 'discarded' else p_remainder end;
  end if;

  -- Quem manipulou: vínculo ativo na mesma empresa e nome de exibição definido.
  select m.display_name into v_name from public.memberships m
   where m.organization_id = p_organization_id and m.user_id = p_handled_by and m.revoked_at is null;
  if not found then
    raise exception 'A pessoa que manipulou precisa ter vínculo ativo com a empresa.' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Defina o nome de exibição da pessoa que manipulou antes de registrar.' using errcode = '22023';
  end if;

  -- Gravação, tudo na mesma transação.
  if v_remainder = 'discarded' then v_remainder_intent := gen_random_uuid(); end if;
  insert into public.container_handlings (organization_id, establishment_id, batch_id, source_container_id,
    source_expiry_date, kind, portion_count, total_quantity, expiry_date, storage, handled_at, late, remainder,
    remainder_quantity, remainder_intent_id, handled_by, handled_by_name, note, intent_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_batch.id, v_source.id, v_source.expiry_date, p_kind, v_count,
    v_sum + case when v_remainder = 'portion' then v_rest else 0 end, p_expiry_date, p_storage, p_handled_at, v_late,
    v_remainder, v_rest, v_remainder_intent, p_handled_by, v_name, v_note, p_intent_id, v_batch.timezone, v_user)
  returning id into v_id;

  if v_late then
    insert into public.occurrences (organization_id, establishment_id, batch_id, kind, handling_id, reason, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_batch.id, 'late_handling', v_id, v_late_reason, v_batch.timezone, v_user);
  end if;

  insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, handling_id,
    intent_id, kind, quantity, reason, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_batch.id, v_source.id, v_id, p_intent_id, 'transfer',
    v_sum + case when v_remainder = 'portion' then v_rest else 0 end, null, v_batch.timezone, v_user);

  if v_remainder = 'discarded' then
    insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, handling_id,
      intent_id, kind, quantity, reason, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_batch.id, v_source.id, v_id, v_remainder_intent, 'discard',
      v_rest, v_remainder_reason, v_batch.timezone, v_user);
  end if;

  for i in 1 .. v_count loop
    insert into public.containers (organization_id, establishment_id, batch_id, kind, parent_container_id,
      handling_id, position, initial_quantity, expiry_date, storage, handled_at, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_batch.id, 'derived', v_source.id, v_id, i,
      p_quantities[i], p_expiry_date, p_storage, p_handled_at, v_batch.timezone, v_user);
  end loop;
  if v_remainder = 'portion' then
    insert into public.containers (organization_id, establishment_id, batch_id, kind, parent_container_id,
      handling_id, position, initial_quantity, expiry_date, storage, handled_at, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_batch.id, 'derived', v_source.id, v_id, v_count + 1,
      v_rest, p_expiry_date, p_storage, p_handled_at, v_batch.timezone, v_user);
  end if;
  return v_id;
end;
$$;

-- 10) void_handling: igual à 6.4, mais o cruzamento com identificadores de decisão (I-3). Ocorrência
--     tardia aberta não impede anular (4.10); a ocorrência fica registrada e pode ser decidida.
create or replace function private.void_handling(
  p_organization_id uuid, p_establishment_id uuid, p_handling_id uuid, p_reason text, p_intent_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_reason text := private.visible_text(p_reason);
  v_handling public.container_handlings%rowtype;
  v_existing public.handling_voids%rowtype;
  v_transfer public.stock_movements%rowtype;
  v_discard public.stock_movements%rowtype;
  v_derived record;
  v_id uuid;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_intent_id is null or p_handling_id is null or v_reason is null or length(v_reason) > 500 then
    raise exception 'Motivo ou identificador inválido.' using errcode = '22023';
  end if;
  select * into v_handling from public.container_handlings h
   where h.organization_id = p_organization_id and h.establishment_id = p_establishment_id and h.id = p_handling_id;
  if not found then
    raise exception 'Manipulação não encontrada.' using errcode = '23503';
  end if;
  perform 1 from public.batch_receipts b
   where b.organization_id = p_organization_id and b.establishment_id = p_establishment_id and b.id = v_handling.batch_id
   for update;
  select * into v_existing from public.handling_voids v
   where v.organization_id = p_organization_id and v.establishment_id = p_establishment_id and v.intent_id = p_intent_id;
  if found then
    if v_existing.handling_id is distinct from p_handling_id or v_existing.created_by is distinct from v_user
       or v_existing.reason is distinct from v_reason then
      raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  -- I-3: o identificador de uma baixa, anulação, manipulação ou decisão não vira anulação de manipulação.
  if exists (select 1 from public.stock_movements m
              where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id and m.intent_id = p_intent_id)
     or exists (select 1 from public.container_handlings h
              where h.organization_id = p_organization_id and h.establishment_id = p_establishment_id and h.intent_id = p_intent_id)
     or private.decision_intent_used(p_organization_id, p_establishment_id, p_intent_id) then
    raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
  end if;
  if exists (select 1 from public.handling_voids v where v.handling_id = p_handling_id) then
    raise exception 'Manipulação já anulada.' using errcode = '23505';
  end if;
  if exists (select 1 from public.stock_movements m join public.containers c on c.id = m.container_id
              where c.handling_id = p_handling_id) then
    raise exception 'Algum recipiente desta manipulação já teve movimentação; a manipulação não pode ser anulada.'
      using errcode = '22023';
  end if;

  select * into strict v_transfer from public.stock_movements m where m.handling_id = p_handling_id and m.kind = 'transfer';

  insert into public.handling_voids (organization_id, establishment_id, batch_id, handling_id, reason, intent_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_handling.batch_id, p_handling_id, v_reason, p_intent_id, v_handling.timezone, v_user)
  returning id into v_id;

  insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, handling_id,
    handling_void_id, intent_id, kind, quantity, reason, reverses_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_handling.batch_id, v_handling.source_container_id, p_handling_id,
    v_id, p_intent_id, 'transfer_reversal', v_transfer.quantity, v_reason, v_transfer.id, v_handling.timezone, v_user);

  if v_handling.remainder = 'discarded' then
    select * into strict v_discard from public.stock_movements m where m.handling_id = p_handling_id and m.kind = 'discard';
    insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, handling_id,
      handling_void_id, intent_id, kind, quantity, reason, reverses_id, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_handling.batch_id, v_handling.source_container_id, p_handling_id,
      v_id, gen_random_uuid(), 'reversal', v_discard.quantity, v_reason, v_discard.id, v_handling.timezone, v_user);
  end if;

  for v_derived in
    select c.id, c.initial_quantity from public.containers c where c.handling_id = p_handling_id order by c.position
  loop
    insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, derived_handling_id,
      handling_void_id, intent_id, kind, quantity, reason, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_handling.batch_id, v_derived.id, p_handling_id,
      v_id, gen_random_uuid(), 'handling_void', v_derived.initial_quantity, v_reason, v_handling.timezone, v_user);
  end loop;
  return v_id;
end;
$$;

-- 11) decide_occurrence (5.4) -------------------------------------------------------------------------
-- Ordem (I-4): autorização → forma → ocorrência no escopo → bloqueio do recebimento (I-6) → replay →
-- estado. Só o proprietário decide (D-019), com justificativa; uma decisão por ocorrência, sem troca.
create function private.decide_occurrence(
  p_organization_id uuid, p_establishment_id uuid, p_occurrence_id uuid, p_decision text, p_reason text, p_intent_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_reason text := private.visible_text(p_reason);
  v_occurrence public.occurrences%rowtype;
  v_existing public.occurrence_decisions%rowtype;
  v_id uuid;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_intent_id is null or p_occurrence_id is null or p_decision is null or p_decision not in ('released', 'rejected')
     or v_reason is null or length(v_reason) > 500 then
    raise exception 'Decisão, justificativa ou identificador inválido.' using errcode = '22023';
  end if;
  select * into v_occurrence from public.occurrences o
   where o.organization_id = p_organization_id and o.establishment_id = p_establishment_id and o.id = p_occurrence_id;
  if not found then
    raise exception 'Ocorrência não encontrada.' using errcode = '23503';
  end if;
  -- I-6: a mesma linha que baixas, manipulações e anulações bloqueiam.
  perform 1 from public.batch_receipts b
   where b.organization_id = p_organization_id and b.establishment_id = p_establishment_id and b.id = v_occurrence.batch_id
   for update;
  select * into v_existing from public.occurrence_decisions d
   where d.organization_id = p_organization_id and d.establishment_id = p_establishment_id and d.intent_id = p_intent_id;
  if found then
    if v_existing.occurrence_id is distinct from p_occurrence_id or v_existing.decision is distinct from p_decision
       or v_existing.reason is distinct from v_reason or v_existing.created_by is distinct from v_user then
      raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  -- I-3: o identificador de uma baixa, anulação, manipulação ou anulação de manipulação não vira decisão.
  if exists (select 1 from public.stock_movements m
              where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id and m.intent_id = p_intent_id)
     or exists (select 1 from public.container_handlings h
              where h.organization_id = p_organization_id and h.establishment_id = p_establishment_id and h.intent_id = p_intent_id)
     or exists (select 1 from public.handling_voids v
              where v.organization_id = p_organization_id and v.establishment_id = p_establishment_id and v.intent_id = p_intent_id) then
    raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
  end if;
  if exists (select 1 from public.occurrence_decisions d where d.occurrence_id = p_occurrence_id) then
    raise exception 'Ocorrência já decidida.' using errcode = '23505';
  end if;
  insert into public.occurrence_decisions (organization_id, establishment_id, batch_id, occurrence_id, decision, reason,
    intent_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_occurrence.batch_id, p_occurrence_id, p_decision, v_reason,
    p_intent_id, v_occurrence.timezone, v_user)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.decide_occurrence(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.decide_occurrence(uuid, uuid, uuid, text, text, uuid) to authenticated;
create function public.decide_occurrence(
  p_organization_id uuid, p_establishment_id uuid, p_occurrence_id uuid, p_decision text, p_reason text, p_intent_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.decide_occurrence(p_organization_id, p_establishment_id, p_occurrence_id, p_decision, p_reason, p_intent_id);
$$;
revoke all on function public.decide_occurrence(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.decide_occurrence(uuid, uuid, uuid, text, text, uuid) to authenticated;

-- 12) Coerência de ocorrências e conservação (verificação final e pgTAP). Vazio = tudo certo.
create function private.occurrence_problems()
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
   where c.kind = 'integral' and c.storage is distinct from b.storage_condition;
$$;
revoke all on function private.occurrence_problems() from public, anon, authenticated, service_role;

-- 13) Proteção do histórico com as tabelas novas (lista fixa, D-033) -------------------------------
create or replace function private.assert_history_protected()
returns void language plpgsql set search_path = '' as $$
declare
  v_problems text;
begin
  select string_agg(problem, '; ' order by problem) into v_problems
  from (
    select t.name || ': gatilho de proteção ausente, desabilitado ou incompleto' as problem
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes', 'container_handlings',
                      'handling_voids', 'occurrences', 'occurrence_decisions']) as t(name)
    where not exists (
      select 1
      from pg_catalog.pg_trigger g
      where g.tgrelid = ('public.' || t.name)::regclass
        and g.tgname = t.name || '_append_only'
        and g.tgfoid = 'private.reject_history_change()'::regprocedure
        and g.tgenabled = 'A'                -- ENABLE ALWAYS
        and (g.tgtype & 1) = 0               -- por comando
        and (g.tgtype & 2) = 2               -- BEFORE
        and (g.tgtype & 8) = 8               -- DELETE
        and (g.tgtype & 16) = 16             -- UPDATE
        and (g.tgtype & 32) = 32             -- TRUNCATE
    )
    union all
    select t.name || ': ' || r.role || ' tem ' || p.priv
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes', 'container_handlings',
                      'handling_voids', 'occurrences', 'occurrence_decisions']) as t(name)
    cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
    where pg_catalog.has_table_privilege(r.role, ('public.' || t.name)::regclass, p.priv)
  ) as problems;
  if v_problems is not null then
    raise exception 'Proteção do histórico incompleta: %', v_problems using errcode = '55000';
  end if;
end;
$$;
revoke all on function private.assert_history_protected() from public, anon, authenticated, service_role;

-- 14) Verificações finais -----------------------------------------------------------------------------
do $$
declare v_problems text;
begin
  perform private.assert_history_protected();
  select string_agg(batch_id || ': ' || problem, '; ' order by batch_id, problem) into v_problems
    from (select * from private.stock_conservation_problems() limit 20) p;
  if v_problems is not null then
    raise exception 'Conservação do estoque falhou: %', v_problems using errcode = '55000';
  end if;
  if exists (select 1 from private.container_balance_problems()) then
    raise exception 'Saldo registrado difere do histórico; migração desfeita.' using errcode = '55000';
  end if;
  select string_agg(batch_id || ': ' || problem, '; ' order by batch_id, problem) into v_problems
    from (select * from private.occurrence_problems() limit 20) p;
  if v_problems is not null then
    raise exception 'Ocorrências incoerentes: %', v_problems using errcode = '55000';
  end if;
end;
$$;
