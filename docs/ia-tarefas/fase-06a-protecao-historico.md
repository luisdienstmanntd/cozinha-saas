# Tarefa: Fase 6, fatia 6.0a — proteção do histórico (P5) e adaptação de testes

- **ID:** fase-06a-protecao-historico
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Implementar fatia 6.0a da Fase 6")
- **Estado:** concluida (aceita por luis; PR em rascunho, sem merge)
- **Objetivo e aceite:** seção 10, fatia 6.0a, de `FASE_06_DESENHO.md` (PR #3): gatilhos append-only (UPDATE, DELETE, TRUNCATE) em `batch_receipts`, `containers` e `stock_movements`, inclusive para `service_role`; teste de catálogo "gatilho existe e está habilitado" na guarda; verificação reutilizável para o caminho B-1 da 6.1; fixture de integração sem DELETE de histórico nem de usuários com histórico; `db:reset` documentado. Aceite: testes 1 e 2 da seção 8 verdes, toda a bateria verde sem alterar asserções, rollback e reaplicação testados.
- **Branch / worktree / base:** `claude/fase-06a-protecao-historico`, a partir de `origin/claude/revisao-05-seguranca-produto` em `2804c58` (PR #2, aceito por luis em 13/11/2026 e ainda não mesclado na `main`).
- **Arquivos e recursos em uso:** nova migração `supabase/migrations/20261113020000_history_append_only.sql` e rollback `supabase/rollback/history_append_only.sql`; novo `supabase/tests/history_append_only.test.sql`; `supabase/tests/security_guard.test.sql` (só acréscimos); `scripts/catalog-fixture.mjs`; `tests/e2e/expiry-pagination.spec.mjs` (ID do recebimento concorrente); `docs/FASE_06A.md`; `README.md` e `IA_ESTADO.md` (uma linha). `DECISOES.md` não foi alterado (D-034 proposta em `FASE_06A.md` para evitar conflito com o PR #3).
- **Dependências e riscos:** Codex trabalha em paralelo na `main`; conflita com qualquer outra mudança de privilégios de `service_role` nas três tabelas ou de `scripts/catalog-fixture.mjs`. PR #3/#4 só têm documentação.
- **Próximo passo:** ver último checkpoint.

## Checkpoints

### 13/11/2026 01:55 UTC — Claude Code
- **Planejado / feito:** leitura de AGENTS, CLAUDE, coordenação, estado, desenho (seções 4.11, 8 e 10), revisão 05 (P5) e guarda do PR #2. luis confirmou o aceite da Fase 5 e do PR #2 e aprovou o início da 6.0a.
- **Alterações e commits:** branch criada; nenhum commit ainda.
- **Testes:** nenhum executado ainda.
- **Estado do ambiente:** container efêmero; Supabase local sendo iniciado.
- **Pendências / riscos:** nenhuma.
- **Próximo passo:** escrever pgTAP de proteção (falhando primeiro), depois migração.

### 13/11/2026 02:30 UTC — Claude Code
- **Planejado / feito:** pgTAP novo escrito antes da migração; migração com gatilhos por comando `ENABLE ALWAYS`, `service_role` só leitura e `private.assert_history_protected()`; três verificações acrescentadas à guarda; fixture sem DELETE de histórico; ID fixo do teste de paginação trocado por ID sorteado com o mesmo prefixo (adaptação não prevista na 4.11, ver `FASE_06A.md`); README atualizado.
- **Alterações e commits:** ver PR rascunho da branch `claude/fase-06a-protecao-historico` (base `claude/revisao-05-seguranca-produto`).
- **Testes:** falha primeiro reproduzida (rollback + `test:db`: 22 falhas; fixture antiga: 42501). Depois de `db:reset`: `test:db` 198 PASS; advisors sem ocorrências; `lint`, `typecheck`, `format:check`, `build` ok; `test` 76/76; `test:integration` 13/13 e `playwright` 3/3, cada um duas vezes no mesmo banco; rollback e reaplicação com dados conferidos. Job de CI no GitHub ainda não executado.
- **Estado do ambiente:** nenhum efeito fora do container efêmero.
- **Pendências / riscos:** aceite de luis; integrar depois do PR #2.
- **Próximo passo:** aguardar aceite. A 6.0b só começa com aprovação própria.

### 13/11/2026 02:00 UTC — Claude Code
- **Planejado / feito:** luis aceitou a 6.0a em 13/11/2026 01:53 UTC. Aceite não autoriza merge; a 6.0b aguarda aprovação separada.
- **Alterações e commits:** só este registro, `IA_ESTADO.md` e `FASE_06A.md`.
- **Testes:** CI do PR #5 em `ac76272`: `quality` sucesso; `banco-api-e2e` sucesso (pgTAP, advisors, integração e Playwright no GitHub).
- **Estado do ambiente:** nenhum efeito fora do container efêmero.
- **Pendências / riscos:** integrar depois do PR #2, quando luis autorizar.
- **Próximo passo:** aguardar aprovação de luis para a 6.0b.
