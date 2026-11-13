-- Reverte 20261113090000_conservation_occurrences.sql.
-- RECUSA se existir qualquer dado que só a 6.5a sabe ler: ocorrência, decisão, manipulação tardia,
-- recebimento com conservação/temperatura ou produto com conservação definida. O histórico é
-- append-only; sem as colunas e tabelas da 6.5a esses registros perderiam o sentido (e o bloqueio).
do $$
begin
  if exists (select 1 from public.occurrences) or exists (select 1 from public.occurrence_decisions)
     or exists (select 1 from public.container_handlings where late)
     or exists (select 1 from public.batch_receipts where storage_condition is not null or temperature_status is not null)
     or exists (select 1 from public.products where storage_condition is not null) then
    raise exception 'Rollback recusado: existem registros de conservação, temperatura ou ocorrências.' using errcode = '55000';
  end if;
end;
$$;

drop function if exists public.decide_occurrence(uuid, uuid, uuid, text, text, uuid);
drop function if exists private.decide_occurrence(uuid, uuid, uuid, text, text, uuid);
drop function if exists public.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid);
drop function if exists private.receive_batch(uuid,uuid,uuid,uuid,text,numeric,date,text,date,text,text,numeric,text,uuid);
drop function if exists public.set_product_storage_condition(uuid, uuid, uuid, text);
drop function if exists private.set_product_storage_condition(uuid, uuid, uuid, text);

-- Funções de escrita voltam ao texto da 6.4 (receive_batch ao da 6.0c, baixas ao da 6.1, manipulação
-- ao da 6.3). Antes de apagar os auxiliares que as versões da 6.5a usam.
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
  -- I-11: a unidade é travada antes do recebimento; mudar o fuso espera este recebimento confirmar.
  select e.timezone into v_timezone from public.establishments e
    where e.organization_id=p_organization_id and e.id=p_establishment_id for share;
  if not found then
    raise exception 'Produto ou fornecedor inválido para o estabelecimento.' using errcode='23503';
  end if;
  select p.unit into v_unit from public.products p
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

create or replace function private.apply_stock_exit(p_organization_id uuid, p_establishment_id uuid, p_batch_id uuid,
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

create or replace function private.handle_container(
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

create or replace function private.void_handling(
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

drop function if exists private.receive_batch_core(uuid,uuid,uuid,uuid,text,numeric,date,text,date,boolean,text,text,numeric,text,uuid);
drop function if exists private.raise_if_blocked(uuid, uuid, uuid);
drop function if exists private.decision_intent_used(uuid, uuid, uuid);
drop function if exists public.container_blocks(uuid, uuid, uuid);
drop function if exists private.occurrence_problems();

drop table public.occurrence_decisions;
drop table public.occurrences;
drop function if exists private.check_occurrence_cause();

alter table public.container_handlings drop constraint container_handlings_late_check;
alter table public.container_handlings add constraint container_handlings_late_check check (not late);

create or replace function private.create_integral_container()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.containers (organization_id, establishment_id, batch_id, created_by, created_at)
  values (new.organization_id, new.establishment_id, new.id, new.created_by, new.created_at);
  return null;
end;
$$;

create or replace function private.prepare_container()
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

alter table public.batch_receipts drop constraint batch_receipts_temperature_check;
alter table public.batch_receipts drop column received_temperature_c, drop column temperature_status, drop column storage_condition;

drop trigger if exists log_product_storage_condition on public.products;
drop function if exists private.log_product_storage_condition();
drop trigger if exists products_lock_storage_condition on public.products;
drop function if exists private.lock_product_storage_condition();
alter table public.products drop column storage_condition;
alter table public.entity_changes drop constraint entity_changes_field_check;
alter table public.entity_changes add constraint entity_changes_field_check check (field in ('name', 'timezone', 'display_name'));
alter table public.entity_changes drop constraint entity_changes_entity_check;
alter table public.entity_changes add constraint entity_changes_entity_check check (entity in ('organization', 'establishment', 'membership'));

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

do $$
begin
  perform private.assert_history_protected();
  if exists (select 1 from private.stock_conservation_problems()) or exists (select 1 from private.container_balance_problems()) then
    raise exception 'Conservação ou saldo inconsistente depois do rollback; nada foi alterado.' using errcode = '55000';
  end if;
end;
$$;
