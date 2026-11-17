-- Fase 7, fatia 7.2 — anular produção (D-049, desenho 4.6; ponto 4 aceito em 14/11/2026).
--
-- Validade digitada errada é o erro mais provável. O proprietário anula o lote produzido inteiro, com
-- motivo, uma vez, enquanto o integral não teve nenhum movimento (consumo, descarte, porcionamento ou
-- mudança de local). Na mesma transação: um registro em production_voids e um movimento
-- 'production_void' que zera o saldo do integral. Depois do primeiro movimento, o caminho é o descarte
-- com motivo. Nada aqui é desfeito por "Anular registro".
--   * Tipo de movimento novo: atualizado nos três lugares da D-038 (container_balance,
--     apply_movement_to_balance, stock_conservation_problems).

-- 1) Registro da anulação (append-only) -----------------------------------------------------------------
create table public.production_voids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null unique,
  reason text not null check (
    length(reason) between 1 and 300
    and reason = btrim(reason, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  intent_id uuid not null,
  timezone text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint production_voids_intent_key unique (organization_id, establishment_id, intent_id),
  constraint production_voids_id_batch_key unique (id, batch_id),
  -- Só lote produzido tem anulação de produção (batch_productions existe só para origem 'produced').
  constraint production_voids_production_fk foreign key (batch_id) references public.batch_productions (batch_id),
  constraint production_voids_batch_fk foreign key (organization_id, establishment_id, batch_id)
    references public.batch_receipts (organization_id, establishment_id, id)
);
create index production_voids_created_by_idx on public.production_voids (created_by);
alter table public.production_voids enable row level security;
revoke all on public.production_voids from public, anon, authenticated, service_role;
grant select on public.production_voids to authenticated, service_role;
create policy production_voids_read on public.production_voids for select to authenticated
  using (organization_id in (select private.member_organizations()));
create trigger production_voids_append_only before update or delete or truncate on public.production_voids
  for each statement execute function private.reject_history_change();
alter table public.production_voids enable always trigger production_voids_append_only;

-- 2) Movimento que zera o integral ------------------------------------------------------------------------
alter table public.stock_movements add column production_void_id uuid;
alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check
  check (kind = any (array['consumption'::text, 'discard'::text, 'reversal'::text, 'transfer'::text,
                           'transfer_reversal'::text, 'handling_void'::text, 'production_void'::text]));
alter table public.stock_movements drop constraint stock_movements_handling_check;
alter table public.stock_movements add constraint stock_movements_handling_check check (
  (kind = 'transfer' and handling_id is not null and reason is null and reverses_id is null and handling_void_id is null) or
  (kind = 'discard' and handling_void_id is null) or
  (kind = 'consumption' and handling_id is null and handling_void_id is null) or
  (kind = 'reversal' and (handling_id is null) = (handling_void_id is null)) or
  (kind = 'transfer_reversal' and handling_id is not null and handling_void_id is not null) or
  (kind = 'handling_void' and handling_id is null and handling_void_id is not null and reason is not null) or
  (kind = 'production_void' and handling_id is null and handling_void_id is null and reverses_id is null and reason is not null));
alter table public.stock_movements add constraint stock_movements_production_void_check
  check ((kind = 'production_void') = (production_void_id is not null));
-- O movimento pertence à anulação do mesmo lote.
alter table public.stock_movements add constraint stock_movements_production_void_fk
  foreign key (production_void_id, batch_id) references public.production_voids (id, batch_id);
create unique index stock_movements_one_production_void_idx on public.stock_movements (production_void_id)
  where kind = 'production_void';
create index stock_movements_production_void_idx on public.stock_movements (production_void_id)
  where production_void_id is not null;

-- O movimento de anulação de produção só vai para o integral do lote.
create function private.check_production_void_container()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'production_void' and not exists (
       select 1 from public.containers c where c.id = new.container_id and c.batch_id = new.batch_id and c.kind = 'integral') then
    raise exception 'Anulação de produção só zera o recipiente integral do lote.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_production_void_container() from public, anon, authenticated, service_role;
create trigger stock_movements_check_production_void before insert on public.stock_movements
  for each row execute function private.check_production_void_container();
alter table public.stock_movements enable always trigger stock_movements_check_production_void;

-- 3) Regras de saldo com o tipo novo (D-038: nos três lugares) --------------------------------------------
create or replace function private.container_balance(p_container_id uuid)
returns numeric language sql stable set search_path = '' as $$
  select c.initial_quantity - coalesce(sum(case when m.kind in ('consumption', 'discard', 'transfer', 'handling_void', 'production_void') then m.quantity
                                                 when m.kind in ('reversal', 'transfer_reversal') then -m.quantity end), 0)
    from public.containers c
    left join public.stock_movements m on m.organization_id = c.organization_id
      and m.establishment_id = c.establishment_id and m.batch_id = c.batch_id and m.container_id = c.id
   where c.id = p_container_id
   group by c.id, c.initial_quantity;
$$;

do $$
declare v_def text; v_new text;
begin
  -- apply_movement_to_balance: a anulação de produção baixa o saldo como as outras saídas.
  select pg_get_functiondef('private.apply_movement_to_balance()'::regprocedure) into v_def;
  v_new := replace(v_def, 'new.kind in (''consumption'', ''discard'', ''transfer'', ''handling_void'') then -new.quantity',
                          'new.kind in (''consumption'', ''discard'', ''transfer'', ''handling_void'', ''production_void'') then -new.quantity');
  if v_new = v_def then
    raise exception 'Não foi possível incluir production_void em apply_movement_to_balance.' using errcode = '55000';
  end if;
  execute v_new;

  -- stock_conservation_problems: tipo conhecido e, por lote, a anulação de produção entra como saída.
  select pg_get_functiondef('private.stock_conservation_problems()'::regprocedure) into v_def;
  v_new := replace(v_def, 'm.kind not in (''consumption'', ''discard'', ''reversal'', ''transfer'', ''transfer_reversal'', ''handling_void'')',
                          'm.kind not in (''consumption'', ''discard'', ''reversal'', ''transfer'', ''transfer_reversal'', ''handling_void'', ''production_void'')');
  v_new := replace(v_new, 'select sum(case when m.kind in (''consumption'', ''discard'') then m.quantity',
                          'select sum(case when m.kind in (''consumption'', ''discard'', ''production_void'') then m.quantity');
  if v_new not like '%''handling_void'', ''production_void'')%' or v_new not like '%''discard'', ''production_void'') then m.quantity%' then
    raise exception 'Não foi possível incluir production_void em stock_conservation_problems.' using errcode = '55000';
  end if;
  execute v_new;

  -- reverse_movement: a anulação de produção não é desfeita por "Anular registro".
  select pg_get_functiondef('private.reverse_movement(uuid, uuid, uuid, text, uuid)'::regprocedure) into v_def;
  v_new := replace(v_def, 'v_original.kind in (''transfer'',''transfer_reversal'',''handling_void'')',
                          'v_original.kind in (''transfer'',''transfer_reversal'',''handling_void'',''production_void'')');
  if v_new = v_def then
    raise exception 'Não foi possível proteger production_void em reverse_movement.' using errcode = '55000';
  end if;
  execute v_new;
end;
$$;

-- Coerência da anulação de produção (pgTAP). Vazio = tudo certo.
create or replace function private.production_problems()
returns table (batch_id uuid, problem text) language sql stable set search_path = '' as $$
  select b.id, 'lote produzido sem registro de produção'
    from public.batch_receipts b
   where b.origin = 'produced' and not exists (select 1 from public.batch_productions p where p.batch_id = b.id)
  union all
  select p.batch_id, 'registro de produção em lote que não é produzido'
    from public.batch_productions p join public.batch_receipts b on b.id = p.batch_id
   where b.origin <> 'produced'
  union all
  select b.id, 'lote de origem diferente do tipo do item do catálogo'
    from public.batch_receipts b join public.products pr on pr.id = b.product_id
   where (b.origin = 'received') <> (pr.kind = 'product')
  union all
  -- 7.2: lote anulado tem exatamente um movimento de anulação, com toda a quantidade, e saldo zero.
  select v.batch_id, 'produção anulada sem exatamente um movimento de anulação com a quantidade do lote'
    from public.production_voids v join public.batch_receipts b on b.id = v.batch_id
   where (select count(*) from public.stock_movements m
           where m.production_void_id = v.id and m.kind = 'production_void' and m.quantity = b.quantity) <> 1
  union all
  select v.batch_id, 'produção anulada com saldo restante'
    from public.production_voids v join public.containers c on c.batch_id = v.batch_id
   where private.container_balance(c.id) <> 0
  union all
  select m.batch_id, 'movimento de anulação de produção sem anulação registrada: ' || m.id
    from public.stock_movements m
   where m.kind = 'production_void' and not exists (select 1 from public.production_voids v where v.id = m.production_void_id);
$$;
revoke all on function private.production_problems() from public, anon, authenticated, service_role;

-- 4) Anular produção ------------------------------------------------------------------------------------
create function private.void_production(
  p_organization_id uuid, p_establishment_id uuid, p_batch_id uuid, p_reason text, p_intent_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_reason text := private.visible_text(p_reason);
  v_batch public.batch_receipts%rowtype;
  v_existing public.production_voids%rowtype;
  v_container uuid;
  v_id uuid;
begin
  -- Autorização: proprietário ativo (D-019).
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_intent_id is null or p_batch_id is null or v_reason is null or length(v_reason) > 300 then
    raise exception 'Informe o motivo da anulação.' using errcode = '22023';
  end if;

  -- Lote no escopo, bloqueado: serializa com consumo, descarte, porcionamento e mudança de local.
  select * into v_batch from public.batch_receipts b
   where b.organization_id = p_organization_id and b.establishment_id = p_establishment_id and b.id = p_batch_id
   for update;
  if not found then
    raise exception 'Lote não encontrado.' using errcode = '23503';
  end if;

  -- Replay: mesmo lote, mesmo motivo, mesmo autor. Antes das regras de estado.
  select * into v_existing from public.production_voids v
   where v.organization_id = p_organization_id and v.establishment_id = p_establishment_id and v.intent_id = p_intent_id;
  if found then
    if v_existing.batch_id is distinct from p_batch_id or v_existing.reason is distinct from v_reason
       or v_existing.created_by is distinct from v_user then
      raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  if (select count(*) from public.find_operation(p_organization_id, p_establishment_id, p_intent_id)) > 0 then
    raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
  end if;

  if v_batch.origin <> 'produced' then
    raise exception 'Só lote produzido pela cozinha é anulado por aqui; recebimento usa o descarte com motivo.' using errcode = '22023';
  end if;
  if exists (select 1 from public.production_voids v where v.batch_id = p_batch_id) then
    raise exception 'Esta produção já foi anulada.' using errcode = '22023';
  end if;
  -- Regra estrita (como a D-040): nenhum movimento, manipulação ou mudança de local no lote.
  if exists (select 1 from public.stock_movements m where m.batch_id = p_batch_id)
     or exists (select 1 from public.container_handlings h where h.batch_id = p_batch_id)
     or exists (select 1 from public.location_moves lm where lm.batch_id = p_batch_id) then
    raise exception 'A produção já teve consumo, descarte, porcionamento ou mudança de local: não pode ser anulada. Use o descarte com motivo.'
      using errcode = '22023';
  end if;

  select c.id into strict v_container from public.containers c where c.batch_id = p_batch_id and c.kind = 'integral';
  insert into public.production_voids (organization_id, establishment_id, batch_id, reason, intent_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, p_batch_id, v_reason, p_intent_id, v_batch.timezone, v_user)
  returning id into v_id;
  insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, intent_id, kind, quantity,
    reason, production_void_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, p_batch_id, v_container, gen_random_uuid(), 'production_void',
    v_batch.quantity, v_reason, v_id, v_batch.timezone, v_user);
  return v_id;
end;
$$;
revoke all on function private.void_production(uuid, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.void_production(uuid, uuid, uuid, text, uuid) to authenticated;
create function public.void_production(
  p_organization_id uuid, p_establishment_id uuid, p_batch_id uuid, p_reason text, p_intent_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.void_production(p_organization_id, p_establishment_id, p_batch_id, p_reason, p_intent_id);
$$;
revoke all on function public.void_production(uuid, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.void_production(uuid, uuid, uuid, text, uuid) to authenticated;

-- 5) Recuperação de tentativa (D-045) -------------------------------------------------------------------
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.find_operation(uuid, uuid, uuid)'::regprocedure) into v_def;
  v_new := replace(v_def, '    ) found',
    '      union all
      select ''production_void'', pv.id, pv.created_at, 8
        from public.production_voids pv
       where pv.organization_id = p_organization_id and pv.establishment_id = p_establishment_id
         and pv.intent_id = p_intent_id
    ) found');
  if v_new = v_def then
    raise exception 'Não foi possível incluir a anulação de produção em find_operation.' using errcode = '55000';
  end if;
  execute v_new;
end;
$$;

-- 6) Proteção do histórico passa a incluir production_voids --------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef('private.assert_history_protected()'::regprocedure) into v_def;
  v_def := regexp_replace(v_def, '(array\[[^\]]*''batch_productions''[^\]]*)\]', '\1, ''production_voids'']', 'g');
  if v_def not like '%production_voids%' then
    raise exception 'Não foi possível incluir production_voids na proteção do histórico.' using errcode = '55000';
  end if;
  execute v_def;
end;
$$;
revoke all on function private.assert_history_protected() from public, anon, authenticated, service_role;

do $$
begin
  perform private.assert_history_protected();
  if exists (select 1 from private.production_problems()) or exists (select 1 from private.stock_conservation_problems()) then
    raise exception 'Coerência de produção ou de saldo quebrada pela migração.' using errcode = '55000';
  end if;
end;
$$;
