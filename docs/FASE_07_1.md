# Fase 7, fatia 7.1 — preparação própria no banco

> Aprovada por luis em 14/11/2026 ("aceito e quero", 14:51 UTC), conforme o [desenho da Fase 7](FASE_07_DESENHO.md) e a D-049. Decisão: **D-050** (abaixo), **aceita por luis em 14/11/2026 (15:50 UTC)** com os 3 pontos. **Nada aqui afirma conformidade sanitária**; a conferência pela nutricionista RT (Q10) continua pendente. Dados de teste sintéticos.

## O que mudou

### Banco (migração `20261114040000_kitchen_production.sql`)

- **Catálogo:** `products.kind` (`product` ou `preparation`), escolhido só na criação (o cliente ganhou `INSERT` da coluna e continua sem `UPDATE`). Tudo o que existia ficou `product`.
- **Lote:** `batch_receipts.origin` (`received` ou `produced`); tudo o que existia ficou `received`. Para `produced`, o banco exige fornecedor e lote do fabricante nulos, validade "definida pelo responsável", sem validade do fabricante e temperatura `not_required` sem medida. O recebimento continua exigindo fornecedor e lote. Um gatilho recusa receber preparação e produzir produto.
- **`batch_productions`** (append-only, RLS por conjunto, só leitura para todos os papéis): produzido em, se foi tardio, quem produziu (vínculo ativo, nome curto copiado), observação, fuso. Só se liga a lote produzido.
- **`register_production`** (só proprietário, D-019; idempotente pelo `intent_id`): cria o lote, o integral (gatilho da 6.1, com saldo), a produção e, se for o caso, a ocorrência, na mesma transação. Recusa: horário futuro; mais de 2 horas sem justificativa (e justificativa dentro da janela); validade anterior à data da produção ou à de hoje (fuso da unidade); preparação sem conservação definida; item que não é preparação; pessoa sem vínculo ativo ou sem nome. **Nenhum prazo é calculado ou limitado** (D-004).
- **Ocorrência `late_production`:** mesma tabela, mesma decisão única do proprietário; bloqueia todos os recipientes do lote (`container_blocks`, `list_occurrences`), como a de temperatura. Verificação de coerência em `occurrence_problems()` e `production_problems()`.
- **"Abrir" preparação é recusado** por gatilho em `container_handlings`; porcionar funciona com as regras da 6.3 (porção não passa da validade do lote).
- **`find_operation`** devolve `production` para o identificador de uma produção (D-045).
- **Histórico:** `batch_productions` entrou em `assert_history_protected()` e nas listas fixas do pgTAP de segurança.

### Tela (só tolerância; a tela de produção é a 7.3)

- Os esquemas do painel, ocorrências, manipulação e etiqueta aceitam lote sem código; onde aparecia "lote X" aparece "preparação própria" (`batches/domain/lot.ts`).
- O catálogo e a lista de recebimentos mostram só produtos e lotes recebidos.
- A etiqueta PDF de lote produzido é recusada com mensagem até o modelo próprio (7.4).
- Ocorrência de produção tardia tem rótulo próprio na lista de ocorrências.

## Testes

Todos executados neste ambiente, com o banco local recém-recriado (`npm run db:reset`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | ok |
| `npm run test` (Vitest) | 242 passaram (33 arquivos; 5 novos) |
| `npm run test:db` (pgTAP) | 1165 passaram (20 arquivos; `production.test.sql` com 76 novos) |
| `npx supabase db advisors --type security --level warn --fail-on warn` | sem problemas |
| `npm run test:integration` | 33 passaram (`production.test.mjs` novo) |
| Playwright (config local com o Chromium do ambiente) | 15 passaram |

Testes existentes alterados: só as listas fixas de `rls_set_based.test.sql` (política nova `batch_productions_read`) e de `security_guard.test.sql` (tabela nova nas três listas de histórico). Ambas ficaram mais exigentes; nada foi removido ou enfraquecido.

## Limites conhecidos

1. **Porcionar logo após produzir:** a 6.3 exige que o horário do porcionamento não seja anterior ao registro do integral. Para preparação, o correto seria o horário da produção; hoje, uma porção feita antes de o proprietário registrar a produção precisa ser registrada com o horário do registro. Fica para a 7.5 (ajuste da tela de porcionar).
2. **Sem tela:** produção só pela API até a 7.3; o catálogo ainda não cria preparação pela tela.
3. **Sem anulação de produção:** vem na 7.2. Até lá, erro de validade digitada só se corrige com descarte com motivo.
4. **Etiqueta recusada** para lote produzido até a 7.4.
5. A verificação de "abrir" acontece depois das outras validações da manipulação; a tela da 7.5 não vai oferecer a opção.

## Pontos para luis decidir

> Respondidos por luis em 14/11/2026, 15:50 UTC: **sim** aos três. (1) validade do próprio dia continua permitida, com a confirmação da tela; (2) o identificador interno único é o código curto do recipiente; (3) ocultar evita cadastrar preparação como produto de fornecedor.

1. **Validade anterior a hoje recusada** na produção, igual à manipulação (D-031), mesmo que a produção tardia tenha sido de outro dia.
2. **Lote produzido sem código de lote**; as telas mostram "preparação própria" e a etiqueta usa o código curto do recipiente (C-000123).
3. **Catálogo e recebimentos escondem as preparações** até a tela própria (7.3).

## Decisão registrada em `DECISOES.md`

> **D-050 — Preparação própria registrada no banco (14/11/2026).** Status: aceita por luis em 14/11/2026 (15:50 UTC); implementada na fatia 7.1 ([registro](FASE_07_1.md)). Decisão: preparação é um item do catálogo de tipo `preparation`, definido na criação; o lote produzido é um `batch_receipts` de origem `produced` sem fornecedor, lote do fabricante ou temperatura de recebimento, com `batch_productions` append-only e escrita só por `register_production` (proprietário, idempotente, janela de 2 horas com ocorrência `late_production` que bloqueia o lote inteiro, validade digitada sem cálculo); abrir preparação é recusado; `find_operation` devolve `production`. Motivo: D-049 e os pontos aceitos em 14/11/2026; D-004, D-019, D-031, D-041, D-045. Consequência: escrita nova em lote precisa considerar a origem; tabela nova de histórico entra na guarda; a 7.2 precisa de tipo de movimento novo (três lugares da D-038). Revisar quando: a 7.2 a 7.5 chegarem ou a nutricionista RT responder a seção 10 do desenho.

## Próximo passo

Fatia aceita. A 7.2 (anulação de produção) exige aprovação própria. Sem merge sem pedido de luis.
