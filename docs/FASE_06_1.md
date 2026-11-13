# Fase 6, fatia 6.1 — saldo por recipiente

Implementada por Claude Code em 13/11/2026, conforme as seções 4.1, 4.3, 4.11, 5.2, 5.3 e 10 de `FASE_06_DESENHO.md` (PR #3) e os achados B-1, B-3, I-5, I-7 e I-14 de `REVISAO_CRUZADA_FASE_06.md` (PR #4). luis aprovou o início em 13/11/2026. Registro da tarefa: `ia-tarefas/fase-06-1-saldo-recipiente.md`.

**Base:** branch do PR #7 (`claude/fase-06c-fuso-auditoria`, `7c80e61`). **Ordem de integração: PR #2, PR #5, PR #6, PR #7, depois este.**

**Sem mudança de fluxo, de permissão (D-019) nem de Q1–Q10.** A tela continua operando no recebimento, que agora é o recipiente integral. As proteções das 6.0a–6.0c continuam intactas. Nenhum deploy. Nada aqui afirma conformidade sanitária.

## O que mudou

### Banco (`20261113050000_container_balance.sql`, rollback `container_balance.sql`)

1. **`containers` ganhou** `kind` (`integral`/`derived`), `parent_container_id`, `initial_quantity`, `expiry_date`, `expiry_origin` (`receipt`/`handling`), `short_code` e `timezone`, todas obrigatórias exceto o pai. Restrições: forma por tipo (integral sem pai e com validade do recebimento; derivado com pai diferente de si e validade de manipulação), quantidade com até 3 casas, código no formato `C-000001`, código único, FK composta do pai para o **mesmo recebimento**, e `unique (batch_id)` trocado pelo índice único parcial `containers_one_integral_idx ... where kind = 'integral'` (I-5).
2. **Integral nasce com o recebimento.** Gatilho `batch_receipts_create_integral` (`AFTER INSERT`) cria o integral na mesma transação, inclusive nas inserções diretas das fixtures (B-3). O gatilho `containers_prepare` (`BEFORE INSERT`) copia quantidade, validade e fuso do recebimento para o integral e **recusa** valores diferentes, gera o código curto e recusa código informado por quem insere.
3. **Código curto (I-7):** `private.container_short_code_seq`, global, sem linha bloqueada; buracos são aceitáveis. Os recipientes existentes foram numerados em ordem de criação (`created_at`, `id`), de forma determinística.
4. **`stock_movements.container_id`**, obrigatório, com FK composta `(organização, unidade, recebimento, recipiente)`. A FK da anulação passou a exigir o **mesmo recipiente** do movimento anulado. O índice da FK (`stock_movements_scope_container_id_key`, com `include (kind, quantity)`) também serve ao cálculo do saldo. O gatilho `stock_movements_fill_container` preenche o integral quando uma inserção antiga vem sem recipiente (fixtures e guarda); nenhuma função depende dele (pgTAP roda as funções com o gatilho desligado).
5. **Saldo e conservação:** `private.container_balance(recipiente)` (quantidade inicial − consumos − descartes + anulações) e `private.stock_conservation_problems()`, que lista por recebimento: falta ou excesso de integral, integral diferente do recebimento, saldo negativo, tipo de movimento sem regra de saldo e soma dos saldos dos recipientes diferente de `recebimento − saídas + anulações` (4.3). Os tipos de movimento estão fixados no pgTAP: a 6.3 (`transfer`) precisa atualizar as duas funções.
6. **Funções:** `public.record_container_movement(org, unidade, recipiente, tipo, quantidade, motivo, intent)` registra consumo ou descarte **por recipiente**. Nome próprio porque os tipos dos parâmetros coincidem com os de `record_movement`. `record_movement` (assinatura antiga, usada pela tela) continua com as mesmas mensagens e códigos e opera no integral. As duas usam o mesmo núcleo, com a ordem da seção 5 (I-4): autorização → forma → recipiente no escopo → bloqueio `FOR UPDATE` do recebimento → replay → saldo do recipiente. O replay compara também o recipiente: o mesmo `intent_id` em outro recipiente dá `23505`. `reverse_movement` grava o recipiente do movimento anulado. `ensure_container` devolve o integral existente (sem gastar código a cada etiqueta) e mantém o `on conflict` no índice parcial.
7. **Backfill pela estratégia A (B-1, decisão de luis):** na mesma transação, `disable trigger` nominal de `containers_append_only` e `stock_movements_append_only`, preenchimento dos recipientes existentes, criação do integral dos recebimentos sem recipiente (com data e autor do recebimento), numeração dos códigos, ligação dos movimentos ao integral, `enable always trigger` e, no fim, `private.assert_history_protected()` e a verificação de conservação. **Qualquer proteção faltando ou qualquer problema de conservação desfaz a migração inteira.**
8. **Ordem de bloqueio sem mudança:** unidade (`FOR SHARE`, só `receive_batch`) → recebimento (`FOR UPDATE`). O integral é linha nova; a sequence não bloqueia linha; recipientes não são travados (são imutáveis).

### Interface (sem mudança de fluxo)

- `supabaseBatches.ts`: o recebimento associa só o recipiente integral (`containers.kind = integral`), pronto para os derivados da 6.3.
- `supabaseMovements.ts`: o histórico e o saldo exibidos são os do integral (`containers!inner(kind)` filtrado por `integral`), I-14.
- **Única diferença visível:** como o integral existe desde o recebimento, a lista de recebimentos mostra "— recipiente <ID>" logo após receber, e a busca por ID do recipiente encontra recebimentos ainda sem etiqueta impressa. Antes o ID só aparecia depois de gerar a etiqueta. Ver a decisão proposta abaixo.

### Testes

- **Novo `supabase/tests/container_balance.test.sql` (85):** catálogo (colunas, índice parcial, `unique (batch_id)` removido, proteção completa, tipos de movimento fixados); integral criado por inserção direta, com cópia dos dados; código curto no formato e crescente; restrições por inserção direta (segundo integral, integral diferente do recebimento, derivado sem origem, com origem de outro recebimento, origem igual a si, validade de recebimento, precisão, código manual); movimento sem recipiente vai para o integral; movimento e anulação em recipiente errado recusados pela FK; funções sem o gatilho de compatibilidade; conservação verdadeira só com integral e acusada com derivado sem saída da origem; assinatura antiga no integral; **todos os casos de `movements.test.sql` repetidos com recipiente derivado**, inclusive o saldo do recipiente (e não do recebimento) limitando a baixa; replay entre recipientes e entre assinaturas; escopo (outra unidade da mesma empresa, inexistente e outra empresa com a mesma mensagem); membro, revogado, outra empresa e anônimo; append-only depois da 6.1.
- **Novo `tests/integration/container-balance.test.mjs` (1, testes 19 e 23 do desenho):** 12 recebimentos concorrentes, cada um reenviado ao mesmo tempo: um integral por recebimento, códigos sem repetição; `ensure_container` devolve o integral; baixa concorrente pela assinatura nova e pela antiga no mesmo integral: só uma passa; reenvio concorrente idêntico: um registro; consultas da interface com o filtro do integral; negações para membro, outra empresa, outra unidade e anônimo; recipiente não editável.
- **Vitest (+2):** os dois gateways aplicam o filtro do integral.
- **Ajustes em testes existentes, nenhuma asserção removida ou enfraquecida:**
  - `security_guard.test.sql`: a matriz de papéis ganhou `record_container_movement` (membro, revogado, outra empresa); 43 verificações.
  - `history_append_only.test.sql`: o recipiente não é mais inserido com ID fixo (o recebimento já o cria); as verificações o localizam pelo recebimento, e uma verificação nova confirma que ele existe, para as recusas atingirem uma linha real. `truncate containers` virou `truncate containers cascade`, porque agora movimentos e derivados referenciam recipientes por FK e o `TRUNCATE` simples pararia na FK (`0A000`) antes do gatilho; com `CASCADE` a tentativa é mais forte e continua recusada com `55000`.

## Evidências (container em nuvem, 13/11/2026)

Supabase local (Postgres 17) com Docker; Node 24.22.3; Playwright com o Chromium do container por config local não versionada.

| Comando | Resultado |
|---|---|
| Falha primeiro, sem a migração: `npm run test:db` | **FAIL**: `container_balance.test.sql` 12 de 14 antes de abortar (função inexistente); guarda 3 de 43 (`record_container_movement`) |
| Falha primeiro, sem a migração: `container-balance.test.mjs` | **FAIL** (`42703`, coluna inexistente) |
| Falha primeiro, sem a mudança dos gateways: Vitest | **FAIL** 2 de 9 nos dois arquivos de gateway |
| **Backfill com dados realistas** (banco com 6.042 recebimentos, 3.602 recipientes e 26.818 movimentos, 1.334 anulações, 3 empresas, 6 unidades, 3 fusos, `kg` e `un`), `supabase migration up` | aplicada em ~7 s; 6.042 integrais (2.440 novos), 0 recebimento sem exatamente um integral, 0 movimento sem recipiente, **0 problema de conservação**, saldo de cada integral = líquido do recebimento, códigos `C-000001`…`C-006042` sem repetição, quatro gatilhos de proteção `ENABLE ALWAYS` |
| Mesmos dados: hash de recebimentos, movimentos (colunas anteriores), saldo líquido por recebimento e recipientes antigos, antes × depois | idênticos |
| Rollback com um derivado inserido (na mesma transação) | **recusado** (`Rollback recusado: existem recipientes derivados.`), nada alterado |
| Rollback aplicado no banco com dados; bateria da 6.0c (worktree em `7c80e61`) | `test:db` 282 PASS e integração 15/15 contra o banco revertido; recebimentos e movimentos idênticos; ficam os integrais criados (documentado) |
| Reaplicar → rollback → reaplicar | as duas aplicações produzem os mesmos recipientes, códigos, valores e ligações movimento → recipiente (hash idêntico) |
| `npm run db:reset` + `npm run test:db` | PASS, 9 arquivos, 371 verificações (282 anteriores + 1 em `history_append_only` + 3 na guarda + 85 novas) |
| `npm run test:integration`, duas vezes seguidas no mesmo banco | 16 de 16 nas duas |
| `playwright test` | 3 de 3 |
| `npx supabase db advisors --type security --level warn --fail-on warn` e `--type performance --level warn` | sem ocorrências |
| `npm run lint`, `typecheck`, `format:check`, `build` | sucesso (build mantém o aviso antigo de chunk grande) |
| `npm run test` (Vitest) | 78 de 78 |

Não executados: CI do GitHub no momento deste texto; benchmark de saldo (critério de 50 ms é da 6.2).

Em nível `info`, o advisor de desempenho lista FKs sem índice de cobertura que já existiam (autor, produto, fornecedor) e a FK da anulação, que antes também não tinha índice próprio; a busca da anulação usa o índice único parcial `stock_movements_one_reversal_idx`. Fica para a 6.2 avaliar junto com o benchmark.

## Riscos e limites

- **Derivados só por inserção do dono das tabelas** até a 6.3. Um derivado criado assim não tem saída correspondente na origem e quebra a conservação de propósito; `stock_conservation_problems` acusa. A conservação com derivados de verdade (transferência) só fecha na 6.3.
- **Colunas de manipulação adiadas:** `handling_id`, `position` e `handled_at` chegam na 6.3, com as FKs para `container_handlings` (que só existe lá); `storage` chega na 6.5a. São colunas anuláveis novas, sem backfill. Até lá, a validade do derivado não é limitada pela da origem no banco (não há como criar derivado pela aplicação).
- **Quantidade inteira em `un`** para derivados é conferida pela função de manipulação (6.3), porque a unidade está no recebimento.
- **Rollback deixa os integrais criados** (histórico é append-only) e perde os códigos curtos; reaplicar recalcula os mesmos.
- **Backfill com data do recebimento:** os integrais criados pela migração têm `created_at` e `created_by` do recebimento, não do momento da migração; é o que a regra da 6.3 ("manipulação não anterior à criação da origem") espera.
- **O gatilho de compatibilidade** (`stock_movements_fill_container`) existe só para inserções diretas antigas; remover quando as fixtures deixarem de depender dele.
- **`record_container_movement` ainda não é usada pela tela**; a assinatura antiga continua até a interface trabalhar por recipiente (6.6).

## Decisão proposta para `DECISOES.md`

O `DECISOES.md` desta base termina na D-018; D-019 a D-033 estão no PR #3, D-034 no PR #5, D-035 no PR #6 e D-036 no PR #7. Para evitar conflito de numeração, entra como **D-037** quando os PRs anteriores forem integrados:

- **Decisão:** todo recebimento tem exatamente um recipiente integral, criado pelo banco na mesma transação do recebimento (revisa D-014, que criava sob demanda ao gerar a etiqueta); todo movimento pertence a um recipiente do mesmo recebimento e a anulação fica no mesmo recipiente; saldo por recipiente; código curto `C-NNNNNN` por `sequence` global; `record_container_movement` é a escrita por recipiente e `record_movement` opera no integral; backfills futuros terminam com `assert_history_protected()` e a verificação de conservação.
- **Motivo:** P9 e a base da manipulação (6.3); B-1, B-3, I-5, I-7 e I-14 da revisão cruzada.
- **Consequência:** a lista de recebimentos mostra o ID do recipiente desde o recebimento, não só depois da etiqueta. Todo tipo de movimento novo precisa de regra de saldo em `container_balance` e `stock_conservation_problems`.
- **Revisar quando:** a 6.3 criar derivados de verdade, ou se luis preferir esconder o ID até a primeira etiqueta.

## Próximo passo

Aguarda aceite de luis. O aceite não autoriza merge: integrar depois dos PRs #2, #5, #6 e #7. A 6.2 (painel e QR com saldo) e a 6.3 (manipulação no banco) exigem aprovação própria.
