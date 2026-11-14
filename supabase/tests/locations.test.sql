-- Fase 6, fatia 6.9: locais de armazenamento e mudança de local (D-030). Mover não altera saldo,
-- validade nem conservação; a localização atual é o evento de maior seq.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'storage_locations', 'storage_locations existe');
select has_table('public', 'location_moves', 'location_moves existe');
select ok(not has_table_privilege('authenticated', 'public.location_moves', 'INSERT'), 'cliente não insere eventos de local direto');
select ok(not has_table_privilege('authenticated', 'public.storage_locations', 'UPDATE'), 'cliente não altera locais direto');
select ok(not has_function_privilege('anon', 'public.move_container(uuid,uuid,uuid,uuid,uuid,uuid,boolean)', 'execute'), 'anon não move');
select ok((select not prosecdef from pg_proc where oid = 'public.move_container(uuid,uuid,uuid,uuid,uuid,uuid,boolean)'::regprocedure),
  'move_container público é SECURITY INVOKER');

insert into auth.users(id) values
 ('f1000000-0000-4000-8000-000000000001'),('f1000000-0000-4000-8000-000000000002'),('f1000000-0000-4000-8000-000000000003');
insert into organizations(id,name) values
 ('f2000000-0000-4000-8000-00000000000a','A'),('f2000000-0000-4000-8000-00000000000b','B');
insert into establishments(id,organization_id,name,timezone) values
 ('f3000000-0000-4000-8000-0000000000a1','f2000000-0000-4000-8000-00000000000a','UA1','America/Sao_Paulo'),
 ('f3000000-0000-4000-8000-0000000000a2','f2000000-0000-4000-8000-00000000000a','UA2','America/Sao_Paulo'),
 ('f3000000-0000-4000-8000-0000000000b1','f2000000-0000-4000-8000-00000000000b','UB','UTC');
insert into memberships(organization_id,user_id,role,display_name) values
 ('f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-000000000001','owner','Luis'),
 ('f2000000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-000000000002','member','Bia'),
 ('f2000000-0000-4000-8000-00000000000b','f1000000-0000-4000-8000-000000000003','owner','Outro');
insert into products(id,organization_id,establishment_id,name,unit,storage_condition) values
 ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Frango','kg','refrigerated'),
 ('f4000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Arroz','kg','ambient');
insert into suppliers(id,organization_id,establishment_id,name) values
 ('f5000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','FA');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Locais.
select public.create_storage_location('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Câmara fria 01','refrigerated','f7000000-0000-4000-8000-000000000001') as cam \gset
select public.create_storage_location('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Despensa','ambient','f7000000-0000-4000-8000-000000000002') as desp \gset
select public.create_storage_location('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a2','Câmara outra unidade','refrigerated','f7000000-0000-4000-8000-000000000003') as outra \gset
select is(public.create_storage_location('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Câmara fria 01','refrigerated','f7000000-0000-4000-8000-000000000001'),
  :'cam'::uuid, 'replay do mesmo local devolve o mesmo ID');
select throws_ok($$select public.create_storage_location('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Câmara fria 01','frozen','f7000000-0000-4000-8000-000000000001')$$,
  '23505', null, 'mesmo identificador com outros dados é recusado');
select throws_ok($$select public.create_storage_location('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','  câmara FRIA 01 ','refrigerated','f7000000-0000-4000-8000-0000000000a9')$$,
  '23505', null, 'nome repetido na unidade é recusado, sem diferenciar maiúsculas');
select throws_ok($$select public.create_storage_location('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','   ','ambient','f7000000-0000-4000-8000-0000000000a8')$$,
  '22023', null, 'nome só com espaços é recusado');
select throws_ok($$select public.create_storage_location('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','X','tropical','f7000000-0000-4000-8000-0000000000a7')$$,
  '22023', null, 'condição inválida é recusada');

-- Recebimentos (arroz ambiente, frango refrigerado com medição).
select public.receive_batch('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
  'f4000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001','L-A',10,current_date+30,'original',current_date+30,
  'ambient','not_required',null,null,'f7000000-0000-4000-8000-000000000011') as batch \gset
select public.receive_batch('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
  'f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','L-F',5,current_date+30,'original',current_date+30,
  'refrigerated','measured',3.0,null,'f7000000-0000-4000-8000-000000000012') as fbatch \gset
select public.ensure_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'batch') as box \gset
select public.ensure_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'fbatch') as fbox \gset
select balance as bal0 from public.list_containers('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1') where container_id = :'box'::uuid \gset

select is((select count(*) from public.list_container_locations('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1')), 0::bigint,
  'recipiente sem local aparece sem local');

-- Mover: primeira colocação (ambiente em despensa ambiente, sem divergência).
select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'box'::uuid,:'desp'::uuid,
  'f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000021') as mv1 \gset
select is((select location_name from public.list_container_locations('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1') where container_id = :'box'::uuid),
  'Despensa', 'local atual é o do último evento');
select is(public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'box'::uuid,:'desp'::uuid,
  'f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000021'), :'mv1'::uuid, 'replay devolve o mesmo evento');
select throws_ok($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',(select id from public.containers limit 1),
  (select id from public.storage_locations where name = 'Câmara fria 01'),'f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000021')$$,
  '23505', null, 'mesmo identificador com outros dados é recusado');
select throws_ok(format($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','%s','f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000022')$$, :'box', :'desp'),
  '22023', null, 'mover para o local em que já está é recusado');

-- Divergência de condição: ambiente em câmara fria exige confirmação.
select throws_ok(format($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','%s','f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000023')$$, :'box', :'cam'),
  '22023', null, 'condição do local diferente da do recipiente exige confirmação');
select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'box'::uuid,:'cam'::uuid,
  'f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000023', true);
select is((select location_name from public.list_container_locations('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1') where container_id = :'box'::uuid),
  'Câmara fria 01', 'com confirmação o recipiente muda de local');
select is((select mismatch_confirmed from public.list_container_locations('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1') where container_id = :'box'::uuid),
  true, 'a divergência confirmada fica registrada');
select is((select count(*) from public.location_moves where container_id = :'box'::uuid), 2::bigint, 'o histórico guarda os dois eventos');

-- Mover não altera saldo nem validade.
select is((select balance from public.list_containers('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1') where container_id = :'box'::uuid),
  :'bal0'::numeric, 'mover não altera o saldo');
select is((select expiry_date from public.containers where id = :'box'::uuid), current_date+30, 'mover não altera a validade');

-- Escopo e estado.
select throws_ok(format($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','%s','f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000024')$$, :'fbox', :'outra'),
  '23503', null, 'local de outra unidade é recusado');
select public.set_storage_location_active('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'desp'::uuid,false);
select throws_ok(format($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','%s','f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000025')$$, :'fbox', :'desp'),
  '22023', null, 'local desativado como destino é recusado');
select is((select count(*) from public.storage_locations where id = :'desp'::uuid and not active), 1::bigint, 'local desativado continua existindo');
-- Quem moveu: membro ativo com nome vale; sem vínculo (outra empresa) é recusado.
select ok(public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'fbox'::uuid,:'cam'::uuid,
  'f1000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000026') is not null, 'membro ativo com nome pode ser quem moveu');
select throws_ok(format($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','%s','f1000000-0000-4000-8000-000000000003','f7000000-0000-4000-8000-000000000027')$$, :'box', :'cam'),
  '22023', null, 'pessoa de outra empresa não pode constar como quem moveu');

-- Esgotado: consumir tudo e tentar mover.
select public.receive_batch('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
  'f4000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001','L-B',2,current_date+30,'original',current_date+30,
  'ambient','not_required',null,null,'f7000000-0000-4000-8000-000000000031') as sbatch \gset
select public.ensure_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'sbatch') as sbox \gset
select public.record_container_movement('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'sbox'::uuid,'consumption',2,null,'f7000000-0000-4000-8000-000000000032');
select throws_ok(format($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','%s','f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000033')$$, :'sbox', :'cam'),
  '22023', null, 'recipiente esgotado não muda de local');

-- Bloqueado por ocorrência: recebimento refrigerado sem medição.
select public.receive_batch('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',
  'f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','L-X',4,current_date+30,'original',current_date+30,
  'refrigerated','not_measured',null,'Sem termômetro','f7000000-0000-4000-8000-000000000041') as xbatch \gset
select public.ensure_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'xbatch') as xbox \gset
select throws_ok(format($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','%s','f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000042')$$, :'xbox', :'cam'),
  '22023', null, 'recipiente bloqueado por ocorrência não muda de local');
select id as occ from public.occurrences where batch_id = :'xbatch' and kind = 'temperature_not_measured' \gset
select public.decide_occurrence('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'occ'::uuid,
  'released','Medido com termômetro reserva','f7000000-0000-4000-8000-000000000043');
select ok(public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'xbox'::uuid,:'cam'::uuid,
  'f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000044') is not null, 'depois da liberação o recipiente muda de local');

-- Derivados herdam o local da origem (evento 'inherited', mesma transação).
select public.handle_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'fbox'::uuid,
  'portioning', array[1,1]::numeric[], current_date+5, 'refrigerated', now(), 'f1000000-0000-4000-8000-000000000001', 'sealed', null, null, null,
  'f7000000-0000-4000-8000-000000000051') as hand \gset
select is((select count(*) from public.location_moves m join public.containers c on c.id = m.container_id
            where c.handling_id = :'hand'::uuid and m.kind = 'inherited' and m.to_location_id = :'cam'::uuid), 2::bigint,
  'cada derivado herda o local atual da origem');
select is((select count(*) from public.list_container_locations('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1')
            where location_name = 'Câmara fria 01' and container_id in (select id from public.containers where handling_id = :'hand'::uuid)), 2::bigint,
  'os derivados aparecem no local da origem');
select is((select count(*) from public.location_moves where container_id = :'fbox'::uuid and kind = 'move'), 1::bigint, 'a manipulação não cria evento de mudança na origem');

-- Anulação: com o evento herdado apenas, pode; depois de mover um derivado, não.
select public.handle_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'xbox'::uuid,
  'opening', array[1]::numeric[], current_date+5, 'refrigerated', now(), 'f1000000-0000-4000-8000-000000000001', 'sealed', null, null, null,
  'f7000000-0000-4000-8000-000000000052') as hand2 \gset
select ok(public.void_handling('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'hand2'::uuid,
  'Lançado por engano','f7000000-0000-4000-8000-000000000053') is not null, 'anular com só o evento herdado é permitido');
select id as dchild from public.containers where handling_id = :'hand'::uuid order by position limit 1 \gset
select public.set_storage_location_active('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'desp'::uuid,true);
select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1',:'dchild'::uuid,:'desp'::uuid,
  'f1000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000054', true);
select throws_ok(format($$select public.void_handling('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','Lançado por engano','f7000000-0000-4000-8000-000000000055')$$, :'hand'),
  '22023', null, 'anular é recusado depois que um derivado mudou de local');


-- find_operation reconhece a mudança de local.
select is((select kind from public.find_operation('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f7000000-0000-4000-8000-000000000023')),
  'location_move', 'find_operation encontra a mudança de local');
select is((select kind from public.find_operation('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','f7000000-0000-4000-8000-000000000001')),
  'location', 'find_operation encontra o local criado');

-- Membro lê, mas não escreve; outra empresa não vê nada.
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.storage_locations), 3::bigint, 'membro lê os locais da empresa');
select throws_ok($$select public.create_storage_location('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','Nova','ambient','f7000000-0000-4000-8000-000000000061')$$,
  '42501', null, 'membro não cria local');
select throws_ok(format($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','%s','f1000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000062')$$, :'fbox', :'desp'),
  '42501', null, 'membro não muda recipiente de local');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.storage_locations), 0::bigint, 'outra empresa não vê locais de A');
select is((select count(*) from public.location_moves), 0::bigint, 'outra empresa não vê eventos de local de A');
select is((select count(*) from public.list_container_locations('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1')), 0::bigint, 'outra empresa não lista locais, nem com o escopo de A');
select throws_ok(format($$select public.move_container('f2000000-0000-4000-8000-00000000000a','f3000000-0000-4000-8000-0000000000a1','%s','%s','f1000000-0000-4000-8000-000000000003','f7000000-0000-4000-8000-000000000063')$$, :'fbox', :'cam'),
  '42501', null, 'proprietário de B não muda recipiente de A');

-- Histórico append-only (mesmo para o dono do banco).
reset role;
select throws_ok($$update public.location_moves set kind = 'move'$$, null, null, 'evento de local não é alterado');
select throws_ok($$delete from public.location_moves$$, null, null, 'evento de local não é apagado');
select throws_ok($$truncate public.location_moves$$, null, null, 'evento de local não é truncado');
-- Conservação e saldo seguem fechando.
select is((select count(*) from private.stock_conservation_problems()), 0::bigint, 'a conservação do estoque continua fechando');
select lives_ok($$select private.assert_history_protected()$$, 'a guarda de histórico inclui location_moves e passa');
select * from finish();
rollback;
