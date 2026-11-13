-- Reverte 20261113030000_rls_set_based.sql (sem perda de dados).
-- Devolve às 13 políticas o texto anterior, com private.has_membership por linha, e remove
-- private.member_organizations. A regra de acesso é a mesma; só o desempenho volta ao anterior.
alter policy organizations_read on public.organizations
  using (private.has_membership(id));
alter policy organizations_update on public.organizations
  using (private.has_membership(id,true)) with check (private.has_membership(id,true));
alter policy establishments_read on public.establishments
  using (private.has_membership(organization_id));
alter policy establishments_insert on public.establishments
  with check (private.has_membership(organization_id,true));
alter policy establishments_update on public.establishments
  using (private.has_membership(organization_id,true)) with check (private.has_membership(organization_id,true));
alter policy memberships_read on public.memberships
  using (revoked_at is null and private.has_membership(organization_id)
    and (user_id=(select auth.uid()) or private.has_membership(organization_id,true)));
alter policy products_read on public.products
  using (private.has_membership(organization_id));
alter policy products_insert on public.products
  with check (private.has_membership(organization_id, true));
alter policy suppliers_read on public.suppliers
  using (private.has_membership(organization_id));
alter policy suppliers_insert on public.suppliers
  with check (private.has_membership(organization_id, true));
alter policy batch_receipts_read on public.batch_receipts
  using (private.has_membership(organization_id));
alter policy containers_read on public.containers
  using (private.has_membership(organization_id));
alter policy stock_movements_read on public.stock_movements
  using (private.has_membership(organization_id));
drop function if exists private.member_organizations(boolean);
