# Tarefa: Fase 7, fatia 7.1 — preparação própria no banco

- **ID:** fase-07-1-producao-banco
- **Responsável / sessão:** Claude Code (conversa "Desenhar etiqueta de preparação própria")
- **Estado:** concluida (aceita por luis em 14/11/2026, 15:50 UTC)
- **Objetivo e aceite:** implementar a 7.1 do `FASE_07_DESENHO.md` (D-049); critérios 1–7, 9–11 do desenho, seção 13 (8 é da 7.2; 12 da 7.4).
- **Branch / worktree / base:** `claude/fase-07-1-producao-banco`, base `main` em `14b448c`.
- **Arquivos e recursos em uso:** migração `20261114040000_kitchen_production.sql`; `supabase/tests/production.test.sql`; `tests/integration/production.test.mjs`; listas fixas em `rls_set_based.test.sql` e `security_guard.test.sql`; esquemas e textos de lote em `src/features/{batches,occurrences,handling,labels,movements,catalog,pending}`.
- **Dependências e riscos:** 7.2 a 7.5 exigem aprovação própria; limite do horário de porcionamento (registro).
- **Próximo passo:** merge só com pedido de luis; 7.2 só com aprovação.

## Checkpoints

### 14/11/2026 ~15:50 UTC — Claude Code
- **Planejado / feito:** migração, testes pgTAP, integração e Vitest; tolerância das telas a lote sem código.
- **Alterações e commits:** branch acima, PR em rascunho.
- **Testes:** lint, typecheck, format, build ok; Vitest 242; pgTAP 1165; advisors sem problemas; integração 33; Playwright 15 (config local não versionada com o Chromium do ambiente).
- **Estado do ambiente:** banco local recriado com a migração nova.
- **Pendências / riscos:** ver "Limites conhecidos" em `FASE_07_1.md`.
- **Próximo passo:** aceite de luis; 7.2 só com aprovação.

### 14/11/2026 ~15:55 UTC — Claude Code
- **Feito:** registrado o aceite (3 pontos "sim") e a D-050 em `DECISOES.md`; respostas de luis ao questionário e configurações por unidade na seção 16 do desenho.
- **Testes:** só documentação desde o último checkpoint; CI do PR verde.
- **Próximo passo:** aguardar pedido de merge ou aprovação da 7.2.
