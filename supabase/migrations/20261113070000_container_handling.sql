-- Fase 6, fatia 6.3: manipulação no banco (FASE_06_DESENHO.md 3, 4.1, 4.2, 4.3, 4.5, 5, 5.1, 6 e
-- seção 10; revisão cruzada B-2, I-2, I-3, I-4, I-10b, I-12). Sem tela nova: só o banco e a leitura.
--
-- Manipulação = operação única e auditada que retira saldo de um recipiente de origem e cria
-- recipientes derivados do MESMO recebimento:
--   * abertura (opening): um derivado;
--   * porcionamento (portioning): 2 a 20 porções, mais uma porção de sobra opcional (posição 21).
-- Nada cria estoque: a soma dos derivados sai da origem como um movimento 'transfer', com o mesmo
-- intent_id da manipulação (I-3). A sobra (saldo − porções) tem tratamento obrigatório:
--   * 'sealed'    fica na origem, só se a origem é o integral e a pessoa confirma que continua fechada;
--   * 'discard'   vira um 'discard' na origem, na mesma transação, com motivo;
--   * 'portion'   vira mais uma porção (só no porcionamento).
-- Validade após abertura nunca posterior à da origem (CHECK, também com congelamento), origem vencida
-- não é manipulada, handled_at (hora real) separado de created_at com janela de 2 horas: fora dela,
-- nesta fatia, a manipulação é recusada; a ocorrência tardia chega na 6.5a (D-031).
-- handled_by (quem manipulou, vínculo ativo validado pelo banco) separado de created_by (proprietário
-- que registrou, D-019), com cópia do nome de exibição.
--
-- Nenhum dado existente muda: não há derivados reais antes desta fatia (não havia como criá-los pela
-- aplicação), e todas as colunas novas são anuláveis nos integrais. Sem backfill, nenhum gatilho de
-- proteção é suspenso. As verificações finais (proteção, conservação e saldo) rodam no fim.
-- Nada aqui afirma conformidade sanitária.

-- 0) Texto visível ---------------------------------------------------------------------------------
-- Mesmo conjunto de espaços invisíveis de PR #2 (String.prototype.trim do navegador). Usada só dentro
-- das funções SECURITY DEFINER; os CHECK repetem a expressão para não depender de EXECUTE.
create function private.visible_text(p_value text)
returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(p_value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '');
$$;
revoke all on function private.visible_text(text) from public, anon, authenticated, service_role;

-- Janela provisória entre a manipulação real (handled_at) e o registro (D-031). Um único lugar.
create function private.handling_late_window()
returns interval language sql immutable set search_path = '' as $$ select interval '2 hours' $$;
revoke all on function private.handling_late_window() from public, anon, authenticated, service_role;

-- 1) Nome de exibição (Q7, 4.5) ----------------------------------------------------------------------
alter table public.memberships add column display_name text;
alter table public.memberships add constraint memberships_display_name_check check (
  display_name is null or (
    length(display_name) between 1 and 40
    and display_name = btrim(display_name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')));

-- Auditoria do nome em entity_changes (já reservada pela 6.0c), por qualquer caminho de escrita.
create function private.log_membership_display_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.display_name is distinct from old.display_name then
    insert into public.entity_changes(organization_id, entity, entity_id, field, old_value, new_value, changed_by)
    values (new.organization_id, 'membership', new.id, 'display_name', old.display_name, new.display_name, auth.uid());
  end if;
  return null;
end;
$$;
revoke all on function private.log_membership_display_name() from public, anon, authenticated, service_role;
create trigger log_membership_display_name after update of display_name on public.memberships
  for each row execute function private.log_membership_display_name();

-- Só o proprietário ativo define o nome de um vínculo ativo da própria empresa. Devolve o nome gravado.
create function private.set_member_display_name(p_organization_id uuid, p_user_id uuid, p_display_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_name text := private.visible_text(p_display_name); v_membership public.memberships%rowtype;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_user_id is null or v_name is null or length(v_name) > 40 then
    raise exception 'Nome de exibição inválido.' using errcode = '22023';
  end if;
  select * into v_membership from public.memberships m
   where m.organization_id = p_organization_id and m.user_id = p_user_id and m.revoked_at is null
   for update;
  if not found then
    raise exception 'Vínculo não encontrado.' using errcode = '23503';
  end if;
  if v_membership.display_name is distinct from v_name then
    update public.memberships set display_name = v_name where id = v_membership.id;
  end if;
  return v_name;
end;
$$;
revoke all on function private.set_member_display_name(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.set_member_display_name(uuid, uuid, text) to authenticated;
create function public.set_member_display_name(p_organization_id uuid, p_user_id uuid, p_display_name text)
returns text language sql security invoker set search_path = '' as $$
  select private.set_member_display_name(p_organization_id, p_user_id, p_display_name);
$$;
revoke all on function public.set_member_display_name(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_member_display_name(uuid, uuid, text) to authenticated;

-- 2) Manipulações (4.2) ------------------------------------------------------------------------------
-- A validade da origem é copiada e conferida pela FK (id, expiry_date).
alter table public.containers add constraint containers_id_expiry_key unique (id, expiry_date);

create table public.container_handlings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  establishment_id uuid not null,
  batch_id uuid not null,
  source_container_id uuid not null,
  source_expiry_date date not null,
  kind text not null check (kind in ('opening', 'portioning')),
  -- Porções pedidas, sem a porção de sobra: 1 na abertura, 2 a 20 no porcionamento.
  portion_count smallint not null,
  -- Soma dos derivados = quantidade da transferência (função + pgTAP + stock_conservation_problems).
  total_quantity numeric not null check (total_quantity > 0 and total_quantity <= 1000000000 and total_quantity = trunc(total_quantity, 3)),
  -- I-2c: nunca posterior à origem, inclusive com congelamento (Q2).
  expiry_date date not null,
  storage text not null check (storage in ('ambient', 'refrigerated', 'frozen')),
  handled_at timestamptz not null,
  -- 6.3: fora da janela é recusado, então nenhuma manipulação é tardia. A 6.5a troca esta restrição
  -- pela exigência de uma ocorrência 'late_handling'.
  late boolean not null default false check (not late),
  remainder text not null check (remainder in ('none', 'sealed', 'discarded', 'portion')),
  remainder_quantity numeric not null check (remainder_quantity >= 0 and remainder_quantity <= 1000000000 and remainder_quantity = trunc(remainder_quantity, 3)),
  remainder_intent_id uuid,
  handled_by uuid not null,
  handled_by_name text not null check (
    length(handled_by_name) between 1 and 40
    and handled_by_name = btrim(handled_by_name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  note text check (
    note is null or (length(note) between 1 and 200
    and note = btrim(note, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))),
  intent_id uuid not null,
  timezone text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint container_handlings_intent_key unique (organization_id, establishment_id, intent_id),
  constraint container_handlings_scope_batch_id_key unique (organization_id, establishment_id, batch_id, id),
  constraint container_handlings_id_source_key unique (id, source_container_id),
  constraint container_handlings_id_expiry_key unique (id, expiry_date),
  constraint container_handlings_id_storage_key unique (id, storage),
  constraint container_handlings_id_handled_at_key unique (id, handled_at),
  constraint container_handlings_batch_fk foreign key (organization_id, establishment_id, batch_id)
    references public.batch_receipts (organization_id, establishment_id, id),
  -- Origem no mesmo recebimento (e portanto no mesmo escopo).
  constraint container_handlings_source_fk foreign key (organization_id, establishment_id, batch_id, source_container_id)
    references public.containers (organization_id, establishment_id, batch_id, id),
  constraint container_handlings_source_expiry_fk foreign key (source_container_id, source_expiry_date)
    references public.containers (id, expiry_date),
  -- Quem manipulou tem (ou teve) vínculo com a mesma empresa; "ativo" é conferido pela função.
  constraint container_handlings_handled_by_fk foreign key (organization_id, handled_by)
    references public.memberships (organization_id, user_id),
  constraint container_handlings_expiry_not_after_source_check check (expiry_date <= source_expiry_date),
  constraint container_handlings_handled_before_created_check check (handled_at <= created_at),
  constraint container_handlings_kind_portions_check check (
    (kind = 'opening' and portion_count = 1 and remainder <> 'portion') or
    (kind = 'portioning' and portion_count between 2 and 20)),
  constraint container_handlings_remainder_shape_check check (
    (remainder = 'none' and remainder_quantity = 0 and remainder_intent_id is null) or
    (remainder in ('sealed', 'portion') and remainder_quantity > 0 and remainder_intent_id is null) or
    (remainder = 'discarded' and remainder_quantity > 0 and remainder_intent_id is not null))
);
create index container_handlings_source_idx on public.container_handlings (organization_id, establishment_id, batch_id, source_container_id);
create index container_handlings_handled_by_idx on public.container_handlings (organization_id, handled_by);
create index container_handlings_created_by_idx on public.container_handlings (created_by);
create index container_handlings_source_expiry_idx on public.container_handlings (source_container_id, source_expiry_date);
alter table public.container_handlings enable row level security;
revoke all on public.container_handlings from public, anon, authenticated, service_role;
grant select on public.container_handlings to authenticated, service_role;
create policy container_handlings_read on public.container_handlings for select to authenticated
  using (organization_id in (select private.member_organizations()));
create trigger container_handlings_append_only before update or delete or truncate on public.container_handlings
  for each statement execute function private.reject_history_change();
alter table public.container_handlings enable always trigger container_handlings_append_only;

-- 3) Derivados (4.1) ---------------------------------------------------------------------------------
-- Colunas anuláveis: nos integrais ficam nulas (a conservação do integral, storage, chega na 6.5a).
alter table public.containers
  add column handling_id uuid,
  add column position smallint,
  add column handled_at timestamptz,
  add column storage text check (storage in ('ambient', 'refrigerated', 'frozen'));
alter table public.containers drop constraint containers_kind_shape_check;
alter table public.containers add constraint containers_kind_shape_check check (
  (kind = 'integral' and parent_container_id is null and expiry_origin = 'receipt'
    and handling_id is null and position is null and handled_at is null) or
  (kind = 'derived' and parent_container_id is not null and parent_container_id <> id and expiry_origin = 'handling'
    and handling_id is not null and position between 1 and 21 and handled_at is not null and storage is not null));
-- I-2a: o pai do derivado é sempre a origem da sua manipulação; validade, conservação e horário são
-- os da manipulação.
alter table public.containers
  add constraint containers_handling_source_fk foreign key (handling_id, parent_container_id)
    references public.container_handlings (id, source_container_id),
  add constraint containers_handling_expiry_fk foreign key (handling_id, expiry_date)
    references public.container_handlings (id, expiry_date),
  add constraint containers_handling_storage_fk foreign key (handling_id, storage)
    references public.container_handlings (id, storage),
  add constraint containers_handling_handled_at_fk foreign key (handling_id, handled_at)
    references public.container_handlings (id, handled_at);
create unique index containers_handling_position_idx on public.containers (handling_id, position) where handling_id is not null;
create index containers_handling_expiry_idx on public.containers (handling_id, expiry_date) where handling_id is not null;
create index containers_handling_storage_idx on public.containers (handling_id, storage) where handling_id is not null;
create index containers_handling_handled_at_idx on public.containers (handling_id, handled_at) where handling_id is not null;

-- 4) Transferência (4.3) -----------------------------------------------------------------------------
alter table public.stock_movements add column handling_id uuid;
alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check
  check (kind = any (array['consumption'::text, 'discard'::text, 'reversal'::text, 'transfer'::text]));
alter table public.stock_movements add constraint stock_movements_handling_check check (
  (kind = 'transfer' and handling_id is not null and reason is null and reverses_id is null) or
  (kind = 'discard') or                                        -- com handling_id: descarte de sobra
  (kind in ('consumption', 'reversal') and handling_id is null));
-- A transferência (e o descarte de sobra) saem sempre da origem da manipulação (I-2a).
alter table public.stock_movements add constraint stock_movements_handling_fk
  foreign key (handling_id, container_id) references public.container_handlings (id, source_container_id);
-- I-2b: uma transferência e no máximo um descarte de sobra por manipulação.
create unique index stock_movements_one_transfer_idx on public.stock_movements (handling_id) where kind = 'transfer';
create unique index stock_movements_one_remainder_idx on public.stock_movements (handling_id) where kind = 'discard' and handling_id is not null;

-- 5) Regras de saldo com 'transfer' (saída da origem) -----------------------------------------------
create or replace function private.container_balance(p_container_id uuid)
returns numeric language sql stable set search_path = '' as $$
  select c.initial_quantity - coalesce(sum(case when m.kind in ('consumption', 'discard', 'transfer') then m.quantity
                                                 when m.kind = 'reversal' then -m.quantity end), 0)
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
  v_delta := case when new.kind in ('consumption', 'discard', 'transfer') then -new.quantity
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

-- Conservação (4.3): a soma dos saldos de todos os recipientes do recebimento continua sendo
-- recebimento − consumos − descartes + anulações (a transferência sai da origem e entra nos derivados,
-- então não aparece na soma). Por manipulação: derivados somam a transferência, que é o total; a
-- contagem de derivados e a sobra batem com o registro.
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
    from public.stock_movements m where m.kind not in ('consumption', 'discard', 'reversal', 'transfer')
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
         is distinct from case when h.remainder = 'discarded' then h.remainder_quantity else 0 end;
$$;

-- 6) Anulação comum não toca em movimentos de manipulação ---------------------------------------
-- Transferência e descarte de sobra só são desfeitos pela anulação da manipulação (6.4, D-032).
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
 if v_original.kind='transfer' or v_original.handling_id is not null then raise exception 'Movimento de manipulação só é desfeito pela anulação da manipulação.' using errcode='22023'; end if;
 select * into v_existing from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id;
 if found then
   if v_existing.kind is distinct from 'reversal' or v_existing.reverses_id is distinct from p_movement_id or v_existing.created_by is distinct from v_user or v_existing.reason is distinct from v_reason then raise exception 'Identificador já utilizado com outros dados.' using errcode='23505'; end if;
   return v_existing.id;
 end if;
 if exists(select 1 from public.stock_movements where reverses_id=p_movement_id) then raise exception 'Movimento já estornado.' using errcode='23505'; end if;
 select timezone into strict v_timezone from public.establishments where organization_id=p_organization_id and id=p_establishment_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by,reverses_id) values(p_organization_id,p_establishment_id,v_batch_id,v_original.container_id,p_intent_id,'reversal',v_original.quantity,v_reason,v_timezone,v_user,p_movement_id) returning id into v_id;
 return v_id;
end;
$$;

-- 7) handle_container (5.1) --------------------------------------------------------------------------
-- Ordem (I-4): autorização → forma → origem no escopo → bloqueio do recebimento → replay → estado.
-- p_remainder: 'none', 'sealed', 'discard' ou 'portion'. p_late_reason existe para a 6.5a; nesta fatia
-- não há manipulação tardia aceita, então ela precisa vir nula.
create function private.handle_container(
  p_organization_id uuid, p_establishment_id uuid, p_source_container_id uuid, p_kind text,
  p_quantities numeric[], p_expiry_date date, p_storage text, p_handled_at timestamptz, p_handled_by uuid,
  p_remainder text, p_remainder_reason text, p_note text, p_late_reason text, p_intent_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_remainder_reason text := private.visible_text(p_remainder_reason);
  v_note text := private.visible_text(p_note);
  v_count integer;
  v_sum numeric := 0;
  v_q numeric;
  v_source public.containers%rowtype;
  v_batch public.batch_receipts%rowtype;
  v_existing public.container_handlings%rowtype;
  v_balance numeric;
  v_rest numeric;
  v_remainder text;
  v_name text;
  v_handled_day date;
  v_today date;
  v_id uuid;
  v_remainder_intent uuid;
  i integer;
begin
  -- Autorização: proprietário ativo (D-019).
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  -- Forma.
  v_count := coalesce(array_length(p_quantities, 1), 0);
  if p_intent_id is null or p_source_container_id is null or p_kind is null or p_kind not in ('opening', 'portioning')
     or p_quantities is null or array_ndims(p_quantities) is distinct from 1
     or (p_kind = 'opening' and v_count <> 1) or (p_kind = 'portioning' and (v_count < 2 or v_count > 20))
     or p_expiry_date is null or p_expiry_date not between date '0001-01-01' and date '9999-12-31'
     or p_storage is null or p_storage not in ('ambient', 'refrigerated', 'frozen')
     or p_handled_at is null or not isfinite(p_handled_at) or p_handled_by is null
     or p_remainder is null or p_remainder not in ('none', 'sealed', 'discard', 'portion')
     or (p_remainder = 'portion' and p_kind <> 'portioning')
     or (p_remainder = 'discard' and v_remainder_reason is null)
     or (p_remainder <> 'discard' and p_remainder_reason is not null)
     or length(v_remainder_reason) > 500 or length(v_note) > 200
     or (p_note is not null and v_note is null)
     or p_late_reason is not null then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  foreach v_q in array p_quantities loop
    if v_q is null or v_q::text in ('NaN', 'Infinity', '-Infinity') or v_q <= 0 or v_q > 1000000000 or v_q <> trunc(v_q, 3) then
      raise exception 'Dados inválidos.' using errcode = '22023';
    end if;
    v_sum := v_sum + v_q;
  end loop;

  -- Origem no escopo (mesma mensagem para inexistente, outra unidade e outra empresa).
  select * into v_source from public.containers c
   where c.organization_id = p_organization_id and c.establishment_id = p_establishment_id and c.id = p_source_container_id;
  if not found then
    raise exception 'Recipiente não encontrado.' using errcode = '23503';
  end if;

  -- Bloqueio do recebimento: serializa manipulações e baixas do mesmo lote (nenhuma outra linha depois).
  select * into strict v_batch from public.batch_receipts b
   where b.organization_id = p_organization_id and b.establishment_id = p_establishment_id and b.id = v_source.batch_id
   for update;
  if v_batch.unit = 'un' and exists (select 1 from unnest(p_quantities) q where q <> trunc(q)) then
    raise exception 'Quantidade inválida.' using errcode = '22023';
  end if;

  -- Replay: compara tudo o que foi pedido, exceto o nome copiado (I-4). Antes das regras de estado,
  -- para que o reenvio depois da meia-noite, de a origem zerar ou de o nome mudar devolva o mesmo ID.
  select * into v_existing from public.container_handlings h
   where h.organization_id = p_organization_id and h.establishment_id = p_establishment_id and h.intent_id = p_intent_id;
  if found then
    if v_existing.created_by is distinct from v_user
       or v_existing.source_container_id is distinct from p_source_container_id
       or v_existing.kind is distinct from p_kind
       or v_existing.portion_count is distinct from v_count
       or (select array_agg(c.initial_quantity order by c.position) from public.containers c
            where c.handling_id = v_existing.id and c.position <= v_existing.portion_count) is distinct from p_quantities
       or v_existing.expiry_date is distinct from p_expiry_date
       or v_existing.storage is distinct from p_storage
       or v_existing.handled_at is distinct from p_handled_at
       or v_existing.handled_by is distinct from p_handled_by
       or v_existing.remainder is distinct from (case p_remainder when 'discard' then 'discarded' else p_remainder end)
       or v_existing.note is distinct from v_note
       or (select m.reason from public.stock_movements m where m.handling_id = v_existing.id and m.kind = 'discard')
          is distinct from v_remainder_reason then
      raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  -- I-3: o identificador de uma baixa não vira manipulação.
  if exists (select 1 from public.stock_movements m
              where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id and m.intent_id = p_intent_id) then
    raise exception 'Identificador já utilizado com outros dados.' using errcode = '23505';
  end if;

  -- Estado: saldo da origem pelo histórico, sob o bloqueio.
  v_balance := private.container_balance(v_source.id);
  if v_balance <= 0 then
    raise exception 'Recipiente sem saldo registrado.' using errcode = '22023';
  end if;

  -- Horário (B-2, D-031): não futuro, não anterior à origem, até 2 horas antes do registro.
  if p_handled_at > now() then
    raise exception 'O horário da manipulação não pode estar no futuro.' using errcode = '22023';
  end if;
  -- Integral: não antes do recebimento. Derivado: não antes da manipulação que o criou (handled_at);
  -- o created_at do derivado é a hora do registro, que pode vir depois de uma nova manipulação real.
  if (v_source.kind = 'integral' and p_handled_at < v_source.created_at)
     or (v_source.kind = 'derived' and p_handled_at < v_source.handled_at) then
    raise exception 'O horário da manipulação não pode ser anterior ao do recipiente de origem.' using errcode = '22023';
  end if;
  if now() - p_handled_at > private.handling_late_window() then
    raise exception 'Manipulação registrada mais de 2 horas depois de feita ainda não é aceita. Siga o procedimento da cozinha.'
      using errcode = '22023';
  end if;

  -- Validade: origem vencida na data da manipulação não é manipulada; a nova validade vai de
  -- max(data da manipulação, data do registro) até a validade da origem, inclusive (fuso da unidade).
  v_handled_day := (p_handled_at at time zone v_batch.timezone)::date;
  v_today := (now() at time zone v_batch.timezone)::date;
  if v_source.expiry_date < v_handled_day then
    raise exception 'Recipiente de origem vencido na data da manipulação; manipular não recupera validade.' using errcode = '22023';
  end if;
  if p_expiry_date > v_source.expiry_date then
    raise exception 'A validade após abertura não pode passar da validade do recipiente de origem.' using errcode = '22023';
  end if;
  if p_expiry_date < greatest(v_handled_day, v_today) then
    raise exception 'A validade após abertura não pode ser anterior à data da manipulação nem à do registro.' using errcode = '22023';
  end if;

  -- Quantidades e sobra.
  if v_sum > v_balance then
    raise exception 'Quantidade excede saldo registrado.' using errcode = '22023';
  end if;
  v_rest := v_balance - v_sum;
  if v_rest = 0 then
    if p_remainder <> 'none' then
      raise exception 'Não há sobra: as porções levam todo o saldo.' using errcode = '22023';
    end if;
    v_remainder := 'none';
  else
    if p_remainder = 'none' then
      raise exception 'Informe o que acontece com a sobra.' using errcode = '22023';
    end if;
    if p_remainder = 'sealed' and v_source.kind <> 'integral' then
      raise exception 'Só a embalagem original fechada mantém a sobra na origem; inclua a sobra como porção ou descarte.'
        using errcode = '22023';
    end if;
    v_remainder := case p_remainder when 'discard' then 'discarded' else p_remainder end;
  end if;

  -- Quem manipulou: vínculo ativo na mesma empresa e nome de exibição definido.
  select m.display_name into v_name from public.memberships m
   where m.organization_id = p_organization_id and m.user_id = p_handled_by and m.revoked_at is null;
  if not found then
    raise exception 'A pessoa que manipulou precisa ter vínculo ativo com a empresa.' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Defina o nome de exibição da pessoa que manipulou antes de registrar.' using errcode = '22023';
  end if;

  -- Gravação, tudo na mesma transação.
  if v_remainder = 'discarded' then v_remainder_intent := gen_random_uuid(); end if;
  insert into public.container_handlings (organization_id, establishment_id, batch_id, source_container_id,
    source_expiry_date, kind, portion_count, total_quantity, expiry_date, storage, handled_at, remainder,
    remainder_quantity, remainder_intent_id, handled_by, handled_by_name, note, intent_id, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_batch.id, v_source.id, v_source.expiry_date, p_kind, v_count,
    v_sum + case when v_remainder = 'portion' then v_rest else 0 end, p_expiry_date, p_storage, p_handled_at,
    v_remainder, v_rest, v_remainder_intent, p_handled_by, v_name, v_note, p_intent_id, v_batch.timezone, v_user)
  returning id into v_id;

  insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, handling_id,
    intent_id, kind, quantity, reason, timezone, created_by)
  values (p_organization_id, p_establishment_id, v_batch.id, v_source.id, v_id, p_intent_id, 'transfer',
    v_sum + case when v_remainder = 'portion' then v_rest else 0 end, null, v_batch.timezone, v_user);

  if v_remainder = 'discarded' then
    insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, handling_id,
      intent_id, kind, quantity, reason, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_batch.id, v_source.id, v_id, v_remainder_intent, 'discard',
      v_rest, v_remainder_reason, v_batch.timezone, v_user);
  end if;

  for i in 1 .. v_count loop
    insert into public.containers (organization_id, establishment_id, batch_id, kind, parent_container_id,
      handling_id, position, initial_quantity, expiry_date, storage, handled_at, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_batch.id, 'derived', v_source.id, v_id, i,
      p_quantities[i], p_expiry_date, p_storage, p_handled_at, v_batch.timezone, v_user);
  end loop;
  if v_remainder = 'portion' then
    insert into public.containers (organization_id, establishment_id, batch_id, kind, parent_container_id,
      handling_id, position, initial_quantity, expiry_date, storage, handled_at, timezone, created_by)
    values (p_organization_id, p_establishment_id, v_batch.id, 'derived', v_source.id, v_id, v_count + 1,
      v_rest, p_expiry_date, p_storage, p_handled_at, v_batch.timezone, v_user);
  end if;
  return v_id;
end;
$$;
revoke all on function private.handle_container(uuid, uuid, uuid, text, numeric[], date, text, timestamptz, uuid, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.handle_container(uuid, uuid, uuid, text, numeric[], date, text, timestamptz, uuid, text, text, text, text, uuid)
  to authenticated;
create function public.handle_container(
  p_organization_id uuid, p_establishment_id uuid, p_source_container_id uuid, p_kind text,
  p_quantities numeric[], p_expiry_date date, p_storage text, p_handled_at timestamptz, p_handled_by uuid,
  p_remainder text, p_remainder_reason text, p_note text, p_late_reason text, p_intent_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.handle_container(p_organization_id, p_establishment_id, p_source_container_id, p_kind,
    p_quantities, p_expiry_date, p_storage, p_handled_at, p_handled_by, p_remainder, p_remainder_reason,
    p_note, p_late_reason, p_intent_id);
$$;
revoke all on function public.handle_container(uuid, uuid, uuid, text, numeric[], date, text, timestamptz, uuid, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.handle_container(uuid, uuid, uuid, text, numeric[], date, text, timestamptz, uuid, text, text, text, text, uuid)
  to authenticated;

-- 8) Proteção do histórico com a tabela nova (lista fixa, D-033) ----------------------------------
create or replace function private.assert_history_protected()
returns void language plpgsql set search_path = '' as $$
declare
  v_problems text;
begin
  select string_agg(problem, '; ' order by problem) into v_problems
  from (
    select t.name || ': gatilho de proteção ausente, desabilitado ou incompleto' as problem
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes', 'container_handlings']) as t(name)
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
    from unnest(array['batch_receipts', 'containers', 'stock_movements', 'entity_changes', 'container_handlings']) as t(name)
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

-- 9) Verificações finais -----------------------------------------------------------------------------
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
