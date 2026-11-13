# Tarefa: Fase 6, fatia 6.2 — painel e QR com saldo

- **ID:** fase-06-2-painel-saldo
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Implementar fatia 6.2")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** seção 10 (6.2) de `FASE_06_DESENHO.md` (PR #3): `list_containers`, painel só com saldo, QR com saldo, remoção dos tetos no navegador; critério de 50 ms; teste 11 (parte de `list_containers`); E2E 32; contagens só com saldo.
- **Branch / worktree / base:** `claude/fase-06-2-painel-saldo`, a partir de `claude/fase-06-1-saldo-recipiente` (`ef76dff`, PR #8). Ordem de integração: PR #2 → #5 → #6 → #7 → #8 → este.
- **Arquivos e recursos em uso:** migração `supabase/migrations/20261113060000_list_containers.sql` e rollback `supabase/rollback/list_containers.sql`; `supabase/tests/list_containers.test.sql` (novo) e `rls_set_based.test.sql` (lista de políticas); `tests/integration/list-containers.test.mjs` (novo); `tests/e2e/*.spec.mjs`; `src/features/batches` (painel e gateway novo), `src/features/labels`, `src/features/movements/components/MovementPanel.tsx`, `src/app`, `src/test/fakeContainers.ts`; `docs/FASE_06_2.md`.
- **Dependências e riscos:** PRs #2, #5, #6, #7 e #8 sem merge; Codex trabalha na `main` (não tocar em `DECISOES.md`; D-038 proposta em `FASE_06_2.md`).
- **Próximo passo:** aceite de luis; 6.3 exige aprovação própria.

## Checkpoints

### 13/11/2026 03:50 UTC — Claude Code
- **Feito:** leitura do desenho, da 6.1 e das capturas; capturas "antes"; pgTAP de `list_containers` visto falhando sem a migração; primeira versão (saldo por agregação) com painel, QR, Vitest, integração e Playwright verdes.
- **Falha registrada:** benchmark do critério de 50 ms deu ~250 ms com 20 mil recipientes e 200 mil eventos. Decisão: plano B da seção 4.4 (saldo mantido na escrita).
- **Interrupção:** a sessão caiu por erro de API e foi retomada às 06:45 UTC; o Docker precisou ser reiniciado. Nada foi perdido (commit WIP local `bed7af8`).

### 13/11/2026 07:00 UTC — Claude Code
- **Feito:** `container_balances` com gatilhos, guarda e verificação contra o histórico; `list_containers` e `container_expiry_summary` lendo dela; testes novos; capturas "depois"; `FASE_06_2.md` com D-038 proposta e sugestões fora do escopo.
- **Testes:** benchmark 6 a 8 ms; `db:reset` + `test:db` 447 PASS; integração 17/17 duas vezes; Playwright 3/3; Vitest 87/87; lint, typecheck, format, build ok; advisors (warn) limpos; rollback com dados + bateria da 6.1 (371 e 16/16) verde; reaplicação com 0 problema. Detalhes em `FASE_06_2.md`.
- **Estado do ambiente:** banco local da nuvem descartável; nada fora dele.
- **Pendências / riscos:** D-038 (plano B) aguarda luis; sugestões visuais fora do escopo listadas, não implementadas.
- **Próximo passo:** aceite de luis.
