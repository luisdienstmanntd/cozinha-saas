-- Reverte 20261113100000_receiving_occurrence_ui.sql: devolve a assinatura antiga de receive_batch e o
-- núcleo com o ramo legado, exatamente como a 6.5a os deixou, e remove list_occurrences. Não há dado
-- para conferir: a 6.5b não cria tabela nem coluna, e os recebimentos gravados pela assinatura nova
-- continuam válidos na 6.5a.
drop function if exists public.list_occurrences(uuid, uuid, text, integer);
drop function if exists public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid);
drop function if exists private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid);
drop function if exists private.receive_batch_core(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid);

-- Texto da 6.5a (20261113090000_conservation_occurrences.sql, seção 6).
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
revoke all on function private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid) from public, anon, authenticated, service_role;
grant execute on function private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid) to authenticated;

-- Invólucro público da assinatura antiga (20261106180342_batch_receipts.sql).
create function public.receive_batch(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_intent_id uuid
) returns uuid language sql security invoker set search_path = '' as $$
  select private.receive_batch(p_organization_id,p_establishment_id,p_product_id,p_supplier_id,
    p_source_code,p_quantity,p_expiry_date,p_expiry_origin,p_original_expiry_date,p_intent_id);
$$;
revoke all on function public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid) from public, anon, authenticated;
grant execute on function public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid) to authenticated;
