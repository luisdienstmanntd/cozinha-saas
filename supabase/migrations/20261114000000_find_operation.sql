-- Fase 6, fatia 6.8: conferência de uma tentativa pendente (desenho 4.7). A tela guarda o intent_id de
-- uma operação cujo resultado ficou incerto (conexão caiu, aba fechada) e pergunta ao servidor se ela
-- chegou a ser gravada. A função só lê (SECURITY INVOKER: a RLS de cada tabela decide o que aparece) e
-- procura o identificador em recebimentos, manipulações, anulações de manipulação, decisões de
-- ocorrência e movimentos. Se mais de uma tabela tiver o mesmo identificador (a transferência de local
-- da 6.9 poderá repetir o da manipulação), devolve a manipulação (I-3). Nenhuma tabela ou coluna nova.
create function public.find_operation(p_organization_id uuid, p_establishment_id uuid, p_intent_id uuid)
returns table (kind text, id uuid, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select found.kind, found.id, found.created_at
    from (
      select 'handling'::text as kind, h.id, h.created_at, 1 as ord
        from public.container_handlings h
       where h.organization_id = p_organization_id and h.establishment_id = p_establishment_id
         and h.intent_id = p_intent_id
      union all
      select 'receipt', r.id, r.created_at, 2
        from public.batch_receipts r
       where r.organization_id = p_organization_id and r.establishment_id = p_establishment_id
         and r.intent_id = p_intent_id
      union all
      select 'handling_void', v.id, v.created_at, 3
        from public.handling_voids v
       where v.organization_id = p_organization_id and v.establishment_id = p_establishment_id
         and v.intent_id = p_intent_id
      union all
      select 'decision', d.id, d.created_at, 4
        from public.occurrence_decisions d
       where d.organization_id = p_organization_id and d.establishment_id = p_establishment_id
         and d.intent_id = p_intent_id
      union all
      select 'movement', m.id, m.created_at, 5
        from public.stock_movements m
       where m.organization_id = p_organization_id and m.establishment_id = p_establishment_id
         and m.intent_id = p_intent_id
    ) found
   where p_intent_id is not null
   order by found.ord
   limit 1;
$$;
revoke all on function public.find_operation(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.find_operation(uuid, uuid, uuid) to authenticated;

do $$
begin
  perform private.assert_history_protected();
end;
$$;
