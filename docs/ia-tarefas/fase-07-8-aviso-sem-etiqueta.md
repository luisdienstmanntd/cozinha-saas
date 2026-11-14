# Tarefa: Fase 7, fatia 7.8 — aviso de produção sem etiqueta

- **ID:** fase-07-8-aviso-sem-etiqueta
- **Responsável / sessão:** Claude Code (conversa "Desenhar etiqueta de preparação própria")
- **Estado:** pronta, aguardando aceite de luis (D-057 proposta, 3 pontos)
- **Objetivo e aceite:** implementar a 7.8 do `FASE_07_DESENHO.md`: registrar quando a etiqueta do recipiente integral da produção foi baixada (sem criar estoque, D-003) e avisar na tela de Produção "sem etiqueta há X" acima do tempo configurado (D-055). O banco não bloqueia. Autorizada por luis em 14/11/2026, 20:47 UTC, sem antecipar a 7.9.
- **Branch / worktree / base:** `claude/fase-07-8-aviso-sem-etiqueta`, sobre `claude/fase-07-7-janela-por-preparacao` (PR #27, sem merge). Inclui a correção dos testes instáveis (PR #28).
- **Arquivos e recursos em uso:**
  - Banco: migração `20261114090000_production_label.sql`; teste `supabase/tests/production_label.test.sql`; listas fixas em `rls_set_based.test.sql` e `security_guard.test.sql` (só cresceram); integração `tests/integration/production-label.test.mjs`.
  - Tela: `ProductionPanel.tsx`, `production.ts`, `productionGateway.ts`, `supabaseProduction.ts`, `DownloadLabels.tsx`.
  - Testes de tela: `productionLabelWarning.test.tsx`, `tests/e2e/production.spec.mjs` (1 novo).
- **Dependências e riscos:** os PRs #22 a #27 precisam ser integrados antes; 7.9 só com aprovação própria.
- **Próximo passo:** aceite de luis; merge só com pedido dele.

## Checkpoints

### 14/11/2026 ~22:00 UTC — Claude Code
- **Feito:** migração, tela, testes e documentação da 7.8.
- **Testes:** bateria completa verde: lint, typecheck, format e build ok; Vitest 308; pgTAP 1360 (3 rodadas); advisors sem problemas; integração 38; Playwright 20 (config local não versionada).
- **Falhas no caminho (corrigidas no próprio teste novo):** contagem de recipientes novos errada (2 em vez de 4) e verificação dependente da ordem de duas linhas da mesma transação. Nenhum teste existente foi enfraquecido; só duas listas fixas de segurança cresceram.
- **Limites:** download pela página do QR não é registrado; o aviso só aparece na tela de Produção.
- **Próximo passo:** aceite de luis (3 pontos e D-057).
