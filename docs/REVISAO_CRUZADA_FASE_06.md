# Revisão cruzada — desenho da Fase 6 (PR #3)

Revisão escrita por Claude Code em 12/11/2026, a pedido de luis, sobre a branch `claude/fase-06-desenho` em `60d350e` (base `origin/main` em `4c39e9f`). Objeto: `docs/FASE_06_DESENHO.md`, D-019 a D-030 em `docs/DECISOES.md`, `docs/BACKLOG.md` e `docs/ia-tarefas/fase-06-desenho.md`.

**Esta revisão não cria um planejamento concorrente.** Ela aponta problemas e propõe ajustes sobre o desenho aprovado para planejamento. Nada aqui altera código, migração, teste ou banco, e nenhuma proposta está aceita: cada ajuste depende de luis.

## Como foi feita

- **Fontes verificadas no repositório:** migrações em `supabase/migrations/` (recebimentos, recipientes, movimentos e anulação), testes pgTAP em `supabase/tests/`, fixtures e testes de integração em `scripts/catalog-fixture.mjs` e `tests/integration/`, leitura de movimentos no front-end (`src/features/movements/`) e a branch do PR #2 (`claude/revisao-05-seguranca-produto`: `security_guard.test.sql`, migração `20261112153000_review_05_hardening.sql`, job `banco-api-e2e`).
- **Nenhum teste foi executado:** a revisão é só de documentação. Onde um achado diz "quebra", a afirmação vem da leitura do código citado, não de uma execução.
- **Agentes:** os papéis `architect_qa`, `suflex_analyst` e `business_strategist` (definidos em `.codex/agents/`) foram assumidos por vez pelo mesmo assistente, cada um com sua instrução, e depois confrontados. As opiniões são separadas por papel, mas **não são independentes no sentido forte** (mesmo modelo, mesma sessão). `business_strategist` foi chamado porque há impacto de escopo (achados I-10 e I-11). Nenhum agente alterou arquivos.
- **Independência do desenho:** a conversa em que o desenho foi escrito não foi consultada; só o repositório.
- **Limite normativo (Q10):** nenhuma afirmação abaixo confere a RDC 216/2004 ou a Portaria SES/RS 799/2023. Os achados sanitários são de fluxo e de risco de erro, não de conformidade.

## Resumo

O desenho é sólido no essencial: uma única fórmula de saldo, escrita só por função com bloqueio na linha do recebimento, FKs compostas de escopo, validade nunca calculada e sem prorrogação. A conservação fecha matematicamente para abertura, porcionamento, baixa e anulação (ver 1.1).

Há **3 bloqueantes**, todos resolvíveis com ajuste de texto e de fatia, sem mudar decisões de luis:

1. **B-1:** a fatia 6.0 torna recipientes e movimentos *append-only* para todos os papéis, e a 6.1 precisa fazer `UPDATE` nessas mesmas tabelas para o backfill. O desenho não diz como; do jeito que está, a 6.1 é impossível ou exige furar a guarda sem teste.
2. **B-2:** a data de abertura da etiqueta é `handled_at = now()` do servidor. Com a escrita só pelo proprietário (D-019), o registro acontece depois da abertura física, e a etiqueta imprime o horário do registro como se fosse o da abertura.
3. **B-3:** a afirmação "a bateria atual passa sem mudar expectativa" (6.0 e 6.1) não se sustenta: a limpeza de fixtures apaga histórico e usuários, e três arquivos de teste inserem recebimentos e movimentos direto no banco, sem recipiente. É preciso decidir o mecanismo agora para que a promessa continue verdadeira.

Há 18 achados importantes e 10 sugestões. A seção 9 consolida o que muda em cada fatia.

## 1. Modelo de dados (seção 4 do desenho)

### 1.1 O que se verificou e está correto

- **Fórmula de saldo.** Por recipiente: `inicial − consumos − descartes − transferências + anulações`. Somando todos os recipientes de um recebimento, as quantidades iniciais dos derivados se cancelam com as transferências quando `soma dos derivados = transferência`, e sobra `quantidade do recebimento − consumos − descartes + anulações`, que é a invariante da 4.3. A anulação herdando o `container_id` do movimento anulado mantém a identidade.
- **Ordem de bloqueio.** Todas as escritas de um recebimento (incluindo as de derivados, que têm o mesmo `batch_id`) bloqueiam a mesma linha de `batch_receipts`. Não há segunda linha bloqueada por elas, então não aparece ciclo de espera entre `record_movement`, `reverse_movement` e `handle_container`.
- **Cadeia de validade.** Como cada derivado é limitado pela validade efetiva da origem, uma cadeia (porção congelada que depois é aberta) nunca ganha prazo.

### 1.2 Achados

**B-1 (bloqueante) — append-only da 6.0 contra o backfill da 6.1.** A 4.1 preenche colunas novas dos integrais já existentes e a 4.3 grava `container_id` nos movimentos existentes; ambos são `UPDATE`. A 6.0 (P5, D-023) instala antes um trigger que recusa `UPDATE` e `DELETE` "inclusive para `service_role`". Mesmo problema reaparece se `short_code` dos integrais vier só na 6.3 (I-7).
*Ajuste proposto:* escrever no desenho que a migração da 6.1 faz `alter table … disable trigger <nome>` e `enable trigger` dentro da própria transação (só o dono da tabela consegue; `service_role` e `authenticated` não), e acrescentar à guarda do PR #2 um teste de catálogo: "todo trigger append-only existe e está habilitado (`tgenabled = 'O'`) em `batch_receipts`, `containers`, `container_handlings`, `stock_movements` e nas tabelas de 4.8 e 4.9". Alternativa: instalar o trigger dessas duas tabelas só no fim da 6.1. A primeira é melhor porque a guarda fica testada desde a 6.0.

**I-1 (importante) — P5 não cobre `TRUNCATE`.** Trigger `before update or delete` por linha não dispara em `TRUNCATE`. A guarda do PR #2 já impede `TRUNCATE` por `anon` e `authenticated`, mas não por `service_role`, que tem `grant all` em parte das tabelas (`20261105144003`, linha 63).
*Ajuste:* acrescentar trigger `before truncate` por comando, ou `revoke truncate` de `service_role` nas tabelas de histórico, com teste pgTAP. Registrar também que o dono da tabela pode desabilitar trigger: P5 protege contra erro de aplicação e de script, não contra o superusuário.

**I-2 (importante) — vínculos entre derivado, manipulação e transferência não estão amarrados por restrição.** A 4.1 liga o derivado ao pai e à manipulação por FKs separadas. Nada impede, no banco, um derivado com `parent_container_id` diferente do `source_container_id` da sua manipulação, nem um movimento `'transfer'` em um recipiente que não é a origem. A soma "derivados = transferência" e "validade do derivado ≤ origem" também não cabem num `CHECK`.
*Ajuste:* (a) FK composta `(handling_id, parent_container_id) → container_handlings (id, source_container_id)` nos derivados e `(handling_id, container_id) → container_handlings (id, source_container_id)` no movimento de transferência; (b) `unique (handling_id) where kind = 'transfer'` em `stock_movements`; (c) copiar a validade da origem para `container_handlings.source_expiry_date` com FK `(source_container_id, source_expiry_date) → containers (id, expiry_date)` e `check (expiry_date <= source_expiry_date)`, o que torna a regra "nunca posterior" uma restrição real (o desenho diz "restrição no banco", mas não diz qual); (d) `constraint trigger … deferrable initially deferred` para a soma, ou declarar explicitamente que ela é garantida só pela função e pelo pgTAP.

**I-3 (importante) — `intent_id` da transferência e ambiguidade em `find_operation`.** `stock_movements.intent_id` é `not null` e único por unidade. O desenho não diz qual `intent_id` a linha `'transfer'` recebe. Se for o da manipulação, `find_operation` encontra duas linhas para a mesma intenção; se for novo, é um identificador sem uso.
*Ajuste:* a transferência usa o `intent_id` da manipulação e `find_operation` devolve sempre a manipulação quando houver as duas. Testar que `record_movement` com esse `intent_id` dá `23505` (hoje daria, porque compara `kind`).

**I-4 (importante) — idempotência da `handle_container` com regras que dependem do relógio e do saldo.** As regras 2 e 4 da 5.1 usam "hoje no fuso da unidade" e a regra 1 usa o saldo atual. Se a verificação do replay vier depois delas, uma tentativa reenviada depois da meia-noite, ou depois de a própria manipulação ter zerado a origem, é recusada em vez de devolver o ID original, e a recuperação da 6.8 falha justo no caso que ela existe para resolver. `record_movement` hoje faz certo (o replay vem antes do saldo; ver teste "reenvio permitido mesmo após saldo zero" em `movements.test.sql`).
*Ajuste:* fixar a ordem no texto: autorização → validação de forma → bloqueio da linha do recebimento → busca do replay → regras de estado (vencimento, saldo, bloqueio da 4.8). O replay compara origem, tipo, quantidades na ordem, validade, conservação, `handled_by`, observação e autor; **não** compara `handled_by_name` (o nome pode ter mudado). Acrescentar os casos de teste da seção 6.

**I-5 (importante) — `ensure_container` com `on conflict (batch_id)`.** Com `unique (batch_id)` virando índice parcial, `on conflict (batch_id)` deixa de encontrar restrição e a função passa a falhar em toda chamada. Precisa virar `on conflict (batch_id) where kind = 'integral'`. É detalhe de implementação, mas está em função coberta por `containers.test.mjs` e pela guarda; vale registrar na 6.1.

**I-6 (importante) — a 4.8 não diz que a decisão bloqueia a linha do recebimento.** `receipt_hold_decisions` é escrita sobre um recebimento; sem `FOR UPDATE` na linha do recebimento, a regra "sempre na linha do recebimento" deixa de valer só ali. Com uma decisão por ocorrência (`unique`) a corrida não gera dado errado hoje, mas a próxima regra que olhar decisão e saldo juntos (por exemplo, descarte obrigatório depois de rejeição) herdaria a corrida.
*Ajuste:* a função de decisão bloqueia a linha do recebimento, como as demais. O mesmo para a definição única de `products.storage_condition` (bloquear a linha do produto) e para `location_moves` (I-8).

**I-7 (importante) — `short_code` e concorrência.** Código "único por unidade" e sequencial (`R-00042`) exige um contador por unidade, que vira uma segunda linha bloqueada (recebimento → contador) em `receive_batch` e `handle_container`. É uma ordem nova de bloqueio que o desenho não declara. Além disso, se o `short_code` dos integrais entra só na 6.3, é um segundo backfill de `containers` (B-1).
*Ajuste:* mover `short_code` para a 6.1, gerado na criação de todo recipiente. Preferir uma `sequence` global (sem bloqueio de linha; único globalmente implica único por unidade; buracos são aceitáveis) ou, se luis quiser numeração por unidade sem buracos, declarar a ordem "recebimento → contador da unidade" e testar unicidade sob concorrência.

**I-8 (importante) — "localização atual = último evento" (4.9) é ambíguo.** `created_at default now()` é o instante de início da transação: dois eventos na mesma transação (o derivado herdando o local da origem) ou em transações que começaram no mesmo microssegundo empatam. E o desenho não diz qual linha `location_moves` bloqueia; se não for a do recebimento, a `handle_container` pode herdar o local da origem enquanto uma transferência concorrente o muda.
*Ajuste:* coluna `seq bigint generated always as identity` e "atual = maior `seq` do recipiente"; `location_moves` bloqueia a linha do recebimento; teste de concorrência "mover origem × porcionar".

**S-1 (sugestão) — vocabulário de `expiry_origin`.** `containers.expiry_origin` usa `'receipt'`/`'responsible'` e `batch_receipts.expiry_origin` usa `'original'`/`'responsible'`; a 7.2 fala em "quando a origem for `original`". Um integral cujo recebimento tem validade definida pelo responsável vira `'receipt'` e perde essa informação na etiqueta. Usar valores distintos de propósito (`'receipt'` vs. `'handling'`) e ler a origem do recebimento por junção na etiqueta.

**S-2 (sugestão) — anulação de descarte em recebimento rejeitado.** Com a ocorrência rejeitada, anular um descarte devolve saldo a um recipiente permanentemente bloqueado. Não quebra a conservação, mas o painel volta a mostrar "Rejeitado, aguardando descarte". Registrar como comportamento esperado e testar.

**S-3 (sugestão) — "perda no porcionamento" e sobra na origem.** Ver I-12 (fluxo).

### 1.3 Anulação de manipulação (fatia 6.7)

**I-9 (importante) — a 6.7 não tem modelo de dados.** A 4.3 proíbe anular `'transfer'` e manda a correção para a 6.7, que diz só "derivados aparecem como anulados". Para a conservação continuar fechando, a anulação precisa de eventos: um que devolva a quantidade à origem e um em cada derivado que zere o saldo dele. Sem isso, ou a fórmula ganha exceção, ou alguém faz `UPDATE`, o que P5 proíbe.
*Ajuste:* definir já no desenho o par de eventos (por exemplo, `'transfer_reversal'` na origem com `reverses_id` da transferência, e um evento de saída `'handling_void'` por derivado), a condição "nenhum derivado teve consumo, descarte, manipulação **nem** transferência de local" e a validade (a origem volta com a validade dela; o vencimento no meio do caminho não impede devolver). Ver também a ordem (seção 5).

## 2. RLS e privilégios (seção 6) e P3/P5

**Sem caminho de leitura ou escrita entre empresas encontrado no desenho.** As funções novas são `SECURITY INVOKER` sobre RLS ou `SECURITY DEFINER` com verificação de vínculo antes de qualquer leitura; as FKs compostas carregam organização e unidade. Os achados abaixo são lacunas de especificação, não furos demonstrados.

**I-10a (importante) — a tabela da seção 6 omite metade das tabelas novas.** Faltam `receipt_holds`, `receipt_hold_decisions`, `storage_locations`, `location_moves`, a auditoria da definição única de `products.storage_condition` e as colunas novas de `batch_receipts`. Todas precisam constar com `anon`, `authenticated`, escrita, `service_role` e append-only, e entrar na lista fixa da guarda do PR #2 ("histórico e vínculos só mudam por funções autorizadas").

**I-10b (importante) — P3 não serve igual para `memberships`.** A política atual (`memberships_read`) esconde vínculos revogados e só mostra os de outras pessoas ao proprietário. O padrão `organization_id in (select private.member_organizations())` aplicado "às existentes" daria a todo membro a lista de colegas. A seção 6 ainda diz que `display_name` tem "SELECT por vínculo (já existe)", o que não é o comportamento atual: membro não vê o nome dos outros. Isso está certo para a etiqueta (o nome impresso vem da cópia em `container_handlings`), mas o texto precisa refletir a regra real.
*Ajuste:* `private.member_organizations(p_owner_only boolean default false)`, `memberships_read` reescrita com a mesma condição atual, e o teste 9 da seção 8 cobrindo explicitamente "membro não vê vínculo de colega" e "revogado não aparece".

**I-11 (importante) — corrida entre fuso imutável (P6) e `receive_batch`.** O trigger da 4.6 recusa mudar o fuso "quando a unidade já tem recebimento". `receive_batch` lê `establishments.timezone` sem bloqueio (`20261106180342`, linha 51). Em `READ COMMITTED`, um `UPDATE` de fuso e um recebimento concorrentes podem os dois terminar: o trigger não vê o recebimento ainda não confirmado, e o recebimento grava o fuso antigo.
*Ajuste:* `receive_batch` lê a unidade com `FOR SHARE` (o `UPDATE` de fuso espera ou faz o recebimento esperar). É uma nova linha bloqueada, sempre **antes** da criação do recebimento, então não inverte a ordem existente. Teste de integração concorrente.

**P5 e a limpeza por reset: viável, mas não como está escrito (B-3).** Ver seção 4.

**S-4 (sugestão) — `entity_changes` só para proprietário.** A política precisa da variante de proprietário da I-10b. Testar também que o trigger está em `private` (a guarda já recusa `SECURITY DEFINER` em `public`).

## 3. Regras de validade (5.1) e fluxo real da cozinha

**B-2 (bloqueante) — data e hora da abertura na etiqueta.** `handled_at` é `now()` do servidor (4.1) e a etiqueta imprime "Abertura/fracionamento: data e hora" (7.2). Pela D-019, o cozinheiro abre e o proprietário registra; quando ele não está na bancada, o registro acontece horas depois, e a etiqueta impressa nesse momento diz que o produto foi aberto mais tarde do que de fato foi. É exatamente o campo que a análise de 12/11 põe como obrigatório, e o erro é sempre a favor de "mais fresco". O mesmo vale para a regra 2 (origem vencida) e para a regra 4 (validade nova ≥ hoje), que hoje se referem ao instante do registro.
*Ajuste:* separar `handled_at` (informado: quando a pessoa abriu, obrigatório, não futuro, não anterior à criação da origem, com janela máxima a definir por luis, por exemplo 24 horas) de `created_at` (quando foi registrado). A etiqueta imprime `handled_at`; a tela mostra os dois. As regras 2 e 4 passam a usar a data de `handled_at` no fuso da unidade. Se o atraso passar da janela, o registro é recusado e a orientação é descartar ou seguir o procedimento da cozinha, não registrar com data falsa. Isso **não** dá escrita ao membro e não muda a D-019.

**I-12 (importante) — sobra do porcionamento fica com a etiqueta do fabricante.** No porcionamento, "o restante continua na origem" (seção 3). Quando a origem é uma peça ou embalagem única (5 kg de carne em 4 porções de 1,1 kg), o que sobra também foi aberto, mas segue com a validade e a etiqueta do recebimento. A 7.1 (passo 6) diz que "a etiqueta da origem continua valendo para o saldo que sobrou", o que só é verdade se a sobra estiver fechada (várias embalagens).
*Ajuste:* no porcionamento com sobra, a tela pergunta "O que sobra na origem continua fechado?". Se não, a sobra vira uma porção a mais (com a mesma validade nova) ou um descarte no mesmo fluxo; a origem só fica com saldo quando a pessoa confirma que está fechada. Não precisa de regra nova no banco, só do fluxo e de um campo na manipulação (`remainder_sealed boolean`) para auditoria.

**I-13 (importante) — contornos previsíveis da regra "nunca posterior à origem".** A regra está certa e não deve ser afrouxada. Mas dois fluxos reais vão bater nela e o desenho precisa dizer o que a tela responde:
- **Congelamento de matéria-prima recebida refrigerada**, com prazo maior. Está fora do escopo, e é o que a cozinha mais vai tentar. O contorno natural é **registrar um recebimento novo** do produto congelado, o que duplica estoque e apaga a origem. Ajuste: mensagem fixa ("Congelamento com prazo novo não é registrado nesta versão. Não crie um recebimento novo para isso.") e a métrica de tentativas recusadas na trilha 6.10.
- **Validade ancorada no limite.** A 7.1 (passo 4) mostra a validade da origem como limite do seletor. É provável que a pessoa escolha o limite por padrão. Ajuste: mostrar o limite como texto, não como data pré-selecionável, e medir no piloto a proporção de manipulações com validade igual à da origem.

**S-5 (sugestão) — consumo de recipiente vencido.** A Fase 5 permite consumo de recebimento vencido e a 6.3 recusa manipular origem vencida. Não é contradição (manipular criaria etiqueta nova), mas a assimetria vai aparecer na tela. Não mudar a regra da Fase 5 nesta fase; registrar em decisões que a recusa é só para manipulação e mostrar aviso de vencido na baixa.

**S-6 (sugestão) — testes com data fixa.** Os testes 5 e 10a dependem de "hoje no fuso da unidade". Escrever as datas relativas a `current_date` no fuso da unidade de teste, ou concentrar "hoje" numa função `private.unit_today(establishment)`, para que os testes não comecem a falhar com o tempo.

## 4. Compatibilidade com a Fase 5 e com o PR #2

**B-3 (bloqueante) — testes existentes que mudam com 6.0 e 6.1.** O desenho promete que a bateria atual passa sem mudar expectativa. Pela leitura do código, isto quebra:

| Onde | O que faz hoje | O que quebra | Proposta para manter a expectativa |
|---|---|---|---|
| `scripts/catalog-fixture.mjs` (usado por `batches`, `catalog`, `containers`, `movements` da integração) | No `finally`, apaga `stock_movements`, `containers`, `batch_receipts`… por organização e depois `auth.admin.deleteUser` | P5 recusa o `DELETE`; `deleteUser` falha porque `created_by` referencia `auth.users` sem cascata; a fixture usa `checked()`, então **todo teste de integração falha na limpeza** | Limpar só tabelas sem histórico; não apagar usuários com histórico; dados isolados por organização aleatória (já são); CI parte de banco novo (já parte); documentar `npm run db:reset` local periódico. "Reset" troca o mecanismo de limpeza, não a expectativa dos testes |
| `supabase/tests/movements.test.sql` | Insere `batch_receipts` direto (sem `receive_batch`) e chama `record_movement` | Na 6.1, não existe integral para esse recebimento; o `record_movement` antigo "opera no integral" e não encontra recipiente | Trigger `after insert` em `batch_receipts` que cria o integral (vale para função e para fixture; garante "todo recebimento tem integral" no banco, não só na função) |
| `supabase/tests/security_guard.test.sql` (PR #2) | Insere `batch_receipts` e `stock_movements` direto, sem `container_id` | Com `container_id not null`, o insert da preparação falha e a guarda inteira cai | Mesmo trigger acima, mais `before insert` em `stock_movements` que preenche `container_id` com o integral quando vier nulo. Alternativa: ajustar a preparação da guarda, declarando que é mudança de fixture e não de expectativa |
| `identity.test.mjs` | Apaga unidades, vínculos e organizações (sem histórico) | Nada, desde que P5 não inclua essas tabelas | Manter fora de P5 |

**I-14 (importante) — leitura de movimentos no front-end entre a 6.3 e a 6.5.** `src/features/movements/data/supabaseMovements.ts` valida `kind` com `z.enum(['consumption','discard','reversal'])` e `MovementPanel.tsx` calcula o saldo somando todos os movimentos do recebimento. A partir da 6.3, qualquer manipulação feita pela API (que a 6.3 já permite) faz o histórico daquele recebimento falhar na validação (`'transfer'` desconhecido) e, mesmo corrigido o enum, o saldo do recebimento ficaria errado (transferência e baixa do derivado contadas juntas). A interface só migra na 6.5.
*Ajuste:* na 6.1, a leitura do painel de movimentos passa a filtrar pelo `container_id` do integral; na 6.3, aceita `'transfer'` como saída. Isso muda teste de componente existente (o que é esperado, mas precisa ser dito na fatia).

**Sem conflito com as regras da Fase 5.** Replay antes do saldo, motivo obrigatório no descarte, anulação única e não anular anulação continuam valendo; a 6.1 precisa repetir cada teste de `movements.test.sql` com recipiente derivado, não só com o integral.

**PR #2:** a 6.0 depende da guarda; as funções novas precisam entrar na Parte 2 da guarda (matriz de papéis) e as tabelas novas na lista fixa da Parte 1. A migração de endurecimento do PR #2 reescreve `record_movement`; a 6.1 precisa partir dessa versão (com filtro por escopo), não da de `20261108125109`.

## 5. Ordem e tamanho das fatias (seção 10)

| Fatia | Avaliação | Proposta |
|---|---|---|
| 6.0 | Junta três riscos independentes; P5 muda a infraestrutura de testes | Dividir: **6.0a** P5 + nova limpeza de testes + teste "trigger habilitado" (B-1, B-3, I-1); **6.0b** P3 com benchmark e I-10b; **6.0c** P6 com I-11, depois de reconciliar com o PR #1 |
| 6.1 | Correta como base; faltam `short_code` e os triggers de compatibilidade | Incluir `short_code` (I-7), trigger `after insert` do integral e preenchimento de `container_id` (B-3), `on conflict` parcial (I-5), filtro do front-end (I-14) |
| 6.2 | OK | — |
| 6.3 | Grande, mas coesa | Tirar `short_code` (vai para 6.1). Definir comportamento de `display_name` nulo: recusar `handled_by` sem nome de exibição, com mensagem clara (o script que preenche é da 6.10) |
| 6.4 | A maior fatia: cadastro, recebimento, ocorrência, decisão, formulário e painel | Dividir em **6.4a** banco (colunas, ocorrência, decisão, bloqueios) e **6.4b** formulário, página de decisão e faixa "Bloqueado" |
| 6.5 | Expõe a manipulação na tela sem desfazer | Trazer **6.7 (banco) para antes da 6.5**: a primeira tela de manipulação já sai com anulação. Validade digitada errada é o erro mais provável (R1) |
| 6.6 | OK | Antes da 6.6, resolver B-2 (data de abertura informada) |
| 6.7 | Sem modelo de dados (I-9) | Definir eventos agora; implementar entre 6.3 e 6.5 |
| 6.8 | OK; `find_operation` serve também a recebimento e baixa | Pode subir para logo depois da 6.2, se luis quiser reduzir antes o risco de reenvio |
| 6.9 | OK | Incluir I-8 |
| 6.10 | OK em paralelo | O script de provisionamento é pré-requisito prático da 6.3 (`display_name`); ao menos a função de definir nome de exibição deve existir na 6.3 |

## 6. Testes de segurança (seção 8): lacunas

Casos que faltam, além dos já listados:

**pgTAP**
- Trigger append-only existe e está habilitado em todas as tabelas de histórico (B-1); `TRUNCATE` por `service_role` recusado (I-1).
- Derivado com `parent_container_id` diferente da origem da manipulação, transferência fora da origem e segunda transferência para a mesma manipulação recusados pela restrição (I-2).
- Replay da manipulação depois de a origem ficar sem saldo, depois da meia-noite no fuso da unidade e depois de mudar o `display_name` de quem manipulou: devolve o mesmo ID (I-4).
- `record_movement` com o `intent_id` de uma manipulação: `23505` (I-3).
- Membro não vê vínculo de colega nem `display_name` de outros; revogado não aparece (I-10b).
- `handled_at` futuro, anterior à origem e fora da janela recusados; regras 2 e 4 aplicadas à data de `handled_at` (B-2).
- Recebimento rejeitado: anulação de descarte devolve saldo e o bloqueio continua (S-2).
- Inserção direta em `batch_receipts` cria exatamente um integral (B-3).

**Integração concorrente**
- `UPDATE` do fuso × `receive_batch` (I-11).
- Decisão da ocorrência × consumo e × descarte na mesma origem (I-6).
- Geração de `short_code` sob concorrência: sem repetição (I-7).
- Mover a origem × porcionar a origem: o derivado herda o local certo (I-8).
- Anulação de manipulação × baixa num derivado (6.7).

**E2E**
- Recebimento sem medição: etiqueta com a faixa "BLOQUEADO", tentativa de baixa recusada na tela, decisão e reimpressão sem faixa.
- Porcionamento com sobra aberta: tela obriga porção ou descarte (I-12).
- Membro de A não vê ação de decisão de ocorrência.

**Textos**
- O teste 10c procura termos em "textos fixos de componentes". Ele precisa varrer também o texto extraído dos PDFs e as mensagens de erro do banco. Ver I-15.

## 7. Textos e etiquetas (Q10)

**I-15 (importante) — o teste 10c, como descrito, reprova um texto aprovado no próprio desenho e deixa passar outros.** A 7.6 usa "Decida **conforme** o procedimento sanitário da cozinha", e "conforme" está na lista proibida do 10c. Ao mesmo tempo, a lista não pega "dentro das normas", "seguro para consumo", "regularizado", "RDC" nem "ANVISA".
*Ajuste:* trocar a palavra na 7.6 ("Decida seguindo o procedimento sanitário da cozinha") e o teste passar a usar uma lista de expressões (não de palavras soltas) mantida num único arquivo, aplicada a componentes, PDFs e mensagens.

**S-7 (sugestão) — "Responsável:" na etiqueta.** Na cozinha, "Responsável" lê como responsável técnico. Usar "Manipulado por: Ana M.", que é o que o campo de fato é (D-021).

**S-8 (sugestão) — não citar norma na etiqueta nem na tela.** A 7.2 justifica os campos com "o mínimo da RDC 216/2004". Isso pode ficar no documento, mas nenhuma etiqueta, tela ou PDF deve mencionar a norma até a conferência (Q10), porque citar a norma é uma forma de afirmar aderência.

**S-9 (sugestão) — "Validade após abertura" em destaque.** O destaque é correto. Acrescentar abaixo, em fonte pequena, "definida por <nome> em <data>" para a etiqueta nunca parecer um prazo do sistema (R1, D-004).

**S-10 (sugestão) — "Liberado" no painel.** Depois da decisão `'released'`, não usar "Aprovado" nem "Conforme" na tela; usar "Liberado por <nome> em <data>", com a justificativa visível.

## 8. Opiniões por agente e crítica cruzada

### 8.1 `architect_qa`

Foco: invariantes, bloqueios, migrações e testes.

- A arquitetura proposta é boa e consistente com o que já existe; os problemas estão nas transições: o backfill contra o append-only (B-1), as fixtures (B-3) e o front-end que lê movimentos sem saber de recipientes (I-14).
- "Restrição no banco" aparece no texto em lugares onde não existe restrição possível sem desenho adicional (I-2). Pede que cada regra diga se é `CHECK`, FK, trigger ou só função.
- A 6.7 precisa de modelo antes de qualquer fatia ser aceita, porque a escolha de eventos muda o `check` de `kind` que a 6.3 cria (I-9).
- Recomenda dividir 6.0 e 6.4 e não aceitar a 6.1 sem o teste de compatibilidade com a guarda do PR #2.
- Lista de bloqueios: aceita a ordem "recebimento primeiro", com duas adições declaradas: unidade em `FOR SHARE` antes de criar recebimento (I-11) e, se houver, contador de código depois do recebimento (I-7).

### 8.2 `suflex_analyst`

Foco: jornada real de cozinha e promessas. Sem navegação nesta revisão; base: `SUFLEX_EVIDENCIAS.md` e `ESTUDO_COMPETITIVO_E_MODULOS.md` (07/11/2026), material comercial não auditado.

- Os concorrentes consultados anunciam porcionamento, regras de validade cadastradas pelo cliente, responsáveis e locais (Fixee, Yeschef). O desenho cobre a jornada abrir → porcionar → etiquetar → consumir sem copiar nada disso, e a recusa de prazo automático é uma diferença deliberada (D-004), não uma lacuna a fechar.
- A jornada mais frequente no turno é "abrir agora, registrar quando der". Com D-019, o registro sai atrasado; a etiqueta com horário do registro é o maior risco de erro silencioso desta fase (B-2).
- A sobra de porcionamento com etiqueta do fabricante (I-12) e a "nova etiqueta" sem retirar a antiga (R2) são as duas formas de a equipe ler um prazo errado no recipiente físico.
- Congelamento com prazo novo vai ser pedido no primeiro dia; sem mensagem clara, o contorno é registrar recebimento falso (I-13).
- Promessas: não usar "validade garantida", "rastreabilidade completa" nem "pronto para fiscalização" em nenhum material do piloto.

### 8.3 `business_strategist`

Chamado por impacto de escopo.

- **I-16 (importante) — a Fase 6 virou duas fases.** São 11 fatias, várias com banco e tela, antes do piloto. Do ponto de vista de validação com caixa curto, o piloto só precisa das fatias que tornam o sistema usável no turno: 6.0a, 6.1, 6.2, 6.3, 6.7 (banco), 6.5, 6.6 e uma versão mínima da 6.4. A 6.9 (locais) e a parte de cadastro de conservação por produto podem esperar a observação do piloto, que é exatamente o que D-019 já propõe para a escrita por membro. A decisão de manter tudo é de luis; a recomendação é marcar 6.9 como "depois da primeira semana de piloto", sem mudar o desenho.
- **I-17 (importante) — gargalo do proprietário.** Com D-019, toda abertura, porção, baixa e decisão de ocorrência passa por uma pessoa. No piloto isso mede a disposição do dono a operar o sistema, não o valor do produto para a equipe. Pede três métricas na 6.10: atraso entre `handled_at` e `created_at` (depende de B-2), número de etiquetas manuais feitas fora do sistema, e tempo até decisão de ocorrência (R12 já tem).
- Sem impacto direto em preço: nada nesta revisão muda custo de infraestrutura. A trilha 6.10 não deve gerar promessa comercial de conformidade (Q10).

### 8.4 Crítica cruzada

- **`architect_qa` sobre `suflex_analyst`:** concorda com B-2, mas discorda de deixar o `handled_at` livre: sem janela máxima, vira campo para "acertar" a etiqueta depois do fato. A janela e a recusa fora dela entram no ajuste. Também pede que I-12 tenha registro no banco (`remainder_sealed`), não só pergunta na tela, para ser auditável.
- **`suflex_analyst` sobre `architect_qa`:** dividir 6.0 e 6.4 aumenta o número de paradas para aceite com luis, que já opera Codex e Claude em paralelo. Aceita a divisão só se cada parte continuar pequena o bastante para um PR por dia; caso contrário, prefere manter 6.0 inteira com B-1 e B-3 resolvidos.
- **`business_strategist` sobre `architect_qa`:** trazer a 6.7 para antes da 6.5 é a mudança de ordem com melhor custo-benefício, porque evita suporte manual no piloto. Os demais rearranjos são neutros para o piloto.
- **`architect_qa` sobre `business_strategist`:** adiar a 6.9 é aceitável; adiar a 6.4 não, porque a decisão de luis sobre Q8 (bloqueio sem medição) é condição de uso de refrigerados e congelados. A versão mínima da 6.4 precisa incluir o bloqueio.
- **`suflex_analyst` sobre `business_strategist`:** a métrica de "etiquetas manuais fora do sistema" é a que mais informa sobre a D-019; concorda.
- **Dissenso registrado:** dividir ou não a 6.0 (architect_qa a favor; suflex_analyst só se as partes forem pequenas). Fica para luis.

## 9. Ajustes propostos por fatia (consolidado)

| Fatia | Ajustes | Achados |
|---|---|---|
| 6.0 | Mecanismo do backfill sob append-only; teste "trigger habilitado"; `TRUNCATE`; limpeza de fixtures sem `DELETE` de histórico; `member_organizations(owner_only)`; `FOR SHARE` na unidade em `receive_batch`; opcionalmente dividir em 6.0a/b/c | B-1, B-3, I-1, I-10b, I-11 |
| 6.1 | `short_code` aqui; trigger do integral no `insert` de recebimento; `container_id` preenchido na inserção; `on conflict` parcial; partir do `record_movement` do PR #2; filtro por integral no front-end | B-3, I-5, I-7, I-14 |
| 6.3 | FKs compostas de manipulação; validade da origem copiada e checada; `intent_id` da transferência; ordem replay → regras; `display_name` nulo recusado; `handled_at` informado com janela | B-2, I-2, I-3, I-4 |
| 6.4 | Decisão bloqueia a linha do recebimento; tabelas na seção 6; dividir banco e tela | I-6, I-10a |
| 6.5 | Pergunta da sobra fechada; mensagem de congelamento; limite da validade como texto | I-12, I-13 |
| 6.6 | "Manipulado por"; sem citação de norma; autoria da validade na etiqueta | S-7, S-8, S-9 |
| 6.7 | Modelo de eventos de anulação; implementar antes da 6.5 | I-9 |
| 6.9 | `seq` e bloqueio na linha do recebimento | I-8 |
| 6.10 | Métricas de atraso, etiquetas manuais e tentativas de congelamento | I-13, I-17 |
| Textos | Trocar "conforme" na 7.6; lista de expressões em componentes, PDFs e mensagens | I-15, S-10 |

## 10. Índice dos achados

| ID | Classe | Assunto |
|---|---|---|
| B-1 | Bloqueante | Backfill da 6.1 contra append-only da 6.0 |
| B-2 | Bloqueante | Data de abertura na etiqueta é a do registro |
| B-3 | Bloqueante | Testes existentes mudam com 6.0/6.1 |
| I-1 | Importante | `TRUNCATE` fora de P5 |
| I-2 | Importante | Vínculos manipulação–derivado–transferência sem restrição |
| I-3 | Importante | `intent_id` da transferência |
| I-4 | Importante | Ordem do replay na `handle_container` |
| I-5 | Importante | `on conflict` de `ensure_container` |
| I-6 | Importante | Decisão de ocorrência sem bloqueio declarado |
| I-7 | Importante | `short_code`: concorrência e segundo backfill |
| I-8 | Importante | "Último evento" de local ambíguo |
| I-9 | Importante | Anulação de manipulação sem modelo |
| I-10a | Importante | Seção 6 sem tabelas de 4.8/4.9 |
| I-10b | Importante | P3 em `memberships` |
| I-11 | Importante | Corrida fuso × recebimento |
| I-12 | Importante | Sobra aberta com etiqueta do fabricante |
| I-13 | Importante | Contornos da regra de validade |
| I-14 | Importante | Front-end de movimentos entre 6.3 e 6.5 |
| I-15 | Importante | Teste 10c e texto da 7.6 |
| I-16 | Importante | Escopo pré-piloto |
| I-17 | Importante | Gargalo do proprietário e métricas |
| S-1 a S-10 | Sugestão | Ver seções 1 a 7 |

(Os itens I-10a e I-10b contam como dois; I-16 e I-17 vêm de `business_strategist`.)

## 11. O que esta revisão não fez

- Não executou testes nem iniciou o banco. Nenhum achado foi reproduzido em execução.
- Não conferiu normas sanitárias (Q10) nem fontes de concorrentes além dos documentos do repositório.
- Não mediu desempenho de RLS nem de `list_containers`.
- Não revisou o PR #1 além da interação com P6.
