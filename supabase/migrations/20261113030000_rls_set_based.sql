-- Fase 6, fatia 6.0b (P3, REVISAO_05 S4): RLS por conjunto em vez de função por linha.
-- As políticas chamavam private.has_membership(organization_id) para cada linha lida. Agora usam
-- "organization_id in (select private.member_organizations())": o Postgres calcula o conjunto de
-- organizações do usuário uma vez por consulta e compara cada linha com ele.
-- Mesma regra de antes: vínculo ativo (revoked_at is null) do auth.uid(); escrita exige proprietário;
-- memberships_read continua escondendo revogados e vínculos de colegas para quem não é proprietário (I-10b).
-- private.has_membership continua existindo: as funções de escrita verificam uma organização só.

create function private.member_organizations(p_owner_only boolean default false)
returns setof uuid language sql stable security definer set search_path = '' rows 10 as $$
  select m.organization_id from public.memberships m
  where m.user_id = (select auth.uid())
    and m.revoked_at is null
    and (not p_owner_only or m.role = 'owner');
$$;
revoke all on function private.member_organizations(boolean) from public, anon, authenticated, service_role;
grant execute on function private.member_organizations(boolean) to authenticated;

alter policy organizations_read on public.organizations
  using (id in (select private.member_organizations()));
alter policy organizations_update on public.organizations
  using (id in (select private.member_organizations(true)))
  with check (id in (select private.member_organizations(true)));

alter policy establishments_read on public.establishments
  using (organization_id in (select private.member_organizations()));
alter policy establishments_insert on public.establishments
  with check (organization_id in (select private.member_organizations(true)));
alter policy establishments_update on public.establishments
  using (organization_id in (select private.member_organizations(true)))
  with check (organization_id in (select private.member_organizations(true)));

alter policy memberships_read on public.memberships
  using (revoked_at is null
    and organization_id in (select private.member_organizations())
    and (user_id = (select auth.uid()) or organization_id in (select private.member_organizations(true))));

alter policy products_read on public.products
  using (organization_id in (select private.member_organizations()));
alter policy products_insert on public.products
  with check (organization_id in (select private.member_organizations(true)));
alter policy suppliers_read on public.suppliers
  using (organization_id in (select private.member_organizations()));
alter policy suppliers_insert on public.suppliers
  with check (organization_id in (select private.member_organizations(true)));

alter policy batch_receipts_read on public.batch_receipts
  using (organization_id in (select private.member_organizations()));
alter policy containers_read on public.containers
  using (organization_id in (select private.member_organizations()));
alter policy stock_movements_read on public.stock_movements
  using (organization_id in (select private.member_organizations()));
