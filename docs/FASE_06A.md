# Fase 6, fatia 6.0a — proteção do histórico (P5) e adaptação de testes

Implementada por Claude Code em 13/11/2026, conforme a seção 10 de `FASE_06_DESENHO.md` (PR #3) e a decisão B-1 da revisão cruzada (PR #4, D-033). Registro da tarefa: `ia-tarefas/fase-06a-protecao-historico.md`.

**Base:** branch do PR #2 (`claude/revisao-05-seguranca-produto`, `2804c58`). luis aprovou o início da 6.0a e confirmou o aceite da Fase 5 e do PR #2 em 13/11/2026, mas o PR #2 ainda não está mesclado na `main`. Este PR aponta para a branch dele e deve ser integrado depois dele.

**Sem mudança de produto.** Nenhuma tela, função de escrita ou mensagem ao usuário mudou. Nenhum deploy.

## O que mudou

### Banco (`20261113020000_history_append_only.sql`, rollback `history_append_only.sql`)

1. **`private.reject_history_change()`**: função única que recusa a operação com `55000` ("Histórico não pode ser alterado nem apagado.").
2. **Gatilhos `<tabela>_append_only`** em `batch_receipts`, `containers` e `stock_movements`: `BEFORE UPDATE OR DELETE OR TRUNCATE`, **por comando**, com **`ENABLE ALWAYS`**.
   - Por comando, e não por linha: o gatilho também cobre `TRUNCATE`, que não dispara gatilhos por linha, e recusa o comando mesmo quando nenhuma linha seria afetada.
   - `ENABLE ALWAYS` em vez do padrão: o gatilho dispara também com `session_replication_role = replica`, que ignora os gatilhos comuns. O desenho (4.11) dizia `tgenabled = 'O'`; `'A'` é mais restrito e a verificação final exige `'A'`.
   - Recusa até o dono das tabelas (papel que roda migrações). Não protege contra o superusuário do banco, como já estava registrado.
3. **`service_role` só lê o histórico**: perdeu `DELETE` (que existia só para a limpeza dos testes) e `TRUNCATE`, `REFERENCES` e `TRIGGER`, que vinham dos privilégios padrão do Supabase. Também não tem `INSERT` nem `UPDATE`: o histórico só nasce pelas funções autorizadas. Continua com `MAINTAIN` (VACUUM/ANALYZE, sem alterar dados), também dos privilégios padrão.
4. **`private.assert_history_protected()`**: verificação reutilizável do caminho B-1. Recusa com `55000` se, em qualquer uma das três tabelas, o gatilho faltar, estiver desabilitado, não for `ALWAYS`, for por linha, não cobrir UPDATE, DELETE e TRUNCATE ou chamar outra função; e se `anon`, `authenticated` ou `service_role` tiverem qualquer privilégio de escrita, `REFERENCES` ou `TRIGGER`. A própria migração chama a função no fim. A migração da 6.1 deve: numa única transação, `alter table ... disable trigger <nome>` só nos gatilhos necessários, executar o backfill, `alter table ... enable always trigger <nome>` e chamar `select private.assert_history_protected();` no fim. Se algo faltar, a migração inteira é desfeita.

Nada executa as duas funções além do dono: sem `EXECUTE` para `PUBLIC`, `anon`, `authenticated` nem `service_role`.

### Testes

- **Novo `supabase/tests/history_append_only.test.sql` (40 verificações):**
  - dono das tabelas: UPDATE, DELETE e TRUNCATE recusados nas três tabelas com `55000`; comando sem linhas também recusado; modo réplica não contorna; o movimento continua registrado e inalterado;
  - `service_role`: UPDATE, DELETE e TRUNCATE recusados nas três tabelas; não desliga gatilho nem entra em modo réplica; continua lendo;
  - proprietário com sessão: não apaga, não trunca, não desliga gatilho;
  - caminho B-1: com o gatilho suspenso dentro da transação o backfill consegue atualizar e a verificação recusa; depois de `enable always` a verificação aceita e a recusa volta. A verificação também recusa gatilho reabilitado sem `ALWAYS`, gatilho ausente, gatilho sem TRUNCATE, gatilho que chama outra função e `DELETE` devolvido a `service_role`.
- **`security_guard.test.sql` (PR #2), só acréscimos (37 → 40):** toda tabela da lista fixa de histórico tem gatilho de proteção existente e habilitado; `service_role` só lê o histórico; a verificação final aceita o estado atual. Tabela nova de histórico entra nessa lista e na de `private.assert_history_protected()`.

### Adaptações de preparação (B-3, tabela da seção 4.11)

Nenhuma asserção foi alterada, removida, pulada ou enfraquecida.

| Onde | Antes | Agora | O que continua verificado |
|---|---|---|---|
| `scripts/catalog-fixture.mjs` | Apagava movimentos, recipientes, recebimentos, cadastros, vínculos, unidades, organizações e usuários com `service_role` | Se as organizações do teste não têm histórico, limpa tudo como antes. Se têm, não apaga nada: histórico, cadastros e usuários que ele referencia ficam no banco local, isolados por organizações, unidades e e-mails aleatórios. `npm run db:reset` volta a um banco vazio; a CI parte de banco novo | Todas as asserções de isolamento, concorrência, reenvio e revogação dos testes de integração e dos dois testes de navegador que usam a fixture |
| `tests/e2e/expiry-pagination.spec.mjs` | Recebimento concorrente com ID fixo `00000000-0000-4000-8000-000000000001`, que a limpeza apagava | ID com o mesmo prefixo de zeros e o restante sorteado: continua menor que todos os outros (fica atrás do cursor da paginação) e não colide na execução seguinte. **Não previsto na tabela da 4.11**; encontrado ao rodar a bateria duas vezes no mesmo banco | "Vencidos: 1001" durante a paginação concorrente e "Vencidos: 1002" depois de atualizar, sem mudança |
| `identity.test.mjs` | Apaga unidades, vínculos e organizações | Nenhuma: essas tabelas não entram em P5 | Sem mudança |

`README.md`: a descrição da limpeza da integração foi atualizada com o `db:reset`.

## Evidências (container em nuvem, 13/11/2026)

Supabase local (Postgres 17.11) com Docker; Node 24.22.3; Playwright com o Chromium do container por uma config local não versionada (só muda o caminho do navegador).

| Comando | Resultado |
|---|---|
| Falha primeiro: rollback aplicado + `supabase test db` | **FAIL**: 22 das 30 primeiras verificações do teste novo falharam e a função de verificação não existia |
| Falha primeiro: fixture antiga com a migração aplicada (`node --test tests/integration/movements.test.mjs`) | **FAIL** na limpeza: `Operação local falhou (42501)` |
| `npm run db:reset` + `npm run test:db` | PASS, 6 arquivos, 198 verificações (batches 17, catalog 39, history_append_only 40, identity 33, movements 29, security_guard 40) |
| `npx supabase db advisors --type security --level warn --fail-on warn` | No issues found |
| `npm run lint`, `typecheck`, `format:check`, `build` | sucesso (build mantém o aviso antigo de chunk grande) |
| `npm run test` | 76 de 76 |
| `npm run test:integration` | 13 de 13, duas vezes seguidas no mesmo banco |
| `playwright test` | 3 de 3, duas vezes seguidas no mesmo banco (antes da correção do ID fixo, a segunda execução falhava) |
| Rollback com 2.018 recebimentos de teste no banco, conferência dos privilégios, reaplicação e `test:db` | privilégios de `service_role` voltaram exatamente a `rdDxtm` e depois a `rm`; gatilhos `A` nas três tabelas; PASS 198 |

CI no GitHub (PR #5, `ac76272`): `quality` e `banco-api-e2e` com sucesso.

## Riscos e limites

- **Banco local cresce** entre execuções de teste sem `db:reset` (o teste de paginação deixa ~1.000 recebimentos por execução). Não afeta resultados porque cada execução usa organizações aleatórias.
- **Rollback reabre a brecha**: depois dele, a chave de serviço volta a poder apagar histórico. Só deve ser usado junto com a reversão das fatias seguintes.
- **Superusuário** do banco continua podendo desligar gatilhos e apagar; P5 protege contra erro de aplicação e de script, não contra quem administra o banco.
- **Correção de dado errado** continua sendo por novo evento (anulação, D-018). Não há caminho para editar um recebimento; se surgir a necessidade, ela precisa de função auditada própria, não de suspensão de gatilho.
- **Conflito com trabalho paralelo**: qualquer mudança do Codex na `main` que conceda privilégio de escrita a `service_role` nessas tabelas, ou que faça UPDATE nelas, será recusada pela guarda e pelos gatilhos.

## Decisão proposta para `DECISOES.md`

O `DECISOES.md` desta base (PR #2) termina na D-018; D-019 a D-033 estão no PR #3. Para não criar conflito de numeração, a decisão fica aqui e entra como **D-034** quando o PR #3 for integrado:

- **Decisão:** histórico append-only por gatilho por comando `ENABLE ALWAYS` em recebimentos, recipientes e movimentos; `service_role` só lê; qualquer suspensão para backfill termina com `private.assert_history_protected()` na mesma transação.
- **Motivo:** P5 (S6) e B-1: chave de serviço e scripts não podem apagar auditoria, e a proteção precisa ser verificável ao fim de cada migração.
- **Consequência:** testes não limpam histórico; banco local de testes só volta a vazio por `db:reset`; correções continuam por novos eventos.
- **Revisar quando:** surgir tabela nova de histórico (entra nas duas listas fixas), ou se for necessário um papel de manutenção com escrita.

## Próximo passo

**Aceita por luis em 13/11/2026.** O aceite não autoriza merge: integrar depois do PR #2, quando luis autorizar. A 6.0b (P3, RLS por conjunto) só começa com aprovação própria.
