# Fase 6 — desenho: manipulação de recipientes, saldo no servidor e preparação do piloto

Documento de desenho escrito por Claude Code em 12/11/2026 sobre a `main` em `4c39e9f`. **Nada aqui está implementado nem aprovado.** É uma proposta para luis aceitar, ajustar ou recusar antes de qualquer migração ou tela. Registro da tarefa: `ia-tarefas/fase-06-desenho.md`.

Bases usadas: [brief](PRODUCT_BRIEF.md), [decisões](DECISOES.md), [backlog](BACKLOG.md), [riscos](RISCOS.md), [plano da Fase 5](FASE_05_PLANO.md) e a [revisão 05](REVISAO_05_SEGURANCA_PRODUTO.md) (PR #2, ainda em rascunho; as referências S1–S10 e P3–P9 são dela).

Este desenho não substitui avaliação sanitária do responsável técnico, revisão jurídica (LGPD) nem auditoria de segurança independente.

## 1. Pré-requisitos e o que já está decidido

Antes de implementar qualquer fatia desta fase:

1. **Aceite da Fase 5** (consumo, descarte e anulação, D-016 e D-018). O registro `ia-tarefas/fase-05-anulacao.md` ainda está como "aguardando aceite".
2. **Aceite ou recusa do PR #2** (guarda `security_guard.test.sql`, migração de endurecimento, job de banco na CI). A fatia 6.0 deste desenho depende da guarda e do índice de saldo por escopo que ele introduz.
3. **Situação do PR #1** (gestão de unidades, D-017). Não é bloqueante, mas a fatia 6.0 (fuso imutável) toca a mesma área e precisa ser reconciliada com ele.

Decisões que este desenho respeita sem rediscutir:

- **Só o proprietário escreve no piloto** (decisão de luis em 12/11/2026). Cozinheiro e auxiliar continuam só com leitura. Todas as funções novas exigem `owner`; o desenho deixa a troca futura concentrada em um parâmetro, com a matriz de papéis já testada (ver seção 8).
- Validade nunca é calculada pelo sistema (D-004). Etiqueta não é estoque (D-003). Histórico não é editado nem apagado (AGENTS.md).
- Unidade de medida única por produto, sem conversão (brief).

**Mudança de escopo que precisa de aceite explícito:** o [brief](PRODUCT_BRIEF.md) deixa "transformações/fracionamento não modelados" fora da v0.1. Este desenho propõe modelar uma forma mínima de fracionamento (abrir e porcionar uma única origem). Se luis aceitar, o brief deve ser atualizado na fatia 6.3; mistura de lotes, produção e transferências continuam fora.

Decisões registradas a partir deste desenho em [DECISOES.md](DECISOES.md): D-019 (escrita só do proprietário, já decidida) e D-020 a D-028 (propostas).

## 2. Objetivo e escopo

**Objetivo:** tornar o sistema utilizável no turno da cozinha, que é onde a etiqueta realmente nasce: quando alguém **abre** uma embalagem ou **porciona** um produto e precisa registrar a nova validade, a condição de armazenamento e quem fez. Ao mesmo tempo, o painel deve mostrar só o que ainda existe, para a equipe não aprender a ignorá-lo.

### Dentro do escopo

| # | Entrega | Origem |
|---|---|---|
| A | Manipulação de recipiente: **abrir** (1 recipiente derivado com todo o saldo) ou **porcionar** (2 a 20 recipientes derivados), com validade nova definida pelo responsável, armazenamento e data/hora da manipulação | Revisão 05, produto item 2 |
| B | Saldo **por recipiente**, calculado no servidor, com consulta paginada | P9 |
| C | Painel de vencimentos com **apenas recipientes com saldo** e validade efetiva do recipiente | Revisão 05, produto item 3 |
| D | Rota do QR com saldo, origem e recipientes derivados | pendência da Fase 5 |
| E | Etiqueta do recipiente derivado (campos a validar com o responsável técnico) | Revisão 05, produto item 4 |
| F | Recuperação da tentativa após fechar a aba | pendência de D-013, D-016 e D-018 |
| G | Endurecimento que precisa existir antes das tabelas novas: RLS por conjunto (P3), histórico append-only também para o backend (P5), fuso imutável e auditoria de nome/fuso (P6) | P3, P5, P6 |
| H | Carregamento de acesso tolerante a uma organização inválida | P7 |
| J | Conservação e temperatura aferida no recebimento; condição de conservação no cadastro do produto | análise sanitária de 12/11 |
| K | Local de armazenamento e transferência entre equipamentos (**a decidir**, pode ir para a Fase 7) | análise sanitária de 12/11 |
| I | Trilha pré-piloto sem tela: configuração de autenticação (P4), política e procedimento de dados pessoais (P8), script de provisionamento e métricas do piloto | P4, P8, produto itens 6 e 7 |

### Fora do escopo desta fase

- Ampliar escrita para o membro (decisão de luis; reavaliar após observação na cozinha).
- Regras ou sugestões automáticas de prazo, inclusive "abrir = validade original menos N dias" e limites da Portaria SES/RS 799/2023 aplicados como prazo padrão.
- Prorrogar validade por congelamento e etiqueta de **alimento preparado** com validade própria. Exigem ficha de preparo, ingredientes rastreados e aprovação de responsável habilitado; ficam para fase própria.
- Classificação automática de temperatura como conforme ou não conforme.
- Ficha técnica, produção, receitas, mistura de lotes em um recipiente, transferência entre unidades, conversão de unidade, pesagem por balança, impressora térmica, offline.
- Correção de recebimento (quantidade, validade ou lote errados no recebimento). Continua exigindo desenho próprio.
- Convite de membros e criação de empresa pela interface.

## 3. Conceitos

- **Recebimento** (`batch_receipts`): entrada imutável, como hoje. Continua sendo a origem da rastreabilidade (produto, fornecedor, lote externo, validade original).
- **Recipiente integral:** o recipiente que representa o recebimento inteiro. Hoje é criado sob demanda ao gerar a etiqueta (D-014). Proposta: passa a ser **criado no próprio recebimento**, na mesma transação.
- **Manipulação:** operação única e auditada que retira saldo de um recipiente de origem e cria recipientes derivados. Tem dois tipos:
  - **abertura:** um derivado, com quantidade menor ou igual ao saldo da origem. Um recebimento de 10 kg pode ser várias embalagens: abrir uma hoje e outra na semana seguinte gera duas aberturas, cada uma com data, validade e ID próprios, e o restante continua fechado no integral. O ID novo vale também quando a embalagem inteira é aberta sem dividir.
  - **porcionamento:** de 2 a 20 derivados por operação, cada um com sua quantidade. A soma pode ser menor que o saldo da origem; o restante continua na origem. O limite é por operação, provisório e de usabilidade, não sanitário: 25 porções são feitas em duas operações. Não há limite por recebimento.
- **Condição de conservação:** ambiente, refrigerado ou congelado. É registrada no recebimento (D-027) e em cada derivado. Não se confunde com o **local** de armazenamento (câmara fria 01, freezer 2), que fica para a fatia 6.10.
- **Recipiente derivado:** recipiente criado por manipulação. Tem quantidade inicial, validade definida pelo responsável, armazenamento e momento da manipulação próprios. Pertence ao mesmo recebimento (mesmo `batch_id`), então o lote de origem é sempre conhecido. Um derivado pode ser manipulado de novo (por exemplo, porção congelada que depois é descongelada e aberta).
- **Saldo do recipiente:** quantidade inicial do recipiente, menos consumos, descartes e transferências para derivados, mais anulações. É o "saldo registrado" da Fase 5, agora por recipiente. Não comprova conferência física.
- **Validade efetiva:** a validade do próprio recipiente. No integral é a do recebimento; no derivado é a que o responsável informou na manipulação.

Nenhuma manipulação cria estoque novo: a soma dos derivados sai do saldo da origem.

Perda no porcionamento (aparas, sobra que não vira porção) **não** é inferida: se a soma das porções for menor que o saldo e a origem estiver vazia na prática, o operador registra um descarte com motivo na origem. A fatia 6.4 avalia oferecer esse descarte na mesma tela, como evento separado.

## 4. Modelo de dados previsto

Esboço para discussão; nomes finais e SQL serão escritos com teste antes, na fatia correspondente. Toda tabela nova segue o padrão atual: `organization_id` e `establishment_id` em toda linha, FK composta de escopo, RLS habilitada, `revoke all` de `public`, `anon` e `authenticated`, escrita só por função `SECURITY DEFINER` em `private` com `search_path = ''`, wrapper `SECURITY INVOKER` em `public`.

### 4.1 `containers` (alterada)

Colunas novas:

| Coluna | Tipo | Regra |
|---|---|---|
| `kind` | `text` | `'integral'` ou `'derived'` |
| `parent_container_id` | `uuid` | nulo no integral; obrigatório no derivado. FK composta `(organization_id, establishment_id, batch_id, parent_container_id)` → mesmo recebimento |
| `handling_id` | `uuid` | nulo no integral; obrigatório no derivado. FK composta para `container_handlings` |
| `position` | `smallint` | ordem da porção dentro da manipulação (1..20), para etiqueta "porção 2 de 4" |
| `initial_quantity` | `numeric` | `> 0`, até 3 casas, inteira para `un`. No integral é cópia da quantidade do recebimento |
| `expiry_date` | `date` | no integral, cópia da validade do recebimento; no derivado, a informada |
| `expiry_origin` | `text` | `'receipt'` no integral; `'responsible'` no derivado |
| `storage` | `text` | `'ambient'`, `'refrigerated'` ou `'frozen'`. No integral, cópia da condição registrada no recebimento (nulo só nos recebimentos anteriores à fatia 6.9); no derivado, a informada |
| `short_code` | `text` | código curto legível gerado pelo servidor, único por unidade (por exemplo `R-00042`), impresso na etiqueta ao lado do QR. O UUID continua sendo a identidade e o que vai no QR |
| `handled_at` | `timestamptz` | nulo no integral; `now()` do servidor no derivado |
| `timezone` | `text` | fuso da unidade no momento da criação, como em recebimentos e movimentos |

Mudanças de restrição:

- `unique (batch_id)` vira índice único parcial `on containers (batch_id) where kind = 'integral'`: continua havendo um único integral por recebimento.
- `unique (organization_id, establishment_id, batch_id, id)` para permitir FKs compostas de movimentos e derivados.
- `check` de coerência: integral sem pai, sem manipulação e sem `handled_at`; derivado com os três.
- Cópias do integral (`initial_quantity`, `expiry_date`) são preenchidas pela função a partir do recebimento e conferidas por pgTAP. Como recebimento e recipiente são imutáveis, a cópia não diverge; ela existe para o painel não precisar de junção e para o saldo ter uma fórmula só.

**Migração de dados existentes:** para cada recebimento sem recipiente, criar o integral com autoria e data do recebimento; preencher as colunas novas dos integrais já existentes. A migração é reversível só enquanto não existirem derivados (o rollback recusa, como os rollbacks da Fase 5).

### 4.2 `container_handlings` (nova)

Uma linha por manipulação. Guarda o que foi decidido uma vez para todas as porções.

| Coluna | Regra |
|---|---|
| `id`, `organization_id`, `establishment_id`, `batch_id` | escopo e FK composta ao recebimento |
| `source_container_id` | FK composta ao recipiente de origem, no mesmo recebimento |
| `kind` | `'opening'` ou `'portioning'` |
| `portion_count` | 1 em abertura; 2 a 20 em porcionamento |
| `total_quantity` | soma das porções; `<=` saldo da origem no momento |
| `expiry_date` | validade nova informada pelo responsável; **nunca posterior** à validade efetiva da origem (restrição no banco) |
| `handled_by` | usuário com vínculo ativo na organização que manipulou fisicamente (pode ser membro); escolhido pelo proprietário que registra |
| `handled_by_name` | cópia do nome de exibição de `handled_by` no momento da operação, impressa na etiqueta e preservada se o nome mudar ou o vínculo for revogado |
| `storage` | `'ambient'`, `'refrigerated'` ou `'frozen'` |
| `note` | opcional, até 200 caracteres visíveis (por exemplo "aberto para o almoço"). Ver risco R6 sobre dados pessoais em texto livre |
| `intent_id` | `unique (organization_id, establishment_id, intent_id)` |
| `timezone`, `created_by`, `created_at` | como nas demais tabelas |

Todas as porções de uma manipulação têm a mesma validade e o mesmo armazenamento. Porções com validades diferentes são manipulações diferentes; isso mantém a tela simples e o registro claro.

### 4.3 `stock_movements` (alterada)

- Nova coluna `container_id`, obrigatória, com FK composta `(organization_id, establishment_id, batch_id, container_id)`. Movimentos existentes são migrados para o integral do recebimento.
- Novo tipo `'transfer'`: saída da origem para os derivados, com `handling_id` obrigatório e `reason` nulo. Uma linha por manipulação (quantidade = `total_quantity`).
- Anulações (`'reversal'`) herdam o `container_id` do movimento anulado. `reverse_movement` recusa anular `'transfer'`; manipulação errada é tratada pela fatia 6.6.
- Índice `(organization_id, establishment_id, container_id)` incluindo `kind` e `quantity`, para o cálculo de saldo.

**Invariante de conservação** (testada em pgTAP e em teste de propriedade): para cada recebimento,
`soma dos saldos de todos os seus recipientes = quantidade do recebimento − consumos − descartes + anulações`,
e para cada manipulação, `soma das quantidades iniciais dos derivados = quantidade da transferência`.

### 4.4 Saldo no servidor (P9)

Função `public.list_containers(p_organization_id, p_establishment_id, p_filter, p_after, p_limit)`, `SECURITY INVOKER`, `stable`, que devolve por recipiente: produto, unidade, lote externo, tipo, origem, validade efetiva, armazenamento, quantidade inicial, saldo e data de criação. Filtros: `'with_balance'` (padrão do painel), `'all'`, `'batch'` (todos os recipientes de um recebimento) e `'container'` (um recipiente, para a rota do QR). Paginação por chave `(expiry_date, id)`, limite máximo 200.

Por ser `SECURITY INVOKER`, a RLS das tabelas continua sendo a única barreira; a função não amplia acesso. A guarda do PR #2 já exige que qualquer view nova seja `security_invoker`; a mesma regra vale aqui para função.

Desempenho esperado: o saldo é um `sum` agrupado sobre o índice da 4.3. Critério de aceite: listar 200 recipientes com saldo em unidade com 20 mil recipientes e 200 mil eventos em menos de 50 ms no banco local. Se não atingir, a alternativa é uma coluna de saldo mantida pela própria função de escrita sob o mesmo bloqueio; fica registrada como plano B, não como desenho inicial, porque duplica a fonte da verdade.

### 4.5 Nome de exibição do responsável

A etiqueta derivada precisa dizer quem manipulou. Hoje o sistema não guarda nome de pessoa (D-011, dados pessoais mínimos). Proposta (Q4, aprovada na análise de 12/11 e pendente de confirmação de luis): coluna `memberships.display_name` (até 40 caracteres visíveis, por exemplo "Ana M."), definida pelo script de provisionamento (fatia 6.8) e editável só pelo proprietário por função auditada em fase posterior. Ver P8.

**Quem registra e quem manipulou são coisas diferentes.** Pela D-019, só o proprietário grava; na cozinha, quem abre é o cozinheiro. Para a etiqueta mostrar a pessoa certa sem dar escrita ao membro, a manipulação guarda dois campos: `created_by` (o proprietário que registrou, como hoje) e `handled_by` (quem manipulou, escolhido numa lista dos vínculos ativos da organização), com cópia do nome em `handled_by_name`. O banco recusa `handled_by` sem vínculo ativo na mesma organização. A etiqueta imprime "Responsável: Ana M."; a tela e o histórico mostram também "registrado por". Ver Q7.

### 4.6 Auditoria de unidade e organização (P6)

- Trigger que recusa `UPDATE` de `establishments.timezone` quando a unidade já tem recebimento (o PR #1 já não oferece a edição na interface; o banco passa a garantir).
- Tabela `entity_changes` (organização e unidade): campo, valor anterior, valor novo, autor, data. Preenchida por trigger `SECURITY DEFINER` em `UPDATE` de nome. Leitura só para proprietário.

### 4.7 Recuperação de tentativa (F)

- A intenção pendente passa de `sessionStorage` para `localStorage`, com chave por usuário, unidade e operação, e validade de 24 horas. Ao sair (logout), as intenções do usuário são descartadas da máquina **somente** após conferência no servidor.
- Função `public.find_operation(p_organization_id, p_establishment_id, p_intent_id)`, `SECURITY INVOKER`, que procura o `intent_id` em recebimentos, manipulações e movimentos visíveis pela RLS e devolve tipo e ID, ou nada. Ela não revela intenção de outro usuário além do que a RLS já mostra.
- Ao reabrir a tela, para cada intenção guardada: se o servidor já tem a operação, a interface mostra "Registro confirmado" e limpa; se não tem, oferece "Enviar novamente" (mesmo `intent_id`) ou "Descartar tentativa".

Isso resolve fechamento de aba e recarga. Não resolve troca de aparelho; fica registrado como limite.

### 4.8 Conservação e temperatura no recebimento (D-027, fatia 6.9)

A análise de 12/11 separa três informações; o desenho as trata assim:

| Informação | Onde fica | Regra |
|---|---|---|
| Condição de conservação exigida | `products.storage_condition` (`ambient`, `refrigerated`, `frozen`) | definida no cadastro; produtos antigos ficam nulos até o proprietário definir uma vez por função auditada (não há edição livre de cadastro, D-012) |
| Conservação do recebimento | `batch_receipts.storage_condition` | obrigatória em recebimentos novos; padrão vem do produto, o proprietário confirma |
| Temperatura aferida no recebimento | `batch_receipts.received_temperature_c` (`numeric(4,1)`, de −50 a 80) | obrigatória quando a conservação é refrigerada ou congelada, opcional em ambiente. O sistema **não** classifica a temperatura como conforme ou não: limites dependem do alimento e do fabricante e ficam com o responsável técnico |

As duas colunas de recebimento são nulas nos registros anteriores (não se inventa dado). A regra existente `expiry_date <= original_expiry_date` do recebimento continua como está.

### 4.9 Local de armazenamento e transferência (proposta, fatia 6.10)

Para "câmara fria 01" e transferências entre equipamentos: tabela `storage_locations` (nome, condição, unidade) e eventos `location_moves` (recipiente, local anterior, local novo, instante, quem). É um registro de onde está, sem efeito no saldo nem na validade. Fica como última fatia porque não é necessário para a etiqueta e amplia o escopo; luis decide se entra na Fase 6 ou na 7 (Q9).

## 5. Funções de escrita previstas

Todas: `owner` ativo da organização (`private.has_membership(org, true)`), reautorização em replay, `intent_id` obrigatório, erros com os mesmos códigos já usados (`42501`, `22023`, `23503`, `23505`), verificação de vínculo antes de qualquer leitura de dado (para não revelar se um ID de outra empresa existe), bloqueio `FOR UPDATE` na linha do recebimento (mesma ordem de bloqueio da Fase 5, sem risco novo de deadlock).

### 5.1 `handle_container`

Parâmetros: organização, unidade, recipiente de origem, tipo (`opening`/`portioning`), lista de quantidades (array `numeric[]`), validade nova, armazenamento, quem manipulou (`handled_by`), observação, `intent_id`. Devolve o ID da manipulação; os IDs dos derivados são lidos por `list_containers` com filtro `'batch'`.

Regras:

1. Origem existe no escopo informado e tem saldo maior que zero.
2. Origem vencida (validade efetiva anterior à data atual no fuso da unidade) é recusada: manipular não pode servir para recuperar validade.
3. Abertura: exatamente uma quantidade, `<=` saldo. Porcionamento: 2 a 20 quantidades, cada uma válida para a unidade de medida, soma `<=` saldo.
4. Validade nova obrigatória, entre a data atual da unidade e a validade efetiva da origem, inclusive. **Posterior à origem é recusada pelo banco**, também quando o armazenamento novo é congelado: a abertura não reinicia a validade do fabricante e o congelamento não prorroga prazo automaticamente. O sistema não decide se a data dentro desse intervalo está correta.
5. Armazenamento obrigatório. `handled_by` com vínculo ativo na organização.
6. Na mesma transação: insere a manipulação, os derivados (com `position`), e o movimento `'transfer'` na origem.
7. Replay: mesmo `intent_id` com mesmos dados e mesmo autor devolve a mesma manipulação; dados diferentes, `23505`.

### 5.2 `record_movement` e `reverse_movement`

- `record_movement` ganha `p_container_id`. Para não quebrar a interface atual durante a transição, a versão antiga (por recebimento) continua existindo e passa a operar no integral; é removida na fatia em que a interface migrar. O saldo verificado passa a ser o do recipiente.
- `reverse_movement` mantém a assinatura, herda o recipiente e recusa `'transfer'`.

### 5.3 `receive_batch` e `ensure_container`

`receive_batch` passa a criar o integral na mesma transação. `ensure_container` continua idempotente e devolve o integral (compatibilidade com etiquetas já geradas).

## 6. RLS e privilégios previstos

Padrão de política (P3), aplicado às tabelas novas e, na fatia 6.0, às existentes:

```sql
using (organization_id in (select private.member_organizations()))
```

`private.member_organizations()` é `SECURITY DEFINER`, `stable`, `search_path = ''`, devolve os IDs de organização com vínculo ativo do `auth.uid()` e não recebe parâmetro de usuário.

| Tabela | `anon` | `authenticated` | Escrita | `service_role` |
|---|---|---|---|---|
| `containers` | nada | SELECT por vínculo | só funções | SELECT; sem DELETE (P5) |
| `container_handlings` | nada | SELECT por vínculo | só `handle_container` | SELECT |
| `stock_movements` | nada | SELECT por vínculo | só funções | SELECT; sem DELETE (P5) |
| `batch_receipts` | nada | SELECT por vínculo | só `receive_batch` | SELECT; sem DELETE (P5) |
| `entity_changes` | nada | SELECT para proprietário | só trigger | SELECT |
| `memberships.display_name` | nada | SELECT por vínculo (já existe) | script administrativo | — |

**P5 — append-only para todos os papéis:** trigger `before update or delete` que levanta erro em `batch_receipts`, `containers`, `container_handlings` e `stock_movements`, inclusive para `service_role`. A limpeza dos testes de integração passa a usar `db reset` (ou transação revertida), e não DELETE. Isso muda a forma de rodar os testes de integração e precisa ser feito antes das tabelas novas, para que elas já nasçam sem DELETE.

## 7. Fluxos de tela

Interface em português, botões grandes para tablet de bancada, sem informação nova obrigatória além do que o fluxo exige.

### 7.1 Abrir ou porcionar

Entrada: botão "Abrir / porcionar" na página do recipiente (rota do QR) e na linha do painel. Só aparece para proprietário; para membro, o recipiente é só leitura.

1. **Contexto:** produto, lote, recipiente atual, saldo, validade efetiva e armazenamento atual (se derivado).
2. **Tipo e quantidade:** "Abrir embalagem" (quantidade aberta, com atalho "todo o saldo") ou "Dividir em porções".
3. **Porções** (só porcionamento): número de porções (2 a 20) e quantidade de cada uma, com atalho "dividir igualmente" que só preenche os campos (sem arredondamento escondido: se a divisão não for exata na unidade, o atalho avisa e deixa a última porção com a diferença visível). Mostra a soma e o que sobra na origem.
4. **Validade nova:** campo de data obrigatório, sem valor sugerido. Texto fixo: "Informe a validade após a abertura definida pelo responsável. O sistema não calcula prazos." O seletor não aceita data posterior à validade da origem e mostra essa data como limite.
5. **Conservação e responsável:** ambiente, refrigerado ou congelado; quem manipulou (lista de pessoas da organização, padrão o próprio usuário).
6. **Revisão:** resumo com tudo acima, "manipulado por" e "registrado por", e o aviso de que a etiqueta da origem continua valendo só para o saldo que sobrou.
7. **Confirmar.** Em resultado incerto, mantém a intenção (7.5). Em sucesso, vai para a tela de etiquetas das porções.

### 7.2 Etiquetas das porções

Lista das porções criadas com "Baixar PDF de todas" (uma página por etiqueta) e "Baixar esta". Reimpressão nunca cria registro (D-003).

Dois modelos de etiqueta (D-028), legíveis sem ler o QR:

**Produto aberto ou fracionado.** O mínimo da RDC 216/2004 citado na análise de 12/11 (designação do produto, data de fracionamento e validade após abertura) vem primeiro e em destaque; o resto é rastreabilidade:

- Cabeçalho "PRODUTO ABERTO" ou "PRODUTO FRACIONADO".
- Produto (grande). **Obrigatório.**
- Abertura/fracionamento: data e hora, com fuso da unidade. **Obrigatório.**
- **Validade após abertura** (grande). **Obrigatório.**
- Validade do fabricante (do recebimento), quando a origem for `original`.
- Lote original.
- Conservação.
- Responsável: `handled_by_name`.
- Código curto (`short_code`), "porção 2 de 4" e QR (só URL e ID opaco, como hoje).
- Quantidade: opcional no modelo, rotulada "quantidade na criação" (não é saldo atual). Fica fora se faltar espaço.

**Recebimento.** A etiqueta atual do integral passa a ter cabeçalho "RECEBIMENTO", validade original, lote, fornecedor, conservação e quantidade rotulada "entrada" (revisão 05, item 4). Não muda validade.

A etiqueta de **alimento preparado** (preparação da própria cozinha, com validade própria aprovada) fica fora desta fase; ver seção 13.

### 7.3 Painel de vencimentos

- Lista **recipientes** (não mais recebimentos) com saldo maior que zero, ordenados por validade efetiva, com contagens de vencidos, hoje e amanhã calculadas só sobre eles.
- Cada linha: produto, validade, situação, saldo e unidade, armazenamento, tipo (integral, aberto, porção) e lote.
- Filtro "mostrar esgotados" para consulta, desligado por padrão.
- Busca por produto, lote ou ID de recipiente continua, agora no servidor.
- Remove o teto de 10.000 recebimentos e de 1.000 eventos no navegador (D-015, D-016).

### 7.4 Rota do QR

`/recipiente/<id>` mostra: produto, validade efetiva, situação, saldo atual, armazenamento, manipulado em e por quem, origem (link para o recipiente pai e para o recebimento), derivados (se houver, com saldo de cada um) e histórico do próprio recipiente. Se o saldo for zero porque foi aberto ou porcionado, destaca "Este recipiente foi aberto em … Use a etiqueta nova" com links para os derivados. Ações (baixa, anulação, manipulação) só para proprietário.

### 7.5 Tentativa pendente

Faixa no topo da área de trabalho: "Há 1 registro não confirmado de 12/11 às 14:32". Ao abrir, a interface consulta o servidor e mostra "confirmado" ou as opções "Enviar novamente" e "Descartar". Nunca reenvia sozinha sem o usuário ver.

### 7.6 Acesso tolerante (P7)

Se uma das organizações do usuário vier com dado inválido, as válidas aparecem normalmente e uma faixa avisa "Não foi possível carregar 1 empresa". Hoje a falha de uma bloqueia todas.

## 8. Testes de segurança necessários

Escritos antes ou junto do código, com falha reproduzida quando possível.

**pgTAP (banco):**

1. Guarda do PR #2 verde com as tabelas e funções novas (RLS, nenhum privilégio de `anon`, nenhum DELETE/TRUNCATE/TRIGGER/REFERENCES para `authenticated`, `search_path` vazio, nada executável por `anon`/PUBLIC).
2. Matriz de papéis em `handle_container` e no novo `record_movement`: anônimo, membro, proprietário revogado, proprietário de outra empresa, proprietário de duas empresas misturando origem de A com unidade de B, unidade de A com recipiente de outra unidade de A. Todos negados com o mesmo erro, sem revelar existência.
3. Escrita direta negada em `containers`, `container_handlings` e `stock_movements` para `authenticated`; UPDATE e DELETE negados para **todos** os papéis, inclusive `service_role` (P5).
4. FKs compostas: derivado de outro recebimento, pai de outra unidade, manipulação de outra empresa, movimento apontando recipiente de outro recebimento. Todos recusados pela restrição, não só pela função.
5. Regras de manipulação: abertura com quantidade acima do saldo, porcionamento com 1, 20 e 21 porções (20 aceito, 21 recusado), soma acima do saldo, quantidade fracionária em `un`, validade posterior à origem (inclusive com armazenamento congelado), validade igual à da origem aceita, validade anterior a hoje no fuso da unidade, origem vencida, origem sem saldo, armazenamento inválido, `handled_by` sem vínculo, revogado ou de outra empresa, nome copiado preservado depois de revogar o vínculo, motivo/observação só com espaços invisíveis.
6. Idempotência: replay idêntico devolve o mesmo ID; mesmo `intent_id` com quantidade, validade, armazenamento ou autor diferente é recusado.
7. Conservação: após sequência fixa de recebimento, porcionamento, baixas, anulações e nova abertura de uma porção, as somas da seção 4.3 batem.
8. `list_containers` e `find_operation` como membro de B não devolvem nada de A, inclusive com IDs de A passados como parâmetro.
9. P3: cada política reescrita mantém os mesmos resultados positivos e negativos dos testes atuais (a bateria inteira deve passar sem alteração de expectativa).
10. P6: alteração de fuso recusada após recebimento; alteração de nome gera linha em `entity_changes`; `entity_changes` não é legível por membro nem por outra empresa.
10a. Recebimento (6.9): temperatura ausente em refrigerado ou congelado recusada; fora de −50 a 80 recusada; conservação inválida recusada; replay com temperatura diferente recusado; recebimentos antigos continuam legíveis com campos nulos; definição única da conservação de produto antigo só pelo proprietário e auditada.

**Integração via API (Node, usuários reais):**

11. Duas manipulações concorrentes da mesma origem cuja soma excede o saldo: só uma é aceita.
12. Manipulação concorrente com baixa na mesma origem: saldo nunca negativo.
13. Reenvio concorrente idêntico de `handle_container`: uma única manipulação.
14. Revogação durante a sessão: manipulação seguinte negada com o token anterior.
15. Teste de propriedade: sequências aleatórias (semente registrada) de baixas, anulações e manipulações; após cada passo, nenhum saldo negativo e conservação válida.

**Navegador (Playwright):**

16. Jornada: receber, gerar etiqueta, porcionar em 3, baixar PDF das porções, consumir uma porção, conferir painel com 3 linhas e saldo correto, abrir QR da origem e ver o aviso de etiqueta nova.
17. Negação no navegador: usuário de outra empresa abre `/recipiente/<id>` de A e não vê dado nenhum (revisão 05, lacuna de E2E).
18. Membro abre recipiente e não vê ações de escrita.
19. Fechar a aba com a manipulação em resultado incerto (simulado), reabrir e ver a tentativa pendente; confirmar que não duplica.

**Outros:**

20. Rollback de cada migração aplicado e reaplicado na CI (revisão 05, lacuna).
21. Advisors de segurança do Supabase sem ocorrência.
22. PDF das porções: conteúdo extraído e QR decodificado, como na 03C.

## 9. Riscos

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| R1 | Validade informada errada na manipulação, com etiqueta de aparência oficial | Crítica | Sem sugestão de prazo; validade após abertura limitada pelo banco à da origem; origem vencida recusada; texto fixo; validação dos campos com o responsável técnico antes do piloto |
| R2 | Etiqueta antiga continua colada na embalagem aberta e é lida como válida | Alta | Rota do QR destaca "aberto, use a etiqueta nova"; orientação no treinamento; avaliar no ensaio físico se a etiqueta antiga deve ser riscada ou retirada |
| R3 | Autor registrado (proprietário) não é quem manipulou, por causa da decisão de escrita só do proprietário | Média | `handled_by` com nome copiado na etiqueta e "registrado por" na tela; o proprietário pode escolher a pessoa errada, então segue como tema da observação do piloto |
| R11 | Referências normativas da análise de 12/11 (itens da RDC 216/2004, Portaria SES/RS 799/2023, exigências municipais) não foram conferidas no texto oficial neste desenho | Alta | Conferência por profissional habilitado antes da fatia 6.5 (etiqueta) e antes do piloto; o sistema registra, não certifica conformidade |
| R4 | Migração de `containers` e `stock_movements` com dados existentes | Média | Fatia própria, backfill testado, rollback recusa se houver derivados, ensaio em cópia do banco local com volume |
| R5 | Cálculo de saldo agregado lento em unidade com muito histórico | Média | Índice dedicado, critério de 50 ms, plano B de saldo mantido pela função |
| R6 | Observação livre e nome de exibição viram dado pessoal ou sensível | Média | Limite de tamanho, texto de ajuda "não escreva dados de pessoas", nome de exibição curto; incluir no procedimento de P8 |
| R7 | Remover DELETE do `service_role` quebra a limpeza dos testes de integração | Média | Fazer na fatia 6.0, antes das tabelas novas, trocando a limpeza por `db reset` ou transação |
| R8 | Escopo crescer para receitas, mistura de lotes e produção | Média | Manipulação aceita só uma origem; mistura e produção ficam explicitamente fora |
| R9 | Conflito com o Codex na `main` (mesmas funções e migrações) | Média | Registro de tarefa e reserva de arquivos antes de cada fatia; uma fatia por vez nas funções de movimento |
| R10 | Tablet compartilhado com sessão persistente | Média | Decisão própria (D-025, proposta), expiração curta por inatividade e logout visível |

## 10. Ordem de implementação em fatias

Cada fatia é um PR pequeno, com testes antes ou junto, gates completos e parada para aceite. Nenhuma fatia começa sem o aceite da anterior.

| Fatia | Entrega | Depende de | Aceite resumido |
|---|---|---|---|
| **6.0** | Endurecimento: P3 (RLS por conjunto em todas as políticas), P5 (append-only e limpeza de testes sem DELETE), P6 (fuso imutável após recebimento e `entity_changes`) | aceite da Fase 5 e do PR #2 | Bateria atual inteira passa sem mudar expectativa; testes novos de P5 e P6; benchmark de RLS registrado |
| **6.1** | Recipiente integral criado no recebimento, colunas novas de `containers`, `container_id` em `stock_movements` com backfill; `record_movement` antigo opera no integral | 6.0 | Nenhuma mudança visível na interface; conservação verdadeira para todos os dados existentes; rollback testado |
| **6.2** | `list_containers` (P9) e painel de vencimentos só com saldo; rota do QR com saldo; remoção dos tetos no navegador | 6.1 | Painel não mostra esgotados; contagens só com saldo; critério de 50 ms; E2E de negação no navegador |
| **6.3** | `container_handlings`, tipo `'transfer'`, `handle_container` só no banco (validade limitada à origem, origem vencida recusada, `handled_by`), `memberships.display_name` e `short_code`, com pgTAP e integração | 6.1 | Itens 2–7 e 11–15 da seção 8 |
| **6.9** | Conservação no cadastro e no recebimento, temperatura aferida (4.8); `receive_batch` e formulário de recebimento atualizados | 6.1 | Recebimentos antigos intactos; temperatura obrigatória só em refrigerado/congelado; isolamento e idempotência mantidos |
| **6.4** | Telas de abrir e porcionar com escolha de quem manipulou, rota do QR com origem e derivados | 6.2, 6.3, 6.9, Q7 | Jornada E2E 16 e 18; avaliar descarte de sobra na mesma tela |
| **6.5** | Dois modelos de etiqueta em PDF (recebimento e produto aberto/fracionado) | 6.4, conferência normativa (R11) | Campos obrigatórios presentes e legíveis sem QR; conteúdo e QR verificados por extração; ensaio físico agendado |
| **6.6** | Anulação de manipulação enquanto nenhum derivado teve movimento | 6.3 | Anulação única, idempotente, conservação mantida, derivados aparecem como anulados |
| **6.7** | Recuperação de tentativa (`find_operation`, `localStorage`) e acesso tolerante (P7) | 6.4 | E2E 19; teste de componente para organização inválida |
| **6.10** | Locais de armazenamento e transferência (4.9), **se luis aprovar nesta fase** | 6.9 | Histórico de local com autoria; sem efeito em saldo ou validade |
| **6.8** | Trilha pré-piloto sem tela: script de provisionamento testado, `config.toml` de produção documentado (P4), procedimento de dados pessoais (P8), métricas do piloto | pode correr em paralelo a partir de 6.1 | Script cria empresa, unidade, proprietário e membros e é testado na CI; documento P8 revisado por luis |

A ordem de execução é a das linhas da tabela (6.9 entra antes de 6.4). A Fase 6 do backlog (fluxo E2E completo, revisão de segurança, ensaio de impressão real e piloto privado) fica depois destas fatias, como fase 7 de piloto.

## 11. Perguntas

As questões Q1–Q6 foram respondidas pela análise sanitária trazida por luis em 12/11/2026 (seção 13). As respostas foram incorporadas ao desenho, mas **continuam propostas até luis confirmar**.

| # | Pergunta | Resposta da análise | No desenho |
|---|---|---|---|
| Q1 | Campos da etiqueta aberta | Produto, data de abertura/fracionamento e validade após abertura obrigatórios; validade do fabricante, lote, conservação, responsável e QR recomendados; quantidade opcional | 7.2 |
| Q2 | Validade nova pode passar da original? | Não, para produto aberto ou transferido; congelamento não prorroga automaticamente; preparação própria é outra operação | 5.1, regras 2 e 4; restrição no banco |
| Q3 | Conservação no recebimento? | Sim, separando condição exigida, temperatura aferida e local | 4.8 e 4.9 |
| Q4 | Nome curto para a etiqueta? | Sim, guardando `user_id` e cópia do nome usado | 4.5 |
| Q5 | ID novo também na abertura simples? | Sim, com UUID e código curto legível gerado pelo servidor | 3 e 4.1 (`short_code`) |
| Q6 | Limite de 20 porções? | Sim, por operação e provisório; nunca por lote | 3 e 5.1 |

Perguntas novas, para luis:

- **Q7.** Aceita separar "quem registrou" (proprietário) de "quem manipulou" (qualquer pessoa da organização, escolhida pelo proprietário)? É o que permite imprimir o nome certo sem mudar a D-019. A alternativa é reabrir a D-019.
- **Q8.** Temperatura aferida obrigatória para refrigerados e congelados já no piloto, ou opcional no começo para não travar o recebimento?
- **Q9.** Locais de armazenamento e transferência (fatia 6.10) entram nesta fase ou ficam para a Fase 7?
- **Q10.** Quem é o profissional habilitado que vai conferir as referências normativas e as exigências do município antes da etiqueta (R11)?

## 12. Relação com as propostas da revisão 05

| Proposta | Onde entra | Observação |
|---|---|---|
| P3 RLS por conjunto | 6.0 | antes das tabelas novas, para que nasçam no padrão novo |
| P4 autenticação hospedada | 6.8 | só documentação e `config.toml` de referência; deploy continua proibido sem autorização (D-006) |
| P5 append-only no backend | 6.0 | muda a limpeza dos testes de integração |
| P6 fuso imutável e auditoria | 6.0 | reconciliar com D-017 do PR #1 |
| P7 acesso tolerante | 6.7 | só interface |
| P8 dados pessoais | 6.8 (procedimento) e 4.5 (nome de exibição) | anonimização mantém UUID e troca e-mail e nome; implementação da função antes do primeiro cliente |
| P9 saldo no servidor | 6.1 e 6.2 | base de todo o resto da fase |

Melhorias de manutenção da revisão 05 que valem nesta fase, sem fatia própria: `private.visible_text(text)` para os `CHECK` novos (em vez de copiar o conjunto de espaços pela oitava vez), funções SQL formatadas uma condição por linha, tipos gerados do banco ao criar as RPCs novas e `import()` dinâmico do gerador de PDF quando a etiqueta derivada for criada.

## 13. Avaliação da análise sanitária de 12/11/2026

luis trouxe uma análise baseada na RDC 216/2004 da Anvisa e na Portaria SES/RS 799/2023, com respostas a Q1–Q6. Avaliação de Claude Code:

**Responde às dúvidas?** Sim, as seis. As respostas são conservadoras e coerentes com D-004 (nunca calcular prazo) e com o desenho. Os números de itens e o conteúdo das normas citadas não foram conferidos no texto oficial aqui (R11).

**Adotado sem ajuste:**

- Campos mínimos da etiqueta aberta e etiqueta legível sem QR (7.2).
- Validade após abertura nunca posterior à original, sem exceção para congelamento. Isso **substitui** a regra anterior deste desenho (posterior permitida com confirmação), que era menos segura.
- Manipular não recupera validade: origem vencida é recusada.
- ID novo também na abertura simples, sem gerar estoque novo; código curto legível do servidor; idempotência pela chave de intenção que já existe.
- 20 porções por operação, provisório, sem limite por recebimento.
- Nome curto com `user_id` e cópia do nome no momento da operação.
- Manter a regra atual do recebimento (`expiry_date <= original_expiry_date`).

**Adotado com ajuste:**

- **Abertura parcial.** A análise mostrou que um recebimento pode ter várias embalagens abertas em dias diferentes. O desenho anterior obrigava a abertura a levar todo o saldo; agora a abertura leva qualquer quantidade até o saldo.
- **Responsável na etiqueta x D-019.** A análise pressupõe que quem abre registra. Como só o proprietário escreve, o desenho separa `created_by` de `handled_by` (Q7).
- **Conservação no recebimento.** Adotada como fatia própria (6.9). Temperatura é registrada, não julgada.
- **Três tipos de etiqueta.** Recebimento e produto aberto/fracionado entram (D-028). Alimento preparado fica fora: exige produção com vários ingredientes, que o brief exclui do MVP.

**Não adotado agora:**

- Local de armazenamento e transferência entre equipamentos: desenhado (4.9), mas como fatia opcional 6.10, à espera de Q9.
- Limites da Portaria SES/RS 799/2023 (3 dias refrigerado, 90 dias congelado) como regra no sistema: a própria análise diz que são limites máximos para preparados, não prazo padrão. Não entram como validação nem sugestão. Podem aparecer depois como texto de ajuda, se o responsável técnico pedir.

**Conflitos com a Fase 5:** nenhum. Recebimentos, movimentos e anulações continuam iguais; as mudanças vêm por colunas novas e funções novas, nas fatias já previstas.

**Sobre o comando sugerido para o Codex:** pede a mesma análise de impacto que este desenho já faz. Se for enviado, sugiro como revisão cruzada do PR #3, e não como um plano paralelo, para não ter dois desenhos concorrentes da mesma fase.

