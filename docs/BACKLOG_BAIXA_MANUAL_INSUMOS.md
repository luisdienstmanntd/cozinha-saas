# Backlog — Baixa manual de insumos por lote/recipiente

- **Situação:** requisito futuro registrado em 22/11/2026. **Nada foi implementado.** Este documento não cria migração, função do banco, política RLS, componente nem teste.
- **Decisão:** [D-073](DECISOES.md) (proposta, aguardando aceite de luis). Chamada de "D-FUTURA" no pedido original.
- **Pedido:** luis, 22/11/2026.
- **Responsável pela interface definitiva:** revisão conjunta com o Codex (UX/UI).

> Leitura do código feita só para citar nomes reais. Tudo o que aparece como **indício** abaixo foi observado de passagem na `main` (`d9b48c9`) e **precisa ser confirmado pela auditoria técnica da seção 8** antes de qualquer programação.

## 1. Objetivo

Permitir que a cozinha registre, por lote ou recipiente, quanto de um insumo foi usado, descartado ou ajustado, de modo que:

- o saldo disponível acompanhe o uso real;
- o item com saldo zero saia da lista de validades ativas, mesmo antes do vencimento;
- todo o histórico (recebimento, saídas, movimentações) continue consultável para auditoria.

A primeira entrega é **baixa manual**. A baixa automática por produção, receitas ou fichas técnicas fica para depois.

## 2. Problema operacional

A lista de validades deve mostrar o que a cozinha ainda tem. Se um insumo já foi todo usado e continua na lista até a data de validade, a equipe perde confiança no painel, confere itens que não existem e os alertas de vencimento passam a ser ruído.

Ao mesmo tempo, sumir com o registro não é aceitável: é preciso saber depois quem recebeu, quanto foi usado, quando, por quem e por quê.

## 3. Exemplo de utilização

O restaurante recebe **1 kg de peito de peru**, com validade de **15 dias**.

| Momento | Quantidade da saída | Saldo depois | Aparece em validades ativas? |
|---|---|---|---|
| Recebimento | — | 1.000 g | Sim |
| 1º consumo | 300 g | 700 g | Sim |
| 2º consumo | 500 g | 200 g | Sim |
| 3º consumo | 200 g | 0 g | **Não** (mesmo faltando dias para vencer) |

Depois do 3º consumo, o recebimento e as três saídas continuam aparecendo no histórico do lote/recipiente, com usuário e data/hora de cada registro.

## 4. Decisão funcional aprovada

**D-073 — Baixa manual de insumos por lote/recipiente** (registrada em `DECISOES.md`):

- A primeira implementação permite **baixa manual por lote/recipiente**.
- A **baixa automática** associada a produção, receitas ou fichas técnicas é **evolução futura**, sem implementação nesta etapa.
- Saldo zero tira o item **só** da lista operacional de validades ativas; ele continua nas consultas históricas.
- Saldo zero **não** é vencimento nem descarte.

## 5. Requisitos funcionais

| # | Requisito | Indício do que já existe (a confirmar na auditoria) |
|---|---|---|
| RF1 | Selecionar um lote ou recipiente com saldo disponível | Lista de Validades e ficha do recipiente; `list_containers` filtra `balance > 0` por padrão |
| RF2 | Consultar a quantidade atual | `private.container_balance` calcula o saldo do recipiente; saldo aparece no cartão e na ficha |
| RF3 | Registrar uma quantidade consumida | `MovementPanel.tsx` tem o botão "Registrar saída"; `public.record_container_movement` / `private.apply_stock_exit` gravam em `stock_movements` |
| RF4 | Informar o motivo ou tipo de saída | `stock_movements.kind` aceita hoje `consumption` e `discard`; `reason` é obrigatório no descarte |
| RF5 | Confirmar a movimentação | Há etapa de confirmação na saída (capturas da revisão visual 07) |
| RF6 | Atualizar o saldo disponível | Saldo é derivado das movimentações (não há coluna de saldo editável) |
| RF7 | Manter o histórico da movimentação | `stock_movements` é append-only (migração `history_append_only`); anulação é registro novo |
| RF8 | Identificar usuário e data/hora | `created_by` e `created_at` (com `timezone` da unidade) em cada movimento |
| RF9 | Retirar das validades ativas os itens com saldo zero | Selo "Esgotado"; `list_containers` e `container_expiry_summary` só contam saldo > 0 |
| RF10 | Consultar depois os itens totalmente consumidos | Opção "Mostrar esgotados" na lista de Validades |

**Tipos de saída previstos**

| Tipo | Situação hoje (indício) | Observação |
|---|---|---|
| Consumo | Existe (`consumption`) | Recusado para recipiente vencido (fatia 6.11) |
| Descarte | Existe (`discard`) | Motivo obrigatório |
| Ajuste de estoque | **Não encontrado** | Só com permissão adequada; precisa de definição (seção 11) |

O quadro sugere que boa parte do requisito pode já estar coberta. Por isso a auditoria da seção 8 vem antes de qualquer código, para não duplicar funcionalidade.

## 6. Regras de negócio

1. O saldo **nunca** fica negativo.
2. A baixa **não** pode passar da quantidade disponível. (Indício: `apply_stock_exit` recusa com "Quantidade excede saldo registrado.")
3. Proteção contra **baixas simultâneas e duplicadas**. (Indício: bloqueio `for update` no recebimento e `intent_id` único por unidade, que torna a repetição idempotente.)
4. Toda saída mantém **rastreabilidade**: quem, quando, quanto, tipo, motivo, lote/recipiente e unidade.
5. **Nenhum registro histórico é excluído.** Correção é feita por anulação ou ajuste registrado, nunca por apagar ou editar.
6. A **validade original não muda** com a baixa.
7. **Isolamento** entre organizações e unidades preservado (RLS e checagem de vínculo em toda função).
8. **Permissões** respeitadas; o ajuste de estoque exige permissão própria (a definir).
9. **Não contar duas vezes** quantidades já movimentadas por abertura, fracionamento (porcionamento), transferência de local ou produção. A baixa atua sobre o saldo do recipiente onde a quantidade está agora.
10. Saldo zero tira o item **só** da lista operacional de validades ativas; ele continua no histórico, na ficha, no QR e em "Mostrar esgotados".
11. **Saldo zero não é vencimento nem descarte.** O selo e os contadores não podem tratar um esgotado como vencido ou descartado.
12. Nada disso declara conformidade sanitária; a validade continua sendo a informada pelo responsável.

## 7. Fluxo de interface proposto

Ação **"Registrar saída"** na ficha operacional do lote/recipiente. (Indício: já existe um "Registrar saída" no `MovementPanel`, aberto a partir do `BatchPanel`; a auditoria decide se o fluxo novo é esse mesmo, ajustado.)

O formulário mostra:

- nome do produto;
- lote ou recipiente (código curto);
- local de armazenamento;
- quantidade disponível;
- quantidade a baixar (vírgula decimal, como na D-063);
- unidade de medida;
- tipo de saída (Consumo, Descarte, Ajuste quando permitido);
- motivo ou observação;
- botões **Cancelar** (secundário) e **Confirmar saída** (principal; Descarte segue o estilo de risco da D-062).

Depois de confirmar:

1. mostrar o saldo resultante (ex.: "Saldo agora: 200 g");
2. atualizar a lista e os contadores;
3. se o saldo chegou a zero, avisar que o item saiu das validades ativas e continua em "Mostrar esgotados" e no histórico.

A interface definitiva será revisada com o Codex (UX/UI) antes da implementação.

## 8. Dependências técnicas

**Auditoria técnica obrigatória antes de programar** (pré-requisito da etapa 1 do plano):

1. Examinar as tabelas e os movimentos de estoque existentes (`stock_movements`, `containers`, `batch_receipts`, movimentos de manipulação, produção e transferência).
2. Identificar as operações atuais de consumo, descarte e movimentação (`record_container_movement`, `apply_stock_exit`, `reverse_movement` e equivalentes).
3. Verificar como o saldo é calculado (`private.container_balance`, `private.stock_conservation_problems`).
4. Verificar o comportamento atual dos recipientes esgotados (lista, contadores, ficha, QR, etiqueta).
5. Identificar componentes e serviços reutilizáveis (`MovementPanel`, `BatchPanel`, `formatQuantity`, `quantity.ts`).
6. Avaliar a necessidade de mudanças no banco, RPCs e permissões (em especial para o ajuste de estoque).
7. Identificar os testes necessários.
8. Elaborar plano incremental, sem duplicar funcionalidades existentes.

**Não presumir** que o backend precisa de novas tabelas ou migrações antes dessa auditoria. Pela memória da fatia 6.1, um tipo de movimento novo exige atualizar `container_balance` e `stock_conservation_problems`, e o pgTAP fixa a lista de tipos.

Outras dependências: regras de recipiente vencido (D-048/fatia 6.11), bloqueio por ocorrência (fatia 6.5b), filtros de validade (D-072) e a revisão de UX do Codex.

## 9. Critérios de aceitação

1. O exemplo da seção 3 funciona do começo ao fim: 1.000 → 700 → 200 → 0 g.
2. Com saldo zero, o item some da lista de validades ativas e dos contadores, mesmo antes do vencimento.
3. Com "Mostrar esgotados", o item aparece com selo "Esgotado", nunca "Vencido" nem "Descartado".
4. A ficha mostra o recebimento e as três saídas com usuário, data/hora no fuso da unidade, tipo e motivo.
5. Uma baixa maior que o saldo é recusada no banco com mensagem clara, e o saldo não muda.
6. Dois envios iguais (mesma tentativa) geram uma só saída; duas baixas simultâneas não deixam saldo negativo.
7. A validade original do lote/recipiente não muda.
8. Usuário de outra organização ou unidade não vê nem baixa o item.
9. Ajuste de estoque só aparece e só grava para quem tem a permissão definida.
10. Quantidades de abertura, porcionamento, transferência ou produção não são baixadas duas vezes.
11. Bateria inteira verde, sem teste enfraquecido.

## 10. Testes futuros

- **pgTAP:** saldo nunca negativo; recusa acima do saldo; idempotência por tentativa; concorrência; isolamento entre organizações e unidades; permissão do ajuste; histórico append-only; validade intacta; esgotado fora de `list_containers` e `container_expiry_summary` e dentro da consulta com esgotados; conservação de estoque com o tipo novo, se houver.
- **Vitest:** formulário (validação, vírgula decimal, tipo, motivo), mensagem de saldo resultante, selo "Esgotado".
- **Integração:** chamada à função de saída com usuário real de cada perfil.
- **Playwright (E2E):** o exemplo do peito de peru inteiro, no desktop e no celular, incluindo "Mostrar esgotados" e o histórico.
- Usar datas relativas no fuso da unidade (lição da fatia 6.11: datas fixas quebram quando passam).

## 11. Riscos e pontos em aberto

1. **Duplicar o que já existe.** O consumo e o descarte por recipiente parecem já implementados; o risco maior é criar um segundo caminho. Mitigação: auditoria primeiro.
2. **Ajuste de estoque.** Falta definir: só proprietário ou também outro perfil? Pode aumentar o saldo ou só diminuir? Motivo obrigatório? Como anular?
3. **Baixa por lote com vários recipientes.** Ao baixar "por lote", de qual recipiente sai a quantidade? Hoje o saldo é por recipiente.
4. **Recipiente vencido.** Hoje o consumo de vencido é recusado e só o descarte é permitido; o ajuste precisa de regra própria.
5. **Item bloqueado por ocorrência.** Confirmar se a baixa respeita o bloqueio atual.
6. **Contadores.** Confirmar que esgotado nunca entra em Vencidos, Vence hoje, Vence amanhã ou Posteriores.
7. **Baixa automática futura.** O modelo da baixa manual não deve impedir a integração posterior com produção, receitas e fichas técnicas.
8. **Conflito de numeração.** A D-071 está reservada ao PR #56 do Codex; esta decisão usa a D-073.

## 12. Plano de implementação por etapas

Cada etapa é uma fatia própria e só começa com aprovação de luis.

| Etapa | Conteúdo | Saída |
|---|---|---|
| 0 | Este registro (só documentação) | `BACKLOG_BAIXA_MANUAL_INSUMOS.md` e D-073 |
| 1 | Auditoria técnica da seção 8 | Relatório com o que existe, o que falta e o plano incremental, para aprovação |
| 2 | Lacunas de consumo/descarte apontadas pela auditoria (se houver) | Fatia com testes, sem duplicar o fluxo existente |
| 3 | Ajuste de estoque com permissão própria, depois das respostas da seção 11 | Fatia com banco, RLS/permissão e testes, se a auditoria indicar |
| 4 | Interface final revisada com o Codex | Fatia de UX com capturas antes/depois |
| 5 | Validação no piloto e decisão sobre baixa automática | Registro de aprendizados; proposta separada para produção/receitas/fichas técnicas |

Merge na `main` publica o site; nenhuma etapa entra sem autorização explícita de luis.

## 13. Status e próximos passos

> O pedido original chegou cortado no item 13 ("Status e..."). Este título foi interpretado como **"Status e próximos passos"**; luis pode corrigir.

- **Status:** registrado como backlog. Nada implementado. D-073 proposta.
- **Próximos passos:**
  1. luis revisa este documento e aceita (ou ajusta) a D-073.
  2. Quando a funcionalidade for priorizada, abrir a etapa 1 (auditoria técnica) como fatia própria.
  3. Responder os pontos em aberto da seção 11, em especial o ajuste de estoque e a baixa por lote.
  4. Combinar com o Codex a revisão de UX antes da etapa 4.
