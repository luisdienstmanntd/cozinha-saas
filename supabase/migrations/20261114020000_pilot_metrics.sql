-- Fase 6, fatia 6.10: métricas de observação do piloto (desenho 6.10, R12, R13, R15, I-17). Só leitura:
-- SECURITY INVOKER, então a RLS decide o que cada pessoa conta (membros da empresa veem a própria empresa,
-- ninguém vê outra). Nenhuma tabela, coluna ou dado novo. Os números ajudam a observar a cozinha; não
-- medem nem afirmam conformidade sanitária.
--
-- Medido aqui: manipulações e atraso entre handled_at e created_at; ocorrências tardias; tempo até a
-- decisão de ocorrência; validades iguais à da origem; anulações; mudanças de local.
-- NÃO medido pelo banco (registrar à mão durante a observação, ver docs/PRE_PILOTO.md): etiquetas feitas
-- fora do sistema e tentativas de prazo recusadas (recusas não são gravadas).
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
  location_moves_total bigint)
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
        and m.created_at >= p_from and m.created_at < p_to and m.kind = 'move');
end;
$$;
revoke all on function public.pilot_metrics(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.pilot_metrics(uuid, uuid, timestamptz, timestamptz) to authenticated;

do $$
begin
  perform private.assert_history_protected();
end;
$$;
