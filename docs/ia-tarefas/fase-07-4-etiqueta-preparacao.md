# Tarefa: Fase 7, fatia 7.4 — etiqueta PDF "Preparação própria"

- **ID:** fase-07-4-etiqueta-preparacao
- **Responsável / sessão:** Claude Code (conversa "Desenhar etiqueta de preparação própria")
- **Estado:** aguardando aceite de luis
- **Objetivo e aceite:** implementar a 7.4 do `FASE_07_DESENHO.md` (seção 5.2, critério 12); D-053 proposta.
- **Branch / worktree / base:** `claude/fase-07-4-etiqueta-preparacao`, sobre `claude/fase-07-3-producao-tela` (PR #23, sem merge).
- **Arquivos e recursos em uso:** `src/features/labels/**` (PDF, gateway, página do recipiente), `ProductionPanel.tsx`, `App.tsx`, `forbiddenTexts.test.ts`, `tests/e2e/production.spec.mjs`.
- **Dependências e riscos:** PRs #22 e #23 precisam ser integrados antes deste; 7.5 exige aprovação própria.
- **Próximo passo:** aceite de luis; merge só com pedido dele.

## Checkpoints

### 14/11/2026 ~17:20 UTC — Claude Code
- **Feito:** modelo "Preparação própria" (integral e porção), recusas, botões de etiqueta; sem migração.
- **Testes:** primeira rodada do Vitest falhou só no teste da 7.1 que esperava a recusa de todo lote produzido (ajustado para a falha fechada sem dados da produção). O lint acusou `Buffer` sem importação no E2E novo (importado de `node:buffer`, como em `handling.spec.mjs`). Depois: lint, typecheck, format, build ok; Vitest 273; pgTAP 1202; advisors sem problemas; integração 34; Playwright 17 (config local não versionada).
- **Pendências / riscos:** 3 pontos para luis e limites em `FASE_07_4.md`.
- **Próximo passo:** aceite de luis; 7.5 só com aprovação.
