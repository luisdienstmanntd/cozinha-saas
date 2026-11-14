# Tarefa: Fase 7, fatia 7.5 — porcionar preparação e métricas de produção

- **ID:** fase-07-5-porcionar-preparacao
- **Responsável / sessão:** Claude Code (conversa "Desenhar etiqueta de preparação própria")
- **Estado:** aguardando aceite de luis
- **Objetivo e aceite:** implementar a 7.5 do `FASE_07_DESENHO.md` (porcionar preparação na tela, recusa de "abrir", métrica do piloto de produções) e a parte de banco da decisão B (porção com a validade do lote); D-054 proposta.
- **Branch / worktree / base:** `claude/fase-07-5-porcionar-preparacao`, sobre `claude/fase-07-4-etiqueta-preparacao` (PR #24, sem merge).
- **Arquivos e recursos em uso:** migração `20261114060000_production_portioning.sql`; `supabase/tests/production_portioning.test.sql`; `tests/integration/production-portioning.test.mjs`; `HandlingForm.tsx`, `messages.ts`, `BatchPanel.tsx`, `LabelView.tsx`; `tests/e2e/production.spec.mjs`; `PRE_PILOTO.md`.
- **Dependências e riscos:** PRs #22 a #24 precisam ser integrados antes deste; 7.6 a 7.9 exigem aprovação própria.
- **Próximo passo:** aceite de luis; merge só com pedido dele.

## Checkpoints

### 14/11/2026 ~17:10 UTC — Claude Code
- **Feito:** migração (horário mínimo pela produção, validade da porção igual à da origem, `pilot_metrics` com produção), tela de porcionar preparação, testes e documentação.
- **Testes:** primeira rodada do pgTAP falhou no teste 54 de `production.test.sql` (a validade nova vinha antes da recusa de abrir); a regra passou a valer só para porcionamento e o teste existente voltou a passar sem mudança. Depois: lint, typecheck, format, build ok; Vitest 275; pgTAP 1223; advisors sem problemas; integração 35; Playwright 17 (config local não versionada).
- **Pendências / riscos:** 3 pontos para luis e limites em `FASE_07_5.md`.
- **Próximo passo:** aceite de luis; 7.6 só com aprovação.
