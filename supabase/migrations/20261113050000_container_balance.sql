-- Fase 6, fatia 6.1: saldo por recipiente (FASE_06_DESENHO.md 4.1, 4.3, 4.11 e seção 10; revisão
-- cruzada B-1, B-3, I-5, I-7, I-14). Sem mudança de fluxo: a tela continua operando no recebimento,
-- que agora é sempre o recipiente integral.
--
-- 1) Todo recebimento tem exatamente um recipiente integral, criado no banco junto com o recebimento
--    (gatilho), com cópia da quantidade, da validade e do fuso; recebimentos antigos ganham o seu.
-- 2) Todo recipiente tem código curto (C-000001...) de uma sequence global: sem linha bloqueada,
--    único globalmente, buracos aceitáveis (I-7). O UUID continua sendo a identidade e o QR.
-- 3) Todo movimento pertence a um recipiente do mesmo recebimento; a anulação fica no recipiente do
--    movimento anulado (FK). O saldo é calculado por recipiente.
-- 4) public.record_container_movement opera por recipiente; record_movement (assinatura antiga)
--    continua igual para a interface e opera no integral.
--
-- Backfill sob histórico append-only pela estratégia A (B-1, D-033, decisão de luis): os gatilhos de
-- proteção de containers e stock_movements são suspensos por nome dentro desta transação, o backfill
-- roda, eles são reabilitados (ENABLE ALWAYS) e private.assert_history_protected() verifica tudo no
-- fim; se faltar qualquer proteção, ou se a conservação falhar, a migração inteira é desfeita.
-- Colunas de manipulação (handling_id, position, handled_at) chegam na 6.3 e a conservação (storage)
-- na 6.5a, como colunas novas anuláveis, sem novo backfill.

-- 0) Código curto ------------------------------------------------------------------------------
create sequence private.container_short_code_seq as bigint minvalue 1 start 1 no cycle;
revoke all on sequence private.container_short_code_seq from public, anon, authenticated, service_role;

create function private.format_container_short_code(p_number bigint)
returns text language sql immutable set search_path = '' as $$
  select 'C-' || lpad(p_number::text, greatest(6, length(p_number::text)), '0');
$$;
revoke all on function private.format_container_short_code(bigint) from public, anon, authenticated, service_role;

-- 1) Colunas novas (anuláveis até o backfill; ADD COLUMN sem default não reescreve nem dispara gatilho)
alter table public.containers
  add column kind text,
  add column parent_container_id uuid,
  add column initial_quantity numeric,
  add column expiry_date date,
  add column expiry_origin text,
  add column short_code text,
  add column timezone text;
alter table public.stock_movements add column container_id uuid;

-- 2) Backfill (estratégia A) -------------------------------------------------------------------
alter table public.containers disable trigger containers_append_only;
alter table public.stock_movements disable trigger stock_movements_append_only;

-- 2a) Recipientes existentes (todos integrais: até aqui só ensure_container criava recipientes).
update public.containers c
   set kind = 'integral', initial_quantity = b.quantity, expiry_date = b.expiry_date,
       expiry_origin = 'receipt', timezone = b.timezone
  from public.batch_receipts b
 where b.organization_id = c.organization_id and b.establishment_id = c.establishment_id
   and b.id = c.batch_id and c.kind is null;

-- 2b) Recebimentos sem recipiente (etiqueta nunca gerada) ganham o integral, com a data e o autor do
--     recebimento: o integral passa a existir desde o recebimento (D-014 revisada pela 6.1).
insert into public.containers (organization_id, establishment_id, batch_id, kind, initial_quantity,
  expiry_date, expiry_origin, timezone, created_by, created_at)
select b.organization_id, b.establishment_id, b.id, 'integral', b.quantity, b.expiry_date, 'receipt',
       b.timezone, b.created_by, b.created_at
  from public.batch_receipts b
 where not exists (select 1 from public.containers c where c.batch_id = b.id);

-- 2c) Códigos curtos em ordem de criação, determinísticos (reaplicar depois do rollback dá os mesmos).
with numbered as (
  select id, row_number() over (order by created_at, id) as n
    from public.containers where short_code is null
)
update public.containers c
   set short_code = private.format_container_short_code(numbered.n)
  from numbered where numbered.id = c.id;
select setval('private.container_short_code_seq',
  coalesce((select max(substr(short_code, 3)::bigint) from public.containers), 1),
  exists (select 1 from public.containers));

-- 2d) Movimentos existentes vão para o integral do seu recebimento.
update public.stock_movements m
   set container_id = c.id
  from public.containers c
 where c.organization_id = m.organization_id and c.establishment_id = m.establishment_id
   and c.batch_id = m.batch_id and c.kind = 'integral' and m.container_id is null;

alter table public.containers enable always trigger containers_append_only;
alter table public.stock_movements enable always trigger stock_movements_append_only;

-- 3) Restrições ---------------------------------------------------------------------------------
alter table public.containers
  alter column kind set not null,
  alter column initial_quantity set not null,
  alter column expiry_date set not null,
  alter column expiry_origin set not null,
  alter column short_code set not null,
  alter column timezone set not null,
  add constraint containers_kind_check check (kind in ('integral', 'derived')),
  add constraint containers_kind_shape_check check (
    (kind = 'integral' and parent_container_id is null and expiry_origin = 'receipt') or
    (kind = 'derived' and parent_container_id is not null and parent_container_id <> id and expiry_origin = 'handling')),
  add constraint containers_initial_quantity_check check (
    initial_quantity > 0 and initial_quantity <= 1000000000 and initial_quantity = trunc(initial_quantity, 3)),
  add constraint containers_expiry_date_check check (expiry_date between date '0001-01-01' and date '9999-12-31'),
  add constraint containers_short_code_check check (short_code ~ '^C-[0-9]{6,}$'),
  add constraint containers_short_code_key unique (short_code),
  add constraint containers_scope_batch_id_key unique (organization_id, establishment_id, batch_id, id),
  add constraint containers_parent_fk foreign key (organization_id, establishment_id, batch_id, parent_container_id)
    references public.containers (organization_id, establishment_id, batch_id, id);
-- I-5: um integral por recebimento; derivados (6.3) compartilham o batch_id.
create unique index containers_one_integral_idx on public.containers (batch_id) where kind = 'integral';
alter table public.containers drop constraint containers_batch_id_key;
create index containers_parent_idx on public.containers (organization_id, establishment_id, batch_id, parent_container_id)
  where parent_container_id is not null;

alter table public.stock_movements
  alter column container_id set not null,
  add constraint stock_movements_container_fk foreign key (organization_id, establishment_id, batch_id, container_id)
    references public.containers (organization_id, establishment_id, batch_id, id),
  -- Também é o índice do saldo por recipiente (escopo + recipiente, lendo kind e quantity no índice).
  add constraint stock_movements_scope_container_id_key unique (organization_id, establishment_id, batch_id, container_id, id)
    include (kind, quantity);
-- A anulação aponta para um movimento do MESMO recipiente (antes: do mesmo recebimento).
alter table public.stock_movements drop constraint stock_movements_reverses_fk;
alter table public.stock_movements add constraint stock_movements_reverses_fk
  foreign key (organization_id, establishment_id, batch_id, container_id, reverses_id)
  references public.stock_movements (organization_id, establishment_id, batch_id, container_id, id);

-- 4) Gatilhos de criação -------------------------------------------------------------------------
-- 4a) Recipiente: código da sequence; integral copia e confere o recebimento.
create function private.prepare_container()
returns trigger language plpgsql set search_path = '' as $$
declare v_batch public.batch_receipts%rowtype;
begin
  if new.short_code is not null then
    raise exception 'O código curto é gerado pelo banco.' using errcode = '23514';
  end if;
  new.kind := coalesce(new.kind, 'integral');
  select * into v_batch from public.batch_receipts b
   where b.organization_id = new.organization_id and b.establishment_id = new.establishment_id and b.id = new.batch_id;
  if found then
    new.timezone := coalesce(new.timezone, v_batch.timezone);
    if new.kind = 'integral' then
      new.initial_quantity := coalesce(new.initial_quantity, v_batch.quantity);
      new.expiry_date := coalesce(new.expiry_date, v_batch.expiry_date);
      new.expiry_origin := coalesce(new.expiry_origin, 'receipt');
      if new.initial_quantity <> v_batch.quantity or new.expiry_date <> v_batch.expiry_date
         or new.timezone <> v_batch.timezone then
        raise exception 'O recipiente integral precisa ter a quantidade, a validade e o fuso do recebimento.'
          using errcode = '23514';
      end if;
    else
      new.expiry_origin := coalesce(new.expiry_origin, 'handling');
      if new.timezone <> v_batch.timezone then
        raise exception 'O recipiente precisa ter o fuso do recebimento.' using errcode = '23514';
      end if;
    end if;
  end if; -- recebimento inexistente: a FK recusa com 23503
  new.short_code := private.format_container_short_code(nextval('private.container_short_code_seq'));
  return new;
end;
$$;
revoke all on function private.prepare_container() from public, anon, authenticated, service_role;
create trigger containers_prepare before insert on public.containers
  for each row execute function private.prepare_container();

-- 4b) Recebimento cria o integral na mesma transação (também nas inserções diretas das fixtures, B-3).
--     Linha nova, sem bloqueio de linha existente: a ordem de bloqueio (unidade → recebimento) não muda.
create function private.create_integral_container()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.containers (organization_id, establishment_id, batch_id, created_by, created_at)
  values (new.organization_id, new.establishment_id, new.id, new.created_by, new.created_at);
  return null;
end;
$$;
revoke all on function private.create_integral_container() from public, anon, authenticated, service_role;
create trigger batch_receipts_create_integral after insert on public.batch_receipts
  for each row execute function private.create_integral_container();

-- 4c) Compatibilidade com inserções antigas (security_guard e fixtures): movimento sem recipiente vai
--     para o integral. As funções sempre informam o recipiente (pgTAP confirma sem este gatilho).
create function private.fill_movement_container()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.container_id is null then
    select c.id into new.container_id from public.containers c
     where c.organization_id = new.organization_id and c.establishment_id = new.establishment_id
       and c.batch_id = new.batch_id and c.kind = 'integral';
  end if;
  return new;
end;
$$;
revoke all on function private.fill_movement_container() from public, anon, authenticated, service_role;
create trigger stock_movements_fill_container before insert on public.stock_movements
  for each row execute function private.fill_movement_container();

-- 5) Saldo e conservação ------------------------------------------------------------------------
-- Saídas: consumption, discard. Entradas: reversal. Um tipo novo (6.3: transfer...) precisa ser
-- classificado aqui e em stock_conservation_problems; o pgTAP fixa a lista de tipos.
create function private.container_balance(p_container_id uuid)
returns numeric language sql stable set search_path = '' as $$
  select c.initial_quantity - coalesce(sum(case when m.kind in ('consumption', 'discard') then m.quantity
                                                 when m.kind = 'reversal' then -m.quantity end), 0)
    from public.containers c
    left join public.stock_movements m on m.organization_id = c.organization_id
      and m.establishment_id = c.establishment_id and m.batch_id = c.batch_id and m.container_id = c.id
   where c.id = p_container_id
   group by c.id, c.initial_quantity;
$$;
revoke all on function private.container_balance(uuid) from public, anon, authenticated, service_role;

-- Invariante de conservação (4.3), por recebimento. Lista o que estiver errado; vazio = conserva.
create function private.stock_conservation_problems()
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
    from public.stock_movements m where m.kind not in ('consumption', 'discard', 'reversal')
  union all
  select b.id, 'soma dos saldos dos recipientes difere de recebimento − saídas + anulações'
    from public.batch_receipts b
   where (select sum(x.balance) from balances x where x.batch_id = b.id)
         is distinct from b.quantity - coalesce((
           select sum(case when m.kind in ('consumption', 'discard') then m.quantity
                           when m.kind = 'reversal' then -m.quantity end)
             from public.stock_movements m
            where m.organization_id = b.organization_id and m.establishment_id = b.establishment_id
              and m.batch_id = b.id), 0);
$$;
revoke all on function private.stock_conservation_problems() from public, anon, authenticated, service_role;

-- 6) Funções de escrita ----------------------------------------------------------------------------
-- Núcleo comum (não exposto): ordem de verificações da seção 5 (I-4): autorização → forma →
-- recipiente no escopo → bloqueio do recebimento → replay → saldo do recipiente.
create function private.apply_stock_exit(p_organization_id uuid, p_establishment_id uuid, p_batch_id uuid,
  p_container_id uuid, p_by_container boolean, p_kind text, p_quantity numeric, p_reason text, p_intent_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare v_user uuid := auth.uid(); v_batch public.batch_receipts%rowtype; v_existing public.stock_movements%rowtype;
  v_container_id uuid; v_batch_id uuid; v_id uuid; v_timezone text;
  v_reason text := nullif(btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'');
begin
 if v_user is null or not private.has_membership(p_organization_id,true) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_intent_id is null or p_kind is null or p_kind not in ('consumption','discard') or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity <= 0 or p_quantity > 1000000000 or p_quantity <> trunc(p_quantity,3) or (p_kind='discard' and v_reason is null) or length(v_reason)>500 or (p_by_container and p_container_id is null) then raise exception 'Dados inválidos.' using errcode='22023'; end if;
 if not p_by_container then
   -- Assinatura antiga: o recipiente é o integral do recebimento.
   select c.id, c.batch_id into v_container_id, v_batch_id from public.containers c
    where c.organization_id=p_organization_id and c.establishment_id=p_establishment_id and c.batch_id=p_batch_id and c.kind='integral';
   if not found then raise exception 'Recebimento não encontrado.' using errcode='23503'; end if;
 else
   select c.id, c.batch_id into v_container_id, v_batch_id from public.containers c
    where c.organization_id=p_organization_id and c.establishment_id=p_establishment_id and c.id=p_container_id;
   if not found then raise exception 'Recipiente não encontrado.' using errcode='23503'; end if;
 end if;
 select * into strict v_batch from public.batch_receipts where id=v_batch_id and organization_id=p_organization_id and establishment_id=p_establishment_id for update;
 if v_batch.unit='un' and p_quantity <> trunc(p_quantity) then raise exception 'Quantidade inválida.' using errcode='22023'; end if;
 select * into v_existing from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id;
 if found then
   if v_existing.created_by is distinct from v_user or v_existing.batch_id is distinct from v_batch_id or v_existing.container_id is distinct from v_container_id or v_existing.kind is distinct from p_kind or v_existing.quantity is distinct from p_quantity or v_existing.reason is distinct from v_reason then raise exception 'Identificador já utilizado com outros dados.' using errcode='23505'; end if;
   return v_existing.id;
 end if;
 if p_quantity > private.container_balance(v_container_id) then raise exception 'Quantidade excede saldo registrado.' using errcode='22023'; end if;
 select timezone into strict v_timezone from public.establishments where id=p_establishment_id and organization_id=p_organization_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,container_id,intent_id,kind,quantity,reason,timezone,created_by)
 values(p_organization_id,p_establishment_id,v_batch_id,v_container_id,p_intent_id,p_kind,p_quantity,v_reason,v_timezone,v_user) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function private.apply_stock_exit(uuid,uuid,uuid,uuid,boolean,text,numeric,text,uuid) from public, anon, authenticated, service_role;

-- Assinatura antiga (interface atual): mesmas mensagens e códigos; opera no integral.
create or replace function private.record_movement(p_organization_id uuid,p_establishment_id uuid,p_batch_id uuid,p_kind text,p_quantity numeric,p_reason text,p_intent_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 return private.apply_stock_exit(p_organization_id,p_establishment_id,p_batch_id,null,false,p_kind,p_quantity,p_reason,p_intent_id);
end;
$$;

-- Assinatura por recipiente. Nome próprio porque os tipos dos parâmetros coincidem com os da antiga.
create function private.record_container_movement(p_organization_id uuid,p_establishment_id uuid,p_container_id uuid,p_kind text,p_quantity numeric,p_reason text,p_intent_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 return private.apply_stock_exit(p_organization_id,p_establishment_id,null,p_container_id,true,p_kind,p_quantity,p_reason,p_intent_id);
end;
$$;
revoke all on function private.record_container_movement(uuid,uuid,uuid,text,numeric,text,uuid) from public, anon, authenticated, service_role;
grant execute on function private.record_container_movement(uuid,uuid,uuid,text,numeric,text,uuid) to authenticated;
create function public.record_container_movement(p_organization_id uuid,p_establishment_id uuid,p_container_id uuid,p_kind text,p_quantity numeric,p_reason text,p_intent_id uuid)
returns uuid language sql security invoker set search_path='' as $$
 select private.record_container_movement(p_organization_id,p_establishment_id,p_container_id,p_kind,p_quantity,p_reason,p_intent_id);
$$;
revoke all on function public.record_container_movement(uuid,uuid,uuid,text,numeric,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_container_movement(uuid,uuid,uuid,text,numeric,text,uuid) to authenticated;

-- Anulação: mesma lógica; o estorno grava o recipiente do movimento anulado.
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

-- ensure_container: continua idempotente e devolve o integral (I-5: on conflict no índice parcial).
create or replace function private.ensure_container(p_organization_id uuid,p_establishment_id uuid,p_batch_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null or not private.has_membership(p_organization_id,true) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if not exists(select 1 from public.batch_receipts b where b.id=p_batch_id and b.organization_id=p_organization_id and b.establishment_id=p_establishment_id) then
    raise exception 'Recebimento não encontrado.' using errcode='23503';
  end if;
  -- O integral já nasce com o recebimento; a inserção fica como garantia (e não gasta código curto
  -- a cada etiqueta reimpressa).
  select id into v_id from public.containers where batch_id=p_batch_id and kind='integral';
  if v_id is not null then return v_id; end if;
  insert into public.containers(organization_id,establishment_id,batch_id,created_by)
    values(p_organization_id,p_establishment_id,p_batch_id,v_user)
    on conflict (batch_id) where kind = 'integral' do nothing returning id into v_id;
  if v_id is null then
    select id into strict v_id from public.containers where batch_id=p_batch_id and kind='integral';
  end if;
  return v_id;
end;
$$;

-- 7) Verificações finais: proteção do histórico (B-1) e conservação dos dados existentes. -------
select private.assert_history_protected();
do $$
declare v_problems text;
begin
  select string_agg(batch_id || ': ' || problem, '; ' order by batch_id, problem) into v_problems
    from (select * from private.stock_conservation_problems() limit 20) p;
  if v_problems is not null then
    raise exception 'Conservação do estoque falhou depois do backfill: %', v_problems using errcode = '55000';
  end if;
end;
$$;
