-- REVISAO_05: endurecimento sem mudança de fluxo.
-- 1) Nomes de organização e unidade não podem ser compostos apenas por espaços que o cliente (String.prototype.trim)
--    remove; antes, um nome como E'\t' era aceito pelo banco e quebrava a leitura de acesso de todos os membros.
--    O conjunto de caracteres é o mesmo já usado em produtos, fornecedores e lotes.
alter table public.organizations add constraint organizations_name_visible_check
  check (length(btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) between 1 and 120);
alter table public.establishments add constraint establishments_name_visible_check
  check (length(btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) between 1 and 120);

-- 2) O cálculo de saldo em record_movement filtrava somente por batch_id, que não é prefixo de nenhum índice
--    e causava varredura completa de stock_movements a cada baixa, com o recebimento bloqueado (FOR UPDATE).
--    Agora filtra pelo escopo completo e usa stock_movements_scope_batch_id_key. Lógica e mensagens inalteradas.
create or replace function private.record_movement(p_organization_id uuid,p_establishment_id uuid,p_batch_id uuid,p_kind text,p_quantity numeric,p_reason text,p_intent_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_batch public.batch_receipts%rowtype; v_existing public.stock_movements%rowtype; v_id uuid; v_total numeric; v_timezone text; v_reason text := nullif(btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'');
begin
 if v_user is null or not private.has_membership(p_organization_id,true) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_intent_id is null or p_kind is null or p_kind not in ('consumption','discard') or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity <= 0 or p_quantity > 1000000000 or p_quantity <> trunc(p_quantity,3) or (p_kind='discard' and v_reason is null) or length(v_reason)>500 then raise exception 'Dados inválidos.' using errcode='22023'; end if;
 select * into v_batch from public.batch_receipts where id=p_batch_id and organization_id=p_organization_id and establishment_id=p_establishment_id for update;
 if not found then raise exception 'Recebimento não encontrado.' using errcode='23503'; end if;
 if v_batch.unit='un' and p_quantity <> trunc(p_quantity) then raise exception 'Quantidade inválida.' using errcode='22023'; end if;
 select * into v_existing from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and intent_id=p_intent_id;
 if found then
   if v_existing.created_by is distinct from v_user or v_existing.batch_id is distinct from p_batch_id or v_existing.kind is distinct from p_kind or v_existing.quantity is distinct from p_quantity or v_existing.reason is distinct from v_reason then raise exception 'Identificador já utilizado com outros dados.' using errcode='23505'; end if;
   return v_existing.id;
 end if;
 select coalesce(sum(case when kind='reversal' then -quantity else quantity end),0) into v_total from public.stock_movements where organization_id=p_organization_id and establishment_id=p_establishment_id and batch_id=p_batch_id;
 if p_quantity > v_batch.quantity - v_total then raise exception 'Quantidade excede saldo registrado.' using errcode='22023'; end if;
 select timezone into strict v_timezone from public.establishments where id=p_establishment_id and organization_id=p_organization_id;
 insert into public.stock_movements(organization_id,establishment_id,batch_id,intent_id,kind,quantity,reason,timezone,created_by) values(p_organization_id,p_establishment_id,p_batch_id,p_intent_id,p_kind,p_quantity,v_reason,v_timezone,v_user) returning id into v_id;
 return v_id;
end;
$$;
