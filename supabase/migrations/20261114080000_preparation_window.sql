-- Fase 7, fatia 7.7 — janela de registro da produção por preparação (desenho da Fase 7, seção 16,
-- resposta 5 de luis em 14/11/2026: "janela de 2 h adequada, com possibilidade de alterar para alguns
-- alimentos"; D-036, D-055). Autorizada por luis em 14/11/2026 (20:30 UTC).
--
-- A preparação pode ter janela própria, que substitui a da unidade (7.6) só para ela. Sem valor próprio
-- (nulo), vale a da unidade. O sistema não sugere valor: quem define é o proprietário. Cada troca vai
-- para entity_changes (D-036), com o anterior (nulo = a da unidade) e o novo. O registro de produção já
-- guarda a janela usada (batch_productions.late_window_minutes, 7.6), então mudar a janela nunca
-- reescreve produção antiga. Os limites (15 minutos a 24 horas) só recusam o absurdo e não são
-- aprovação sanitária; os valores operacionais dependem da avaliação da nutricionista RT (Q10).

-- 1) Coluna: só preparação, entre 15 minutos e 24 horas -------------------------------------------------
-- ADD COLUMN anulável, sem default, não reescreve a tabela. Sem GRANT de INSERT/UPDATE: só a função grava.
alter table public.products add column production_window_minutes integer
  constraint products_production_window_check check (production_window_minutes between 15 and 1440);
alter table public.products add constraint products_production_window_kind_check
  check (production_window_minutes is null or kind = 'preparation');

-- 2) Auditoria, por qualquer caminho de escrita ---------------------------------------------------------
create function private.log_product_production_window()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.production_window_minutes is distinct from old.production_window_minutes then
    insert into public.entity_changes(organization_id, establishment_id, entity, entity_id, field, old_value, new_value, changed_by)
    values (new.organization_id, new.establishment_id, 'product', new.id, 'production_window_minutes',
      old.production_window_minutes::text, new.production_window_minutes::text, auth.uid());
  end if;
  return null;
end;
$$;
revoke all on function private.log_product_production_window() from public, anon, authenticated, service_role;
create trigger log_product_production_window after update of production_window_minutes on public.products
  for each row execute function private.log_product_production_window();
alter table public.products enable always trigger log_product_production_window;

-- 3) Função: só o proprietário ativo, com a preparação bloqueada ------------------------------------------
create function private.set_preparation_window(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_minutes integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_kind text; v_current integer;
begin
  if v_user is null or not private.has_membership(p_organization_id, true) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_product_id is null then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  if p_minutes is not null and p_minutes not between 15 and 1440 then
    raise exception 'A janela de registro da produção deve ficar entre 15 minutos e 24 horas, em minutos inteiros.'
      using errcode = '22023';
  end if;
  select p.kind, p.production_window_minutes into v_kind, v_current from public.products p
   where p.organization_id = p_organization_id and p.establishment_id = p_establishment_id and p.id = p_product_id
   for update;
  if not found then
    raise exception 'Preparação não encontrada.' using errcode = '23503';
  end if;
  if v_kind <> 'preparation' then
    raise exception 'Só preparação própria tem janela de produção própria.' using errcode = '22023';
  end if;
  if v_current is distinct from p_minutes then
    update public.products set production_window_minutes = p_minutes where id = p_product_id;
  end if;
  return p_minutes;
end;
$$;
revoke all on function private.set_preparation_window(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function private.set_preparation_window(uuid, uuid, uuid, integer) to authenticated;
create function public.set_preparation_window(
  p_organization_id uuid, p_establishment_id uuid, p_product_id uuid, p_minutes integer)
returns integer language sql security invoker set search_path = '' as $$
  select private.set_preparation_window(p_organization_id, p_establishment_id, p_product_id, p_minutes);
$$;
revoke all on function public.set_preparation_window(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.set_preparation_window(uuid, uuid, uuid, integer) to authenticated;

-- 4) register_production: a janela da preparação, se houver, vale no lugar da unidade ----------------------
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('private.register_production(uuid, uuid, uuid, numeric, date, timestamptz, uuid, text, text, uuid)'::regprocedure)
    into v_def;
  v_new := replace(v_def, '  v_window text;
', '  v_window text;
  v_product_window integer;
  v_minutes integer;
');
  if v_new = v_def then raise exception 'Não foi possível declarar a janela da preparação.' using errcode = '55000'; end if;
  v_def := v_new;
  v_new := replace(v_def, 'select p.unit, p.kind, p.storage_condition into v_unit, v_kind, v_storage from public.products p',
    'select p.unit, p.kind, p.storage_condition, p.production_window_minutes
    into v_unit, v_kind, v_storage, v_product_window from public.products p');
  if v_new = v_def then raise exception 'Não foi possível ler a janela da preparação.' using errcode = '55000'; end if;
  v_def := v_new;
  v_new := replace(v_def, 'v_window := private.duration_text(v_settings.production_window_minutes);',
    'v_minutes := coalesce(v_product_window, v_settings.production_window_minutes);
  v_window := private.duration_text(v_minutes);');
  if v_new = v_def then raise exception 'Não foi possível escolher a janela em vigor.' using errcode = '55000'; end if;
  v_def := v_new;
  v_new := replace(v_def, 'make_interval(mins => v_settings.production_window_minutes)', 'make_interval(mins => v_minutes)');
  if v_new = v_def then raise exception 'Não foi possível aplicar a janela em vigor.' using errcode = '55000'; end if;
  v_def := v_new;
  v_new := replace(v_def, '    v_settings.production_window_minutes, p_handled_by, v_name,', '    v_minutes, p_handled_by, v_name,');
  if v_new = v_def then raise exception 'Não foi possível guardar a janela usada.' using errcode = '55000'; end if;
  execute v_new;
end;
$$;

do $$
begin
  perform private.assert_history_protected();
end;
$$;
