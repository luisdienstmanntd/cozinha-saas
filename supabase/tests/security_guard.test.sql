-- Guarda de segurança transversal (REVISAO_05).
-- Parte 1: invariantes de catálogo que valem para QUALQUER tabela/função futura do schema public/private.
-- Parte 2: matriz de papéis nas funções de escrita (member, vínculo revogado, mistura entre empresas).
-- Parte 3: nomes compostos só por espaços invisíveis são recusados em organização e unidade.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Parte 1 — catálogo -------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname, ',' order by c.relname), '') from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity),
  '', 'toda tabela do schema public tem RLS habilitada');

select is(
  (select coalesce(string_agg(c.relname, ',' order by c.relname), '') from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v','m')
      and not coalesce('security_invoker=true' = any(c.reloptions), false)),
  '', 'nenhuma view do schema public contorna RLS (exige security_invoker)');

-- Os privilégios padrão do Supabase concedem TRUNCATE/TRIGGER/REFERENCES a anon em tabelas novas;
-- TRUNCATE ignora RLS. Este teste falha se uma migração futura esquecer o "revoke all".
select is(
  (select coalesce(string_agg(c.relname || ':' || p.priv, ',' order by c.relname, p.priv), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
    where n.nspname = 'public' and c.relkind in ('r','p','v','m')
      and has_table_privilege('anon', c.oid, p.priv)),
  '', 'anon não tem nenhum privilégio de tabela no schema public');

select is(
  (select coalesce(string_agg(c.relname, ',' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
      and has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')),
  '', 'anon não tem privilégio por coluna no schema public');

select is(
  (select coalesce(string_agg(c.relname || ':' || p.priv, ',' order by c.relname, p.priv), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
    where n.nspname = 'public' and c.relkind in ('r','p')
      and has_table_privilege('authenticated', c.oid, p.priv)),
  '', 'authenticated não apaga, trunca nem cria gatilhos/referências em nenhuma tabela');

select is(
  (select coalesce(string_agg(t, ',' order by t), '') from unnest(array[
      'public.memberships','public.batch_receipts','public.containers','public.stock_movements','public.entity_changes',
      'public.container_handlings','public.handling_voids','public.occurrences','public.occurrence_decisions']) t
    where has_any_column_privilege('authenticated', t::regclass, 'INSERT,UPDATE')),
  '', 'histórico e vínculos só mudam por funções autorizadas (sem INSERT/UPDATE direto)');

select is(
  (select coalesce(string_agg(t, ',' order by t), '') from unnest(array[
      'public.products','public.suppliers']) t
    where has_any_column_privilege('authenticated', t::regclass, 'UPDATE')),
  '', 'catálogo não é alterado diretamente pelo cliente');

select is(
  (select coalesce(string_agg(p.proname, ',' order by p.proname), '') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef),
  '', 'nenhuma função SECURITY DEFINER exposta no schema public da API');

select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ',' order by 1), '') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)),
  '', 'toda função SECURITY DEFINER fixa search_path vazio');

select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ',' order by 1), '') from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private')
      and (has_function_privilege('anon', p.oid, 'execute')
        or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  '', 'nenhuma função de public/private executável por anon ou PUBLIC');

-- Fase 6.0a (P5): histórico append-only para todos os papéis. Lista fixa: tabela nova de histórico
-- entra aqui e em private.assert_history_protected().
select is(
  (select coalesce(string_agg(t, ',' order by t), '') from unnest(array[
      'batch_receipts','containers','stock_movements','entity_changes','container_handlings','handling_voids',
      'occurrences','occurrence_decisions']) t
    where not exists (select 1 from pg_trigger g
      where g.tgrelid = ('public.' || t)::regclass and g.tgname = t || '_append_only'
        and g.tgfoid = 'private.reject_history_change()'::regprocedure
        and g.tgenabled = 'A' and (g.tgtype & 1) = 0 and (g.tgtype & 58) = 58)),
  '', 'toda tabela de histórico tem gatilho de proteção existente e habilitado (UPDATE, DELETE, TRUNCATE)');

select is(
  (select coalesce(string_agg(t || ':' || p.priv, ',' order by t, p.priv), '') from unnest(array[
      'public.batch_receipts','public.containers','public.stock_movements','public.entity_changes',
      'public.container_handlings','public.handling_voids','public.occurrences','public.occurrence_decisions']) t
    cross join (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
    where has_table_privilege('service_role', t::regclass, p.priv)),
  '', 'service_role só lê o histórico');

select lives_ok($$select private.assert_history_protected()$$, 'verificação final do histórico (usada pelos backfills) aceita o estado atual');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon sem acesso ao schema private');
select ok(not has_schema_privilege('authenticated', 'public', 'create'), 'authenticated não cria objetos em public');
select ok(not has_schema_privilege('authenticated', 'private', 'create'), 'authenticated não cria objetos em private');

-- Parte 2 — matriz de papéis ----------------------------------------------
-- u1: owner de A e de B; u2: member de A; u3: owner revogado de A.
insert into auth.users(id) values
 ('a1000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002'),('a1000000-0000-4000-8000-000000000003');
insert into organizations(id,name) values
 ('a2000000-0000-4000-8000-00000000000a','A'),('a2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('a3000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-00000000000a','UA','UTC'),
 ('a3000000-0000-4000-8000-00000000000b','a2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,revoked_at) values
 ('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000001','owner',null),
 ('a2000000-0000-4000-8000-00000000000b','a1000000-0000-4000-8000-000000000001','owner',null),
 ('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000002','member',null),
 ('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000003','owner',now());
insert into products(id,organization_id,establishment_id,name,unit) values
 ('a4000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','PA','kg'),
 ('a4000000-0000-4000-8000-00000000000b','a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','PB','kg');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('a5000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','FA'),
 ('a5000000-0000-4000-8000-00000000000b','a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','FB');
insert into batch_receipts(id,organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by) values
 ('a6000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a4000000-0000-4000-8000-00000000000a','a5000000-0000-4000-8000-00000000000a','a7000000-0000-4000-8000-000000000001','L1',10,'kg','2027-01-01','original','2027-01-01','UTC','a1000000-0000-4000-8000-000000000001');
insert into stock_movements(id,organization_id,establishment_id,batch_id,intent_id,kind,quantity,timezone,created_by) values
 ('a8000000-0000-4000-8000-00000000000a','a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a6000000-0000-4000-8000-00000000000a','a7000000-0000-4000-8000-000000000002','consumption',1,'UTC','a1000000-0000-4000-8000-000000000001');

set local role authenticated;

-- member de A: lê, mas não escreve por nenhuma função.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from batch_receipts), 1::bigint, 'member lê recebimentos da própria empresa');
select throws_ok($$select receive_batch('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a4000000-0000-4000-8000-00000000000a','a5000000-0000-4000-8000-00000000000a','L2',1,'2027-01-01','original','2027-01-01','ambient','not_required',null,null,'a7000000-0000-4000-8000-000000000010')$$,'42501',null,'member não recebe lote');
select throws_ok($$select ensure_container('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a6000000-0000-4000-8000-00000000000a')$$,'42501',null,'member não cria recipiente');
select throws_ok($$select record_movement('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a6000000-0000-4000-8000-00000000000a','consumption',1,null,'a7000000-0000-4000-8000-000000000011')$$,'42501',null,'member não registra saída');
select throws_ok($$select reverse_movement('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a8000000-0000-4000-8000-00000000000a','Erro','a7000000-0000-4000-8000-000000000012')$$,'42501',null,'member não anula saída');
select throws_ok($$select record_container_movement('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a',(select id from containers where batch_id='a6000000-0000-4000-8000-00000000000a'),'consumption',1,null,'a7000000-0000-4000-8000-000000000013')$$,'42501',null,'member não registra saída em recipiente');
select throws_ok($$select handle_container('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a',(select id from containers where batch_id='a6000000-0000-4000-8000-00000000000a'),'opening','{1}',current_date,'ambient',now(),'a1000000-0000-4000-8000-000000000002','sealed',null,null,null,'a7000000-0000-4000-8000-000000000014')$$,'42501',null,'member não manipula recipiente');
select throws_ok($$select void_handling('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a9000000-0000-4000-8000-0000000000ee','Erro','a7000000-0000-4000-8000-000000000015')$$,'42501',null,'member não anula manipulação');
select throws_ok($$select set_member_display_name('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000002','Membro')$$,'42501',null,'member não define nome de exibição');
select throws_ok($$select receive_batch('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a4000000-0000-4000-8000-00000000000a','a5000000-0000-4000-8000-00000000000a','L2',1,'2027-01-01','original','2027-01-01','refrigerated','measured',4,null,'a7000000-0000-4000-8000-000000000016')$$,'42501',null,'member não recebe lote com temperatura');
select throws_ok($$select set_product_storage_condition('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a4000000-0000-4000-8000-00000000000a','refrigerated')$$,'42501',null,'member não define conservação do produto');
select throws_ok($$select decide_occurrence('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a9000000-0000-4000-8000-0000000000ef','released','Medido depois','a7000000-0000-4000-8000-000000000017')$$,'42501',null,'member não decide ocorrência');
select throws_ok($$insert into products(organization_id,establishment_id,name,unit) values ('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','X','kg')$$,'42501',null,'member não cadastra produto');

-- owner revogado de A: nada lê e nada escreve, mesmo com token válido.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from batch_receipts) + (select count(*) from stock_movements) + (select count(*) from products), 0::bigint, 'vínculo revogado não lê dados');
select throws_ok($$select receive_batch('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a4000000-0000-4000-8000-00000000000a','a5000000-0000-4000-8000-00000000000a','L2',1,'2027-01-01','original','2027-01-01','ambient','not_required',null,null,'a7000000-0000-4000-8000-000000000020')$$,'42501',null,'revogado não recebe lote');
select throws_ok($$select ensure_container('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a6000000-0000-4000-8000-00000000000a')$$,'42501',null,'revogado não cria recipiente');
select throws_ok($$select record_movement('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a6000000-0000-4000-8000-00000000000a','consumption',1,null,'a7000000-0000-4000-8000-000000000021')$$,'42501',null,'revogado não registra saída');
select throws_ok($$select reverse_movement('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a8000000-0000-4000-8000-00000000000a','Erro','a7000000-0000-4000-8000-000000000022')$$,'42501',null,'revogado não anula saída');
select throws_ok($$select record_container_movement('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a9000000-0000-4000-8000-00000000000a','consumption',1,null,'a7000000-0000-4000-8000-000000000023')$$,'42501',null,'revogado não registra saída em recipiente');
select throws_ok($$select handle_container('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a9000000-0000-4000-8000-00000000000a','opening','{1}',current_date,'ambient',now(),'a1000000-0000-4000-8000-000000000002','sealed',null,null,null,'a7000000-0000-4000-8000-000000000024')$$,'42501',null,'revogado não manipula recipiente');
select throws_ok($$select void_handling('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a9000000-0000-4000-8000-0000000000ee','Erro','a7000000-0000-4000-8000-000000000025')$$,'42501',null,'revogado não anula manipulação');
select throws_ok($$select set_member_display_name('a2000000-0000-4000-8000-00000000000a','a1000000-0000-4000-8000-000000000002','Membro')$$,'42501',null,'revogado não define nome de exibição');
select throws_ok($$select receive_batch('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a4000000-0000-4000-8000-00000000000a','a5000000-0000-4000-8000-00000000000a','L2',1,'2027-01-01','original','2027-01-01','refrigerated','measured',4,null,'a7000000-0000-4000-8000-000000000026')$$,'42501',null,'revogado não recebe lote com temperatura');
select throws_ok($$select set_product_storage_condition('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a4000000-0000-4000-8000-00000000000a','refrigerated')$$,'42501',null,'revogado não define conservação do produto');
select throws_ok($$select decide_occurrence('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000a','a9000000-0000-4000-8000-0000000000ef','released','Medido depois','a7000000-0000-4000-8000-000000000027')$$,'42501',null,'revogado não decide ocorrência');

-- owner de A e B: não mistura registros de uma empresa (ou unidade) com outra.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select receive_batch('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','a4000000-0000-4000-8000-00000000000a','a5000000-0000-4000-8000-00000000000b','L2',1,'2027-01-01','original','2027-01-01','ambient','not_required',null,null,'a7000000-0000-4000-8000-000000000030')$$,'23503',null,'produto de A não entra em lote de B');
select throws_ok($$select receive_batch('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','a4000000-0000-4000-8000-00000000000b','a5000000-0000-4000-8000-00000000000a','L2',1,'2027-01-01','original','2027-01-01','ambient','not_required',null,null,'a7000000-0000-4000-8000-000000000031')$$,'23503',null,'fornecedor de A não entra em lote de B');
select throws_ok($$select receive_batch('a2000000-0000-4000-8000-00000000000a','a3000000-0000-4000-8000-00000000000b','a4000000-0000-4000-8000-00000000000a','a5000000-0000-4000-8000-00000000000a','L2',1,'2027-01-01','original','2027-01-01','ambient','not_required',null,null,'a7000000-0000-4000-8000-000000000032')$$,'23503',null,'unidade de B não é aceita sob empresa A');
select throws_ok($$select ensure_container('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','a6000000-0000-4000-8000-00000000000a')$$,'23503',null,'lote de A não gera recipiente em B');
select throws_ok($$select record_movement('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','a6000000-0000-4000-8000-00000000000a','consumption',1,null,'a7000000-0000-4000-8000-000000000033')$$,'23503',null,'lote de A não recebe saída por B');
select throws_ok($$select reverse_movement('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','a8000000-0000-4000-8000-00000000000a','Erro','a7000000-0000-4000-8000-000000000034')$$,'23503',null,'saída de A não é anulada por B');
select throws_ok($$select record_container_movement('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b',(select id from containers where batch_id='a6000000-0000-4000-8000-00000000000a'),'consumption',1,null,'a7000000-0000-4000-8000-000000000035')$$,'23503',null,'recipiente de A não recebe saída por B');
select throws_ok($$select handle_container('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b',(select id from containers where batch_id='a6000000-0000-4000-8000-00000000000a'),'opening','{1}',current_date,'ambient',now(),'a1000000-0000-4000-8000-000000000001','sealed',null,null,null,'a7000000-0000-4000-8000-000000000036')$$,'23503',null,'recipiente de A não é manipulado por B');
select throws_ok($$select void_handling('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','a9000000-0000-4000-8000-0000000000ee','Erro','a7000000-0000-4000-8000-000000000037')$$,'23503',null,'manipulação inexistente em B recusada sem revelar existência');
select throws_ok($$select set_member_display_name('a2000000-0000-4000-8000-00000000000b','a1000000-0000-4000-8000-000000000002','Membro')$$,'23503',null,'vínculo de A não recebe nome por B');
select throws_ok($$select receive_batch('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','a4000000-0000-4000-8000-00000000000a','a5000000-0000-4000-8000-00000000000b','L2',1,'2027-01-01','original','2027-01-01','refrigerated','measured',4,null,'a7000000-0000-4000-8000-000000000038')$$,'23503',null,'produto de A não entra em lote de B com temperatura');
select throws_ok($$select set_product_storage_condition('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','a4000000-0000-4000-8000-00000000000a','refrigerated')$$,'23503',null,'produto de A não recebe conservação por B');
select throws_ok($$select decide_occurrence('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000b','a9000000-0000-4000-8000-0000000000ef','released','Medido depois','a7000000-0000-4000-8000-000000000039')$$,'23503',null,'ocorrência inexistente em B recusada sem revelar existência');
select throws_ok($$insert into products(organization_id,establishment_id,name,unit) values ('a2000000-0000-4000-8000-00000000000b','a3000000-0000-4000-8000-00000000000a','X','kg')$$,'23503',null,'produto não aponta para unidade de outra empresa');
select is((select count(*) from stock_movements where organization_id='a2000000-0000-4000-8000-00000000000b'), 0::bigint, 'nenhum evento foi criado em B');
select is((select count(*) from container_handlings), 0::bigint, 'nenhuma manipulação foi criada pelas recusas');
select is((select count(*) from handling_voids), 0::bigint, 'nenhuma anulação de manipulação foi criada pelas recusas');
select is((select count(*) from occurrence_decisions) + (select count(*) from products where storage_condition is not null), 0::bigint, 'nenhuma decisão nem conservação de produto foi criada pelas recusas');

-- Parte 3 — nomes visíveis --------------------------------------------------
-- A interface usa String.prototype.trim (Zod); o banco precisa recusar o mesmo conjunto de espaços,
-- senão um nome "invisível" quebra a validação de leitura e o carregamento de acesso de todos os membros.
select throws_ok($$update organizations set name=E'\t' where id='a2000000-0000-4000-8000-00000000000a'$$,'23514',null,'organização não aceita nome só com tabulação');
select throws_ok($$update organizations set name=U&'\00A0' where id='a2000000-0000-4000-8000-00000000000a'$$,'23514',null,'organização não aceita nome só com espaço não separável');
select throws_ok($$insert into establishments(organization_id,name,timezone) values ('a2000000-0000-4000-8000-00000000000a',U&'\3000','UTC')$$,'23514',null,'unidade não aceita nome só com espaço ideográfico');
select throws_ok($$update establishments set name=E'\n' where id='a3000000-0000-4000-8000-00000000000a'$$,'23514',null,'unidade não aceita nome só com quebra de linha');
select lives_ok($$update organizations set name='Empresa A' where id='a2000000-0000-4000-8000-00000000000a'$$,'nome comum continua aceito');

select * from finish();
rollback;
