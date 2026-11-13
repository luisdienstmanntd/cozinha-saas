-- Benchmark da fatia 6.0b (P3). Não altera o banco: tudo roda numa transação desfeita no fim.
-- Uso: psql "$DB_URL" -f supabase/benchmarks/rls_set_based.sql
-- Cenário: 20 mil recebimentos numa unidade, usuário proprietário com sessão, leitura completa pela RLS.
begin;
insert into auth.users(id) values ('b1000000-0000-4000-8000-000000000001');
insert into public.organizations(id, name) values ('b2000000-0000-4000-8000-000000000001', 'Bench');
insert into public.memberships(organization_id, user_id, role)
  values ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'owner');
insert into public.establishments(id, organization_id, name, timezone)
  values ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Bench', 'America/Sao_Paulo');
insert into public.products(id, organization_id, establishment_id, name, unit)
  values ('b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Bench', 'kg');
insert into public.suppliers(id, organization_id, establishment_id, name)
  values ('b5000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Bench');
insert into public.batch_receipts(organization_id, establishment_id, product_id, supplier_id, intent_id, source_code,
  quantity, unit, expiry_date, expiry_origin, original_expiry_date, timezone, created_by)
select 'b2000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', gen_random_uuid(), 'L' || g,
  1, 'kg', date '2027-01-01', 'original', date '2027-01-01', 'America/Sao_Paulo', 'b1000000-0000-4000-8000-000000000001'
from generate_series(1, 20000) g;
analyze public.batch_receipts;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
-- Aquecimento, depois três medições.
select count(*) from public.batch_receipts;
explain (analyze, costs off, timing on, summary on) select count(*) from public.batch_receipts;
explain (analyze, costs off, timing on, summary on) select count(*) from public.batch_receipts;
explain (analyze, costs off, timing on, summary on) select count(*) from public.batch_receipts;
-- Painel de vencimentos: primeira página ordenada.
explain (analyze, costs off, timing on, summary on)
  select id from public.batch_receipts
  where organization_id = 'b2000000-0000-4000-8000-000000000001' and establishment_id = 'b3000000-0000-4000-8000-000000000001'
  order by expiry_date, id limit 50;
rollback;
