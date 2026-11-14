-- Fase 7, fatia 7.2: anular produção (D-049, desenho 4.6). Só o proprietário, com motivo, uma vez,
-- enquanto o lote não teve nenhum movimento; zera o saldo do integral. Dados sintéticos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'production_voids', 'production_voids existe');
select ok(not has_table_privilege('authenticated', 'public.production_voids', 'INSERT'), 'cliente não insere anulação direto');
select ok(not has_function_privilege('anon', 'public.void_production(uuid,uuid,uuid,text,uuid)', 'execute'), 'anon não anula');
select ok((select not prosecdef from pg_proc where oid = 'public.void_production(uuid,uuid,uuid,text,uuid)'::regprocedure),
  'void_production público é SECURITY INVOKER');

insert into auth.users(id) values
 ('c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000002'),('c1000000-0000-4000-8000-000000000003');
insert into organizations(id,name) values
 ('c2000000-0000-4000-8000-00000000000a','A'),('c2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('c3000000-0000-4000-8000-0000000000a1','c2000000-0000-4000-8000-00000000000a','Cozinha','America/Sao_Paulo'),
 ('c3000000-0000-4000-8000-0000000000a2','c2000000-0000-4000-8000-00000000000a','Outra','America/Sao_Paulo'),
 ('c3000000-0000-4000-8000-0000000000b1','c2000000-0000-4000-8000-00000000000b','UB','America/Sao_Paulo');
insert into memberships(organization_id,user_id,role,display_name) values
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000001','owner','Dona Maria Silva'),
 ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000002','member','Ana Souza'),
 ('c2000000-0000-4000-8000-00000000000b','c1000000-0000-4000-8000-000000000003','owner','Outra');
insert into products(id,organization_id,establishment_id,name,unit,storage_condition,kind) values
 ('c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','Caldo de legumes','l','refrigerated','preparation'),
 ('c4000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','Arroz','kg','ambient','product');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('c5000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1','F');

select (now() at time zone 'America/Sao_Paulo')::date as sp \gset
select now() - interval '20 minutes' as at20 \gset

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

create function pg_temp.produce(p_qty numeric, p_intent uuid) returns uuid language sql as $$
  select public.register_production('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
    'c4000000-0000-4000-8000-000000000001', p_qty, ((now() at time zone 'America/Sao_Paulo')::date + 2),
    now() - interval '20 minutes', 'c1000000-0000-4000-8000-000000000002', null, null, p_intent)
$$;
create function pg_temp.void(p_batch uuid, p_reason text, p_intent uuid) returns uuid language sql as $$
  select public.void_production('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
    p_batch, p_reason, p_intent)
$$;
create function pg_temp.integral(p_batch uuid) returns uuid language sql as $$
  select id from public.containers where batch_id = p_batch and kind = 'integral'
$$;
grant execute on all functions in schema pg_temp to authenticated;

select pg_temp.produce(6, 'c7000000-0000-4000-8000-000000000001') as lote \gset
select pg_temp.integral(:'lote') as box \gset

-- 1) Forma e permissão.
select throws_ok(format($$select pg_temp.void(%L, null, 'c7000000-0000-4000-8000-000000000010')$$, :'lote'),
  '22023', 'Informe o motivo da anulação.', 'motivo é obrigatório');
select throws_ok(format($$select pg_temp.void(%L, '   ', 'c7000000-0000-4000-8000-000000000011')$$, :'lote'),
  '22023', 'Informe o motivo da anulação.', 'motivo só com espaços é recusado');
select throws_ok(format($$select pg_temp.void(%L, repeat('x', 301), 'c7000000-0000-4000-8000-000000000012')$$, :'lote'),
  '22023', 'Informe o motivo da anulação.', 'motivo acima de 300 caracteres é recusado');
select throws_ok($$select pg_temp.void('c6000000-0000-4000-8000-0000000000ff', 'Errado', 'c7000000-0000-4000-8000-000000000013')$$,
  '23503', 'Lote não encontrado.', 'lote inexistente é recusado');
select throws_ok(format($$select public.void_production('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a2',
  %L, 'Errado', 'c7000000-0000-4000-8000-000000000014')$$, :'lote'),
  '23503', 'Lote não encontrado.', 'lote de outra unidade não é anulado por esta');

select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok(format($$select pg_temp.void(%L, 'Errado', 'c7000000-0000-4000-8000-000000000015')$$, :'lote'),
  '42501', 'Acesso negado.', 'membro não anula produção (D-019)');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok(format($$select pg_temp.void(%L, 'Errado', 'c7000000-0000-4000-8000-000000000016')$$, :'lote'),
  '42501', 'Acesso negado.', 'proprietário de outra empresa não anula');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- 2) Recebimento não é anulado por aqui.
select public.ensure_container('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  public.receive_batch('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  'c4000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000001','L-1',5,current_date+30,'original',current_date+30,
  'ambient','not_required',null,null,'c7000000-0000-4000-8000-000000000020')) as rbox \gset
select throws_ok(format($$select pg_temp.void((select batch_id from public.containers where id = %L), 'Errado', 'c7000000-0000-4000-8000-000000000021')$$, :'rbox'),
  '22023', 'Só lote produzido pela cozinha é anulado por aqui; recebimento usa o descarte com motivo.', 'recebimento não é anulado como produção');

-- 3) Anulação normal: zera o integral, uma vez, idempotente.
select pg_temp.void(:'lote', 'Validade digitada errada', 'c7000000-0000-4000-8000-000000000030') as anul \gset
select is((select balance from public.container_balances where container_id = :'box'::uuid), 0::numeric, 'o integral fica com saldo zero');
select is((select kind || ':' || quantity || ':' || reason from public.stock_movements where container_id = :'box'::uuid),
  'production_void:6:Validade digitada errada', 'um movimento de anulação com toda a quantidade e o motivo');
select is((select reason || ':' || created_by from public.production_voids where batch_id = :'lote'::uuid),
  'Validade digitada errada:c1000000-0000-4000-8000-000000000001', 'a anulação guarda motivo e autor');
select is(pg_temp.void(:'lote', 'Validade digitada errada', 'c7000000-0000-4000-8000-000000000030'), :'anul'::uuid,
  'reenvio com os mesmos dados devolve a mesma anulação');
select throws_ok(format($$select pg_temp.void(%L, 'Outro motivo', 'c7000000-0000-4000-8000-000000000030')$$, :'lote'),
  '23505', null, 'mesmo identificador com outro motivo é recusado');
select throws_ok(format($$select pg_temp.void(%L, 'De novo', 'c7000000-0000-4000-8000-000000000031')$$, :'lote'),
  '22023', 'Esta produção já foi anulada.', 'segunda anulação é recusada');
select is((select kind || ':' || (id = :'anul'::uuid)::text from public.find_operation('c2000000-0000-4000-8000-00000000000a',
  'c3000000-0000-4000-8000-0000000000a1','c7000000-0000-4000-8000-000000000030')), 'production_void:true',
  'find_operation encontra a anulação');
select throws_ok(format($$select pg_temp.void(%L, 'Errado', 'c7000000-0000-4000-8000-000000000001')$$, :'lote'),
  '23505', null, 'identificador da produção não vira anulação');

-- 4) Lote anulado: sem consumo, porcionamento ou mudança de local; "Anular registro" não desfaz.
select throws_ok(format($$select public.record_container_movement('c2000000-0000-4000-8000-00000000000a',
  'c3000000-0000-4000-8000-0000000000a1', %L, 'consumption', 1, null, 'c7000000-0000-4000-8000-000000000040')$$, :'box'),
  '22023', null, 'lote anulado não é consumido');
select throws_ok(format($$select public.reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  (select id from public.stock_movements where container_id = %L), 'Desfazer', 'c7000000-0000-4000-8000-000000000041')$$, :'box'),
  '22023', 'Movimento de manipulação só é desfeito pela anulação da manipulação.', 'a anulação de produção não é desfeita');
select throws_ok(format($$select public.handle_container('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  %L, 'portioning', array[1,1]::numeric[], %L, 'refrigerated', now(), 'c1000000-0000-4000-8000-000000000002', 'none', null, null, null,
  'c7000000-0000-4000-8000-000000000042')$$, :'box', :'sp'::date + 1),
  '22023', null, 'lote anulado não é porcionado');

-- 5) Regra estrita: depois de qualquer movimento, não anula.
select pg_temp.produce(3, 'c7000000-0000-4000-8000-000000000050') as consumido \gset
select public.record_container_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  pg_temp.integral(:'consumido'), 'consumption', 1, null, 'c7000000-0000-4000-8000-000000000051') as cons \gset
select throws_like(format($$select pg_temp.void(%L, 'Errado', 'c7000000-0000-4000-8000-000000000052')$$, :'consumido'),
  'A produção já teve consumo%', 'produção consumida não é anulada');
select lives_ok(format($$select public.reverse_movement('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  %L, 'Lançado errado', 'c7000000-0000-4000-8000-000000000053')$$, :'cons'), 'anular o consumo continua possível');
select throws_like(format($$select pg_temp.void(%L, 'Errado', 'c7000000-0000-4000-8000-000000000054')$$, :'consumido'),
  'A produção já teve consumo%', 'consumo anulado também conta como movimento (regra estrita)');

select pg_temp.produce(2, 'c7000000-0000-4000-8000-000000000060') as porcionado \gset
select public.handle_container('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  pg_temp.integral(:'porcionado'), 'portioning', array[1,1]::numeric[], :'sp'::date + 2, 'refrigerated', now(),
  'c1000000-0000-4000-8000-000000000002', 'none', null, null, null, 'c7000000-0000-4000-8000-000000000061') as porc \gset
select throws_like(format($$select pg_temp.void(%L, 'Errado', 'c7000000-0000-4000-8000-000000000062')$$, :'porcionado'),
  'A produção já teve%', 'produção porcionada não é anulada');

select public.create_storage_location('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  'Câmara', 'refrigerated', 'c7000000-0000-4000-8000-000000000070') as cam \gset
select pg_temp.produce(2, 'c7000000-0000-4000-8000-000000000071') as movido \gset
select public.move_container('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1',
  pg_temp.integral(:'movido'), :'cam', 'c1000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000072', false) as mv \gset
select throws_like(format($$select pg_temp.void(%L, 'Errado', 'c7000000-0000-4000-8000-000000000073')$$, :'movido'),
  'A produção já teve%', 'produção que mudou de local não é anulada');

-- 6) Coerência, forma e histórico.
reset role;
select is((select count(*) from private.production_problems()), 0::bigint, 'anulações coerentes');
select is((select count(*) from private.stock_conservation_problems()), 0::bigint, 'conservação do saldo continua fechando');
select throws_ok(format($$insert into public.stock_movements (organization_id, establishment_id, batch_id, container_id, intent_id, kind,
  quantity, reason, timezone, created_by) values ('c2000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-0000000000a1', %L, %L,
  gen_random_uuid(), 'production_void', 1, 'x', 'America/Sao_Paulo', 'c1000000-0000-4000-8000-000000000001')$$,
  :'movido', pg_temp.integral(:'movido')),
  '23514', null, 'movimento de anulação sem anulação registrada é recusado pelo banco');
select throws_ok($$update public.production_voids set reason = 'x'$$, null, null, 'anulação não é alterada');
select throws_ok($$delete from public.production_voids$$, null, null, 'anulação não é apagada');
select throws_ok($$truncate public.production_voids$$, null, null, 'anulação não é truncada');
select lives_ok($$select private.assert_history_protected()$$, 'a guarda de histórico inclui production_voids e passa');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.production_voids), 1::bigint, 'membro lê a anulação da empresa');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.production_voids), 0::bigint, 'outra empresa não vê a anulação');

select * from finish();
rollback;
