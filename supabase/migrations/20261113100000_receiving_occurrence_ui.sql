-- Fase 6, fatia 6.5b — recebimento, decisão e bloqueio na interface (desenho 7.3, 7.6; D-041).
--
-- Duas mudanças de banco, as duas pedidas pela tela:
-- 1) A assinatura antiga de receive_batch (sem conservação nem temperatura) sai. A tela passa a usar a
--    assinatura nova; nenhum caminho de recebimento fica sem conservação e situação da medição
--    (ponto 2 do aceite da 6.5a). O núcleo perde o ramo "legado"; regras e mensagens da assinatura
--    nova não mudam.
-- 2) public.list_occurrences: leitura das ocorrências da unidade (SECURITY INVOKER, a RLS filtra), com
--    a decisão e os recipientes com saldo que cada uma bloqueia. Alimenta a faixa de bloqueados no
--    painel e a página de decisão. A regra de bloqueio continua sendo uma só (container_blocks): esta
--    função lista as mesmas ligações (recebimento → todos os recipientes; manipulação tardia → os
--    derivados dela), e o pgTAP confere que as duas concordam.
--
-- Nenhuma tabela muda, nenhum dado é reescrito, nenhum gatilho de proteção é suspenso. Nada aqui
-- afirma conformidade sanitária; a decisão segue o procedimento da cozinha (Q10 pendente).

-- 1) Retirada da assinatura antiga -------------------------------------------------------------------
drop function public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid);
drop function private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,uuid);
drop function private.receive_batch_core(uuid,uuid,uuid,uuid,text,numeric,date,text,date,boolean,text,text,numeric,text,uuid);

-- Núcleo sem o ramo legado. Ordem: autorização → forma → unidade (FOR SHARE, 6.0c) → produto (FOR SHARE:
-- serializa com a definição da conservação, I-6) e fornecedor → gravação com replay.
create function private.receive_batch_core(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_storage_condition text, p_temperature_status text,
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
  if (
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
    if v_product_storage is not null and v_product_storage <> v_storage then
      raise exception 'A conservação do recebimento precisa ser a definida no produto.' using errcode='22023';
    end if;
  end if;
  insert into public.batch_receipts (organization_id, establishment_id, product_id, supplier_id, source_code,
    quantity, unit, expiry_date, expiry_origin, original_expiry_date, storage_condition, temperature_status,
    received_temperature_c, intent_id, timezone, created_by)
  values (p_organization_id,p_establishment_id,p_product_id,p_supplier_id,btrim(p_source_code),p_quantity,
    v_unit,p_expiry_date,p_expiry_origin,p_original_expiry_date,v_storage,v_status,
    p_received_temperature_c,p_intent_id,v_timezone,v_user)
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
    -- Recebimento anterior à 6.5a (conservação nula) também difere: o reenvio precisa ser o mesmo dado.
    or v_existing.storage_condition is distinct from p_storage_condition
    or v_existing.temperature_status is distinct from p_temperature_status
    or v_existing.received_temperature_c is distinct from p_received_temperature_c
    or (select o.reason from public.occurrences o where o.batch_id = v_existing.id and o.kind = 'temperature_not_measured')
       is distinct from v_reason then
      raise exception 'Identificador já utilizado com outros dados.' using errcode='23505';
  end if;
  return v_existing.id;
end;
$$;
revoke all on function private.receive_batch_core(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid)
  from public, anon, authenticated, service_role;
create or replace function private.receive_batch(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_storage_condition text, p_temperature_status text,
  p_received_temperature_c numeric, p_temperature_reason text, p_intent_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return private.receive_batch_core(p_organization_id, p_establishment_id, p_product_id, p_supplier_id,
    p_source_code, p_quantity, p_expiry_date, p_expiry_origin, p_original_expiry_date,
    p_storage_condition, p_temperature_status, p_received_temperature_c, p_temperature_reason, p_intent_id);
end;
$$;

-- 2) Ocorrências da unidade -------------------------------------------------------------------------
-- p_scope 'open': sem decisão, ou rejeitadas que ainda bloqueiam recipiente com saldo (aguardando
-- descarte). 'all': todas, para conferência. Sem decisão primeiro, depois da mais antiga para a mais
-- nova. Até 200 por chamada; a tela avisa quando chega ao limite.
create function public.list_occurrences(
  p_organization_id uuid, p_establishment_id uuid, p_scope text default 'open', p_limit integer default 100)
returns table (
  occurrence_id uuid,
  kind text,
  batch_id uuid,
  handling_id uuid,
  product_name text,
  source_code text,
  unit text,
  reason text,
  created_at timestamptz,
  timezone text,
  status text,
  decision_reason text,
  decided_at timestamptz,
  containers jsonb)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_organization_id is null or p_establishment_id is null then
    raise exception 'Escopo obrigatório.' using errcode = '22023';
  end if;
  if p_scope is null or p_scope not in ('open', 'all') then
    raise exception 'Filtro inválido.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'Limite deve estar entre 1 e 200.' using errcode = '22023';
  end if;
  return query
  select o.id, o.kind, o.batch_id, o.handling_id, p.name, b.source_code, b.unit, o.reason, o.created_at,
         o.timezone,
         case when d.id is null then 'pending' else d.decision end,
         d.reason, d.created_at,
         coalesce(blocked.items, '[]'::jsonb)
    from public.occurrences o
    join public.batch_receipts b on b.organization_id = o.organization_id and b.establishment_id = o.establishment_id
     and b.id = o.batch_id
    join public.products p on p.organization_id = b.organization_id and p.establishment_id = b.establishment_id
     and p.id = b.product_id
    left join public.occurrence_decisions d on d.occurrence_id = o.id
    -- Mesmas ligações de container_blocks: recebimento sem medição alcança todos os recipientes do
    -- recebimento; manipulação tardia, só os derivados dela. Só os que ainda têm saldo.
    left join lateral (
      select jsonb_agg(jsonb_build_object('container_id', c.id, 'short_code', c.short_code,
               'kind', c.kind, 'balance', cb.balance) order by c.short_code) as items
        from public.containers c
        join public.container_balances cb on cb.container_id = c.id
       where c.organization_id = o.organization_id and c.establishment_id = o.establishment_id
         and c.batch_id = o.batch_id
         and (o.kind = 'temperature_not_measured' or c.handling_id = o.handling_id)
         and cb.balance > 0
    ) blocked on true
   where o.organization_id = p_organization_id and o.establishment_id = p_establishment_id
     and (p_scope = 'all' or d.id is null or (d.decision = 'rejected' and blocked.items is not null))
   order by (d.id is null) desc, o.created_at, o.id
   limit p_limit;
end;
$$;
revoke all on function public.list_occurrences(uuid, uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.list_occurrences(uuid, uuid, text, integer) to authenticated;

-- 3) Verificações finais ----------------------------------------------------------------------------
do $$
begin
  perform private.assert_history_protected();
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where p.proname in ('receive_batch', 'receive_batch_core') and n.nspname in ('public', 'private')
                and p.pronargs <> 14) then
    raise exception 'Assinatura antiga de receive_batch ainda existe; migração desfeita.' using errcode = '55000';
  end if;
  if exists (select 1 from private.occurrence_problems()) then
    raise exception 'Ocorrências incoerentes; migração desfeita.' using errcode = '55000';
  end if;
end;
$$;
