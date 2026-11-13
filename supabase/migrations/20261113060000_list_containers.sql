-- Fase 6, fatia 6.2 (P9, FASE_06_DESENHO 4.4, 7.3 e 7.4): painel e QR com saldo calculado no servidor.
-- Nenhuma escrita nova para o cliente e nenhum histórico alterado. As duas funções de leitura são
-- SECURITY INVOKER: a RLS das tabelas (6.0b) continua sendo a única barreira, e quem não tem vínculo
-- ativo simplesmente não recebe linha nenhuma.
--
-- Plano B da seção 4.4 (saldo mantido na escrita). O saldo calculado por agregação dos movimentos a
-- cada leitura não cumpriu o critério de 50 ms: "só com saldo" precisa pular todos os recipientes já
-- esgotados, que são a maior parte do histórico e os de validade mais antiga (medido: ~250 ms com
-- 20 mil recipientes e 200 mil eventos). public.container_balances guarda o saldo atual de cada
-- recipiente, mantido por gatilho na mesma transação do movimento. A fonte da verdade continua sendo
-- o histórico: private.container_balance (6.1) recalcula, e private.container_balance_problems()
-- acusa qualquer diferença.

-- 1) Saldo atual por recipiente -------------------------------------------------------------------
create table public.container_balances (
  container_id uuid primary key,
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null,
  expiry_date date not null,
  -- Segunda barreira contra saldo negativo: nenhuma escrita, por nenhum caminho, termina abaixo de zero.
  balance numeric not null check (balance >= 0),
  constraint container_balances_container_fk
    foreign key (organization_id, establishment_id, batch_id, container_id)
    references public.containers (organization_id, establishment_id, batch_id, id)
);
alter table public.container_balances enable row level security;
revoke all on public.container_balances from public, anon, authenticated, service_role;
grant select on public.container_balances to authenticated, service_role;
create policy container_balances_read on public.container_balances for select to authenticated
  using (organization_id in (select private.member_organizations()));

-- Painel "só com saldo": ordenado por validade efetiva, sem passar pelos esgotados.
create index container_balances_live_idx on public.container_balances (organization_id, establishment_id, expiry_date, container_id)
  where balance > 0;
-- "Mostrar esgotados".
create index container_balances_scope_expiry_idx on public.container_balances (organization_id, establishment_id, expiry_date, container_id);

-- Só os gatilhos abaixo escrevem. Qualquer INSERT, UPDATE, DELETE ou TRUNCATE direto é recusado para
-- todos os papéis, inclusive o dono das tabelas (pg_trigger_depth() = 1 significa comando direto).
create function private.guard_container_balances()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') or pg_trigger_depth() < 2 then
    raise exception 'Saldo de recipiente só é alterado pelo registro de movimentos.'
      using errcode = '55000', detail = tg_op;
  end if;
  return null;
end;
$$;
revoke all on function private.guard_container_balances() from public, anon, authenticated, service_role;
create trigger container_balances_guard before insert or update or delete or truncate on public.container_balances
  for each statement execute function private.guard_container_balances();
alter table public.container_balances enable always trigger container_balances_guard;

-- Backfill: saldo de cada recipiente existente pela regra da 6.1. O gatilho de guarda fica suspenso só
-- dentro desta transação (tabela nova, sem histórico) e volta como ENABLE ALWAYS logo abaixo.
alter table public.container_balances disable trigger container_balances_guard;
insert into public.container_balances (container_id, organization_id, establishment_id, batch_id, expiry_date, balance)
select c.id, c.organization_id, c.establishment_id, c.batch_id, c.expiry_date, private.container_balance(c.id)
  from public.containers c;
alter table public.container_balances enable always trigger container_balances_guard;

-- Recipiente novo nasce com saldo igual à quantidade inicial.
create function private.init_container_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.container_balances (container_id, organization_id, establishment_id, batch_id, expiry_date, balance)
  values (new.id, new.organization_id, new.establishment_id, new.batch_id, new.expiry_date, new.initial_quantity);
  return null;
end;
$$;
revoke all on function private.init_container_balance() from public, anon, authenticated, service_role;
create trigger containers_init_balance after insert on public.containers
  for each row execute function private.init_container_balance();
alter table public.containers enable always trigger containers_init_balance;

-- Movimento novo ajusta o saldo do seu recipiente na mesma transação. Tipo sem regra de saldo é
-- recusado: um tipo novo (6.3: transfer...) precisa entrar aqui, em private.container_balance e em
-- private.stock_conservation_problems.
create function private.apply_movement_to_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_delta numeric;
begin
  v_delta := case when new.kind in ('consumption', 'discard') then -new.quantity
                  when new.kind = 'reversal' then new.quantity end;
  if v_delta is null then
    raise exception 'Tipo de movimento sem regra de saldo.' using errcode = '55000', detail = new.kind;
  end if;
  update public.container_balances set balance = balance + v_delta where container_id = new.container_id;
  if not found then
    raise exception 'Recipiente sem saldo registrado.' using errcode = '55000';
  end if;
  return null;
end;
$$;
revoke all on function private.apply_movement_to_balance() from public, anon, authenticated, service_role;
create trigger stock_movements_apply_balance after insert on public.stock_movements
  for each row execute function private.apply_movement_to_balance();
alter table public.stock_movements enable always trigger stock_movements_apply_balance;

-- Saldo guardado × saldo recalculado do histórico. Vazio = tudo certo.
create function private.container_balance_problems()
returns table (container_id uuid, problem text) language sql stable set search_path = '' as $$
  select c.id, 'recipiente sem saldo registrado'
    from public.containers c
   where not exists (select 1 from public.container_balances cb where cb.container_id = c.id)
  union all
  select cb.container_id, 'saldo registrado difere do histórico'
    from public.container_balances cb
   where cb.balance is distinct from private.container_balance(cb.container_id)
  union all
  select cb.container_id, 'validade registrada difere do recipiente'
    from public.container_balances cb join public.containers c on c.id = cb.container_id
   where cb.expiry_date <> c.expiry_date;
$$;
revoke all on function private.container_balance_problems() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from private.container_balance_problems()) then
    raise exception 'Backfill de saldo inconsistente; migração desfeita.' using errcode = '55000';
  end if;
  perform private.assert_history_protected();
end;
$$;

-- 2) Leitura ----------------------------------------------------------------------------------------
create function public.list_containers(
  p_organization_id uuid,
  p_establishment_id uuid,
  p_filter text default 'with_balance',
  p_target_id uuid default null,
  p_search text default null,
  p_after_expiry date default null,
  p_after_id uuid default null,
  p_limit integer default 50)
returns table (
  container_id uuid,
  short_code text,
  kind text,
  parent_container_id uuid,
  batch_id uuid,
  product_id uuid,
  product_name text,
  unit text,
  source_code text,
  expiry_date date,
  expiry_origin text,
  batch_expiry_origin text,
  initial_quantity numeric,
  balance numeric,
  timezone text,
  created_at timestamptz)
language plpgsql stable security invoker set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_search text := nullif(btrim(p_search, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '');
  v_pattern text;
begin
  if p_organization_id is null or p_establishment_id is null then
    raise exception 'Escopo obrigatório.' using errcode = '22023';
  end if;
  if p_filter is null or p_filter not in ('with_balance', 'all', 'batch', 'container') then
    raise exception 'Filtro inválido.' using errcode = '22023';
  end if;
  if (p_filter in ('batch', 'container')) <> (p_target_id is not null) then
    raise exception 'Filtro por recebimento ou recipiente exige o identificador, e só ele.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'Limite deve estar entre 1 e 200.' using errcode = '22023';
  end if;
  if (p_after_expiry is null) <> (p_after_id is null) then
    raise exception 'Cursor incompleto.' using errcode = '22023';
  end if;
  if char_length(v_search) > 120 then
    raise exception 'Busca longa demais.' using errcode = '22023';
  end if;
  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(lower(v_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  -- A página sai primeiro de container_balances, já na ordem do índice (parcial para "só com saldo"),
  -- e só depois busca produto e lote. Sem busca, o limite é aplicado antes das junções; com busca, o
  -- filtro precisa do nome, então o limite fica só no fim (limit null = sem limite).
  -- Dois ramos para o planejador usar o índice parcial ou o completo. A função fixa plano por chamada
  -- (os parâmetros decidem o índice) e a ordem das junções escrita (página → recipiente → recebimento →
  -- produto), para a busca não varrer o histórico inteiro da unidade.
  if p_filter = 'with_balance' then
    return query
    with page as materialized (
      select cb.container_id, cb.expiry_date, cb.balance
        from public.container_balances cb
       where cb.organization_id = p_organization_id
         and cb.establishment_id = p_establishment_id
         and cb.balance > 0
         and (p_after_expiry is null or (cb.expiry_date, cb.container_id) > (p_after_expiry, p_after_id))
       order by cb.expiry_date, cb.container_id
       limit case when v_pattern is null then p_limit end)
    select c.id, c.short_code, c.kind, c.parent_container_id, c.batch_id, b.product_id, p.name, b.unit,
           b.source_code, c.expiry_date, c.expiry_origin, b.expiry_origin, c.initial_quantity,
           page.balance, c.timezone, c.created_at
      from page
      join public.containers c on c.id = page.container_id
      join public.batch_receipts b on b.id = c.batch_id
      join public.products p on p.id = b.product_id
     where c.organization_id = p_organization_id and c.establishment_id = p_establishment_id
       and b.organization_id = p_organization_id and b.establishment_id = p_establishment_id
       and p.organization_id = p_organization_id
       and (v_pattern is null
            or lower(p.name) like v_pattern
            or lower(b.source_code) like v_pattern
            or lower(c.short_code) like v_pattern
            or c.id::text like v_pattern)
     order by page.expiry_date, page.container_id
     limit p_limit;
  else
    return query
    with page as materialized (
      select cb.container_id, cb.expiry_date, cb.balance
        from public.container_balances cb
       where cb.organization_id = p_organization_id
         and cb.establishment_id = p_establishment_id
         and (p_filter <> 'batch' or cb.batch_id = p_target_id)
         and (p_filter <> 'container' or cb.container_id = p_target_id)
         and (p_after_expiry is null or (cb.expiry_date, cb.container_id) > (p_after_expiry, p_after_id))
       order by cb.expiry_date, cb.container_id
       limit case when v_pattern is null then p_limit end)
    select c.id, c.short_code, c.kind, c.parent_container_id, c.batch_id, b.product_id, p.name, b.unit,
           b.source_code, c.expiry_date, c.expiry_origin, b.expiry_origin, c.initial_quantity,
           page.balance, c.timezone, c.created_at
      from page
      join public.containers c on c.id = page.container_id
      join public.batch_receipts b on b.id = c.batch_id
      join public.products p on p.id = b.product_id
     where c.organization_id = p_organization_id and c.establishment_id = p_establishment_id
       and b.organization_id = p_organization_id and b.establishment_id = p_establishment_id
       and p.organization_id = p_organization_id
       and (v_pattern is null
            or lower(p.name) like v_pattern
            or lower(b.source_code) like v_pattern
            or lower(c.short_code) like v_pattern
            or c.id::text like v_pattern)
     order by page.expiry_date, page.container_id
     limit p_limit;
  end if;
end;
$$;
revoke all on function public.list_containers(uuid, uuid, text, uuid, text, date, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.list_containers(uuid, uuid, text, uuid, text, date, uuid, integer) to authenticated;

-- Contagens do painel só sobre recipientes com saldo (7.3). A data de referência vem de quem consulta
-- (a tela usa o relógio do dispositivo no fuso da unidade, como antes); assim os testes não envelhecem (S-6).
create function public.container_expiry_summary(
  p_organization_id uuid,
  p_establishment_id uuid,
  p_reference_date date)
returns table (overdue bigint, due_today bigint, due_tomorrow bigint, later bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_organization_id is null or p_establishment_id is null or p_reference_date is null then
    raise exception 'Escopo e data de referência obrigatórios.' using errcode = '22023';
  end if;
  return query
  select count(*) filter (where cb.expiry_date < p_reference_date),
         count(*) filter (where cb.expiry_date = p_reference_date),
         count(*) filter (where cb.expiry_date = p_reference_date + 1),
         count(*) filter (where cb.expiry_date > p_reference_date + 1)
    from public.container_balances cb
   where cb.organization_id = p_organization_id
     and cb.establishment_id = p_establishment_id
     and cb.balance > 0;
end;
$$;
revoke all on function public.container_expiry_summary(uuid, uuid, date) from public, anon, authenticated, service_role;
grant execute on function public.container_expiry_summary(uuid, uuid, date) to authenticated;
