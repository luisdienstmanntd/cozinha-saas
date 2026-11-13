# Tarefa: Fase 6, fatia 6.4 — anulação de manipulação no banco

- **ID:** fase-06-4-anulacao
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Implementar fatia 6.4 (anulação no banco)")
- **Estado:** aceita (sem merge)
- **Objetivo e aceite:** seção 10 (6.4) de `FASE_06_DESENHO.md` (PR #3): `handling_voids`, `'transfer_reversal'`, `'handling_void'`, `void_handling` (4.10, 5.4). Aceite: testes 9, 10 (com anulação), 19 (anulação), 24 e 26 com anulação incluída; nenhuma tela de anulação.
- **Branch / worktree / base:** `claude/fase-06-4-anulacao`, a partir de `claude/fase-06-3-manipulacao` (`e528b1c`, PR #10). Ordem de integração: PR #2 → #5 → #6 → #7 → #8 → #9 → #10 → este.
- **Arquivos e recursos em uso:** migração `supabase/migrations/20261113080000_handling_void.sql` e rollback `supabase/rollback/handling_void.sql`; `supabase/tests/handling_void.test.sql` (novo); listas fixas em `security_guard.test.sql`, `container_balance.test.sql`, `rls_set_based.test.sql`; `tests/integration/handling-void.test.mjs` (novo); `src/features/movements`, `src/features/labels`; `docs/FASE_06_4.md`, `docs/PRODUCT_BRIEF.md`.
- **Dependências e riscos:** PRs #2, #5, #6, #7, #8, #9 e #10 sem merge; Codex trabalha na `main` (não tocar em `DECISOES.md`; decisão nova proposta em `FASE_06_4.md` como D-040).
- **Próximo passo:** integrar depois dos PRs #2, #5, #6, #7, #8, #9 e #10, só com luis; 6.5a exige aprovação própria.

## Checkpoints

### 13/11/2026 13:35 UTC — Claude Code
- **Feito:** leitura do desenho (4.3, 4.10, 5, 5.4, 6, 8, 10), da revisão cruzada (I-9) e de `FASE_06_3.md`; ambiente local (Node 24, Docker, Supabase); bateria da base verde (`test:db` 601, integração 18/18).
- **Próximo passo:** escrever pgTAP da anulação e a migração.

### 13/11/2026 14:30 UTC — Claude Code
- **Feito:** migração e rollback; `handling_void.test.sql` (114) e `handling-void.test.mjs`; listas fixas adaptadas (sem remover nem enfraquecer asserção); histórico lê os tipos novos; etiqueta de recipiente anulado recusada; `FASE_06_4.md` e brief.
- **Testes:** falha primeiro registrada (pgTAP, integração e Vitest); `db:reset` + `test:db` 719 PASS; integração 19/19; Vitest 95/95; Playwright 3/3; lint, typecheck, format, build ok; advisors (warn) limpos; rollback recusado com anulações e, sem elas, bateria da 6.3 verde contra o banco revertido; reaplicação verde.
- **Falha corrigida:** segunda FK de `stock_movements` para `containers` deixou ambígua a junção `containers!inner` da API (`PGRST201`); trocada por gatilho de inserção.
- **Pendências / riscos:** D-040 e três pontos aguardam luis.
- **Próximo passo:** aceite de luis.

### 13/11/2026 13:55 UTC — Claude Code
- **Aceite:** luis aprovou a fatia 6.4, a D-040 e os três pontos em 13/11/2026 13:54 UTC ("aprovado"). CI do PR #11 verde. Sem merge.
- **Próximo passo:** integração na ordem #2 → #5 → #6 → #7 → #8 → #9 → #10 → #11, só com luis. 6.5a aguarda aprovação própria.
