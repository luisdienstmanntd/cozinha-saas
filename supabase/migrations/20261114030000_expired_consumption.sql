-- Fase 6, fatia 6.11: consumo de recipiente vencido recusado no banco e métrica de vencidos com saldo.
-- Pedido de luis em 14/11/2026, depois da revisão do relatório sanitário externo (ver docs/FASE_06_11.md).
--
-- 1) Consumo recusado quando a validade efetiva do recipiente (containers.expiry_date: a do recebimento
--    no integral, a definida na manipulação no derivado) é anterior à data de hoje no fuso da unidade.
--    O descarte continua permitido; anulações de consumo e de descarte não mudam. Nenhum prazo é
--    calculado nem sugerido (D-004): só se compara a data já registrada com a data de hoje.
--    É uma regra de uso decidida por luis, não uma avaliação sanitária; a conferência normativa (Q10)
--    segue pendente.
-- 2) pilot_metrics ganha containers_expired_with_balance (só leitura, pela RLS). Etiquetas feitas fora
--    do sistema continuam fora do banco: procedimento manual em docs/PRE_PILOTO.md.
-- Nenhuma tabela, coluna ou dado novo.

-- 1) Baixas ---------------------------------------------------------------------------------------
create or replace function private.apply_stock_exit(p_organization_id uuid, p_establishment_id uuid, p_batch_id uuid,
  p_container_id uuid, p_by_container boolean, p_kind text, p_quantity numeric, p_reason text, p_intent_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare v_user uuid := auth.uid(); v_batch public.batch_receipts%rowtype; v_existing public.stock_movements%rowtype;
  v_container_id uuid; v_batch_id uuid; v_id uuid; v_timezone text; v_expiry date; v_container_tz text;
  v_reason text := nullif(btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'');
begin
 if v_user is null or not private.has_membership(p_organization_id,true) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_intent_id is null or p_kind is null or p_kind not in ('consumption','discard') or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity <= 0 or p_quantity > 1000000000 or p_quantity <> trunc(p_quantity,3) or (p_kind='discard' and v_reason is null) or length(v_reason)>500 or (p_by_container and p_container_id is null) then raise exception 'Dados inválidos.' using errcode='22023'; end if;
 if not p_by_container then
   -- Assinatura antiga: o recipiente é o integral do recebimento.
   select c.id, c.batch_id, c.expiry_date, c.timezone into v_container_id, v_batch_id, v_expiry, v_container_tz from public.containers c
    where c.organization_id=p_organization_id and c.establishment_id=p_establishment_id and c.batch_id=p_batch_id and c.kind='integral';
   if not found then raise exception 'Recebimento não encontrado.' using errcode='23503'; end if;
 else
   select c.id, c.batch_id, c.expiry_date, c.timezone into v_container_id, v_batch_id, v_expiry, v_container_tz from public.containers c
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
 -- 6.11: consumo exige validade efetiva do recipiente (containers.expiry_date) não vencida na data de hoje
 -- no fuso do recipiente (o da unidade, imutável desde a 6.0c). Só olha o recipiente, nunca campos do
 -- recebimento: vale para integral, derivado e qualquer origem futura de recipiente. No próprio dia da validade o consumo vale, como na
 -- manipulação (6.3). Depois do bloqueio por ocorrência: a mensagem do bloqueio vem primeiro.
 if p_kind='consumption' and v_expiry < (now() at time zone v_container_tz)::date then
   raise exception 'Recipiente vencido: a validade registrada (%) já passou na data da unidade. Consumo recusado; o descarte continua permitido.',
     to_char(v_expiry, 'DD/MM/YYYY') using errcode = '22023';
 end if;
 if p_quantity > private.container_balance(v_container_id) then raise exception 'Quantidade excede saldo registrado.' using errcode='22023'; end if;
 select timezone into strict v_timezone from public.establishments where id=p_establishment_id and organization_id=p_organization_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by)
 values(p_organization_id,p_establishment_id,v_batch_id,v_container_id,p_intent_id,p_kind,p_quantity,v_reason,v_timezone,v_user) returning id into v_id;
 return v_id;
end;
$$;

-- 2) Métricas do piloto: o tipo de retorno muda, então a função é recriada -------------------------
drop function public.pilot_metrics(uuid, uuid, timestamptz, timestamptz);
create function public.pilot_metrics(
  p_organization_id uuid, p_establishment_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  handlings_total bigint,
  handlings_same_expiry bigint,
  handlings_shorter_expiry bigint,
  handlings_late bigint,
  handling_delay_p50_seconds numeric,
  handling_delay_max_seconds numeric,
  occurrences_total bigint,
  occurrences_late_handling bigint,
  occurrences_undecided bigint,
  decisions_total bigint,
  decision_wait_p50_seconds numeric,
  decision_wait_max_seconds numeric,
  handling_voids_total bigint,
  location_moves_total bigint,
  containers_expired_with_balance bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_organization_id is null or p_establishment_id is null or p_from is null or p_to is null then
    raise exception 'Escopo e período são obrigatórios.' using errcode = '22023';
  end if;
  if p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'Período inválido: o fim deve ser posterior ao início, com no máximo 366 dias.' using errcode = '22023';
  end if;
  return query
  with h as (
    select * from public.container_handlings x
     where x.organization_id = p_organization_id and x.establishment_id = p_establishment_id
       and x.created_at >= p_from and x.created_at < p_to),
  o as (
    select * from public.occurrences x
     where x.organization_id = p_organization_id and x.establishment_id = p_establishment_id
       and x.created_at >= p_from and x.created_at < p_to),
  d as (
    select x.created_at - oc.created_at as wait
      from public.occurrence_decisions x
      join public.occurrences oc on oc.id = x.occurrence_id
     where x.organization_id = p_organization_id and x.establishment_id = p_establishment_id
       and x.created_at >= p_from and x.created_at < p_to)
  select
    (select count(*) from h),
    (select count(*) from h where h.expiry_date = h.source_expiry_date),
    (select count(*) from h where h.expiry_date < h.source_expiry_date),
    (select count(*) from h where h.late),
    (select round((percentile_cont(0.5) within group (order by extract(epoch from h.created_at - h.handled_at)))::numeric, 0) from h),
    (select round(max(extract(epoch from h.created_at - h.handled_at))::numeric, 0) from h),
    (select count(*) from o),
    (select count(*) from o where o.kind = 'late_handling'),
    (select count(*) from o where not exists (select 1 from public.occurrence_decisions x where x.occurrence_id = o.id)),
    (select count(*) from d),
    (select round((percentile_cont(0.5) within group (order by extract(epoch from d.wait)))::numeric, 0) from d),
    (select round(max(extract(epoch from d.wait))::numeric, 0) from d),
    (select count(*) from public.handling_voids v
      where v.organization_id = p_organization_id and v.establishment_id = p_establishment_id
        and v.created_at >= p_from and v.created_at < p_to),
    (select count(*) from public.location_moves m
      where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id
        and m.created_at >= p_from and m.created_at < p_to and m.kind = 'move'),
    -- 6.11: fotografia de agora, independente do período: recipientes com saldo cuja validade efetiva
    -- já passou na data de hoje no fuso da unidade (o mesmo critério do consumo recusado).
    (select count(*) from public.container_balances cb
       join public.containers c on c.id = cb.container_id
      where cb.organization_id = p_organization_id and cb.establishment_id = p_establishment_id
        and cb.balance > 0 and cb.expiry_date < (now() at time zone c.timezone)::date);
end;
$$;
revoke all on function public.pilot_metrics(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.pilot_metrics(uuid, uuid, timestamptz, timestamptz) to authenticated;

do $$
begin
  perform private.assert_history_protected();
end;
$$;
