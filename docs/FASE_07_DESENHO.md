# Fase 7 — desenho: etiqueta de preparação própria

> **Só desenho.** Nenhum código, migração ou teste foi escrito. Cada fatia da seção 9 exige aprovação própria de luis antes de começar. Proposta de decisão: **D-049** (seção 11), que **altera a D-028**.
>
> **Sem conformidade sanitária.** Este documento não afirma que o fluxo atende a norma alguma. A conferência normativa pela nutricionista responsável técnica (Q10) continua pendente; as perguntas para ela estão na seção 10. Os exemplos usam dados sintéticos.

## 1. Por que

Na revisão das folhas de uma cozinha de hotel, perto da metade dos itens sem etiqueta eram preparações da própria cozinha (sucos, caldos, massas, sobremesas). Hoje o sistema etiqueta o que é **recebido** e o que é **aberto ou porcionado** a partir de um recebimento. A D-028 deixou "etiqueta de alimento preparado" para fase própria, e o desenho da Fase 6 (seção 2) a pôs fora de escopo.

luis descreveu o fluxo desejado (14/11/2026): **a cozinha etiqueta a produção que fizer, informa a validade manualmente e depois imprime a etiqueta com QR.** Este desenho parte dessa descrição e de nada além dela.

## 2. Mudança proposta na D-028

| | Hoje (D-028) | Proposta (D-049) |
|---|---|---|
| Modelos de etiqueta | Recebimento; produto aberto/fracionado | Os dois de hoje **mais** "preparação própria" |
| Alimento preparado | Fora de escopo, fase própria | Entra como **lote de preparação**, com validade informada por pessoa |
| Ingredientes e origem dos insumos | Exigidos antes de existir a etiqueta (desenho 6, seção 2) | **Fora do mínimo**; opção separada (seção 8), depende da nutricionista |

Nada muda nos dois modelos atuais. A alteração só vale se luis aceitar a D-049; até lá, a D-028 continua como está.

## 3. O que é um lote de preparação

Um **lote de preparação** é o registro de algo que a cozinha produziu, num instante e numa unidade, com uma quantidade e uma validade decidida por pessoa. Exemplo sintético: "Caldo de legumes, 6 l, produzido hoje às 10:40 por Ana, validade 16/11/2026, refrigerado".

Campos:

| Campo | Regra |
|---|---|
| Preparação | Item do catálogo da unidade marcado como **preparação** (nome, unidade de medida e conservação definidos uma vez, como os produtos na 6.5b). Não é texto livre a cada lote, para não ter "caldo legumes" e "Caldo de Legumes" como coisas diferentes. |
| Produzido em | Data e hora informadas, no **fuso da unidade** (D-036). Futuro recusado. Mesma janela de 2 horas da manipulação (D-031, `private.handling_late_window`): acima dela, só com justificativa e com **ocorrência** que bloqueia (seção 5.3). |
| Produzido por | `handled_by` com vínculo ativo na empresa e **nome curto copiado** (D-024, D-039). Separado de `created_by`, que é sempre o proprietário (D-019). |
| Quantidade | Número e unidade da preparação no catálogo (kg, g, l, ml, un), com as mesmas regras do recebimento. |
| Validade | **Data informada pela pessoa.** O sistema não calcula, não sugere e não preenche prazo (D-004). Recusada se anterior à data de produção. Origem gravada como "definida pelo responsável". |
| Conservação | A do catálogo da preparação (ambiente, refrigerado, congelado), copiada no lote, como no recebimento. |
| Observação | Opcional, curta (até 300 caracteres), sem vir para a etiqueta no mínimo. |

O que **não** tem: fornecedor, lote do fabricante, validade do fabricante, temperatura de recebimento. Esses campos são do recebimento e não fazem sentido aqui; a etiqueta não os mostra vazios.

## 4. Como encaixa no que existe (sem segundo estoque)

A regra é: **o lote de preparação é um lote como o recebimento, com outra origem.** Tudo o que pendura no lote (recipiente integral, saldo, consumo, descarte, porcionamento, anulação, ocorrências, locais, QR, recuperação de tentativa) continua sendo o mesmo código.

### 4.1 Banco (desenho, sem migração escrita)

- `batch_receipts` ganha `origin` (`received` para tudo o que já existe, `produced` para preparações). Para `produced`: fornecedor e lote do fabricante ficam nulos, `expiry_origin = 'responsible'`, `original_expiry_date` nulo, `temperature_status = 'not_required'` sem temperatura. Restrições `CHECK` amarram cada origem aos seus campos, para um recebimento nunca perder o fornecedor por engano.
- Tabela nova **`batch_productions`** (append-only, uma linha por lote produzido): `produced_at`, `handled_by`, `handled_by_name`, observação, fuso. Fica separada para não encher `batch_receipts` de colunas vazias.
- `products` ganha o tipo do item (`product` ou `preparation`). Recebimento só aceita `product`; produção só aceita `preparation`.
- Função de escrita nova **`register_production`**, só do proprietário (requisito de papel em um único parâmetro, D-019), com `intent_id` idempotente, que cria na mesma transação o lote, a linha de produção e o **recipiente integral** (o mesmo gatilho da 6.1), e a ocorrência tardia se for o caso. Fim da migração com `assert_history_protected()` incluindo a tabela nova (D-033, D-034).

O backfill é trivial: todo lote existente vira `origin = 'received'` e todo item do catálogo vira `product`. Nenhum dado existente muda de significado.

### 4.2 Saldo, consumo, descarte e anulação de movimento (6.1, 6.2, 6.4)

O integral da preparação tem saldo em `container_balances` como qualquer outro (D-038). Consumo e descarte usam `record_container_movement`; "Anular registro" de consumo funciona igual. Nenhum tipo de movimento novo no mínimo, exceto o da anulação de produção (4.6).

### 4.3 Porcionar (6.3, 6.6)

O caldo de 6 l vira 6 potes de 1 l pelo **porcionamento que já existe**: derivados com validade **até a do lote** (restrição do banco da D-039), herança de local (D-046), sobra com tratamento obrigatório. Proposta: **"abrir" não se aplica** a preparação (a tela não oferece e o banco recusa `opening` sobre integral de preparação), porque não há embalagem do fabricante. É o ponto 3 da seção 12.

### 4.4 Ocorrências e vencido (6.5a, 6.5b e a fatia 6.11 em andamento)

- Bloqueio por ocorrência: produção registrada mais de 2 horas depois de feita abre ocorrência do tipo novo `late_production` (mesma tabela `occurrences`, mesma decisão única do proprietário em `occurrence_decisions`, mesmo `container_blocks`). Até a decisão: sem consumo, porcionamento ou mudança de local; descarte permitido; etiqueta não sai (igual à manipulação tardia, D-044).
- Vencido: a fatia 6.11 (outra conversa) está recusando consumo de recipiente vencido e pondo a faixa "VENCIDO" nas telas. O lote de preparação usa a **mesma coluna `containers.expiry_date`** e o fuso da unidade, então fica coberto sem regra nova, desde que a 6.11 olhe o recipiente e não campos só do recebimento. Isso foi combinado com a outra conversa; o critério de aceite 11 confere.

### 4.5 Locais e conservação (6.9)

O integral nasce **sem local**, como o recebimento hoje (local inicial em segunda operação, limite aceito na 6.9). A conservação vem do catálogo da preparação. Mudar de local para um local de condição diferente pede a mesma confirmação registrada (D-046).

### 4.6 Correção: anular produção

Validade digitada errada é o erro mais provável (motivo da D-032). Proposta: **`void_production`**, só do proprietário, com motivo, uma vez por lote, permitida **só enquanto o integral não teve nenhum movimento** (consumo, descarte, porcionamento ou mudança de local). Grava um evento `production_void` que zera o saldo do integral (tipo de movimento novo: atualizar os três lugares da D-038). O lote anulado não gera etiqueta e o QR mostra "ANULADO". Para corrigir, registra-se outro lote. Depois do primeiro movimento, o caminho é o descarte com motivo, como já é para recebimento.

### 4.7 Recuperação de tentativa e acesso (6.8)

`register_production` e `void_production` passam por `trackGateways` e entram em `find_operation` pelo `intent_id` (D-045). Fechar a aba no meio mostra "Registro confirmado" ou "Enviar novamente", nunca reenvia sozinho.

### 4.8 RLS e histórico append-only (6.0a, 6.0b)

`batch_productions` com leitura pela RLS por conjunto (`member_organizations()`), sem escrita direta para nenhum papel, gatilho append-only `enable always`, e entrada nas listas fixas do pgTAP de segurança. Testes de negação cruzada entre empresas e unidades, como nas demais tabelas.

## 5. Telas e etiqueta

### 5.1 Registrar produção (só proprietário)

Mesmo padrão em passos da D-043: formulário → revisão → confirmação → resultado.

- Formulário: preparação (lista do catálogo), produzido em (padrão = instante do registro, como na 6.6), produzido por (lista de membros com nome curto), quantidade, validade (campo de data **vazio**, sem sugestão), observação.
- **Revisão** escreve por extenso: "Validade 16/11/2026 (sábado), 2 dias depois da produção". A contagem de dias é só para a pessoa conferir o que digitou, não é prazo nem comparação com regra. Validade no mesmo dia da produção pede uma confirmação a mais ("A validade é hoje. Confirmar?").
- Resultado: "Baixar etiqueta" e "Porcionar agora".

### 5.2 Modelo de etiqueta "Preparação própria" (PDF 100 × 100 mm, D-044)

Legível sem o QR, data em dd/mm/aaaa:

1. Nome da preparação (maior texto da etiqueta).
2. **VALIDADE dd/mm/aaaa** em destaque.
3. Produzido em dd/mm/aaaa hh:mm.
4. Produzido por (nome curto).
5. Conservação.
6. Quantidade do recipiente (no integral, a produzida; na porção, a da porção e "porção X de N").
7. "Validade informada pelo responsável".
8. Código curto (C-000123) e QR.

A porção de uma preparação usa este mesmo modelo, não o de "produto aberto", porque não há validade do fabricante a mostrar. Nenhum texto afirma conformidade (teste 16 de `forbiddenTexts.test.ts`). Reimpressão não grava nada (D-003). Recusas do arquivo inteiro, como na 6.7: lote anulado, produção tardia sem liberação, dados da produção indisponíveis.

### 5.3 Página do QR

Mostra "Preparação própria", nome, produzido em/por, validade e a origem dela, saldo, local, porções e faixas (bloqueio, anulado, vencido). Mesmo cuidado de hoje com dado interno: nada de identificador longo nem e-mail.

## 6. Quem escreve (D-019)

Só o **proprietário**: cadastra a preparação no catálogo (nome, unidade, conservação), registra a produção, decide a ocorrência tardia, anula a produção, porciona, registra consumo e descarte e muda de local. **Membro** (cozinheiro, auxiliar) só consulta, imprime a etiqueta já gerada e lê o QR. Quem produziu aparece como "produzido por", sem ganhar escrita. Isto é o maior risco operacional (seção 7, R-1).

## 7. Riscos

| # | Risco | Mitigação no desenho | Sobra |
|---|---|---|---|
| R-1 | Gargalo: só o proprietário registra, e a cozinha produz muitas vezes por turno | Formulário curto, "produzido por" separado, janela de 2 h | Métrica de atraso do piloto (D-047) diz se D-019 precisa ser revista |
| R-2 | Validade digitada errada (dia/mês trocado, ano errado) | Campo vazio, revisão por extenso com dia da semana e contagem de dias, confirmação extra para "hoje", recusa de validade anterior à produção, anulação enquanto não houve movimento | Prazo plausível mas errado não é detectável: o sistema não sabe o prazo certo (D-004) |
| R-3 | Etiqueta colada no recipiente errado | Nome da preparação como maior texto, código curto, QR mostra o conteúdo | Conferência visual continua sendo da pessoa |
| R-4 | Reimpressão de etiqueta antiga ou de lote anulado | Reimpressão não cria saldo (D-003); PDF de lote anulado é recusado; QR de etiqueta antiga mostra "ANULADO" ou "VENCIDO" | Papel já impresso continua existindo; só o QR denuncia |
| R-5 | Horário de produção errado | Futuro recusado, janela de 2 h com ocorrência acima | Horário plausível mas errado é tema de observação, como na D-031 |
| R-6 | Preparação feita com insumo vencido ou bloqueado | Fora do mínimo (sem ingredientes) | Opção 8.1 resolve; depende da nutricionista |
| R-7 | Ler a etiqueta como garantia sanitária | Nenhum texto de conformidade (teste 16), "validade informada pelo responsável" | Q10 |

## 8. Fora do mínimo (opções separadas)

Dependem de resposta da nutricionista (seção 10) e de aprovação própria. Não entram em nenhuma fatia da seção 9.

- **8.1 Ingredientes com origem.** Ao registrar a produção, escolher os recipientes usados e quanto de cada; o banco grava um **consumo** em cada um (o mesmo `stock_movements`, com ligação para a produção), recusa insumo vencido ou bloqueado e o QR da preparação lista as origens. Daria rastreio "de qual lote veio" e baixa de estoque dos insumos. Pergunta aberta: a validade da preparação deve ser limitada pela menor validade dos insumos? Sem a RT, o sistema não aplica esse limite.
- **8.2 Ficha de preparo.** Receita padrão por preparação (ingredientes esperados, modo de conservação, prazo aprovado pela RT). Só com ficha aprovada o sistema poderia **mostrar** um prazo, e ainda assim a pessoa confirmaria. Muda a D-004 e precisa de decisão própria.
- **8.3 Alergênicos na etiqueta.** Campo por preparação, se a RT pedir.
- **8.4 Resfriamento e reaquecimento.** Registro de temperatura ao fim do resfriamento ou no reaquecimento; liga-se ao futuro módulo de equipamentos.
- **8.5 Membro registra a produção.** Revisão da D-019 depois da observação do piloto.

## 9. Fatiamento

Cada fatia segue o critério comum da Fase 6: bateria inteira verde, nenhum teste removido ou enfraquecido, testes antes ou junto do código.

| Fatia | O quê | Migração | Depende de |
|---|---|---|---|
| **7.1** | Banco: `origin` no lote, tipo no catálogo, `batch_productions`, `register_production`, ocorrência `late_production`, RLS, append-only, `find_operation` | Sim | 6.11 integrada (para não conflitar em `record_container_movement`) |
| **7.2** | Banco: `void_production` e o movimento `production_void` (três lugares da D-038) | Sim | 7.1 |
| **7.3** | Tela: preparação no catálogo; registrar produção em passos; anular produção; QR; recuperação de tentativa | Não | 7.1, 7.2 |
| **7.4** | Etiqueta "Preparação própria" (integral e porção), baixar esta/todas, recusas | Não | 7.3 |
| **7.5** | Porcionar preparação na tela atual (recusa de "abrir"), métrica do piloto de produções | Talvez (só leitura) | 7.4 |

**Mínimo viável:** 7.1 a 7.4. Com elas a cozinha cadastra a preparação, registra o lote com validade digitada, imprime a etiqueta com QR, consome, descarta e corrige erro. O porcionamento pelo banco já funciona desde a 7.1; a 7.5 só ajusta a tela e a métrica.

## 10. Perguntas para a nutricionista RT (Q10)

Objetivas, para responder sim/não ou com um valor. Nenhuma resposta vira regra no sistema sem decisão de luis.

1. Quais campos **mínimos** a etiqueta de preparação própria precisa ter? A lista da seção 5.2 sobra ou falta algo (por exemplo, alergênicos, lote de origem)?
2. Quem pode **definir a validade** de cada preparação: qualquer cozinheiro, o chefe ou só a RT? Precisa de ficha de preparo aprovada antes?
3. A validade da preparação deve ser limitada pela **menor validade dos ingredientes**?
4. O **horário de produção** é o início, o fim do preparo ou o fim do resfriamento?
5. A janela de **2 horas** entre produzir e registrar serve para preparações?
6. Porção de preparação pode ter validade **menor** que o lote? Pode ser congelada depois com validade nova (hoje o sistema proíbe prorrogar)?
7. É preciso registrar **temperatura** no fim do resfriamento ou no reaquecimento para o piloto?
8. Para preparação, a **etiqueta impressa depois** (com o produto já guardado) é aceitável, e por quanto tempo o recipiente pode ficar sem etiqueta?
9. O registro de **quem produziu** precisa de nome completo ou basta o nome curto?

## 11. Decisão proposta — D-049

> ## D-049 — Preparação própria como lote com validade informada (14/11/2026)
>
> - **Status:** proposta, só desenho ([registro](FASE_07_DESENHO.md)); aguardando aceite de luis. **Altera a D-028**, que deixava alimento preparado para fase própria.
> - **Decisão:** a cozinha registra o que produz como **lote de preparação**: item do catálogo marcado como preparação, produzido em (fuso da unidade, janela de 2 h com ocorrência acima), produzido por (nome curto), quantidade e **validade digitada pela pessoa, sem cálculo nem sugestão**. O lote é um `batch_receipts` de origem `produced` com recipiente integral, e usa saldo, consumo, descarte, porcionamento, ocorrências, vencido, locais, QR e recuperação de tentativa existentes, sem segundo estoque. Só o proprietário escreve. Anulação de produção só antes de qualquer movimento. Terceiro modelo de etiqueta, "Preparação própria", 100 × 100 mm, legível sem QR, sem afirmar conformidade. Ingredientes, origem dos insumos e ficha de preparo ficam fora.
> - **Motivo:** cerca de metade dos itens sem etiqueta observados eram preparações próprias; fluxo descrito por luis em 14/11/2026; D-003, D-004, D-019, D-024, D-031, D-038, D-041, D-044, D-045, D-046.
> - **Consequência:** a etiqueta vira o maior volume de escrita do proprietário (R-1); validade plausível mas errada não é detectada (R-2); o modelo de 100 × 100 mm continua provisório até o ensaio físico.
> - **Revisar quando:** a nutricionista RT responder as perguntas da seção 10 (Q10), o piloto medir o atraso do registro, ou luis pedir ingredientes (8.1).

## 12. Pontos para luis decidir

1. **Aceitar a D-049**, que altera a D-028 (preparação própria entra, com validade digitada).
2. **Preparação no catálogo** (cadastro uma vez, com unidade e conservação) em vez de nome livre a cada lote.
3. **"Abrir" não vale para preparação**; só porcionar.
4. **Anular produção** só antes de qualquer movimento; depois disso, descarte com motivo.
5. **Revisão com contagem de dias** ("2 dias depois da produção") como ajuda de conferência, não como prazo.
6. **Mínimo = fatias 7.1 a 7.4**; ingredientes (8.1) fica para depois da nutricionista.

## 13. Critérios de aceite (para as fatias, quando aprovadas)

1. O proprietário registra um lote de preparação; membro recebe "Acesso negado" (matriz de papéis testada).
2. Validade é obrigatória, vem vazia e nunca é preenchida ou sugerida pelo sistema (teste de componente e de domínio).
3. Validade anterior à data de produção é recusada pelo banco; validade igual pede confirmação extra na tela.
4. Produzido em futuro é recusado; acima de 2 h só entra com justificativa e abre ocorrência que bloqueia consumo, porcionamento, mudança de local e etiqueta; descarte permitido.
5. Reenviar o mesmo `intent_id` devolve o mesmo lote (idempotência) e `find_operation` o encontra.
6. O integral nasce com saldo igual à quantidade; consumo, descarte e anulação de consumo funcionam sem código novo.
7. Porção de preparação não pode ter validade posterior à do lote; "abrir" é recusado.
8. Anular produção zera o saldo, só antes de qualquer movimento, uma vez, com motivo; depois do primeiro movimento é recusada.
9. Recebimento continua exigindo fornecedor, lote e temperatura como hoje (testes atuais intactos); produção não aceita fornecedor.
10. `batch_productions` é append-only para todos os papéis e entra no pgTAP de segurança; leitura cruzada entre empresas é negada.
11. Lote de preparação vencido aparece com a faixa e tem consumo recusado pela regra da 6.11, sem regra própria.
12. PDF "Preparação própria" desenha todos os campos da seção 5.2 (teste do texto desenhado); lote anulado ou tardio sem liberação recusa o arquivo; nenhum texto passa no teste 16 como conformidade.

## 14. Testes previstos

- **pgTAP:** papéis (proprietário, membro, sem vínculo, outra empresa); `CHECK` por origem; janela e ocorrência; idempotência; anulação e suas recusas; porcionamento sobre preparação; append-only e guarda de segurança; vencido (com a 6.11).
- **Integração (API):** registrar, consumir, porcionar e anular pelo cliente; negação cruzada; `find_operation`.
- **Vitest:** domínio (validação do formulário, texto da revisão, contagem de dias, confirmação de "hoje"); componentes (campo vazio, mensagens do banco em `messages.ts`); PDF (texto desenhado, recusas); teste 16.
- **Playwright:** proprietário registra produção, baixa etiqueta, porciona, consome; membro só vê; recuperação de tentativa com a aba fechada no meio.

## 15. Próximo passo

luis responde os pontos da seção 12. Com a D-049 aceita, a fatia 7.1 só começa com aprovação própria e depois que a 6.11 estiver integrada.
