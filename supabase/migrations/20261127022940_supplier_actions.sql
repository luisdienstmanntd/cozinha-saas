-- Mutação restrita ao proprietário por RPC; UPDATE/DELETE diretos continuam indisponíveis.
alter table public.entity_changes drop constraint entity_changes_entity_check;
alter table public.entity_changes add constraint entity_changes_entity_check
  check (entity in ('organization','establishment','membership','product','supplier'));
alter table public.entity_changes drop constraint entity_changes_field_check;
alter table public.entity_changes add constraint entity_changes_field_check
  check (field in ('name','timezone','display_name','storage_condition','production_registrar',
    'production_window_minutes','unlabeled_limit_minutes','portion_expiry_rule','email','contact','deleted'));

create function private.log_supplier_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f text; v_old text; v_new text;
begin
  if tg_op = 'DELETE' then
    insert into public.entity_changes(organization_id,establishment_id,entity,entity_id,field,old_value,new_value,changed_by)
      values(old.organization_id,old.establishment_id,'supplier',old.id,'deleted',
        jsonb_build_object('name',old.name,'email',old.email,'contact',old.contact)::text,null,auth.uid());
    return old;
  end if;
  foreach f in array array['name','email','contact'] loop
    v_old := to_jsonb(old)->>f; v_new := to_jsonb(new)->>f;
    if v_old is distinct from v_new then
      insert into public.entity_changes(organization_id,establishment_id,entity,entity_id,field,old_value,new_value,changed_by)
        values(new.organization_id,new.establishment_id,'supplier',new.id,f,v_old,v_new,auth.uid());
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.log_supplier_changes() from public,anon,authenticated,service_role;
create trigger suppliers_changes after update or delete on public.suppliers
  for each row execute function private.log_supplier_changes();

create function private.edit_supplier(p_organization_id uuid,p_establishment_id uuid,p_supplier_id uuid,
  p_name text,p_email text,p_contact text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.suppliers%rowtype; v_name text; v_email text; v_contact text;
  v_trim constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if auth.uid() is null or not private.has_membership(p_organization_id,true) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  select * into v from public.suppliers s where s.organization_id=p_organization_id
    and s.establishment_id=p_establishment_id and s.id=p_supplier_id for update;
  if not found then raise exception 'Fornecedor indisponível.' using errcode='42501'; end if;
  v_name := btrim(p_name,v_trim);
  v_email := nullif(btrim(p_email,v_trim),'');
  v_contact := nullif(btrim(p_contact,v_trim),'');
  if v.name is distinct from v_name and exists(select 1 from public.batch_receipts b
      where b.organization_id=p_organization_id and b.establishment_id=p_establishment_id and b.supplier_id=p_supplier_id) then
    raise exception 'O nome do fornecedor com recebimentos deve ser preservado. E-mail e contato podem ser atualizados.' using errcode='22023';
  end if;
  update public.suppliers set name=v_name,email=v_email,contact=v_contact where id=v.id returning * into v;
  return jsonb_build_object('id',v.id,'name',v.name,'email',v.email,'contact',v.contact);
end;
$$;
revoke all on function private.edit_supplier(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.edit_supplier(uuid,uuid,uuid,text,text,text) to authenticated;
create function public.edit_supplier(p_organization_id uuid,p_establishment_id uuid,p_supplier_id uuid,
  p_name text,p_email text,p_contact text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.edit_supplier(p_organization_id,p_establishment_id,p_supplier_id,p_name,p_email,p_contact);
$$;
revoke all on function public.edit_supplier(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.edit_supplier(uuid,uuid,uuid,text,text,text) to authenticated;

create function private.delete_supplier(p_organization_id uuid,p_establishment_id uuid,p_supplier_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not private.has_membership(p_organization_id,true) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  select id into v_id from public.suppliers s where s.organization_id=p_organization_id
    and s.establishment_id=p_establishment_id and s.id=p_supplier_id for update;
  if not found then raise exception 'Fornecedor indisponível.' using errcode='42501'; end if;
  -- A FK sem CASCADE também protege uma inserção de recebimento concorrente.
  begin
    delete from public.suppliers where id=v_id;
  exception when foreign_key_violation then
    raise exception 'Este fornecedor possui recebimentos e não pode ser excluído. O histórico foi preservado.' using errcode='23503';
  end;
  return v_id;
end;
$$;
revoke all on function private.delete_supplier(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.delete_supplier(uuid,uuid,uuid) to authenticated;
create function public.delete_supplier(p_organization_id uuid,p_establishment_id uuid,p_supplier_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.delete_supplier(p_organization_id,p_establishment_id,p_supplier_id);
$$;
revoke all on function public.delete_supplier(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.delete_supplier(uuid,uuid,uuid) to authenticated;
-- Reversão exige preservar auditoria existente antes de remover valores das constraints.
