-- Fase 7, fatia 7.5 (desenho da Fase 7, seções 4.3 e 16.B; D-049, D-050, D-053): porcionar preparação
-- própria e métricas do piloto de produções. Aprovada por luis em 14/11/2026 (16:41 UTC).
--
-- 1) handle_container: o porcionamento do integral de um lote produzido pode ser registrado a partir do
--    horário da produção (batch_productions.produced_at), e não do registro do lote. Era o limite 1 da 7.1.
-- 2) handle_container: a porção de preparação própria leva a mesma validade do recipiente de origem
--    (decisão B de luis, 14/11/2026 15:47 UTC: "igual à do lote" por padrão; a opção "igual ou menor" é
--    configuração da 7.6). O sistema não calcula prazo: só confere que a pessoa digitou a mesma data.
-- 3) pilot_metrics ganha as métricas de produção (só leitura, pela RLS). O tipo de retorno muda, então a
--    função é recriada, como na 6.11.
--    Só para porcionamento: abrir preparação segue recusado pelo gatilho da 7.1, com a mesma mensagem.
-- Nenhuma tabela de histórico muda; append-only e RLS seguem como estão.

-- 1) e 2) --------------------------------------------------------------------------------------------
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('private.handle_container(uuid, uuid, uuid, text, numeric[], date, text, timestamptz, uuid, text, text, text, text, uuid)'::regprocedure)
    into v_def;
  v_new := replace(v_def,
    '(v_source.kind = ''integral'' and p_handled_at < v_source.created_at)',
    '(v_source.kind = ''integral'' and p_handled_at < coalesce(
        (select bp.produced_at from public.batch_productions bp
          where bp.organization_id = p_organization_id and bp.batch_id = v_source.batch_id),
        v_source.created_at))');
  if v_new = v_def then
    raise exception 'Não foi possível ajustar o horário mínimo do porcionamento de preparação.' using errcode = '55000';
  end if;
  v_def := v_new;
  v_new := replace(v_def,
    '  if p_expiry_date < greatest(v_handled_day, v_today) then',
    '  if v_batch.origin = ''produced'' and p_kind = ''portioning'' and p_expiry_date <> v_source.expiry_date then
    raise exception ''A porção de preparação própria leva a mesma validade do recipiente de origem.'' using errcode = ''22023'';
  end if;
  if p_expiry_date < greatest(v_handled_day, v_today) then');
  if v_new = v_def then
    raise exception 'Não foi possível incluir a validade da porção de preparação.' using errcode = '55000';
  end if;
  execute v_new;
end;
$$;

-- 3) Métricas do piloto ----------------------------------------------------------------------------
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
  containers_expired_with_balance bigint,
  -- 7.5: produção da cozinha (R-1 do desenho da Fase 7: gargalo do proprietário e D-019).
  productions_total bigint,
  productions_late bigint,
  production_delay_p50_seconds numeric,
  production_delay_max_seconds numeric,
  production_voids_total bigint,
  production_portionings_total bigint,
  occurrences_late_production bigint)
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
       and x.created_at >= p_from and x.created_at < p_to),
  p as (
    select * from public.batch_productions x
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
        and cb.balance > 0 and cb.expiry_date < (now() at time zone c.timezone)::date),
    -- 7.5: produções registradas no período; atraso = registro menos horário da produção.
    (select count(*) from p),
    (select count(*) from p where p.late),
    (select round((percentile_cont(0.5) within group (order by extract(epoch from p.created_at - p.produced_at)))::numeric, 0) from p),
    (select round(max(extract(epoch from p.created_at - p.produced_at))::numeric, 0) from p),
    (select count(*) from public.production_voids v
      where v.organization_id = p_organization_id and v.establishment_id = p_establishment_id
        and v.created_at >= p_from and v.created_at < p_to),
    (select count(*) from h
       join public.batch_receipts b on b.id = h.batch_id
      where b.origin = 'produced' and h.kind = 'portioning'),
    (select count(*) from o where o.kind = 'late_production');
end;
$$;
revoke all on function public.pilot_metrics(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.pilot_metrics(uuid, uuid, timestamptz, timestamptz) to authenticated;

do $$
begin
  perform private.assert_history_protected();
end;
$$;
