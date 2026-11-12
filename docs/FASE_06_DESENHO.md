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

Decisões registradas a partir deste desenho em [DECISOES.md](DECISOES.md): D-019 (escrita só do proprietário, já decidida) e D-020 a D-026 (propostas).

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
| I | Trilha pré-piloto sem tela: configuração de autenticação (P4), política e procedimento de dados pessoais (P8), script de provisionamento e métricas do piloto | P4, P8, produto itens 6 e 7 |

### Fora do escopo desta fase

- Ampliar escrita para o membro (decisão de luis; reavaliar após observação na cozinha).
- Regras ou sugestões automáticas de prazo, inclusive "abrir = validade original menos N dias".
- Ficha técnica, produção, receitas, mistura de lotes em um recipiente, transferência entre unidades, conversão de unidade, pesagem por balança, impressora térmica, offline.
- Correção de recebimento (quantidade, validade ou lote errados no recebimento). Continua exigindo desenho próprio.
- Convite de membros e criação de empresa pela interface.

## 3. Conceitos

- **Recebimento** (`batch_receipts`): entrada imutável, como hoje. Continua sendo a origem da rastreabilidade (produto, fornecedor, lote externo, validade original).
- **Recipiente integral:** o recipiente que representa o recebimento inteiro. Hoje é criado sob demanda ao gerar a etiqueta (D-014). Proposta: passa a ser **criado no próprio recebimento**, na mesma transação.
- **Manipulação:** operação única e auditada que retira saldo de um recipiente de origem e cria recipientes derivados. Tem dois tipos:
  - **abertura:** um derivado com todo o saldo da origem. Na prática é a mesma embalagem com uma etiqueta nova; o sistema dá a ela um ID novo para que a validade e o momento da abertura fiquem registrados e o QR antigo passe a apontar para o novo.
  - **porcionamento:** de 2 a 20 derivados, cada um com sua quantidade. A soma pode ser menor que o saldo da origem; o restante continua na origem.
- **Recipiente derivado:** recipiente criado por manipulação. Tem quantidade inicial, validade definida pelo responsável, armazenamento e momento da manipulação próprios. Pertence ao mesmo recebimento (mesmo `batch_id`), então o lote de origem é sempre conhecido. Um derivado pode ser manipulado de novo (por exemplo, porção congelada que depois é descongelada e aberta).
- **Saldo do recipiente:** quantidade inicial do recipiente, menos consumos, descartes e transferências para derivados, mais anulações. É o "saldo registrado" da Fase 5, agora por recipiente. Não comprova conferência física.
- **Validade efetiva:** a validade do próprio recipiente. No integral é a do recebimento; no derivado é a que o responsável informou na manipulação.

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
| `storage` | `text` | nulo no integral (ver questão Q3); no derivado `'ambient'`, `'refrigerated'` ou `'frozen'` |
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
| `expiry_date` | validade nova informada pelo responsável |
| `exceeds_source_expiry` | `boolean`; verdadeiro quando a validade nova é posterior à da origem. Só é aceito se a interface enviou confirmação explícita (ver 5.1) |
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

A etiqueta derivada precisa dizer quem manipulou. Hoje o sistema não guarda nome de pessoa (D-011, dados pessoais mínimos). Proposta: coluna `memberships.display_name` (até 40 caracteres visíveis, por exemplo "Ana P."), definida pelo script de provisionamento (fatia 6.8) e editável só pelo proprietário por função auditada em fase posterior. A etiqueta imprime o nome de exibição do autor; sem nome, imprime "Responsável: não cadastrado" e o painel avisa. Ver questão Q4 e P8.

Como no piloto só o proprietário escreve, **o autor registrado é sempre o proprietário**, mesmo quando outra pessoa manipulou fisicamente. Isso precisa ser dito na interface ("registrado por") e é um dos pontos a observar no piloto para reavaliar papéis.

### 4.6 Auditoria de unidade e organização (P6)

- Trigger que recusa `UPDATE` de `establishments.timezone` quando a unidade já tem recebimento (o PR #1 já não oferece a edição na interface; o banco passa a garantir).
- Tabela `entity_changes` (organização e unidade): campo, valor anterior, valor novo, autor, data. Preenchida por trigger `SECURITY DEFINER` em `UPDATE` de nome. Leitura só para proprietário.

### 4.7 Recuperação de tentativa (F)

- A intenção pendente passa de `sessionStorage` para `localStorage`, com chave por usuário, unidade e operação, e validade de 24 horas. Ao sair (logout), as intenções do usuário são descartadas da máquina **somente** após conferência no servidor.
- Função `public.find_operation(p_organization_id, p_establishment_id, p_intent_id)`, `SECURITY INVOKER`, que procura o `intent_id` em recebimentos, manipulações e movimentos visíveis pela RLS e devolve tipo e ID, ou nada. Ela não revela intenção de outro usuário além do que a RLS já mostra.
- Ao reabrir a tela, para cada intenção guardada: se o servidor já tem a operação, a interface mostra "Registro confirmado" e limpa; se não tem, oferece "Enviar novamente" (mesmo `intent_id`) ou "Descartar tentativa".

Isso resolve fechamento de aba e recarga. Não resolve troca de aparelho; fica registrado como limite.

## 5. Funções de escrita previstas

Todas: `owner` ativo da organização (`private.has_membership(org, true)`), reautorização em replay, `intent_id` obrigatório, erros com os mesmos códigos já usados (`42501`, `22023`, `23503`, `23505`), verificação de vínculo antes de qualquer leitura de dado (para não revelar se um ID de outra empresa existe), bloqueio `FOR UPDATE` na linha do recebimento (mesma ordem de bloqueio da Fase 5, sem risco novo de deadlock).

### 5.1 `handle_container`

Parâmetros: organização, unidade, recipiente de origem, tipo (`opening`/`portioning`), lista de quantidades (array `numeric[]`), validade nova, armazenamento, confirmação de validade posterior (`boolean`), observação, `intent_id`. Devolve o ID da manipulação; os IDs dos derivados são lidos por `list_containers` com filtro `'batch'`.

Regras:

1. Origem existe no escopo informado e tem saldo maior que zero.
2. Abertura: exatamente uma quantidade e ela é igual ao saldo da origem. Porcionamento: 2 a 20 quantidades, cada uma válida para a unidade de medida, soma `<=` saldo.
3. Validade nova obrigatória e dentro dos limites de data já usados. Se for posterior à validade efetiva da origem, exige a confirmação; sem ela, `22023`. O sistema não decide se a data está correta.
4. Validade nova anterior à data atual da unidade é recusada (não faz sentido etiquetar algo já vencido; se o responsável quiser registrar, deve descartar).
5. Armazenamento obrigatório.
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
2. **Tipo:** "Abrir embalagem (todo o saldo)" ou "Dividir em porções".
3. **Porções** (só porcionamento): número de porções (2 a 20) e quantidade de cada uma, com atalho "dividir igualmente" que só preenche os campos (sem arredondamento escondido: se a divisão não for exata na unidade, o atalho avisa e deixa a última porção com a diferença visível). Mostra a soma e o que sobra na origem.
4. **Validade nova:** campo de data obrigatório, sem valor sugerido. Texto fixo: "Informe a validade definida pelo responsável. O sistema não calcula prazos." Se a data for posterior à validade da origem, aparece aviso e uma caixa de confirmação obrigatória.
5. **Armazenamento:** ambiente, refrigerado ou congelado.
6. **Revisão:** resumo com tudo acima, "registrado por" com o nome de exibição, e o aviso de que a etiqueta da origem continua valendo só para o saldo que sobrou.
7. **Confirmar.** Em resultado incerto, mantém a intenção (7.5). Em sucesso, vai para a tela de etiquetas das porções.

### 7.2 Etiquetas das porções

Lista das porções criadas com "Baixar PDF de todas" (uma página por etiqueta) e "Baixar esta". Reimpressão nunca cria registro (D-003).

Campos propostos para a etiqueta derivada, **a validar com o responsável técnico** (Q1):

- Produto (grande).
- **Validade** (grande) e "definida pelo responsável".
- Manipulado em: data e hora, com fuso da unidade.
- Armazenamento.
- Responsável: nome de exibição.
- Quantidade da porção, rotulada "quantidade na criação" (não é saldo atual).
- Lote externo e data de recebimento.
- "Porção 2 de 4" e ID curto do recipiente.
- QR (só URL e ID opaco, como hoje).

A etiqueta do integral passa a rotular a quantidade como "entrada" (revisão 05, item 4).

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
5. Regras de manipulação: abertura com quantidade diferente do saldo, porcionamento com 1 ou 21 porções, soma acima do saldo, quantidade fracionária em `un`, validade posterior sem confirmação, validade anterior a hoje no fuso da unidade, origem sem saldo, armazenamento inválido, motivo/observação só com espaços invisíveis.
6. Idempotência: replay idêntico devolve o mesmo ID; mesmo `intent_id` com quantidade, validade, armazenamento ou autor diferente é recusado.
7. Conservação: após sequência fixa de recebimento, porcionamento, baixas, anulações e nova abertura de uma porção, as somas da seção 4.3 batem.
8. `list_containers` e `find_operation` como membro de B não devolvem nada de A, inclusive com IDs de A passados como parâmetro.
9. P3: cada política reescrita mantém os mesmos resultados positivos e negativos dos testes atuais (a bateria inteira deve passar sem alteração de expectativa).
10. P6: alteração de fuso recusada após recebimento; alteração de nome gera linha em `entity_changes`; `entity_changes` não é legível por membro nem por outra empresa.

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
| R1 | Validade informada errada na manipulação, com etiqueta de aparência oficial | Crítica | Sem sugestão de prazo; confirmação extra quando posterior à origem; texto fixo; validação dos campos com o responsável técnico antes do piloto |
| R2 | Etiqueta antiga continua colada na embalagem aberta e é lida como válida | Alta | Rota do QR destaca "aberto, use a etiqueta nova"; orientação no treinamento; avaliar no ensaio físico se a etiqueta antiga deve ser riscada ou retirada |
| R3 | Autor registrado (proprietário) não é quem manipulou, por causa da decisão de escrita só do proprietário | Alta | Texto "registrado por" na etiqueta e na tela; tema explícito da observação do piloto e da reavaliação de papéis |
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
| **6.3** | `container_handlings`, tipo `'transfer'` e `handle_container` só no banco, com pgTAP e integração | 6.1 | Itens 2–7 e 11–15 da seção 8 |
| **6.4** | Telas de abrir e porcionar, rota do QR com origem e derivados, `display_name` | 6.2, 6.3, respostas Q1–Q4 | Jornada E2E 16 e 18; avaliar descarte de sobra na mesma tela |
| **6.5** | Etiqueta derivada em PDF e rótulo "entrada" no integral | 6.4, Q1 | Conteúdo e QR verificados por extração; ensaio físico agendado |
| **6.6** | Anulação de manipulação enquanto nenhum derivado teve movimento | 6.3 | Anulação única, idempotente, conservação mantida, derivados aparecem como anulados |
| **6.7** | Recuperação de tentativa (`find_operation`, `localStorage`) e acesso tolerante (P7) | 6.4 | E2E 19; teste de componente para organização inválida |
| **6.8** | Trilha pré-piloto sem tela: script de provisionamento testado, `config.toml` de produção documentado (P4), procedimento de dados pessoais (P8), métricas do piloto | pode correr em paralelo a partir de 6.1 | Script cria empresa, unidade, proprietário e membros e é testado na CI; documento P8 revisado por luis |

A Fase 6 do backlog (fluxo E2E completo, revisão de segurança, ensaio de impressão real e piloto privado) fica depois destas fatias, como fase 7 de piloto.

## 11. Perguntas abertas

Para o responsável técnico do piloto (luis intermedia):

- **Q1.** Quais campos a etiqueta de produto aberto ou porcionado precisa ter? A lista da seção 7.2 é uma proposta, não uma norma.
- **Q2.** Validade nova posterior à original é aceitável em algum caso (congelamento, por exemplo)? O desenho permite com confirmação; se a resposta for "nunca", passa a ser recusada pelo banco.
- **Q3.** O recipiente integral precisa de armazenamento registrado no recebimento? Hoje não tem; o desenho deixa nulo.

Para luis:

- **Q4.** Aceita guardar um nome de exibição curto por vínculo (seção 4.5)? Sem ele, a etiqueta não diz quem manipulou.
- **Q5.** Abertura deve gerar ID novo (desenho atual) ou apenas registrar abertura no mesmo recipiente? ID novo é mais simples e consistente; o custo é imprimir uma etiqueta nova também na abertura simples.
- **Q6.** O limite de 20 porções por manipulação serve para o piloto?

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
