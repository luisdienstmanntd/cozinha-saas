# Tarefa: Fase 7, fatia 7.7 — janela de registro por preparação

- **ID:** fase-07-7-janela-por-preparacao
- **Responsável / sessão:** Claude Code (conversa "Desenhar etiqueta de preparação própria")
- **Estado:** aguardando aceite de luis
- **Objetivo e aceite:** implementar a 7.7 do `FASE_07_DESENHO.md` (janela por preparação no catálogo, auditada); D-056 proposta.
- **Branch / worktree / base:** `claude/fase-07-7-janela-por-preparacao`, sobre `claude/fase-07-6-configuracoes-unidade` (PR #26, sem merge).
- **Arquivos e recursos em uso:**
  - Banco: migração `20261114080000_preparation_window.sql`; teste `supabase/tests/production_window.test.sql`; integração `tests/integration/preparation-window.test.mjs`.
  - Tela: `CatalogPanel.tsx`, `catalog.ts`, `catalogGateway.ts`, `supabaseCatalog.ts`, `ProductionPanel.tsx`.
  - Testes de tela: `PreparationWindow.test.tsx`, `productionSettings.test.tsx` (2 novos), `tests/e2e/production.spec.mjs` (1 novo).
- **Dependências e riscos:** os PRs #22 a #26 precisam ser integrados antes deste; 7.8 e 7.9 só com aprovação própria.
- **Próximo passo:** aceite de luis; merge só com pedido dele.

## Checkpoints

### 14/11/2026 ~21:15 UTC — Claude Code
- **Antes da 7.7:** aceite da 7.6 e da D-055 registrado, com a restrição do ponto 2 (opção "igual ou menor" oculta na tela). Ver `ia-tarefas/fase-07-6-configuracoes-unidade.md`.
- **Feito:** migração, tela, testes e documentação da 7.7.
- **Testes:** bateria completa verde na primeira rodada completa: lint, typecheck, format e build ok; Vitest 299; pgTAP 1327; advisors sem problemas; integração 37; Playwright 19 (config local não versionada). Nenhuma falha a registrar nesta fatia.
- **Cuidado de ordem:** o arquivo pgTAP novo se chama `production_window.test.sql` para rodar depois de `handling_void` (teste 26 depende da ordem física).
- **Pendência aberta com luis:** corrigir os dois testes instáveis; sem resposta, ficam sem alteração.
- **Próximo passo:** aceite de luis.
