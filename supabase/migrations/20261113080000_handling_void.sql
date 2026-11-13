-- Fase 6, fatia 6.4: anulação de manipulação no banco (FASE_06_DESENHO.md 4.3, 4.10, 5, 5.4, 6 e
-- seção 10; revisão cruzada I-9). Sem tela nova: a anulação na tela é da 6.6.
--
-- O histórico é append-only desde a 6.0a, então anular uma manipulação é um registro novo
-- (handling_voids) mais eventos de saldo, todos na mesma transação e com o recebimento bloqueado:
--   * 'transfer_reversal' na origem, com reverses_id da transferência: devolve a quantidade;
--   * 'handling_void' em cada derivado, com a quantidade inicial dele: zera o saldo;
--   * se a sobra foi descartada, a anulação desse descarte ('reversal' com a manipulação).
-- A fórmula de saldo não ganha exceção: a devolução e as saídas dos derivados se cancelam na soma do
-- recebimento, como a transferência e os derivados já se cancelavam (4.3, I-9).
-- Condição: nenhum derivado teve qualquer movimento (consumo, descarte, anulação, manipulação). A origem
-- volta com a validade dela, mesmo vencida (o painel mostra vencida). Só o proprietário anula (D-019).
-- Nenhum dado existente muda; sem backfill, nenhum gatilho de proteção é suspenso.
-- Nada aqui afirma conformidade sanitária.

-- 1) Anulações de manipulação (4.10) ------------------------------------------------------------------
create table public.handling_voids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null,
  handling_id uuid not null,
  reason text not null check (
    length(reason) between 1 and 500
    and reason = btrim(reason, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  intent_id uuid not null,
  timezone text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- Uma anulação por manipulação; anular de novo é recusado pelo banco, não só pela função.
  constraint handling_voids_handling_key unique (handling_id),
  constraint handling_voids_intent_key unique (organization_id, establishment_id, intent_id),
  constraint handling_voids_id_handling_key unique (id, handling_id),
  -- Mesma empresa, unidade e recebimento da manipulação.
  constraint handling_voids_handling_fk foreign key (organization_id, establishment_id, batch_id, handling_id)
    references public.container_handlings (organization_id, establishment_id, batch_id, id)
);
create index handling_voids_scope_idx on public.handling_voids (organization_id, establishment_id, batch_id);
create index handling_voids_created_by_idx on public.handling_voids (created_by);
alter table public.handling_voids enable row level security;
revoke all on public.handling_voids from public, anon, authenticated, service_role;
grant select on public.handling_voids to authenticated, service_role;
create policy handling_voids_read on public.handling_voids for select to authenticated
  using (organization_id in (select private.member_organizations()));
create trigger handling_voids_append_only before update or delete or truncate on public.handling_voids
  for each statement execute function private.reject_history_change();
alter table public.handling_voids enable always trigger handling_voids_append_only;

-- 2) Eventos de anulação em stock_movements (4.3) ---------------------------------------------------
-- handling_void_id: a anulação que gerou o evento (devolução, saída do derivado, anulação do descarte de
-- sobra). derived_handling_id: só em 'handling_void', a manipulação que criou o derivado, para a FK
-- conferir que o recipiente é mesmo derivado da manipulação anulada (handling_id fica nulo nesse caso,
-- porque a FK da 6.3 obriga handling_id a apontar para a origem).
alter table public.stock_movements add column handling_void_id uuid, add column derived_handling_id uuid;
alter table public.stock_movements add constraint stock_movements_id_handling_key unique (id, handling_id);

alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check
  check (kind = any (array['consumption'::text, 'discard'::text, 'reversal'::text, 'transfer'::text,
                           'transfer_reversal'::text, 'handling_void'::text]));
-- A devolução também aponta o movimento que desfaz (a transferência) e tem motivo (o da anulação).
alter table public.stock_movements drop constraint stock_movements_reversal_check;
alter table public.stock_movements add constraint stock_movements_reversal_check check (
  (kind in ('reversal', 'transfer_reversal') and reverses_id is not null and reason is not null) or
  (kind not in ('reversal', 'transfer_reversal') and reverses_id is null));
alter table public.stock_movements drop constraint stock_movements_handling_check;
alter table public.stock_movements add constraint stock_movements_handling_check check (
  (kind = 'transfer' and handling_id is not null and reason is null and reverses_id is null and handling_void_id is null) or
  (kind = 'discard' and handling_void_id is null) or                         -- com handling_id: descarte de sobra
  (kind = 'consumption' and handling_id is null and handling_void_id is null) or
  -- Anulação comum (sem manipulação) ou anulação do descarte de sobra pela anulação da manipulação.
  (kind = 'reversal' and (handling_id is null) = (handling_void_id is null)) or
  (kind = 'transfer_reversal' and handling_id is not null and handling_void_id is not null) or
  (kind = 'handling_void' and handling_id is null and handling_void_id is not null and reason is not null));
alter table public.stock_movements add constraint stock_movements_derived_handling_check
  check ((kind = 'handling_void') = (derived_handling_id is not null));
alter table public.stock_movements
  -- Devolução e anulação do descarte de sobra pertencem à anulação da mesma manipulação.
  add constraint stock_movements_handling_void_fk foreign key (handling_void_id, handling_id)
    references public.handling_voids (id, handling_id),
  -- A saída do derivado pertence à anulação da manipulação que criou o derivado ...
  add constraint stock_movements_handling_void_derived_fk foreign key (handling_void_id, derived_handling_id)
    references public.handling_voids (id, handling_id),
  -- O movimento desfeito pela anulação da manipulação é da mesma manipulação (transferência ou descarte
  -- de sobra). Em anulações comuns handling_id é nulo e esta FK não se aplica.
  add constraint stock_movements_reverses_handling_fk foreign key (reverses_id, handling_id)
    references public.stock_movements (id, handling_id);
-- ... e o recipiente é mesmo um derivado dessa manipulação. Conferido por gatilho, não por FK: uma
-- segunda FK de stock_movements para containers tornaria ambígua a junção containers(...) da API
-- (PGRST201), usada pelo histórico de movimentações. Recipientes são append-only, então conferir na
-- inserção basta.
create function private.check_handling_void_container()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Sem a manipulação do derivado, quem recusa é a restrição de forma (23514).
  if new.kind = 'handling_void' and new.derived_handling_id is not null and not exists (
       select 1 from public.containers c where c.id = new.container_id and c.handling_id = new.derived_handling_id) then
    raise exception 'Saída de anulação em recipiente que não é derivado da manipulação anulada.' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function private.check_handling_void_container() from public, anon, authenticated, service_role;
create trigger stock_movements_check_handling_void before insert on public.stock_movements
  for each row execute function private.check_handling_void_container();
alter table public.stock_movements enable always trigger stock_movements_check_handling_void;
create unique index stock_movements_one_transfer_reversal_idx on public.stock_movements (handling_id) where kind = 'transfer_reversal';
create unique index stock_movements_one_handling_void_idx on public.stock_movements (container_id) where kind = 'handling_void';
create index stock_movements_handling_void_idx on public.stock_movements (handling_void_id) where handling_void_id is not null;
create index stock_movements_reverses_handling_idx on public.stock_movements (reverses_id, handling_id) where handling_id is not null;

-- 3) Regras de saldo com os dois tipos novos (D-038: nos três lugares) -------------------------------
create or replace function private.container_balance(p_container_id uuid)
returns numeric language sql stable set search_path = '' as $$
  select c.initial_quantity - coalesce(sum(case when m.kind in ('consumption', 'discard', 'transfer', 'handling_void') then m.quantity
                                                 when m.kind in ('reversal', 'transfer_reversal') then -m.quantity end), 0)
    from public.containers c
    left join public.stock_movements m on m.organization_id = c.organization_id
      and m.establishment_id = c.establishment_id and m.batch_id = c.batch_id and m.container_id = c.id
   where c.id = p_container_id
   group by c.id, c.initial_quantity;
$$;

create or replace function private.apply_movement_to_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_delta numeric;
begin
  v_delta := case when new.kind in ('consumption', 'discard', 'transfer', 'handling_void') then -new.quantity
                  when new.kind in ('reversal', 'transfer_reversal') then new.quantity end;
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

-- Conservação (4.3): a soma por recebimento não muda (devolução e saídas dos derivados se cancelam;
-- a anulação do descarte de sobra é uma anulação como as outras). Por manipulação anulada: a soma dos
-- saldos dos derivados é zero, a devolução é igual à transferência, cada derivado tem exatamente uma
-- saída de anulação com a quantidade inicial dele, e o descarte de sobra (se houve) foi anulado.
create or replace function private.stock_conservation_problems()
returns table (batch_id uuid, problem text) language sql stable set search_path = '' as $$
  with balances as (
    select c.batch_id, c.id, private.container_balance(c.id) as balance from public.containers c
  )
  select b.id, 'recebimento sem exatamente um recipiente integral'
    from public.batch_receipts b
   where (select count(*) from public.containers c where c.batch_id = b.id and c.kind = 'integral') <> 1
  union all
  select c.batch_id, 'integral difere do recebimento: ' || c.id
    from public.containers c join public.batch_receipts b on b.id = c.batch_id
   where c.kind = 'integral' and (c.initial_quantity <> b.quantity or c.expiry_date <> b.expiry_date or c.timezone <> b.timezone)
  union all
  select batch_id, 'saldo negativo no recipiente ' || id from balances where balance < 0
  union all
  select m.batch_id, 'tipo de movimento sem regra de saldo: ' || m.kind
    from public.stock_movements m
   where m.kind not in ('consumption', 'discard', 'reversal', 'transfer', 'transfer_reversal', 'handling_void')
  union all
  select b.id, 'soma dos saldos dos recipientes difere de recebimento − saídas + anulações'
    from public.batch_receipts b
   where (select sum(x.balance) from balances x where x.batch_id = b.id)
         is distinct from b.quantity - coalesce((
           select sum(case when m.kind in ('consumption', 'discard') then m.quantity
                           when m.kind = 'reversal' then -m.quantity else 0 end)
             from public.stock_movements m
            where m.organization_id = b.organization_id and m.establishment_id = b.establishment_id
              and m.batch_id = b.id), 0)
  union all
  select c.batch_id, 'derivado sem transferência da origem: ' || c.id
    from public.containers c
   where c.kind = 'derived'
     and not exists (select 1 from public.stock_movements m where m.handling_id = c.handling_id and m.kind = 'transfer')
  union all
  select h.batch_id, 'manipulação com derivados, transferência ou sobra divergentes: ' || h.id
    from public.container_handlings h
   where h.total_quantity is distinct from (select sum(c.initial_quantity) from public.containers c where c.handling_id = h.id)
      or h.total_quantity is distinct from (select sum(m.quantity) from public.stock_movements m where m.handling_id = h.id and m.kind = 'transfer')
      or (select count(*) from public.containers c where c.handling_id = h.id)
         <> h.portion_count + case when h.remainder = 'portion' then 1 else 0 end
      or (h.remainder = 'portion') is distinct from exists (
           select 1 from public.containers c where c.handling_id = h.id and c.position = h.portion_count + 1
              and c.initial_quantity = h.remainder_quantity)
      or coalesce((select sum(m.quantity) from public.stock_movements m where m.handling_id = h.id and m.kind = 'discard'), 0)
         is distinct from case when h.remainder = 'discarded' then h.remainder_quantity else 0 end
  union all
  select h.batch_id, 'manipulação anulada com devolução, derivados ou descarte de sobra divergentes: ' || h.id
    from public.container_handlings h join public.handling_voids v on v.handling_id = h.id
   where coalesce((select sum(x.balance) from balances x join public.containers c on c.id = x.id where c.handling_id = h.id), 0) <> 0
      or h.total_quantity is distinct from (
           select sum(m.quantity) from public.stock_movements m
            where m.handling_void_id = v.id and m.kind = 'transfer_reversal'
              and m.reverses_id = (select t.id from public.stock_movements t where t.handling_id = h.id and t.kind = 'transfer'))
      or exists (
           select 1 from public.containers c where c.handling_id = h.id
              and (select count(*) from public.stock_movements m
                    where m.container_id = c.id and m.kind = 'handling_void' and m.handling_void_id = v.id
                      and m.quantity = c.initial_quantity) <> 1)
      or (h.remainder = 'discarded') is distinct from exists (
           select 1 from public.stock_movements m
            where m.handling_void_id = v.id and m.kind = 'reversal'
              and m.reverses_id = (select d.id from public.stock_movements d where d.handling_id = h.id and d.kind = 'discard'))
  union all
  select m.batch_id, 'evento de anulação de manipulação sem anulação registrada: ' || m.id
    from public.stock_movements m
   where m.kind in ('transfer_reversal', 'handling_void') and m.handling_void_id is null;
$$;

-- 4) Anulação comum não toca em eventos de manipulação nem de anulação de manipulação --------------
create or replace function private.reverse_movement(p_organization_id uuid,p_establishment_id uuid,p_movement_id uuid,p_reason text,p_intent_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_original public.stock_movements%rowtype; v_existing public.stock_movements%rowtype; v_batch_id uuid; v_reason text:=nullif(btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),''); v_timezone text; v_id uuid;
begin
 if v_user is null or not private.has_membership(p_organization_id,true) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_intent_id is null or v_reason is null or length(v_reason)>500 then raise exception 'Motivo ou identificador inválido.' using errcode='22023'; end if;
 select batch_id into v_batch_id from public.stock_movements where id=p_movement_id and organization_id=p_organization_id and establishment_id=p_establishment_id;
 if not found then raise exception 'Movimento não encontrado.' using errcode='23503'; end if;
 perform 1 from public.batch_receipts where id=v_batch_id and organization_id=p_organization_id and establishment_id=p_establishment_id for update;
 select * into strict v_original from public.stock_movements where id=p_movement_id and organization_id=p_organization_id and establishment_id=p_establishment_id and batch_id=v_batch_id;
 if v_original.kind='reversal' then raise exception 'Estorno de estorno não é permitido.' using errcode='22023'; end if;
 if v_original.kind in ('transfer','transfer_reversal','handling_void') or v_original.handling_id is not null or v_original.handling_void_id is not null then raise exception 'Movimento de manipulação só é desfeito pela anulação da manipulação.' using errcode='22023'; end if;
 select * into v_existing from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id;
 if found then
   if v_existing.kind is distinct from 'reversal' or v_existing.reverses_id is distinct from p_movement_id or v_existing.created_by is distinct from v_user or v_existing.reason is distinct from v_reason then raise exception 'Identificador já utilizado com outros dados.' using errcode='23505'; end if;
   return v_existing.id;
 end if;
 -- I-3: o identificador de uma manipulação ou de uma anulação de manipulação não vira anulação comum.
 if exists(select 1 from public.container_handlings where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id)
    or exists(select 1 from public.handling_voids where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id) then
   raise exception 'Identificador já utilizado com outros dados.' using errcode='23505';
 end if;
 if exists(select 1 from public.stock_movements where reverses_id=p_movement_id) then raise exception 'Movimento já estornado.' using errcode='23505'; end if;
 select timezone into strict v_timezone from public.establishments where organization_id=p_organization_id and id=p_establishment_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by,reverses_id) values(p_organization_id,p_establishment_id,v_batch_id,v_original.container_id,p_intent_id,'reversal',v_original.quantity,v_reason,v_timezone,v_user,p_movement_id) returning id into v_id;
 return v_id;
end;
$$;

-- 5) void_handling (5.4) ------------------------------------------------------------------------------
-- Ordem (I-4): autorização → forma → manipulação no escopo → bloqueio do recebimento → replay → estado.
create function private.void_handling(
  p_organization_id uuid, p_establishment_id uuid, p_handling_id uuid, p_reason text, p_intent_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_reason text := private.visible_text(p_reason);
  v_handling public.container_handlings%rowtype;
  v_existing public.handling_voids%rowtype;
  v_transfer public.stock_movements%rowtype;
  v_discard public.stock_movements%rowtype;
  v_derived record;
  v_id uuid;
begin
  -- Autorização: proprietário ativo (D-019).
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  -- Forma.
  if p_intent_id is null or p_handling_id is null or v_reason is null or length(v_reason) > 500 then
    raise exception 'Motivo ou identificador inválido.' using errcode = '22023';
  end if;

  -- Manipulação no escopo (mesma mensagem para inexistente, outra unidade e outra empresa).
  select * into v_handling from public.container_handlings h
   where h.organization_id = p_organization_id and h.establishment_id = p_establishment_id and h.id = p_handling_id;
  if not found then
    raise exception 'Manipulação não encontrada.' using errcode = '23503';
  end if;

  -- Bloqueio do recebimento: serializa com baixas, manipulações e anulações do mesmo lote.
  perform 1 from public.batch_receipts b
   where b.organization_id = p_organization_id and b.establishment_id = p_establishment_id and b.id = v_handling.batch_id
   for update;

  -- Replay antes das regras de estado: o reenvio depois de anular devolve o mesmo ID.
  select * into v_existing from public.handling_voids v
   where v.organization_id = p_organization_id and v.establishment_id = p_establishment_id and v.intent_id = p_intent_id;
  if found then
    if v_existing.handling_id is distinct from p_handling_id or v_existing.created_by is distinct from v_user
       or v_existing.reason is distinct from v_reason then
      raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  -- I-3: o identificador de uma baixa, anulação ou manipulação não vira anulação de manipulação.
  if exists (select 1 from public.stock_movements m
              where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id and m.intent_id = p_intent_id)
     or exists (select 1 from public.container_handlings h
              where h.organization_id = p_organization_id and h.establishment_id = p_establishment_id and h.intent_id = p_intent_id) then
    raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
  end if;

  -- Estado.
  if exists (select 1 from public.handling_voids v where v.handling_id = p_handling_id) then
    raise exception 'Manipulação já anulada.' using errcode = '23505';
  end if;
  -- Nenhum derivado teve movimento: consumo, descarte, anulação ou transferência de nova manipulação.
  if exists (select 1 from public.stock_movements m join public.containers c on c.id = m.container_id
              where c.handling_id = p_handling_id) then
    raise exception 'Algum recipiente desta manipulação já teve movimentação; a manipulação não pode ser anulada.'
      using errcode = '22023';
  end if;

  select * into strict v_transfer from public.stock_movements m where m.handling_id = p_handling_id and m.kind = 'transfer';

  -- Gravação, tudo na mesma transação. A devolução usa o identificador da anulação (como a transferência
  -- usa o da manipulação); os demais eventos recebem identificadores próprios.
  insert into public.handling_voids (organization_id, establishment_id, batch_id, handling_id, reason, intent_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_handling.batch_id, p_handling_id, v_reason, p_intent_id, v_handling.timezone, v_user)
  returning id into v_id;

  insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, handling_id,
    handling_void_id, intent_id, kind, quantity, reason, reverses_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_handling.batch_id, v_handling.source_container_id, p_handling_id,
    v_id, p_intent_id, 'transfer_reversal', v_transfer.quantity, v_reason, v_transfer.id, v_handling.timezone, v_user);

  if v_handling.remainder = 'discarded' then
    select * into strict v_discard from public.stock_movements m where m.handling_id = p_handling_id and m.kind = 'discard';
    insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, handling_id,
      handling_void_id, intent_id, kind, quantity, reason, reverses_id, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_handling.batch_id, v_handling.source_container_id, p_handling_id,
      v_id, gen_random_uuid(), 'reversal', v_discard.quantity, v_reason, v_discard.id, v_handling.timezone, v_user);
  end if;

  for v_derived in
    select c.id, c.initial_quantity from public.containers c where c.handling_id = p_handling_id order by c.position
  loop
    insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, derived_handling_id,
      handling_void_id, intent_id, kind, quantity, reason, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_handling.batch_id, v_derived.id, p_handling_id,
      v_id, gen_random_uuid(), 'handling_void', v_derived.initial_quantity, v_reason, v_handling.timezone, v_user);
  end loop;
  return v_id;
end;
$$;
revoke all on function private.void_handling(uuid, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.void_handling(uuid, uuid, uuid, text, uuid) to authenticated;
create function public.void_handling(
  p_organization_id uuid, p_establishment_id uuid, p_handling_id uuid, p_reason text, p_intent_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.void_handling(p_organization_id, p_establishment_id, p_handling_id, p_reason, p_intent_id);
$$;
revoke all on function public.void_handling(uuid, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.void_handling(uuid, uuid, uuid, text, uuid) to authenticated;

-- 6) Proteção do histórico com a tabela nova (lista fixa, D-033) ----------------------------------
create or replace function private.assert_history_protected()
returns void language plpgsql set search_path = '' as $$
declare
  v_problems text;
begin
  select string_agg(problem, '; ' order by problem) into v_problems
  from (
    select t.name || ': gatilho de proteção ausente, desabilitado ou incompleto' as problem
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes', 'container_handlings', 'handling_voids']) as t(name)
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
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes', 'container_handlings', 'handling_voids']) as t(name)
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

-- 7) Verificações finais -----------------------------------------------------------------------------
do $$
declare v_problems text;
begin
  perform private.assert_history_protected();
  select string_agg(batch_id || ': ' || problem, '; ' order by batch_id, problem) into v_problems
    from (select * from private.stock_conservation_problems() limit 20) p;
  if v_problems is not null then
    raise exception 'Conservação do estoque falhou: %', v_problems using errcode = '55000';
  end if;
  if exists (select 1 from private.container_balance_problems()) then
    raise exception 'Saldo registrado difere do histórico; migração desfeita.' using errcode = '55000';
  end if;
end;
$$;
