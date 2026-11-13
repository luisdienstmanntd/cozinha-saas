-- Reverte 20261113040000_timezone_immutable_audit.sql.
-- ATENÇÃO: apaga a tabela de auditoria public.entity_changes (o registro de quem mudou nome e fuso é perdido).
-- Depois do rollback o fuso volta a poder ser alterado mesmo com recebimentos (o que reclassifica vencimentos).
-- O gatilho append-only de entity_changes some junto com a tabela; por isso a verificação do histórico é
-- restaurada antes, para a lista de tabelas voltar a ser a da 6.0a.
drop trigger if exists validate_establishment_timezone_locked on public.establishments;
drop trigger if exists log_establishment_changes on public.establishments;
drop trigger if exists log_organization_changes on public.organizations;
drop function if exists private.lock_establishment_timezone();
drop function if exists private.log_entity_changes();
drop table if exists public.entity_changes;
create or replace function private.assert_history_protected()
returns void language plpgsql set search_path = '' as $$
declare
  v_problems text;
begin
  select string_agg(problem, '; ' order by problem) into v_problems
  from (
    select t.name || ': gatilho de proteção ausente, desabilitado ou incompleto' as problem
    from unnest(array['batch_receipts', 'containers', 'stock_movements']) as t(name)
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
    from unnest(array['batch_receipts', 'containers', 'stock_movements']) as t(name)
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
-- receive_batch volta ao texto da migração 20261106180342 (sem FOR SHARE na unidade).
create or replace function private.receive_batch(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_supplier_id uuid,
  p_source_code text, p_quantity numeric, p_expiry_date date, p_expiry_origin text,
  p_original_expiry_date date, p_intent_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_unit text; v_timezone text; v_id uuid; v_existing public.batch_receipts%rowtype;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_intent_id is null or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000
      or p_quantity <> trunc(p_quantity, 3) then
    raise exception 'Quantidade ou identificação inválida.' using errcode='22023';
  end if;
  select p.unit, e.timezone into v_unit, v_timezone from public.products p
    join public.establishments e on e.organization_id=p.organization_id and e.id=p.establishment_id
    where p.organization_id=p_organization_id and p.establishment_id=p_establishment_id and p.id=p_product_id;
  if not found or not exists (select 1 from public.suppliers s where s.organization_id=p_organization_id
      and s.establishment_id=p_establishment_id and s.id=p_supplier_id) then
    raise exception 'Produto ou fornecedor inválido para o estabelecimento.' using errcode='23503';
  end if;
  insert into public.batch_receipts (organization_id, establishment_id, product_id, supplier_id, source_code,
    quantity, unit, expiry_date, expiry_origin, original_expiry_date, intent_id, timezone, created_by)
  values (p_organization_id,p_establishment_id,p_product_id,p_supplier_id,btrim(p_source_code),p_quantity,
    v_unit,p_expiry_date,p_expiry_origin,p_original_expiry_date,p_intent_id,v_timezone,v_user)
  on conflict (organization_id, establishment_id, intent_id) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;
  select * into strict v_existing from public.batch_receipts where organization_id=p_organization_id
    and establishment_id=p_establishment_id and intent_id=p_intent_id;
  if v_existing.created_by is distinct from v_user or v_existing.product_id is distinct from p_product_id
    or v_existing.supplier_id is distinct from p_supplier_id or v_existing.source_code is distinct from btrim(p_source_code)
    or v_existing.quantity is distinct from p_quantity or v_existing.expiry_date is distinct from p_expiry_date
    or v_existing.expiry_origin is distinct from p_expiry_origin or v_existing.original_expiry_date is distinct from p_original_expiry_date then
      raise exception 'Identificador já utilizado com outros dados.' using errcode='23505';
  end if;
  return v_existing.id;
end;
$$;
