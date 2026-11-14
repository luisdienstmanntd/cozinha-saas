# Fase 7, fatia 7.2 — anular produção no banco

> Aprovada por luis em 14/11/2026 ("sim e aprovo"), conforme o [desenho da Fase 7](FASE_07_DESENHO.md) (seção 4.6, critério 8) e a D-049. Decisão proposta: **D-051** (abaixo), **aguardando aceite de luis**. **Nada aqui afirma conformidade sanitária**; a conferência pela nutricionista RT (Q10) continua pendente. Dados de teste sintéticos.

## O que mudou

### Banco (migração `20261114050000_production_void.sql`)

- **`production_voids`** (append-only, RLS por conjunto, só leitura para todos os papéis): lote (único: uma anulação por lote), motivo de 1 a 300 caracteres, autor, horário, `intent_id` único por escopo. Só se liga a lote com produção registrada (`batch_productions`).
- **Movimento novo `production_void`** em `stock_movements`, ligado à anulação por chave estrangeira (`production_void_id`, `batch_id`), com índice único e gatilho que só aceita o recipiente integral. Os três lugares da D-038 foram atualizados: `container_balance()`, `apply_movement_to_balance()` e `stock_conservation_problems()` (inclusive a soma por lote).
- **`void_production`** (só proprietário, D-019; idempotente pelo `intent_id`, com a conferência I-3 de `find_operation`): trava o lote, exige motivo, recusa recebimento ("recebimento usa o descarte com motivo"), recusa segunda anulação e aplica a **regra estrita**: se o lote já teve qualquer movimento, manipulação (porcionamento) ou mudança de local, recusa com "Use o descarte com motivo." Grava a anulação e um movimento com toda a quantidade, que zera o saldo do integral.
- **`reverse_movement`** recusa desfazer uma anulação de produção (para corrigir, registra-se outro lote).
- Depois da anulação o saldo é zero, então consumo, descarte e porcionamento do lote anulado são recusados pelas regras que já existiam.
- **`find_operation`** devolve `production_void`; `production_problems()` confere a coerência entre anulação e movimento; `production_voids` entrou em `assert_history_protected()` e nas listas fixas do pgTAP de segurança.

### Tela (só leitura de movimento; a tela de anular é a 7.3)

- O painel de movimentos conhece o tipo novo: mostra "Produção anulada" e não oferece "Anular registro" para ele.
- O gateway de tentativas pendentes reconhece `production_void` em `find_operation`.

## Testes

Todos executados neste ambiente, com o banco local recém-recriado (`npm run db:reset`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | ok |
| `npm run test` (Vitest) | 243 passaram (1 novo em `MovementPanel.test.tsx`) |
| `npm run test:db` (pgTAP) | 1202 passaram (21 arquivos; `production_void.test.sql` com 37 novos) |
| `npx supabase db advisors --type security --level warn --fail-on warn` | sem problemas |
| `npm run test:integration` | 34 passaram (`production-void.test.mjs` novo) |
| Playwright (config local com o Chromium do ambiente) | 15 passaram |

Testes existentes alterados, sem remover nem enfraquecer nada:

- `container_balance.test.sql` (teste 13): a lista fixa de tipos de movimento ganhou `production_void`; o teste continua exigindo a lista exata.
- `rls_set_based.test.sql` e `security_guard.test.sql`: listas fixas ganharam `production_voids_read` e `production_voids`.
- `production.test.sql` (testes 8 e 9, da 7.1): contavam lotes e itens diferentes de `received`/`product` e só passavam com o banco vazio; a bateria de integração deixa lotes produzidos entre execuções. Passaram a conferir o default das colunas (`received` e `product`), que é o que garante o backfill sem reescrever histórico.

## Limites conhecidos

1. **Sem tela:** anular só pela API até a 7.3. O QR mostrando "ANULADO" também vem com a 7.3; a recusa do PDF de lote anulado vem com a 7.4 (hoje todo PDF de lote produzido já é recusado).
2. **Produção tardia anulada:** a anulação não fecha a ocorrência `late_production`; ela continua aberta até a decisão do proprietário (ver ponto 2).
3. O lote anulado continua no histórico e nas listas de lotes (com saldo zero); a faixa "ANULADO" nas telas é da 7.3.

## Pontos para luis decidir

1. **Regra estrita:** um consumo registrado e depois desfeito ("Anular registro") também conta como movimento, então a produção não pode mais ser anulada; o caminho é o descarte com motivo. Proposta: manter assim, porque o histórico mostra que o lote já foi usado.
2. **Ocorrência de produção tardia em aberto:** anular a produção não decide a ocorrência sozinha. Proposta: manter, para o proprietário registrar a decisão de propósito.
3. **Anulação definitiva:** não se desfaz; se anular por engano, registra-se a produção de novo. Proposta: manter.

## Decisão proposta para `DECISOES.md`

> **D-051 — Anulação de produção no banco (14/11/2026).** Status: proposta, aguardando aceite de luis; implementada na fatia 7.2 ([registro](FASE_07_2.md)). Decisão: `void_production` (proprietário, idempotente, motivo obrigatório, uma vez por lote, só lote produzido) grava `production_voids` append-only e um movimento `production_void` que zera o integral; é recusada se o lote teve qualquer movimento (inclusive desfeito), porcionamento ou mudança de local; não se desfaz; não fecha ocorrência tardia. Motivo: D-049 (seção 4.6), D-019, D-038, D-045. Consequência: tipo de movimento novo nos três lugares da D-038; a tela da 7.3 mostra "ANULADO". Revisar quando: a 7.3 chegar ou a observação na cozinha mostrar outro erro frequente.

## Próximo passo

Aceite de luis (3 pontos e D-051). A 7.3 (tela) exige aprovação própria. Sem merge sem pedido de luis.
