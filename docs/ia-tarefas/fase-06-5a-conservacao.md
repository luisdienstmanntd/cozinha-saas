# Tarefa: Fase 6, fatia 6.5a — conservação, temperatura e ocorrências no banco

- **ID:** fase-06-5a-conservacao
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Implementar fatia 6.5a (temperatura e ocorrências)")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** seção 10 (6.5a) de `FASE_06_DESENHO.md` (PR #3): colunas da 4.8, `occurrences`, `occurrence_decisions`, `decide_occurrence`, bloqueio em `record_movement` e `handle_container`, ocorrência `late_handling` aceitando manipulação fora da janela. Aceite: testes 6 (parte tardia), 14, 19 (decisão) e 22; sem tela nova (6.5b).
- **Branch / worktree / base:** `claude/fase-06-5a-conservacao`, a partir de `claude/fase-06-4-anulacao` (`0cc4b70`, PR #11). Ordem de integração: PR #2 → #5 → #6 → #7 → #8 → #9 → #10 → #11 → este.
- **Arquivos e recursos em uso:** migração `supabase/migrations/20261113090000_conservation_occurrences.sql` e rollback `supabase/rollback/conservation_occurrences.sql`; `supabase/tests/occurrences.test.sql` (novo); `container_handling.test.sql`, `rls_set_based.test.sql`, `security_guard.test.sql`; `tests/integration/occurrences.test.mjs` (novo); `src/features/labels`; `docs/FASE_06_5A.md`, `docs/PRODUCT_BRIEF.md`.
- **Dependências e riscos:** PRs #2, #5, #6, #7, #8, #9, #10 e #11 sem merge; Codex trabalha na `main` (não tocar em `DECISOES.md`; decisão nova proposta em `FASE_06_5A.md` como D-041).
- **Próximo passo:** aceite de luis (fatia, D-041 e cinco pontos); 6.5b exige aprovação própria.

## Checkpoints

### 13/11/2026 14:05 UTC — Claude Code
- **Feito:** leitura do desenho (3, 4.8, 5, 6, 8, 10), da revisão cruzada (B-2, I-3, I-6, S-2) e de `FASE_06_4.md`; ambiente local (Node 24, Docker, Supabase); bateria da base verde (`test:db` 719, integração 19/19 depois de uma falha transitória logo após `db:start`).
- **Próximo passo:** migração e testes.

### 13/11/2026 14:13 UTC — Claude Code (WIP publicado em 17:35 UTC após queda da sessão)
- **Feito:** migração, rollback, `occurrences.test.sql` (176), `occurrences.test.mjs`, ajustes nas listas fixas e nos testes da 6.3 que esperavam "ainda não aceito". `test:db` 906 PASS, integração 20/20.
- **Falhas corrigidas:** gatilho adiado mudava o erro de TRUNCATE (trocado por `occurrence_problems()`); CHECK bidirecional de `late` quebrava fixtures (ficou unidirecional).
- **Próximo passo:** etiqueta de derivado tardio, documentação, PR.

### 13/11/2026 17:55 UTC — Claude Code
- **Feito:** recusa de etiqueta de derivado de manipulação tardia (gateway, tela, PDF); `FASE_06_5A.md`; brief.
- **Testes:** falha primeiro (pgTAP com banco revertido; Vitest 3); `db:reset` + `test:db` 906 PASS; integração 20/20; Vitest 98/98; Playwright 3/3; lint, typecheck, format, build ok; advisors limpos; rollback recusado com ocorrências; sem elas, bateria da 6.4 verde contra o banco revertido; reaplicação sobre dados da 6.4 verde.
- **Pendências / riscos:** D-041 e cinco pontos aguardam luis; assinatura antiga de `receive_batch` sai na 6.5b.
- **Próximo passo:** aceite de luis.
