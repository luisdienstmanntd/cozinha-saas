# Fase 6 — desenho: manipulação de recipientes, saldo no servidor e preparação do piloto

Documento de desenho escrito por Claude Code em 12/11/2026 sobre a `main` em `4c39e9f`. **Nada aqui está implementado.** Registro da tarefa: `ia-tarefas/fase-06-desenho.md`.

> **Situação em 12/11/2026:** desenho **aprovado por luis para planejamento**, com as respostas a Q1–Q10 (seção 11) e as correções da revisão cruzada do PR #4 (seção 14) incorporadas. Isso **não autoriza implementação**: a primeira fatia só começa com aprovação explícita de luis, depois do aceite da Fase 5 e da resolução do PR #2, e cada fatia seguinte tem aceite próprio. Migração, deploy e merge continuam exigindo autorização explícita.
>
> **Princípio desta fase:** a nova arquitetura precisa preservar tudo o que já funciona. Os testes e regras existentes continuam valendo; quando uma fatia precisa mudar uma fixture ou a preparação de um teste, a fatia diz qual e mostra que o comportamento verificado é o mesmo (seção 4.11).
>
> Até a conferência normativa por profissional habilitado (Q10), nenhuma tela, etiqueta, mensagem ou documento do produto pode afirmar que o software garante conformidade sanitária.

Bases usadas: [brief](PRODUCT_BRIEF.md), [decisões](DECISOES.md), [backlog](BACKLOG.md), [riscos](RISCOS.md), [plano da Fase 5](FASE_05_PLANO.md), a [revisão 05](REVISAO_05_SEGURANCA_PRODUTO.md) (PR #2; as referências S1–S10 e P3–P9 são dela) e a revisão cruzada `REVISAO_CRUZADA_FASE_06.md` (PR #4; as referências B-, I- e S- de uma letra seguida de número são dela).

Este desenho não substitui avaliação sanitária do responsável técnico, revisão jurídica (LGPD) nem auditoria de segurança independente.

## 1. Pré-requisitos e o que já está decidido

Antes da primeira fatia:

1. **Aceite da Fase 5** (consumo, descarte e anulação, D-016 e D-018). O registro `ia-tarefas/fase-05-anulacao.md` ainda está como "aguardando aceite".
2. **Resolução do PR #2** (guarda `security_guard.test.sql`, migração de endurecimento, job de banco na CI). As fatias 6.0a e 6.1 partem da guarda e da versão de `record_movement` desse PR.
3. **Situação do PR #1** (gestão de unidades, D-017). Não bloqueia a 6.0a nem a 6.0b, mas a 6.0c (fuso imutável e auditoria) toca a mesma tabela e precisa ser reconciliada com ele (seção 15).
4. **Aprovação explícita de luis para iniciar a 6.0a.**

Decisões que este desenho respeita sem rediscutir:

- **Só o proprietário escreve no piloto** (D-019). Cozinheiro e auxiliar continuam só com leitura. Todas as funções novas exigem `owner`; a troca futura fica concentrada em um parâmetro, com a matriz de papéis já testada (seção 8).
- **Quem registrou e quem manipulou são campos separados** (Q7).
- Validade nunca é calculada pelo sistema (D-004). Etiqueta não é estoque (D-003). Histórico não é editado nem apagado (AGENTS.md).
- Unidade de medida única por produto, sem conversão (brief).

**Mudança de escopo aceita para planejamento:** o [brief](PRODUCT_BRIEF.md) deixa "transformações/fracionamento não modelados" fora da v0.1. Este desenho modela uma forma mínima de fracionamento (abrir e porcionar uma única origem). O brief deve ser atualizado na fatia 6.3; mistura de lotes, produção e transferências entre unidades continuam fora.

Decisões registradas a partir deste desenho em [DECISOES.md](DECISOES.md): D-019 (decidida) e D-020 a D-033 (aprovadas para planejamento; D-025 continua proposta).

## 2. Objetivo e escopo

**Objetivo:** tornar o sistema utilizável no turno da cozinha, que é onde a etiqueta realmente nasce: quando alguém **abre** uma embalagem ou **porciona** um produto e precisa registrar a nova validade, a condição de conservação, quando e quem fez. Ao mesmo tempo, o painel deve mostrar só o que ainda existe, para a equipe não aprender a ignorá-lo.

### Dentro do escopo

| # | Entrega | Origem |
|---|---|---|
| A | Manipulação de recipiente: **abrir** (1 derivado) ou **porcionar** (2 a 20 derivados), com validade após abertura informada, conservação, horário real e quem manipulou | Revisão 05, produto item 2 |
| B | Saldo **por recipiente**, calculado no servidor, com consulta paginada | P9 |
| C | Painel de vencimentos com **apenas recipientes com saldo** e validade efetiva do recipiente | Revisão 05, produto item 3 |
| D | Rota do QR com saldo, origem e recipientes derivados | pendência da Fase 5 |
| E | Etiquetas de recebimento e de produto aberto/fracionado | Revisão 05, item 4; análise sanitária |
| F | Anulação de manipulação, disponível antes das telas de manipulação | revisão cruzada I-9; decisão de luis |
| G | Recuperação da tentativa após fechar a aba | pendência de D-013, D-016 e D-018 |
| H | Endurecimento antes das tabelas novas: histórico append-only (P5), RLS por conjunto (P3), fuso imutável e auditoria (P6) | P3, P5, P6 |
| I | Carregamento de acesso tolerante a uma organização inválida | P7 |
| J | Conservação e temperatura aferida no recebimento, ocorrência e bloqueio quando não houver medição | análise sanitária; Q8 |
| K | Locais de armazenamento e transferências | Q9 |
| L | Trilha pré-piloto sem tela: autenticação (P4), dados pessoais (P8), provisionamento e métricas | P4, P8, produto itens 6 e 7 |

### Fora do escopo desta fase

- Ampliar escrita para o membro (D-019; reavaliar após observação na cozinha).
- Regras ou sugestões automáticas de prazo, inclusive "abrir = validade original menos N dias" e limites da Portaria SES/RS 799/2023 aplicados como prazo padrão.
- Prorrogar validade por congelamento e etiqueta de **alimento preparado** com validade própria. Exigem ficha de preparo, ingredientes rastreados e aprovação de responsável habilitado; ficam para fase própria.
- Classificação automática de temperatura como conforme ou não conforme.
- Ficha técnica, produção, receitas, mistura de lotes, transferência entre unidades, conversão de unidade, balança, impressora térmica, offline.
- Correção de recebimento (quantidade, validade ou lote errados). Continua exigindo desenho próprio.
- Correção de `handled_by` ou de `handled_at` depois de registrados. Se vier depois, será por evento novo que preserve o valor anterior.
- Convite de membros e criação de empresa pela interface.

## 3. Conceitos

- **Recebimento** (`batch_receipts`): entrada imutável, como hoje. Continua sendo a origem da rastreabilidade (produto, fornecedor, lote externo, validade original).
- **Recipiente integral:** o recipiente que representa o recebimento. Hoje é criado sob demanda ao gerar a etiqueta (D-014). Passa a ser **criado junto com o recebimento**, por trigger, inclusive em inserções feitas por testes (4.11).
- **Manipulação:** operação única e auditada que retira saldo de um recipiente de origem e cria recipientes derivados. Dois tipos:
  - **abertura:** um derivado, com quantidade até o saldo da origem. Um recebimento de 10 kg pode ser várias embalagens: abrir uma hoje e outra na semana seguinte gera duas aberturas, cada uma com horário, validade e ID próprios. O ID novo vale também quando a embalagem inteira é aberta sem dividir.
  - **porcionamento:** de 2 a 20 derivados por operação. O limite é por operação, provisório e de usabilidade, não sanitário: 25 porções são feitas em duas operações. Não há limite por recebimento.
- **Sobra:** o que fica na origem quando a manipulação não leva todo o saldo. **Só uma embalagem originalmente fechada mantém a condição de origem intacta**: a sobra pode ficar na origem apenas quando a origem é o recipiente integral e a pessoa confirma que o restante continua fechado. Em qualquer outro caso (peça única aberta, origem que já é derivada), a sobra precisa virar mais uma porção ou ser descartada na mesma operação (5.1, regra 6).
- **Horário da manipulação** (`handled_at`): quando a pessoa abriu ou porcionou, informado no registro. É diferente de `created_at`, que é quando o proprietário registrou. A etiqueta imprime `handled_at`.
- **Condição de conservação:** ambiente, refrigerado ou congelado. Registrada no recebimento (D-027) e em cada derivado. Não se confunde com o **local** de armazenamento (câmara fria 01, freezer 2), da fatia 6.9.
- **Recipiente derivado:** recipiente criado por manipulação. Pertence ao mesmo recebimento (mesmo `batch_id`), então o lote de origem é sempre conhecido. Pode ser manipulado de novo.
- **Saldo do recipiente:** quantidade inicial, menos consumos, descartes, transferências para derivados e anulações de manipulação, mais anulações de saída e devoluções de transferência. É o "saldo registrado" da Fase 5, agora por recipiente. Não comprova conferência física.
- **Validade efetiva:** a do próprio recipiente. No integral é a do recebimento; no derivado é a informada na manipulação.
- **Ocorrência:** registro de uma situação que bloqueia o uso até uma decisão auditada. Nesta fase há dois tipos: recebimento sem medição de temperatura (Q8) e manipulação registrada fora da janela de horário (B-2).

Nenhuma manipulação cria estoque: a soma dos derivados (e do descarte de sobra, se houver) sai do saldo da origem.

## 4. Modelo de dados previsto

Esboço para planejamento; nomes finais e SQL serão escritos com teste antes, na fatia correspondente. Toda tabela nova segue o padrão atual: `organization_id` e `establishment_id` em toda linha, FK composta de escopo, RLS habilitada, `revoke all` de `public`, `anon` e `authenticated`, escrita só por função `SECURITY DEFINER` em `private` com `search_path = ''`, wrapper `SECURITY INVOKER` em `public`. Toda regra abaixo diz se é garantida por `CHECK`, FK, índice único, trigger ou só pela função (com pgTAP).

### 4.1 `containers` (alterada na 6.1)

| Coluna | Tipo | Regra |
|---|---|---|
| `kind` | `text` | `'integral'` ou `'derived'` (`CHECK`) |
| `parent_container_id` | `uuid` | nulo no integral; obrigatório no derivado |
| `handling_id` | `uuid` | nulo no integral; obrigatório no derivado |
| `position` | `smallint` | 1 a 21 no derivado (a 21ª só como porção de sobra), para "porção 2 de 4" |
| `initial_quantity` | `numeric` | `> 0`, até 3 casas, inteira para `un`. No integral, cópia da quantidade do recebimento |
| `expiry_date` | `date` | no integral, cópia da validade do recebimento; no derivado, a informada |
| `expiry_origin` | `text` | `'receipt'` no integral; `'handling'` no derivado. A origem da validade do recebimento (`original`/`responsible`) é lida por junção, não copiada (S-1) |
| `storage` | `text` | `'ambient'`, `'refrigerated'` ou `'frozen'`. No integral, cópia da conservação do recebimento (nulo só nos recebimentos anteriores à 6.5a); no derivado, a informada |
| `short_code` | `text` | código curto legível gerado na criação de **todo** recipiente, a partir de uma `sequence` global (por exemplo `C-000042`). Único globalmente, logo único por unidade; buracos são aceitáveis; nenhuma linha nova bloqueada (I-7). O UUID continua sendo a identidade e o que vai no QR |
| `handled_at` | `timestamptz` | nulo no integral; no derivado, cópia de `container_handlings.handled_at` |
| `timezone` | `text` | fuso da unidade na criação |

Restrições:

- `unique (batch_id)` vira índice único parcial `where kind = 'integral'`; `ensure_container` passa a usar `on conflict (batch_id) where kind = 'integral'` (I-5).
- `unique (organization_id, establishment_id, batch_id, id)` para as FKs compostas.
- FK composta `(organization_id, establishment_id, batch_id, parent_container_id)` → mesmo recebimento.
- FK composta `(handling_id, parent_container_id)` → `container_handlings (id, source_container_id)`: o pai do derivado é sempre a origem da sua manipulação (I-2a).
- FK composta `(handling_id, expiry_date)` → `container_handlings (id, expiry_date)` e `(handling_id, storage)` → `container_handlings (id, storage)`: o derivado tem a validade e a conservação da manipulação.
- `CHECK` de coerência: integral sem pai, sem manipulação e sem `handled_at`; derivado com os três.

### 4.2 `container_handlings` (nova na 6.3)

| Coluna | Regra |
|---|---|
| `id`, escopo, `batch_id` | FK composta ao recebimento |
| `source_container_id`, `source_expiry_date` | FK composta `(source_container_id, source_expiry_date)` → `containers (id, expiry_date)`: a validade da origem é copiada e conferida pelo banco |
| `kind` | `'opening'` ou `'portioning'` |
| `portion_count` | 1 em abertura; 2 a 20 em porcionamento (sem contar a porção de sobra) |
| `total_quantity` | soma dos derivados; conferida pela função e por pgTAP |
| `expiry_date` | validade após abertura informada. `CHECK (expiry_date <= source_expiry_date)`: **nunca posterior à origem** é uma restrição real (I-2c) |
| `storage` | `'ambient'`, `'refrigerated'` ou `'frozen'` |
| `handled_at` | horário real informado (D-031). `CHECK (handled_at <= created_at)`; janela e anterioridade à origem pela função |
| `late` | `boolean`; verdadeiro quando `created_at − handled_at` passa da janela; obriga uma ocorrência (4.8) |
| `remainder` | `'none'` (levou todo o saldo), `'sealed'` (sobra fechada na origem integral) ou `'discarded'` (sobra descartada na mesma operação). `CHECK`: `'sealed'` só com origem integral (garantido pela função, conferido por pgTAP, porque o tipo da origem está em outra tabela) |
| `remainder_quantity` | quantidade que ficou ou foi descartada; zero com `'none'` |
| `remainder_intent_id` | gerado pelo servidor quando há descarte de sobra; é o `intent_id` desse movimento |
| `handled_by`, `handled_by_name` | quem manipulou (vínculo ativo validado pelo banco) e cópia do nome de exibição no momento |
| `note` | opcional, até 200 caracteres visíveis |
| `intent_id` | `unique (organization_id, establishment_id, intent_id)` |
| `timezone`, `created_by`, `created_at` | como nas demais tabelas |
| — | `unique (id, source_container_id)`, `unique (id, expiry_date)`, `unique (id, storage)` para as FKs da 4.1 e 4.3 |

Todas as porções de uma manipulação têm a mesma validade, conservação e horário. Porções com dados diferentes são manipulações diferentes.

### 4.3 `stock_movements` (alterada na 6.1 e na 6.3)

- **6.1:** coluna `container_id`, obrigatória, com FK composta `(organization_id, establishment_id, batch_id, container_id)`. Movimentos existentes recebem o integral do recebimento no backfill (4.11). Índice `(organization_id, establishment_id, container_id)` incluindo `kind` e `quantity`.
- **6.3:** tipo `'transfer'` (saída da origem para os derivados), com `handling_id` obrigatório, `reason` nulo e o **mesmo `intent_id` da manipulação** (I-3). FK composta `(handling_id, container_id)` → `container_handlings (id, source_container_id)`: a transferência sai sempre da origem (I-2a). `unique (handling_id) where kind = 'transfer'` (I-2b). O descarte de sobra é um `'discard'` comum na origem, com `handling_id` preenchido e `intent_id = remainder_intent_id`.
- **6.4:** tipos `'transfer_reversal'` (na origem, `reverses_id` da transferência) e `'handling_void'` (um por derivado, zera o saldo dele), descritos na 4.10.
- Anulações (`'reversal'`) herdam o `container_id` do movimento anulado. `reverse_movement` recusa `'transfer'`, `'transfer_reversal'` e `'handling_void'`.

**Invariante de conservação** (pgTAP e teste de propriedade): para cada recebimento, `soma dos saldos de todos os seus recipientes = quantidade do recebimento − consumos − descartes + anulações de saída`; para cada manipulação não anulada, `soma das quantidades iniciais dos derivados = quantidade da transferência`; para cada manipulação anulada, a soma dos saldos dos derivados é zero. A soma por manipulação não cabe num `CHECK`: é garantida pela função, que insere tudo na mesma transação, e verificada por pgTAP e pelo teste de propriedade (I-2d).

### 4.4 Saldo no servidor (P9, fatia 6.2)

Função `public.list_containers(p_organization_id, p_establishment_id, p_filter, p_after, p_limit)`, `SECURITY INVOKER`, `stable`, que devolve por recipiente: produto, unidade, lote externo, tipo, origem, validade efetiva e origem dela, conservação, quantidade inicial, saldo, situação de bloqueio, `short_code` e criação. Filtros: `'with_balance'` (padrão), `'all'`, `'batch'` e `'container'`. Paginação por `(expiry_date, id)`, limite 200.

Por ser `SECURITY INVOKER`, a RLS continua sendo a única barreira. Critério: 200 recipientes com saldo em unidade com 20 mil recipientes e 200 mil eventos em menos de 50 ms no banco local. Plano B: saldo mantido pela função de escrita sob o mesmo bloqueio.

### 4.5 Quem registrou e quem manipulou (Q7)

- `memberships.display_name` (até 40 caracteres visíveis, por exemplo "Ana M."). Definido pela função `set_member_display_name`, só do proprietário, auditada em `entity_changes`; o script de provisionamento (6.10) a usa. A função existe já na 6.3, porque `handle_container` depende do nome.
- A manipulação guarda `created_by` (proprietário que registrou) e `handled_by` (quem manipulou, qualquer vínculo ativo da organização), com cópia do nome em `handled_by_name`. O banco recusa `handled_by` sem vínculo ativo na mesma organização e recusa `handled_by` sem nome de exibição, com mensagem clara.
- Membro não passa a ver o nome nem o vínculo de colegas: a lista de pessoas para escolher é do proprietário, e o nome impresso vem da cópia na manipulação (I-10b).

### 4.6 Fuso imutável e auditoria (P6, fatia 6.0c)

- Trigger que recusa `UPDATE` de `establishments.timezone` quando a unidade já tem recebimento.
- `receive_batch` lê a unidade com `FOR SHARE` antes de criar o recebimento, para que fuso e recebimento concorrentes não terminem os dois (I-11). É uma linha bloqueada **antes** da do recebimento; a ordem existente não se inverte.
- `entity_changes`: organização, unidade e nome de exibição; campo, valor anterior, valor novo, autor, data. Preenchida por trigger em `private`. Leitura só para proprietário (S-4).

### 4.7 Recuperação de tentativa (fatia 6.8)

- Intenção pendente em `localStorage`, por usuário, unidade e operação, por até 24 horas.
- `public.find_operation(p_organization_id, p_establishment_id, p_intent_id)`, `SECURITY INVOKER`, procura o `intent_id` em recebimentos, manipulações, anulações de manipulação, decisões de ocorrência, movimentos e transferências de local visíveis pela RLS. Quando a manipulação e sua transferência têm o mesmo `intent_id`, devolve sempre a manipulação (I-3).
- Ao reabrir: se o servidor já tem a operação, mostra "Registro confirmado"; se não, oferece "Enviar novamente" (mesmo `intent_id`) ou "Descartar tentativa". Nunca reenvia sozinha.

### 4.8 Conservação, temperatura e ocorrências (D-027 e D-029, fatia 6.5a)

| Informação | Onde fica | Regra |
|---|---|---|
| Condição de conservação exigida | `products.storage_condition` | produtos antigos ficam nulos até o proprietário definir uma vez por função auditada, que bloqueia a linha do produto (I-6) |
| Conservação do recebimento | `batch_receipts.storage_condition` | obrigatória em recebimentos novos; padrão do produto, confirmada pelo proprietário |
| Situação da medição | `batch_receipts.temperature_status`: `measured`, `not_measured`, `not_required` | `not_required` só em ambiente |
| Temperatura aferida | `batch_receipts.received_temperature_c` (`numeric(4,1)`, −50 a 80) | obrigatória se `measured`, proibida nos outros casos. Não é classificada como conforme |

As colunas novas são nulas nos recebimentos anteriores. A regra `expiry_date <= original_expiry_date` do recebimento continua como está.

**Ocorrências** (`occurrences`), criadas na mesma transação da operação que as causa:

| Coluna | Regra |
|---|---|
| escopo, `batch_id` | FK composta ao recebimento |
| `kind` | `'temperature_not_measured'` (recebimento sem medição) ou `'late_handling'` (manipulação fora da janela, D-031) |
| `handling_id` | nulo em `'temperature_not_measured'`; obrigatório em `'late_handling'` (FK composta). `CHECK` de coerência entre `kind` e `handling_id`; índices únicos parciais: uma ocorrência por recebimento sem medição e uma por manipulação tardia |
| `reason` | justificativa obrigatória, até 300 caracteres visíveis |
| `created_by`, `created_at`, `timezone` | autoria e instante |

**Decisão** (`occurrence_decisions`): ocorrência (único), `decision` (`'released'` ou `'rejected'`), justificativa obrigatória (até 500 caracteres visíveis), quem decidiu, instante e `intent_id`. A função de decisão bloqueia a linha do recebimento, como as demais (I-6). Uma decisão por ocorrência; não há troca.

**Bloqueio de uso** (garantido pelas funções de escrita, com pgTAP): um recipiente está bloqueado quando o recebimento dele tem ocorrência sem decisão ou rejeitada, ou quando a manipulação que o criou tem ocorrência sem decisão ou rejeitada. Recipiente bloqueado não pode ser consumido, manipulado nem transferido de local; descarte é permitido. A etiqueta de produto aberto de um derivado bloqueado por manipulação tardia não é gerada até a liberação (não se imprime horário que ainda não foi aceito). A etiqueta de recebimento bloqueado sai com a faixa "BLOQUEADO — aguardando decisão".

Quem decide é o proprietário (D-019), seguindo o procedimento sanitário da cozinha. Enquanto esse procedimento não for aprovado por profissional habilitado (Q10), a tela diz isso e o sistema só registra a decisão e o fundamento informado. A liberação nunca acontece sozinha nem por prazo. Com recebimento rejeitado, anular um descarte devolve saldo a um recipiente que continua bloqueado (S-2).

### 4.9 Local de armazenamento e transferência (D-030, fatia 6.9)

- `storage_locations`: nome, condição, unidade, ativo. Criados pelo proprietário; desativados, nunca apagados.
- `location_moves`: evento imutável com recipiente, local anterior, local novo, quem moveu (`handled_by`), quem registrou, instante, fuso, `intent_id` e `seq bigint generated always as identity`. **Localização atual = evento de maior `seq` do recipiente** (I-8). A função bloqueia a linha do recebimento.
- Recebimento e manipulação aceitam local inicial opcional; derivado sem local herda o local atual da origem, como evento na mesma transação.
- Mover não altera saldo, validade nem conservação. Divergência entre a condição do local e a do recipiente gera aviso e confirmação, sem mudança automática. Recipiente esgotado ou bloqueado não pode ser movido.

### 4.10 Anulação de manipulação (D-032, fatia 6.4)

- `handling_voids`: manipulação (único), justificativa obrigatória, `intent_id`, `created_by`, `created_at`, `timezone`.
- Na mesma transação, com a linha do recebimento bloqueada: um `'transfer_reversal'` na origem (devolve a transferência), um `'handling_void'` em cada derivado (quantidade igual à inicial, zera o saldo) e, se houve descarte de sobra, a anulação desse descarte (`'reversal'`). A conservação continua fechando sem exceção na fórmula.
- Condição: nenhum derivado teve consumo, descarte, manipulação ou transferência de local (além do evento de local herdado na criação). Ocorrência tardia aberta não impede anular.
- A origem volta com a validade dela. Se a origem venceu no meio do caminho, a anulação é permitida (devolve saldo), e o painel mostra a origem como vencida.
- Derivados anulados aparecem como "Anulado" na rota do QR e no histórico; o PDF deles é recusado.

### 4.11 Transição segura: backfill, proteções e testes existentes (D-033)

**B-1 — backfill sob histórico append-only.** A 6.0a instala triggers que recusam `UPDATE`, `DELETE` e `TRUNCATE` nas tabelas de histórico. A 6.1 precisa preencher colunas novas em `containers` e `stock_movements` existentes. Duas estratégias foram comparadas:

| | A. Suspensão transacional controlada | B. Ativação definitiva só depois da migração |
|---|---|---|
| Como | A migração da 6.1, numa única transação, faz `disable trigger` nominal só nos triggers de append-only de `containers` e `stock_movements`, executa o backfill e faz `enable trigger` antes do fim. Um bloco final verifica que todos os triggers de proteção existem e estão habilitados (`tgenabled = 'O'`) e aborta a migração se não estiverem | A 6.0a não protege `containers` e `stock_movements`; os triggers dessas tabelas só são criados no fim da 6.1 |
| Quem consegue | Só o dono da tabela, durante a migração; `service_role` e `authenticated` não têm permissão para desabilitar triggers | — |
| Janela sem proteção | Nenhuma visível fora da transação; `alter table` toma bloqueio exclusivo e outras sessões esperam | Entre a 6.0a e a 6.1, duas tabelas de histórico ficam sem proteção |
| Teste | Teste de catálogo na guarda desde a 6.0a: todo trigger de proteção existe e está habilitado em todas as tabelas de histórico; pgTAP depois da 6.1 confirma que UPDATE/DELETE/TRUNCATE voltaram a falhar | Mesmo teste, mas só verde a partir da 6.1 |
| Risco | Uma migração futura copiar o padrão sem reabilitar; mitigado pelo bloco final e pela guarda | Guarda não uniforme por uma fatia; esquecer a ativação |

**Escolha: A.** Ela deixa a proteção testada desde a 6.0a e a verifica ao fim da própria migração. Como `short_code` também nasce na 6.1, não há segundo backfill. Qualquer backfill futuro segue o mesmo procedimento e repete o bloco final. P5 protege contra erro de aplicação e de script; não protege contra o superusuário do banco, o que fica registrado.

**B-3 — testes existentes.** Os critérios de comportamento, segurança e rastreabilidade dos testes atuais não mudam. Mudam fixtures e preparação, uma por uma:

| Onde | Hoje | Adaptação | O que continua verificado |
|---|---|---|---|
| `scripts/catalog-fixture.mjs` (integração de lotes, catálogo, recipientes e movimentos) | Apaga histórico por organização e depois os usuários | Na 6.0a: não apaga mais tabelas de histórico nem usuários com histórico; cada teste continua isolado por organização e e-mail aleatórios; a CI parte de banco novo; `npm run db:reset` local documentado | Todas as asserções de isolamento, concorrência, reenvio e revogação, sem alteração |
| `supabase/tests/movements.test.sql` e `batches.test.sql` | Inserem `batch_receipts` direto | Na 6.1: trigger `after insert` em `batch_receipts` cria o integral, então a preparação não muda | Todas as asserções; na 6.1 cada caso de movimento é repetido também com derivado |
| `supabase/tests/security_guard.test.sql` (PR #2) | Insere `batch_receipts` e `stock_movements` direto, sem recipiente | Na 6.1: trigger `before insert` em `stock_movements` preenche `container_id` com o integral quando vier nulo. As funções novas sempre informam o recipiente, e pgTAP confirma que nenhuma delas depende desse preenchimento | Toda a guarda; tabelas e funções novas entram na lista fixa e na matriz de papéis |
| `identity.test.mjs` e testes de unidade do PR #1 | Apagam unidades, vínculos e organizações | Nenhuma: essas tabelas não entram em P5 | Sem mudança |
| Front-end de movimentos (`supabaseMovements.ts`, `MovementPanel.tsx`) | Valida `kind` em três valores e soma movimentos do recebimento | Na 6.1: lê pelo `container_id` do integral; na 6.3: aceita `'transfer'` como saída (I-14). Os testes de componente mudam a preparação, não o que verificam | Saldo exibido, confirmação, reenvio e recuperação de recusa |

Nenhum teste é removido, pulado ou enfraquecido. Se uma adaptação não conseguir manter uma asserção, a fatia para e isso é levado a luis.

## 5. Funções de escrita previstas

Todas: `owner` ativo (`private.has_membership(org, true)`), reautorização em replay, `intent_id` obrigatório, códigos de erro já usados (`42501`, `22023`, `23503`, `23505`), verificação de vínculo antes de qualquer leitura de dado, bloqueio `FOR UPDATE` na linha do recebimento. Ordem de bloqueio: unidade em `FOR SHARE` (só `receive_batch`), depois recebimento; nada bloqueia outra linha depois do recebimento (a `sequence` do `short_code` não bloqueia).

**Ordem das verificações em toda função com replay** (I-4): autorização → validação de forma → bloqueio da linha do recebimento → busca do replay → regras de estado (vencimento, saldo, bloqueio, janela de horário). Assim um reenvio depois da meia-noite, depois de a origem zerar ou depois de o nome de exibição mudar devolve o ID original.

### 5.1 `handle_container` (6.3; ocorrência tardia na 6.5a)

Parâmetros: organização, unidade, origem, tipo, quantidades (`numeric[]`), validade após abertura, conservação, `handled_at`, `handled_by`, tratamento da sobra (`'none'`, `'sealed'` ou `'discard'`) e motivo do descarte de sobra, observação, justificativa de atraso (só fora da janela), `intent_id`. Devolve o ID da manipulação.

Regras de estado:

1. Origem existe no escopo, tem saldo maior que zero e não está bloqueada (4.8).
2. **Horário:** `handled_at` obrigatório, não futuro, não anterior à criação da origem (e ao `handled_at` dela, se derivada). Até **2 horas** antes do registro, segue o fluxo normal. Acima disso: na 6.3, recusado; a partir da 6.5a, aceito somente com justificativa de atraso, gravando `late = true` e uma ocorrência `'late_handling'` que bloqueia os derivados até a decisão. Horário desconhecido não é registrado; a orientação é seguir o procedimento da cozinha. A janela de 2 horas é provisória, sujeita a validação operacional e sanitária, e fica numa única função `private.handling_late_window()` (D-031).
3. **Origem vencida na data do `handled_at`** (no fuso da unidade) é recusada: manipular não recupera validade.
4. Abertura: uma quantidade. Porcionamento: 2 a 20 quantidades, válidas para a unidade de medida.
5. **Validade após abertura** obrigatória, de `max(data do handled_at, data do registro)` até a validade efetiva da origem, inclusive. Posterior à origem é recusada (`CHECK` da 4.2), também com conservação congelada.
6. **Sobra** (`saldo − soma das porções`):
   - zero: `'none'`;
   - maior que zero e origem integral: `'sealed'` com confirmação de que o restante continua fechado, ou `'discard'`;
   - maior que zero e origem derivada: só `'discard'`, ou a pessoa inclui a sobra como mais uma porção (que conta no limite de 20, ou ocupa a posição 21 quando já houver 20).
   A sobra descartada gera um `'discard'` na origem, na mesma transação, com motivo obrigatório.
7. Conservação obrigatória. `handled_by` com vínculo ativo e nome de exibição.
8. Na mesma transação: manipulação, derivados (com `position` e `short_code`), transferência, descarte de sobra (se houver), ocorrência tardia (se houver) e evento de local herdado (a partir da 6.9).
9. Replay compara origem, tipo, quantidades na ordem, validade, conservação, `handled_at`, `handled_by`, sobra, observação, justificativa e autor. **Não** compara `handled_by_name`. Mesmo `intent_id` usado em `record_movement` dá `23505` (I-3).

### 5.2 `record_movement` e `reverse_movement`

- `record_movement` parte da versão do PR #2 (com filtro de escopo). Recusa **consumo** em recipiente bloqueado (a partir da 6.5a); descarte segue permitido. Na 6.1 ganha `p_container_id`; a assinatura antiga continua existindo e opera no integral até a interface migrar.
- Consumo de recipiente vencido continua permitido, como na Fase 5; a tela mostra aviso. A recusa por vencimento vale só para manipulação (S-5).
- `reverse_movement` mantém a assinatura, herda o recipiente e recusa anular transferência e eventos de anulação de manipulação.

### 5.3 `receive_batch` e `ensure_container`

`receive_batch` lê a unidade com `FOR SHARE` (6.0c). O integral é criado pelo trigger de recebimento (6.1). `ensure_container` continua idempotente e devolve o integral.

### 5.4 `void_handling` (6.4) e `decide_occurrence` (6.5a)

Ambas seguem a ordem de verificações da seção 5, bloqueiam a linha do recebimento e são idempotentes por `intent_id`. `void_handling` aplica a 4.10; `decide_occurrence` aplica a 4.8.

## 6. RLS e privilégios previstos

Padrão de política (P3, fatia 6.0b):

```sql
using (organization_id in (select private.member_organizations()))
```

`private.member_organizations(p_owner_only boolean default false)` é `SECURITY DEFINER`, `stable`, `search_path = ''`, devolve as organizações com vínculo ativo do `auth.uid()` (só as de proprietário quando `p_owner_only`) e não recebe parâmetro de usuário. **`memberships_read` mantém a regra atual** (vínculos revogados escondidos; vínculos de colegas só para o proprietário), reescrita com a mesma condição (I-10b).

| Tabela | `anon` | `authenticated` | Escrita | `service_role` | Append-only (P5) |
|---|---|---|---|---|---|
| `batch_receipts` | nada | SELECT por vínculo | `receive_batch` | SELECT | sim |
| `containers` | nada | SELECT por vínculo | funções e trigger de recebimento | SELECT | sim |
| `stock_movements` | nada | SELECT por vínculo | funções | SELECT | sim |
| `container_handlings` | nada | SELECT por vínculo | `handle_container` | SELECT | sim |
| `handling_voids` | nada | SELECT por vínculo | `void_handling` | SELECT | sim |
| `occurrences` | nada | SELECT por vínculo | `receive_batch`, `handle_container` | SELECT | sim |
| `occurrence_decisions` | nada | SELECT por vínculo | `decide_occurrence` | SELECT | sim |
| `storage_locations` | nada | SELECT por vínculo | funções do proprietário (criar, desativar) | SELECT | sem DELETE; UPDATE só de `active` pela função |
| `location_moves` | nada | SELECT por vínculo | função de transferência | SELECT | sim |
| `entity_changes` | nada | SELECT só proprietário | trigger | SELECT | sim |
| `memberships` (inclui `display_name`) | nada | regra atual, sem mudança | `set_member_display_name` e script administrativo | como hoje | não |
| `products.storage_condition` | nada | SELECT por vínculo | função de definição única, auditada | como hoje | — |

**P5 (6.0a):** triggers `before update or delete` por linha e `before truncate` por comando nas tabelas marcadas, para todos os papéis, inclusive `service_role`; `revoke truncate` de `service_role` nessas tabelas (I-1). Toda tabela nova entra na lista fixa da guarda do PR #2 e no teste "trigger existe e está habilitado". Funções novas entram na matriz de papéis da guarda.

## 7. Fluxos de tela

Interface em português, botões grandes para tablet de bancada, sem campo obrigatório além do que o fluxo exige. Nenhum texto fixo cita norma nem afirma conformidade (S-8, Q10).

### 7.1 Abrir ou porcionar (6.6)

Entrada: "Abrir / porcionar" na rota do QR e na linha do painel. Só para proprietário; recipiente bloqueado mostra o motivo no lugar do botão.

1. **Contexto:** produto, lote, `short_code`, saldo, validade efetiva, conservação e se a origem é embalagem fechada (integral) ou já aberta (derivado).
2. **Tipo e quantidade:** "Abrir embalagem" ou "Dividir em porções".
3. **Porções:** número (2 a 20) e quantidade de cada uma; "dividir igualmente" só preenche os campos e mostra a diferença na última. Mostra a soma e a sobra.
4. **Sobra** (se houver): na origem integral, "O restante continua fechado na embalagem original?" (Sim mantém; Não leva a "incluir como porção" ou "descartar", com motivo). Na origem derivada, só "incluir como porção" ou "descartar".
5. **Quando foi aberto:** data e hora, padrão "agora", editável para trás. Acima de 2 horas, aviso: "Registro fora da janela. Ficará bloqueado até a decisão do responsável." e justificativa obrigatória. Sem opção de horário desconhecido.
6. **Validade após abertura:** campo de data sem valor sugerido. Texto fixo: "Informe a validade após a abertura definida pelo responsável. O sistema não calcula prazos." A validade da origem aparece como **texto** ("não pode passar de 28/11/2026"), não como data pré-selecionável (I-13).
7. **Conservação e quem manipulou:** ambiente, refrigerado ou congelado; pessoa da organização (padrão o próprio usuário).
8. **Revisão:** tudo acima, "manipulado por" e "registrado por". Se a conservação mudar para congelado: "Congelar não prorroga a validade nesta versão. Não registre um recebimento novo para isso." (I-13).
9. **Confirmar.** Em resultado incerto, mantém a intenção (7.5). Em sucesso, vai para as etiquetas, com "Anular manipulação" visível enquanto nenhum derivado tiver movimento.

### 7.2 Etiquetas (6.7)

"Baixar PDF de todas" e "Baixar esta". Reimpressão nunca cria registro (D-003). Dois modelos (D-028), legíveis sem ler o QR:

**Produto aberto ou fracionado:**

- Cabeçalho "PRODUTO ABERTO" ou "PRODUTO FRACIONADO".
- Produto (grande). **Obrigatório.**
- Aberto em: data e hora de `handled_at`, com fuso da unidade. **Obrigatório.**
- **Validade após abertura** (grande). **Obrigatório.** Abaixo, pequeno: "definida por <nome> em <data>" (S-9).
- Validade do fabricante, quando a validade do recebimento for `original`.
- Lote original.
- Conservação.
- **Manipulado por:** `handled_by_name` (S-7).
- `short_code`, "porção 2 de 4" e QR (só URL e ID opaco).
- Quantidade: opcional, rotulada "quantidade na criação".

**Recebimento:** cabeçalho "RECEBIMENTO", validade original, lote, fornecedor, conservação, quantidade como "entrada", `short_code` e QR; faixa "BLOQUEADO — aguardando decisão" enquanto houver ocorrência aberta.

Derivado bloqueado por manipulação tardia ou anulado: PDF recusado com mensagem.

### 7.3 Painel de vencimentos (6.2; bloqueios a partir da 6.5b)

- Lista recipientes com saldo maior que zero, por validade efetiva; contagens de vencidos, hoje e amanhã só sobre eles.
- Linha: produto, validade, situação, saldo, conservação, tipo (integral, aberto, porção), lote e `short_code`.
- Bloqueados no topo, com motivo e tempo desde a ocorrência; rejeitados como "Rejeitado, aguardando descarte". Liberados mostram "Liberado por <nome> em <data>", nunca "Aprovado" ou "Conforme" (S-10).
- "Mostrar esgotados" desligado por padrão; busca no servidor; sem os tetos de 10.000 e 1.000 no navegador.

### 7.4 Rota do QR (6.2; origem e derivados a partir da 6.6)

Produto, validade efetiva, situação, saldo, conservação, aberto em e por quem, origem, derivados com saldo, histórico e bloqueio. Recipiente zerado por manipulação: "Este recipiente foi aberto em … Use a etiqueta nova", com links. Anulado: "Manipulação anulada em … por …". Ações só para proprietário.

### 7.5 Tentativa pendente (6.8)

Faixa "Há 1 registro não confirmado de 12/11 às 14:32", conferência no servidor, "Enviar novamente" ou "Descartar".

### 7.6 Recebimento e decisão de ocorrência (6.5b)

1. Formulário de recebimento com conservação (padrão do produto) e, para refrigerado ou congelado, "Temperatura medida" (°C) ou "Não foi possível medir" (justificativa).
2. "Não foi possível medir" mostra na revisão: "O recebimento ficará bloqueado para uso até a decisão do responsável."
3. Página da ocorrência (recebimento ou manipulação tardia): "Registrar decisão", liberar ou rejeitar, justificativa e o texto "Decida **seguindo** o procedimento sanitário da cozinha" (I-15). Rejeitar leva ao descarte do saldo.
4. Membro vê o bloqueio, mas não a ação de decisão.

### 7.7 Acesso tolerante (P7, 6.8)

Organizações válidas aparecem normalmente e uma faixa avisa "Não foi possível carregar 1 empresa".

## 8. Testes de segurança necessários

Escritos antes ou junto do código, com falha reproduzida quando possível. Datas relativas a "hoje no fuso da unidade" via uma única função `private.unit_today(establishment)`, para que os testes não envelheçam (S-6).

**pgTAP (banco):**

1. Guarda do PR #2 verde com tudo o que é novo: RLS, nada para `anon`, nada de DELETE/TRUNCATE/TRIGGER/REFERENCES para `authenticated`, `search_path` vazio, nada executável por `anon`/PUBLIC; tabelas novas na lista fixa; funções novas na matriz de papéis.
2. **Proteção do histórico:** todo trigger de proteção existe e está habilitado em todas as tabelas de histórico; UPDATE, DELETE e TRUNCATE recusados para todos os papéis, inclusive `service_role`; depois do backfill da 6.1, as mesmas recusas continuam.
3. Matriz de papéis em toda função de escrita nova: anônimo, membro, proprietário revogado, proprietário de outra empresa, proprietário de duas empresas misturando escopos, unidade de A com recipiente de outra unidade de A. Mesmo erro, sem revelar existência.
4. Restrições: derivado de outro recebimento, pai diferente da origem da manipulação, validade ou conservação do derivado diferente da manipulação, transferência fora da origem, segunda transferência para a mesma manipulação, validade da manipulação posterior à da origem por inserção direta (com triggers de teste). Todos recusados pela restrição.
5. Manipulação: 1, 20 e 21 porções (20 aceito; 21 só como sobra); soma acima do saldo; fracionária em `un`; validade igual à origem aceita, posterior recusada (inclusive congelado), anterior ao registro recusada; origem vencida na data do `handled_at`; origem sem saldo ou bloqueada; `handled_by` sem vínculo, revogado, de outra empresa ou sem nome; nome copiado preservado depois de revogar o vínculo; observação e motivos só com espaços invisíveis.
6. **Horário:** `handled_at` futuro, anterior à origem, exatamente 2 horas (aceito), 2 horas e 1 minuto (recusado na 6.3; ocorrência a partir da 6.5a); tardio sem justificativa recusado; derivados de manipulação tardia bloqueados até a decisão e PDF recusado.
7. **Sobra:** `'sealed'` em origem integral aceito; `'sealed'` em origem derivada recusado; sobra sem tratamento recusada; descarte de sobra cria exatamente um `'discard'` na origem com o `remainder_intent_id`.
8. **Idempotência:** replay idêntico devolve o mesmo ID; replay depois de a origem zerar, depois da meia-noite no fuso da unidade e depois de mudar o nome de exibição devolve o mesmo ID; mesmo `intent_id` com qualquer campo diferente é recusado; `record_movement` com o `intent_id` de uma manipulação dá `23505`.
9. **Anulação de manipulação:** com movimento, manipulação ou transferência de local em algum derivado, recusada; segunda anulação recusada; conservação após anular, inclusive com descarte de sobra; origem vencida pode receber a devolução; PDF de derivado anulado recusado.
10. **Conservação:** sequência fixa de recebimento, abertura parcial com sobra fechada, porcionamento com sobra descartada, baixas, anulações, nova abertura de porção e anulação de manipulação; as somas da 4.3 batem.
11. `list_containers` e `find_operation` como membro de B não devolvem nada de A, inclusive com IDs de A; `find_operation` devolve a manipulação, não a transferência.
12. **P3:** toda a bateria atual passa sem mudar expectativa; membro não vê vínculo nem nome de colega; revogado não aparece.
13. **P6:** fuso recusado após recebimento, com o mesmo código de erro de fuso inválido do PR #1 preservado; alteração de nome (organização, unidade, nome de exibição) gera `entity_changes`; `entity_changes` invisível para membro e outra empresa.
14. **Recebimento e ocorrências (6.5a):** refrigerado ou congelado sem situação de medição recusado; `measured` sem temperatura; `not_measured` sem justificativa; temperatura fora de −50 a 80; `not_measured` cria exatamente uma ocorrência (também em replay); consumo, manipulação e transferência de local recusados com ocorrência aberta ou rejeitada e aceitos depois de liberada; descarte aceito; segunda decisão recusada; decisão por membro, revogado ou outra empresa recusada; nenhuma liberação sem decisão; recebimentos antigos legíveis com campos nulos; definição única da conservação de produto só pelo proprietário e auditada; recebimento rejeitado com descarte anulado continua bloqueado (S-2).
15. **Locais (6.9):** local de outra unidade ou empresa; local inativo como destino; recipiente esgotado ou bloqueado; mover não altera saldo nem validade; localização atual pelo maior `seq`.
16. **Textos:** uma lista única de expressões proibidas (por exemplo "garante conformidade", "dentro das normas", "seguro para consumo", "aprovado pela vigilância", "regularizado", nomes de normas e órgãos), aplicada a textos fixos de componentes, ao texto extraído dos PDFs e às mensagens de erro do banco (I-15).

**Integração via API (usuários reais):**

17. Duas manipulações concorrentes da mesma origem acima do saldo: só uma aceita.
18. Manipulação × baixa na mesma origem: saldo nunca negativo.
19. Reenvio concorrente idêntico de `handle_container`, `void_handling` e `decide_occurrence`: um único registro.
20. Revogação durante a sessão: próxima escrita negada com o token anterior.
21. UPDATE de fuso × `receive_batch` (I-11).
22. Decisão de ocorrência × consumo e × descarte na mesma origem (I-6).
23. Geração de `short_code` sob concorrência: sem repetição (I-7).
24. Anulação de manipulação × baixa num derivado.
25. Mover a origem × porcionar a origem: o derivado herda o local certo (I-8).
26. Teste de propriedade com semente registrada: baixas, anulações, manipulações, sobras e anulações de manipulação aleatórias; após cada passo, nenhum saldo negativo e conservação válida.

**Navegador (Playwright):**

27. Jornada: receber, etiquetar, abrir parcialmente com sobra fechada, porcionar em 3 com sobra descartada, baixar PDFs, consumir uma porção, conferir painel e QR da origem com aviso de etiqueta nova.
28. Anular manipulação logo após criá-la; QR mostra "anulada".
29. Recebimento sem medição: etiqueta com faixa, baixa recusada na tela, decisão, reimpressão sem faixa.
30. Manipulação tardia: aviso, justificativa, derivados bloqueados, PDF indisponível até a decisão.
31. Porcionamento de origem derivada com sobra: tela obriga porção ou descarte.
32. Negação no navegador: usuário de outra empresa abre `/recipiente/<id>` de A e não vê nada.
33. Membro não vê ações de escrita nem de decisão.
34. Fechar a aba com resultado incerto, reabrir e confirmar sem duplicar.

**Outros:**

35. Rollback de cada migração aplicado e reaplicado na CI; rollback da 6.1 recusa se houver derivados.
36. Advisors de segurança sem ocorrência.
37. PDFs: conteúdo extraído e QR decodificado.

## 9. Riscos

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| R1 | Validade informada errada, com etiqueta de aparência oficial | Crítica | Sem sugestão; limite pela origem como restrição; limite mostrado como texto; autoria impressa; anulação disponível desde a primeira tela; conferência normativa antes do piloto |
| R2 | Etiqueta antiga lida como válida na embalagem aberta | Alta | QR destaca "use a etiqueta nova"; sobra só fica na origem se fechada; avaliar no ensaio físico se a etiqueta antiga deve ser riscada |
| R3 | Proprietário escolhe a pessoa errada em "manipulado por" | Média | Nome e "registrado por" na tela; tema de observação do piloto |
| R4 | Migração com dados existentes | Média | Estratégia A da 4.11, bloco final de verificação, rollback que recusa com derivados, ensaio com volume |
| R5 | Saldo agregado lento | Média | Índice, critério de 50 ms, plano B |
| R6 | Texto livre e nome de exibição como dado pessoal | Média | Limites, ajuda "não escreva dados de pessoas", procedimento P8 |
| R7 | Mudança de limpeza dos testes de integração | Média | 6.0a dedicada, tabela da 4.11, nenhuma asserção alterada |
| R8 | Escopo crescer para receitas e produção | Média | Uma origem por manipulação; fora de escopo explícito |
| R9 | Conflito entre assistentes e PRs abertos | Média | Seção 15; registro de tarefa e reserva de arquivos antes de cada fatia |
| R10 | Tablet compartilhado com sessão persistente | Média | D-025, ainda proposta |
| R11 | Referências normativas não conferidas | Alta | Pendência pré-piloto (Q10); lista de expressões proibidas (teste 16) |
| R12 | Bloqueio trava o turno se ninguém decidir | Média | Painel com tempo desde a ocorrência; decisão em poucos passos; métrica no piloto |
| R13 | Janela de 2 horas inadequada ao turno real | Média | Provisória, numa única função; métrica de atraso entre `handled_at` e `created_at` e de ocorrências tardias no piloto |
| R14 | Equipe contorna "congelar não prorroga" registrando recebimento novo | Média | Mensagem fixa; métrica de tentativas; tema para o responsável técnico |
| R15 | Gargalo do proprietário (D-019) | Média | Métricas de atraso, etiquetas feitas fora do sistema e tempo até decisão (I-17) |

## 10. Ordem revisada das fatias e critérios de aceite

Cada fatia é um PR pequeno, com registro de tarefa, testes antes ou junto, gates completos (`lint`, `typecheck`, `test`, `build`, `test:db`, `test:integration`, `test:e2e`, advisors) e parada para aceite. **Nenhuma fatia começa sem aprovação de luis**, e a 6.0a só depois do aceite da Fase 5 e da resolução do PR #2. Critério comum a todas: toda a bateria existente continua verde, com as únicas adaptações de fixture previstas na 4.11; nenhum teste removido, pulado ou enfraquecido.

| Ordem | Fatia | Entrega | Depende de |
|---|---|---|---|
| 1 | **6.0a** | P5: proteção do histórico e adaptação de testes | Fase 5, PR #2, aprovação de luis |
| 2 | **6.0b** | P3: RLS por conjunto | 6.0a |
| 3 | **6.0c** | P6: fuso imutável e auditoria | 6.0b; reconciliação com PR #1 |
| 4 | **6.1** | Saldo por recipiente, sem mudança visível | 6.0c |
| 5 | **6.2** | Painel só com saldo e QR com saldo | 6.1 |
| 6 | **6.3** | Manipulação no banco | 6.1 |
| 7 | **6.4** | Anulação de manipulação no banco | 6.3 |
| 8 | **6.5a** | Conservação, temperatura e ocorrências no banco | 6.4 |
| 9 | **6.5b** | Recebimento, decisão e bloqueio na interface | 6.5a, 6.2 |
| 10 | **6.6** | Telas de abrir, porcionar e anular | 6.5b |
| 11 | **6.7** | Etiquetas de recebimento e de produto aberto | 6.6 |
| 12 | **6.8** | Recuperação de tentativa e acesso tolerante | 6.6 |
| 13 | **6.9** | Locais e transferências | 6.7 e 6.8 estáveis |
| — | **6.10** | Trilha pré-piloto sem tela | em paralelo a partir da 6.1 |

### 6.0a — Proteção do histórico (P5) e adaptação de testes

- Triggers de append-only (UPDATE, DELETE, TRUNCATE) em `batch_receipts`, `containers` e `stock_movements`; `revoke truncate` de `service_role`.
- Teste de catálogo "trigger existe e está habilitado" na guarda.
- Fixture de integração sem DELETE de histórico nem de usuários com histórico; `db:reset` local documentado.

Aceite: testes 2 e 1 da seção 8 verdes; toda a integração verde com a nova limpeza, sem alterar asserções; rollback e reaplicação testados.

### 6.0b — RLS por conjunto (P3)

- `private.member_organizations(p_owner_only)`; todas as políticas reescritas; `memberships_read` com a regra atual.

Aceite: teste 12; benchmark registrado (antes e depois, 20 mil linhas); nenhuma expectativa de teste alterada.

### 6.0c — Fuso imutável e auditoria (P6)

- Trigger de fuso; `FOR SHARE` em `receive_batch`; `entity_changes` só para proprietário.

Aceite: testes 13 e 21; testes do PR #1 (se integrado) inalterados, inclusive o código de erro de fuso inválido.

### 6.1 — Saldo por recipiente

- Colunas novas de `containers` (incluindo `short_code` por `sequence`, `expiry_origin` com `'receipt'`/`'handling'`); índice parcial e `on conflict` de `ensure_container`; `container_id` em `stock_movements`.
- Trigger de integral no recebimento e preenchimento de `container_id` para inserções legadas.
- Backfill pela estratégia A da 4.11 com bloco final de verificação.
- `record_movement` a partir da versão do PR #2, com `p_container_id`; assinatura antiga no integral.
- Front-end de movimentos lendo pelo integral.

Aceite: nenhuma mudança visível; conservação verdadeira para todos os dados existentes; teste 2 verde depois do backfill; todo caso de `movements.test.sql` repetido também com derivado (preparado por inserção de teste); teste 23; rollback recusa com derivados.

### 6.2 — Painel com saldo e QR com saldo

- `list_containers`; painel só com saldo; QR com saldo; remoção dos tetos no navegador.

Aceite: critério de 50 ms; teste 11 (parte de `list_containers`); E2E 32; contagens só com saldo.

### 6.3 — Manipulação no banco

- `container_handlings`, `'transfer'`, FKs e únicos da 4.2 e 4.3; `handle_container` com ordem de verificações da seção 5, `handled_at` com janela de 2 horas (fora dela, recusado nesta fatia), regra da sobra, `handled_by` com nome; `memberships.display_name` e `set_member_display_name`; front-end aceita `'transfer'` na leitura; brief atualizado.

Aceite: testes 3 a 8, 10, 17, 18, 19 (manipulação), 20; nenhuma tela de manipulação ainda.

### 6.4 — Anulação de manipulação no banco

- `handling_voids`, `'transfer_reversal'`, `'handling_void'`, `void_handling`.

Aceite: testes 9, 10 (com anulação), 19 (anulação), 24, 26 com anulação incluída.

### 6.5a — Conservação, temperatura e ocorrências no banco

- Colunas de 4.8; `occurrences` e `occurrence_decisions`; `decide_occurrence`; bloqueio em `record_movement` e `handle_container`; ocorrência `'late_handling'` passa a aceitar manipulação fora da janela.

Aceite: testes 6 (parte tardia), 14, 19 (decisão), 22.

### 6.5b — Recebimento, decisão e bloqueio na interface

- Formulário de recebimento (7.6), página de decisão, faixa "Bloqueado" no painel, faixa no PDF de recebimento.

Aceite: E2E 29 e 33 (decisão); teste 16 nos textos novos.

### 6.6 — Telas de abrir, porcionar e anular

- Fluxo 7.1 completo, anulação na tela, QR com origem e derivados.

Aceite: E2E 27, 28, 30, 31, 33.

### 6.7 — Etiquetas

- Dois modelos (7.2); PDF recusado para bloqueado por atraso e anulado; `import()` dinâmico do gerador.

Aceite: teste 37 e 16 nos PDFs; campos obrigatórios legíveis sem QR; ensaio físico agendado. A conferência normativa (Q10) é exigida antes do piloto, não antes da fatia.

### 6.8 — Recuperação de tentativa e acesso tolerante

- `find_operation`, `localStorage`, faixa de tentativa; P7.

Aceite: teste 11 (`find_operation`); E2E 34; teste de componente de organização inválida.

### 6.9 — Locais e transferências

- 4.9 completa, local inicial em recebimento e manipulação, herança do local.

Aceite: testes 15 e 25; histórico de local com autoria; nenhum efeito em saldo ou validade.

### 6.10 — Trilha pré-piloto (sem tela)

- Script de provisionamento testado na CI (empresa, unidade, proprietário, membros com nome de exibição); `config.toml` de produção documentado (P4); procedimento de dados pessoais (P8); métricas: atraso entre `handled_at` e `created_at`, ocorrências tardias, etiquetas feitas fora do sistema, tentativas de prazo recusadas, tempo até decisão de ocorrência, proporção de validades iguais à da origem.

Aceite: script verde na CI; documento P8 revisado por luis; nada aqui afirma conformidade.

A antiga F6 do backlog (fluxo E2E completo, revisão de segurança, ensaio de impressão real e piloto privado) fica depois destas fatias, como F7, e exige a conferência normativa de Q10.

## 11. Perguntas e decisões

Q1–Q6 foram respondidas pela análise sanitária trazida por luis em 12/11/2026 (seção 13) e Q7–Q10 decididas por luis no mesmo dia. Todas aprovadas para planejamento.

| # | Pergunta | Decisão | No desenho |
|---|---|---|---|
| Q1 | Campos da etiqueta aberta | Produto, data de abertura e validade após abertura obrigatórios; fabricante, lote, conservação, quem manipulou e QR recomendados; quantidade opcional | 7.2 |
| Q2 | Validade nova pode passar da original? | Não, nem com congelamento; preparação própria é outra operação | 4.2 (`CHECK`), 5.1 |
| Q3 | Conservação no recebimento? | Sim, separando condição exigida, temperatura aferida e local | 4.8, 4.9 |
| Q4 | Nome curto para a etiqueta? | Sim, com `user_id` e cópia do nome | 4.5 |
| Q5 | ID novo na abertura simples? | Sim, com UUID e código curto do servidor | 3, 4.1 |
| Q6 | Limite de 20 porções? | Por operação, provisório; nunca por lote | 3, 5.1 |
| Q7 | Separar quem registrou de quem manipulou | **Aprovado**, vínculo validado pelo banco, correções futuras preservam auditoria | 4.5, D-021, D-024 |
| Q8 | Temperatura obrigatória? | **Aprovado com condições**: obrigatória para refrigerado e congelado; sem medição, ocorrência e bloqueio até decisão | 4.8, D-027, D-029 |
| Q9 | Locais e transferências nesta fase? | **Aprovado**, incremento separado depois dos fluxos principais | 4.9, 6.9, D-030 |
| Q10 | Quem confere as normas? | **Pendência pré-piloto**: nutricionista responsável técnico ou profissional habilitado, ainda não escolhido; até lá, não declarar conformidade | R11, teste 16 |

## 12. Relação com as propostas da revisão 05

| Proposta | Onde entra | Observação |
|---|---|---|
| P3 RLS por conjunto | 6.0b | `memberships` mantém a regra atual |
| P4 autenticação hospedada | 6.10 | só documentação; deploy proibido sem autorização (D-006) |
| P5 append-only | 6.0a | inclui TRUNCATE e a nova limpeza de testes |
| P6 fuso imutável e auditoria | 6.0c | reconciliar com D-017 do PR #1 |
| P7 acesso tolerante | 6.8 | só interface |
| P8 dados pessoais | 6.10 e 4.5 | anonimização mantém UUID; cópias de nome nas manipulações entram no procedimento |
| P9 saldo no servidor | 6.1 e 6.2 | base do resto da fase |

Manutenção sem fatia própria: `private.visible_text(text)` nos `CHECK` novos, SQL com uma condição por linha, tipos gerados do banco nas RPCs novas e `import()` dinâmico do gerador de PDF.

## 13. Avaliação da análise sanitária de 12/11/2026

luis trouxe uma análise baseada na RDC 216/2004 e na Portaria SES/RS 799/2023, com respostas a Q1–Q6. Ela responde às seis dúvidas de forma conservadora e coerente com D-004. Números de itens e conteúdo das normas não foram conferidos no texto oficial (R11).

- **Adotado:** campos mínimos e etiqueta legível sem QR; validade após abertura nunca posterior à original, sem exceção para congelamento; manipular não recupera validade; ID novo também na abertura simples, sem estoque novo; código curto; 20 porções por operação; nome curto com `user_id` e cópia; regra atual do recebimento mantida.
- **Adotado com ajuste:** abertura parcial; `handled_by` separado de `created_by` por causa da D-019; conservação e temperatura no recebimento como fatia própria; etiquetas de recebimento e de produto aberto (alimento preparado fica fora).
- **Não adotado:** limites da Portaria como prazo no sistema (são máximos para preparados, não prazo padrão).

## 14. Incorporação da revisão cruzada (PR #4)

luis leu a revisão cruzada do PR #4 em 12/11/2026 e aprovou os três bloqueantes e a incorporação das correções a este desenho, sem autorização para implementar.

**Ressalva registrada por luis:** os três papéis da revisão (`architect_qa`, `suflex_analyst`, `business_strategist`) foram simulados em sequência pelo mesmo assistente. Houve perspectivas diferentes, mas não uma validação verdadeiramente independente, e nenhum teste foi executado na revisão. Os achados vêm da leitura do código; cada fatia deve confirmá-los com teste antes de corrigir.

| Achado | Decisão de luis | Onde ficou |
|---|---|---|
| B-1 backfill × append-only | Estratégia segura, comparando suspensão transacional e ativação posterior; proteções ativas e verificadas ao concluir | 4.11 (escolha A), 6.0a, 6.1, D-033 |
| B-2 horário da abertura | `handled_at` separado de `created_at`; janela provisória de 2 horas; fora dela, ocorrência, sem etiqueta com horário fictício | 3, 4.2, 4.8, 5.1, 7.1, D-031 |
| B-3 testes existentes | Adaptar fixtures e testes preservando comportamento, segurança e rastreabilidade | 4.11, critério comum da seção 10, D-033 |
| Divisão da 6.0 | 6.0a P5, 6.0b P3, 6.0c P6 | 10 |
| Divisão da 6.4 | Banco e interface | 6.5a e 6.5b |
| Anulação antes das telas | Modelagem e implementação antecipadas | 4.10, 6.4, D-032 |
| Sobra do porcionamento | Só embalagem originalmente fechada mantém a condição de origem | 3, 4.2, 5.1 regra 6, 7.1, D-021 |
| Lacunas I-1 a I-15 e S-1 a S-10 | Corrigir RLS, integridade, concorrência, idempotência e etiquetas | I-1 em 6; I-2 em 4.1–4.3; I-3 em 4.3/4.7; I-4 em 5; I-5 em 4.1; I-6 em 4.8; I-7 em 4.1; I-8 em 4.9; I-9 em 4.10; I-10a/b em 6; I-11 em 4.6; I-12 em 3/5.1; I-13 em 7.1; I-14 em 4.11; I-15 em 7.6/8; S-1 em 4.1; S-2 em 4.8; S-4 em 4.6; S-5 em 5.2; S-6 em 8; S-7 a S-10 em 7 |
| I-16 escopo pré-piloto | Não acrescentar funcionalidades; Q9 mantida (locais na 6.9, por último entre as fatias de produto) | 10 |
| I-17 gargalo do proprietário | Métricas no piloto | 6.10, R15 |
| Q1–Q10 e Q7 | Preservadas | 11 |

Nenhuma funcionalidade nova foi acrescentada além do que as correções exigem: ocorrência tardia reaproveita o mecanismo de ocorrência de Q8, e a anulação de manipulação já estava prevista.

## 15. Conflitos e dependências entre PRs abertos

Verificado em 12/11/2026 por `git merge-tree` entre as branches, sem merge.

| PR | Branch → base | Relação com este desenho | Conflito de texto |
|---|---|---|---|
| #1 Unidades | `claude/revisao-interface-unidades` → `main` | D-017 (fuso só na criação) é compatível com a 6.0c, que passa a garantir no banco. Os testes do PR #1 alteram nome e tentam fuso inválido em unidade sem recebimento; a 6.0c precisa manter esses resultados e o código de erro `22023`. A auditoria de nome da 6.0c captura as renomeações feitas pela interface do PR #1 | **Sim**, em `docs/DECISOES.md`: o PR #1 insere D-017 e altera a última linha de D-018, e este PR acrescenta D-019 a D-033 logo depois. Resolução: manter as duas mudanças (acrescentar, sem descartar) |
| #2 Revisão 05 | `claude/revisao-05-seguranca-produto` → `main` | Pré-requisito: guarda de segurança, `CHECK` de nomes, versão de `record_movement` com filtro de escopo e job de banco na CI. A 6.0a e a 6.1 partem dele | Não |
| #3 Este desenho | `claude/fase-06-desenho` → `main` | — | Só com o PR #1, acima |
| #4 Revisão cruzada | `claude/revisao-cruzada-fase-06` → `claude/fase-06-desenho` | Fonte das correções da seção 14. Acrescenta `REVISAO_CRUZADA_FASE_06.md`, o próprio registro de tarefa e uma linha em `IA_ESTADO.md` | **Sim**, uma linha em `docs/IA_ESTADO.md` (o PR #4 tem a versão anterior da linha "Desenho da Fase 6"; manter a deste PR e a linha do PR #4). Com o PR #1, o mesmo conflito de `DECISOES.md` herdado deste PR |

Ordem sugerida de integração, quando luis autorizar: PR #2, depois PR #1 (reconciliando `DECISOES.md`), depois PR #4 dentro do PR #3, e por fim o PR #3. A Fase 6 só começa depois disso e da aprovação explícita da 6.0a.
