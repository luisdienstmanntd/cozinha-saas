-- Fase 7, fatia 7.1: preparação própria no banco (D-049). Lote produzido com validade informada pela
-- pessoa, integral pelo gatilho da 6.1 e as mesmas regras de saldo, ocorrência, vencido e locais.
-- Datas relativas à data de hoje no fuso da unidade (nunca current_date). Dados sintéticos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Estrutura e permissões.
select has_table('public', 'batch_productions', 'batch_productions existe');
select ok(not has_table_privilege('authenticated', 'public.batch_productions', 'INSERT'), 'cliente não insere produção direto');
select ok(not has_table_privilege('service_role', 'public.batch_productions', 'INSERT'), 'service_role não insere produção direto');
select ok(not has_function_privilege('anon',
  'public.register_production(uuid,uuid,uuid,numeric,date,timestamptz,uuid,text,text,uuid)', 'execute'), 'anon não registra produção');
select ok((select not prosecdef from pg_proc
  where oid = 'public.register_production(uuid,uuid,uuid,numeric,date,timestamptz,uuid,text,text,uuid)'::regprocedure),
  'register_production público é SECURITY INVOKER');
select ok(has_column_privilege('authenticated', 'public.products', 'kind', 'INSERT'), 'o tipo do item é escolhido ao criar');
select ok(not has_column_privilege('authenticated', 'public.products', 'kind', 'UPDATE'), 'o tipo do item não é trocado depois');
-- O backfill da 7.1 é pelo default constante (sem reescrever o histórico). Sem contar linhas: a bateria
-- de integração deixa lotes produzidos no banco local entre execuções.
select col_default_is('public', 'batch_receipts', 'origin', 'received'::text, 'lote sem origem informada é recebido');
select col_default_is('public', 'products', 'kind', 'product'::text, 'item sem tipo informado é produto');

insert into auth.users(id) values
 ('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002'),
 ('d1000000-0000-4000-8000-000000000003'),('d1000000-0000-4000-8000-000000000004'),
 ('d1000000-0000-4000-8000-000000000005');
insert into organizations(id,name) values
 ('d2000000-0000-4000-8000-00000000000a','A'),('d2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('d3000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-00000000000a','Cozinha','America/Sao_Paulo'),
 ('d3000000-0000-4000-8000-0000000000a2','d2000000-0000-4000-8000-00000000000a','Outra','America/Sao_Paulo'),
 ('d3000000-0000-4000-8000-0000000000b1','d2000000-0000-4000-8000-00000000000b','UB','America/Sao_Paulo');
insert into memberships(organization_id,user_id,role,display_name,revoked_at) values
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000001','owner','Dona',null),
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000002','member','Ana',null),
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000004','member',null,null),
 ('d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000005','member','Saiu',now()),
 ('d2000000-0000-4000-8000-00000000000b','d1000000-0000-4000-8000-000000000003','owner','Outra',null);
insert into products(id,organization_id,establishment_id,name,unit,storage_condition,kind) values
 ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','Caldo de legumes','l','refrigerated','preparation'),
 ('d4000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','Bolo simples','un','ambient','preparation'),
 ('d4000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','Molho sem conservação','l',null,'preparation'),
 ('d4000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','Leite','l','refrigerated','product'),
 ('d4000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a2','Suco','l','refrigerated','preparation');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','F');

select (now() at time zone 'America/Sao_Paulo')::date as sp \gset
select now() - interval '30 minutes' as at30 \gset
select now() - interval '3 hours' as at3h \gset

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

create function pg_temp.produce(p_product uuid, p_qty numeric, p_expiry date, p_at timestamptz, p_by uuid,
  p_note text, p_late text, p_intent uuid,
  p_est uuid default 'd3000000-0000-4000-8000-0000000000a1', p_org uuid default 'd2000000-0000-4000-8000-00000000000a')
returns uuid language sql as $$
  select public.register_production(p_org, p_est, p_product, p_qty, p_expiry, p_at, p_by, p_note, p_late, p_intent)
$$;
create function pg_temp.integral(p_batch uuid) returns uuid language sql as $$
  select id from public.containers where batch_id = p_batch and kind = 'integral'
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1) Registro normal: lote produzido, integral com saldo, produção com quem produziu.
select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 6, :'sp'::date + 2, :'at30',
  'd1000000-0000-4000-8000-000000000002', 'Panela grande', null, 'd7000000-0000-4000-8000-000000000001') as caldo \gset
select pg_temp.integral(:'caldo') as caldo_box \gset
select is((select origin || ':' || coalesce(supplier_id::text, '-') || ':' || coalesce(source_code, '-') || ':' || expiry_origin
             || ':' || coalesce(original_expiry_date::text, '-') || ':' || storage_condition || ':' || temperature_status
             || ':' || unit || ':' || quantity
             from public.batch_receipts where id = :'caldo'::uuid),
  'produced:-:-:responsible:-:refrigerated:not_required:l:6', 'lote produzido sem fornecedor, lote ou temperatura de recebimento');
select is((select expiry_date from public.batch_receipts where id = :'caldo'::uuid), :'sp'::date + 2,
  'a validade gravada é exatamente a informada');
select is((select handled_by_name || ':' || note || ':' || late::text || ':' || (produced_at = :'at30'::timestamptz)::text
             from public.batch_productions where batch_id = :'caldo'::uuid),
  'Ana:Panela grande:false:true', 'produção guarda quem produziu (nome copiado), observação e horário');
select is((select created_by from public.batch_receipts where id = :'caldo'::uuid), 'd1000000-0000-4000-8000-000000000001'::uuid,
  'quem registra é o proprietário (D-019)');
select is((select kind || ':' || storage || ':' || expiry_date || ':' || initial_quantity from public.containers where id = :'caldo_box'::uuid),
  'integral:refrigerated:' || (:'sp'::date + 2) || ':6', 'integral nasce com conservação, validade e quantidade do lote');
select is((select balance from public.container_balances where container_id = :'caldo_box'::uuid), 6::numeric, 'saldo igual à produção');
select is((select count(*) from public.occurrences where batch_id = :'caldo'::uuid), 0::bigint, 'dentro da janela não abre ocorrência');
select is((select count(*) from public.container_blocks('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1', :'caldo_box')),
  0::bigint, 'lote dentro da janela não fica bloqueado');

-- 2) Idempotência e recuperação de tentativa.
select is(pg_temp.produce('d4000000-0000-4000-8000-000000000001', 6, :'sp'::date + 2, :'at30',
  'd1000000-0000-4000-8000-000000000002', 'Panela grande', null, 'd7000000-0000-4000-8000-000000000001'), :'caldo'::uuid,
  'reenvio com os mesmos dados devolve o mesmo lote');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 6, %L, %L,
  'd1000000-0000-4000-8000-000000000002', 'Panela grande', null, 'd7000000-0000-4000-8000-000000000001')$$, :'sp'::date + 3, :'at30'),
  '23505', null, 'mesmo identificador com outra validade é recusado');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 6, %L, %L,
  'd1000000-0000-4000-8000-000000000001', 'Panela grande', null, 'd7000000-0000-4000-8000-000000000001')$$, :'sp'::date + 2, :'at30'),
  '23505', null, 'mesmo identificador com outra pessoa é recusado');
select is((select count(*) from public.batch_receipts where intent_id = 'd7000000-0000-4000-8000-000000000001'), 1::bigint,
  'um lote por identificador');
select is((select kind || ':' || (id = :'caldo'::uuid)::text from public.find_operation('d2000000-0000-4000-8000-00000000000a',
  'd3000000-0000-4000-8000-0000000000a1','d7000000-0000-4000-8000-000000000001')), 'production:true',
  'find_operation encontra a produção pelo identificador');

-- 3) Validade digitada: nada calculado; só o impossível é recusado.
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000002')$$, :'sp'::date - 1, :'at30'),
  '22023', null, 'validade anterior à data da produção (ou de hoje) é recusada');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, null, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000003')$$, :'at30'),
  '22023', 'Dados inválidos.', 'validade é obrigatória');
select lives_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000002', 12, %L, %L,
  'd1000000-0000-4000-8000-000000000001', null, null, 'd7000000-0000-4000-8000-000000000004')$$, :'sp'::date, :'at30'),
  'validade igual a hoje é aceita (a confirmação extra é da tela)');
select lives_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000002', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000001', null, null, 'd7000000-0000-4000-8000-000000000005')$$, :'sp'::date + 400, :'at30'),
  'validade longa não é limitada pelo sistema (sem prazo padrão, D-004)');

-- 4) Forma e item do catálogo.
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000002', 1.5, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000006')$$, :'sp'::date + 1, :'at30'),
  '22023', 'Quantidade inválida.', 'preparação em unidades não aceita fração');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 0, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000007')$$, :'sp'::date + 1, :'at30'),
  '22023', 'Dados inválidos.', 'quantidade zero é recusada');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000002', '   ', null, 'd7000000-0000-4000-8000-000000000008')$$, :'sp'::date + 1, :'at30'),
  '22023', 'Dados inválidos.', 'observação só com espaços é recusada');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000004', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000009')$$, :'sp'::date + 1, :'at30'),
  '22023', 'Só item do catálogo marcado como preparação pode ser produzido.', 'produto recebido não é produzido');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000003', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000010')$$, :'sp'::date + 1, :'at30'),
  '22023', 'Defina a conservação da preparação antes de registrar a produção.', 'preparação sem conservação definida é recusada');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000005', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000011')$$, :'sp'::date + 1, :'at30'),
  '23503', null, 'preparação de outra unidade não é produzida nesta');
select throws_ok($$select public.receive_batch('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  'd4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','L-1',1,current_date+60,'original',current_date+60,
  'refrigerated','measured',3.0,null,'d7000000-0000-4000-8000-000000000012')$$,
  '22023', 'Preparação própria não é recebida: registre a produção.', 'preparação não entra como recebimento');

-- 5) Quem produziu.
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000005', null, null, 'd7000000-0000-4000-8000-000000000013')$$, :'sp'::date + 1, :'at30'),
  '22023', 'A pessoa que produziu precisa ter vínculo ativo com a empresa.', 'vínculo revogado não produz');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000003', null, null, 'd7000000-0000-4000-8000-000000000014')$$, :'sp'::date + 1, :'at30'),
  '22023', 'A pessoa que produziu precisa ter vínculo ativo com a empresa.', 'pessoa de outra empresa não produz aqui');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000004', null, null, 'd7000000-0000-4000-8000-000000000015')$$, :'sp'::date + 1, :'at30'),
  '22023', 'Defina o nome de exibição da pessoa que produziu antes de registrar.', 'sem nome de exibição não registra');

-- 6) Horário e janela (D-031): futuro recusado; acima de 2 h só com justificativa e ocorrência.
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000016')$$, :'sp'::date + 1, now() + interval '5 minutes'),
  '22023', 'O horário da produção não pode estar no futuro.', 'produção no futuro é recusada');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000017')$$, :'sp'::date + 1, :'at3h'),
  '22023', null, 'produção registrada mais de 2 h depois sem justificativa é recusada');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, 'Esqueci', 'd7000000-0000-4000-8000-000000000018')$$, :'sp'::date + 1, :'at30'),
  '22023', null, 'justificativa de atraso dentro da janela é recusada');
select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 4, :'sp'::date + 1, :'at3h',
  'd1000000-0000-4000-8000-000000000002', null, 'Registro no fim do turno', 'd7000000-0000-4000-8000-000000000019') as tarde \gset
select pg_temp.integral(:'tarde') as tarde_box \gset
select is((select kind || ':' || reason from public.occurrences where batch_id = :'tarde'::uuid),
  'late_production:Registro no fim do turno', 'produção tardia abre ocorrência com a justificativa');
select is((select late from public.batch_productions where batch_id = :'tarde'::uuid), true, 'produção marcada como tardia');
select is((select string_agg(kind || ':' || status, ',') from public.container_blocks('d2000000-0000-4000-8000-00000000000a',
  'd3000000-0000-4000-8000-0000000000a1', :'tarde_box')), 'late_production:pending', 'o integral fica bloqueado até a decisão');
select throws_ok(format($$select public.record_container_movement('d2000000-0000-4000-8000-00000000000a',
  'd3000000-0000-4000-8000-0000000000a1', %L, 'consumption', 1, null, 'd7000000-0000-4000-8000-000000000020')$$, :'tarde_box'),
  '22023', null, 'consumo do lote bloqueado é recusado');
select is((select count(*) from public.list_occurrences('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1')
  where kind = 'late_production' and jsonb_array_length(containers) = 1 and source_code is null), 1::bigint,
  'a ocorrência aparece na lista da unidade com o recipiente bloqueado');
select is(pg_temp.produce('d4000000-0000-4000-8000-000000000001', 4, :'sp'::date + 1, :'at3h',
  'd1000000-0000-4000-8000-000000000002', null, 'Registro no fim do turno', 'd7000000-0000-4000-8000-000000000019'), :'tarde'::uuid,
  'reenvio da produção tardia devolve o mesmo lote');
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 4, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, 'Outro motivo', 'd7000000-0000-4000-8000-000000000019')$$, :'sp'::date + 1, :'at3h'),
  '23505', null, 'reenvio com outra justificativa é recusado');
select lives_ok(format($$select public.decide_occurrence('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  (select id from public.occurrences where batch_id = %L), 'released', 'Conferido com a equipe', 'd7000000-0000-4000-8000-000000000021')$$, :'tarde'),
  'o proprietário libera a produção tardia');
select is((select count(*) from public.container_blocks('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1', :'tarde_box')),
  0::bigint, 'liberada, o lote deixa de estar bloqueado');
select lives_ok(format($$select public.record_container_movement('d2000000-0000-4000-8000-00000000000a',
  'd3000000-0000-4000-8000-0000000000a1', %L, 'consumption', 1, null, 'd7000000-0000-4000-8000-000000000022')$$, :'tarde_box'),
  'depois da liberação o consumo funciona');

-- 7) Saldo, consumo, descarte e anulação de consumo funcionam sem código novo.
select public.record_container_movement('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  :'caldo_box', 'consumption', 1, null, 'd7000000-0000-4000-8000-000000000030') as cons \gset
select lives_ok(format($$select public.record_container_movement('d2000000-0000-4000-8000-00000000000a',
  'd3000000-0000-4000-8000-0000000000a1', %L, 'discard', 0.5, 'Caiu no chão', 'd7000000-0000-4000-8000-000000000031')$$, :'caldo_box'),
  'descarte com motivo funciona');
select is((select balance from public.container_balances where container_id = :'caldo_box'::uuid), 4.5::numeric, 'saldo baixa com consumo e descarte');
select lives_ok(format($$select public.reverse_movement('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  %L, 'Lançado errado', 'd7000000-0000-4000-8000-000000000032')$$, :'cons'), 'anular o consumo funciona');
select is((select balance from public.container_balances where container_id = :'caldo_box'::uuid), 5.5::numeric, 'anulação devolve o saldo');

-- 8) Porcionar sim; abrir não (ponto 3 aceito). Porção não passa da validade do lote.
select throws_ok(format($$select public.handle_container('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  %L, 'opening', array[1]::numeric[], %L, 'refrigerated', now(), 'd1000000-0000-4000-8000-000000000002', 'sealed', null, null, null,
  'd7000000-0000-4000-8000-000000000040')$$, :'caldo_box', :'sp'::date + 1),
  '22023', 'Preparação própria não é aberta: use o porcionamento.', 'abrir preparação é recusado');
select throws_ok(format($$select public.handle_container('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  %L, 'portioning', array[1,1]::numeric[], %L, 'refrigerated', now(), 'd1000000-0000-4000-8000-000000000002', 'discard', 'Sobra', null, null,
  'd7000000-0000-4000-8000-000000000041')$$, :'caldo_box', :'sp'::date + 3),
  '22023', null, 'porção com validade depois da do lote é recusada');
select public.handle_container('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  :'caldo_box', 'portioning', array[1,1,1,1,1.5]::numeric[], :'sp'::date + 2, 'refrigerated', now(),
  'd1000000-0000-4000-8000-000000000002', 'none', null, null, null, 'd7000000-0000-4000-8000-000000000042') as porc \gset
select is((select count(*) from public.containers where handling_id = :'porc'::uuid), 5::bigint, 'porcionar a preparação cria as porções');
select is((select balance from public.container_balances where container_id = :'caldo_box'::uuid), 0::numeric, 'o lote fica sem saldo');

-- 9) Vencido (6.11) vale para o lote produzido sem regra própria. Lote vencido montado como fixture.
reset role;
insert into public.batch_receipts (id, organization_id, establishment_id, product_id, quantity, unit, expiry_date, expiry_origin,
  storage_condition, temperature_status, origin, intent_id, timezone, created_by, created_at)
values ('d6000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  'd4000000-0000-4000-8000-000000000002', 3, 'un', :'sp'::date - 1, 'responsible', 'ambient', 'not_required', 'produced',
  'd7000000-0000-4000-8000-000000000050', 'America/Sao_Paulo', 'd1000000-0000-4000-8000-000000000001', now() - interval '3 days');
insert into public.batch_productions (organization_id, establishment_id, batch_id, produced_at, late, handled_by, handled_by_name,
  timezone, created_by, created_at)
values ('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','d6000000-0000-4000-8000-000000000001',
  now() - interval '3 days', false, 'd1000000-0000-4000-8000-000000000002', 'Ana', 'America/Sao_Paulo',
  'd1000000-0000-4000-8000-000000000001', now() - interval '3 days');
set local role authenticated;
select pg_temp.integral('d6000000-0000-4000-8000-000000000001') as velho \gset
select throws_like(format($$select public.record_container_movement('d2000000-0000-4000-8000-00000000000a',
  'd3000000-0000-4000-8000-0000000000a1', %L, 'consumption', 1, null, 'd7000000-0000-4000-8000-000000000051')$$, :'velho'),
  'Recipiente vencido:%', 'consumo de preparação vencida é recusado pela regra da 6.11');
select lives_ok(format($$select public.record_container_movement('d2000000-0000-4000-8000-00000000000a',
  'd3000000-0000-4000-8000-0000000000a1', %L, 'discard', 3, 'Venceu', 'd7000000-0000-4000-8000-000000000052')$$, :'velho'),
  'descarte de preparação vencida é permitido');

-- 10) Formas impossíveis recusadas pelo próprio banco (mesmo como superusuário).
reset role;
select throws_ok($$insert into public.batch_receipts (organization_id, establishment_id, product_id, supplier_id, source_code, quantity,
  unit, expiry_date, expiry_origin, storage_condition, temperature_status, origin, intent_id, timezone, created_by)
  values ('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','d4000000-0000-4000-8000-000000000002',
  'd5000000-0000-4000-8000-000000000001', 'L-X', 1, 'un', current_date + 5, 'responsible', 'ambient', 'not_required', 'produced',
  'd7000000-0000-4000-8000-000000000060', 'America/Sao_Paulo', 'd1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'lote produzido não tem fornecedor nem lote do fabricante');
select throws_ok($$insert into public.batch_receipts (organization_id, establishment_id, product_id, quantity,
  unit, expiry_date, expiry_origin, storage_condition, temperature_status, intent_id, timezone, created_by)
  values ('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','d4000000-0000-4000-8000-000000000004',
  1, 'l', current_date + 5, 'responsible', 'refrigerated', 'measured', 'd7000000-0000-4000-8000-000000000061', 'America/Sao_Paulo',
  'd1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'recebimento continua exigindo fornecedor e lote');
select throws_ok($$insert into public.batch_receipts (organization_id, establishment_id, product_id, quantity,
  unit, expiry_date, expiry_origin, storage_condition, temperature_status, origin, intent_id, timezone, created_by)
  values ('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1','d4000000-0000-4000-8000-000000000001',
  1, 'l', current_date + 5, 'responsible', 'refrigerated', 'measured', 'produced', 'd7000000-0000-4000-8000-000000000062', 'America/Sao_Paulo',
  'd1000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'lote produzido não tem temperatura de recebimento');
select throws_ok(format($$insert into public.batch_productions (organization_id, establishment_id, batch_id, produced_at, late,
  handled_by, handled_by_name, timezone, created_by)
  values ('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1', (select batch_id from public.containers where id = %L),
  now(), false, 'd1000000-0000-4000-8000-000000000002', 'Ana', 'America/Sao_Paulo', 'd1000000-0000-4000-8000-000000000001')$$,
  (select id from public.containers where batch_id <> :'caldo'::uuid and batch_id in (select id from public.batch_receipts where origin = 'received') limit 1)),
  '23514', null, 'registro de produção não se liga a recebimento');
select is((select count(*) from private.production_problems()), 0::bigint, 'todo lote produzido tem exatamente seu registro de produção');
select is((select count(*) from private.occurrence_problems()), 0::bigint, 'ocorrências coerentes com as produções');
select is((select count(*) from private.stock_conservation_problems()), 0::bigint, 'conservação do saldo continua fechando');

-- 11) Membro só consulta; outra empresa não vê nada.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok(format($$select pg_temp.produce('d4000000-0000-4000-8000-000000000001', 1, %L, %L,
  'd1000000-0000-4000-8000-000000000002', null, null, 'd7000000-0000-4000-8000-000000000070')$$, :'sp'::date + 1, :'at30'),
  '42501', 'Acesso negado.', 'membro não registra produção (D-019)');
select ok((select count(*) from public.batch_productions) >= 2, 'membro lê as produções da empresa');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.batch_productions), 0::bigint, 'outra empresa não vê produções de A');
select throws_ok(format($$select public.register_production('d2000000-0000-4000-8000-00000000000a','d3000000-0000-4000-8000-0000000000a1',
  'd4000000-0000-4000-8000-000000000001', 1, %L, %L, 'd1000000-0000-4000-8000-000000000002', null, null,
  'd7000000-0000-4000-8000-000000000071')$$, :'sp'::date + 1, :'at30'),
  '42501', 'Acesso negado.', 'proprietário de outra empresa não registra produção em A');
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok(format($$select public.register_production('d2000000-0000-4000-8000-00000000000b','d3000000-0000-4000-8000-0000000000b1',
  'd4000000-0000-4000-8000-000000000001', 1, %L, %L, 'd1000000-0000-4000-8000-000000000002', null, null,
  'd7000000-0000-4000-8000-000000000072')$$, :'sp'::date + 1, :'at30'),
  '42501', 'Acesso negado.', 'proprietário de A não registra produção na empresa B');

-- 12) Histórico append-only.
select throws_ok($$update public.batch_productions set note = 'x'$$, null, null, 'produção não é alterada');
select throws_ok($$delete from public.batch_productions$$, null, null, 'produção não é apagada');
reset role;
select throws_ok($$update public.batch_productions set note = 'x'$$, null, null, 'nem pelo superusuário');
select throws_ok($$truncate public.batch_productions$$, null, null, 'produção não é truncada');
select lives_ok($$select private.assert_history_protected()$$, 'a guarda de histórico inclui batch_productions e passa');

select * from finish();
rollback;
