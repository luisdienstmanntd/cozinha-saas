# Tarefa: Fase 7, fatia 7.6 — configurações da unidade

- **ID:** fase-07-6-configuracoes-unidade
- **Responsável / sessão:** Claude Code (conversa "Desenhar etiqueta de preparação própria")
- **Estado:** aguardando aceite de luis
- **Objetivo e aceite:** implementar a 7.6 do `FASE_07_DESENHO.md` (quem registra produção, janela da unidade, tempo sem etiqueta, regra da porção da decisão B), com matriz de papéis testada; D-055 proposta.
- **Branch / worktree / base:** `claude/fase-07-6-configuracoes-unidade`, sobre `claude/fase-07-5-porcionar-preparacao` (PR #25, sem merge).
- **Arquivos e recursos em uso:**
  - Banco: migração `20261114070000_establishment_settings.sql`; testes `supabase/tests/establishment_settings.test.sql` e `tests/integration/establishment-settings.test.mjs`.
  - Tela: `src/features/settings/*`; `ProductionPanel.tsx`, `production.ts`, `supabaseProduction.ts`; `HandlingForm.tsx`, `supabaseHandling.ts`, `family.ts`; `App.tsx`, `configureApp.ts`.
  - Testes de tela: `productionSettings.test.tsx`, `HandlingScreens.test.tsx` (1 novo), `tests/e2e/production.spec.mjs` (1 novo).
  - Listas fixas ampliadas: `rls_set_based.test.sql`, `security_guard.test.sql`.
- **Dependências e riscos:**
  - Os PRs #22 a #25 precisam ser integrados antes deste.
  - Dois testes antigos são instáveis (ver checkpoint).
- **Próximo passo:** aceite de luis; merge só com pedido dele; 7.7 a 7.9 só com aprovação própria.

## Checkpoints

### 14/11/2026 ~17:30 UTC — Claude Code
- **Feito:** migração, tela, testes e documentação da 7.6.
- **Testes:**
  - **Primeira rodada do pgTAP:** falhou o teste 67 de `production.test.sql`, porque o colaborador recebia uma mensagem nova no padrão. A recusa voltou a ser "Acesso negado." e o teste existente passou sem mudança.
  - **Lista de políticas de `rls_set_based`:** ampliada com `establishment_settings_read`.
  - **Bateria completa:** lint, typecheck, format e build ok; Vitest 289; integração 36; Playwright 18 (config local não versionada); advisors sem problemas.
  - **pgTAP 1284:** a bateria passou em 2 de 3 rodadas seguidas. Na outra falhou só o teste 26 de `handling_void.test.sql`, que já era instável: variou de 2 a 11 anulações em 12 rodadas na branch da 7.5, sem esta migração.
- **Pendências / riscos:**
  - Testes instáveis antigos: `handling_void` teste 26 e `list_containers` teste 38, este falhou na CI do PR #25. Correção proposta a luis, com aprovação própria.
  - 3 pontos para luis em `FASE_07_6.md`.
- **Próximo passo:** aceite de luis.
