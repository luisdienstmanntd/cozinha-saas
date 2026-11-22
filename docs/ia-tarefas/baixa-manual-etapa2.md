# Tarefa: D-073, etapa 2 — baixa manual em qualquer recipiente

- **ID:** baixa-manual-etapa2
- **Responsável / sessão:** Claude Code (thread "Implementar baixa manual em porções")
- **Estado:** concluida
- **Objetivo e aceite:** saída e histórico em porções/derivados, mensagem de saldo insuficiente, aviso de esgotado e E2E do exemplo da D-073. Aceite: bateria inteira verde sem enfraquecer testes, capturas vistas por luis. Registro: [BAIXA_MANUAL_ETAPA2.md](../BAIXA_MANUAL_ETAPA2.md).
- **Branch / worktree / base:** `claude/baixa-manual-recipiente`, base `main` `f4ad019`.
- **Arquivos e recursos em uso:** `MovementPanel.tsx`, `supabaseMovements.ts`, `movementGateway.ts`, `BatchPanel.tsx` (botão e painel de movimentações); testes novos.
- **Dependências e riscos:** sem migração. PR #67 (auditoria, só docs) e esta fatia acrescentam linhas em `IA_ESTADO.md` (conflito só de texto). Merge na `main` publica o site.
- **Próximo passo:** CI do PR e aceite de luis.

## Checkpoints

### 22/11/2026, 21:10 UTC — Claude Code

- **Feito:** implementação e testes.
- **Testes locais (Supabase local via Docker):** `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` OK; `npm test` 57 arquivos / 621 testes OK; `npm run test:ci-scripts` OK; `npm run test:e2e` 39 OK (2 novos). pgTAP e integração não rodados localmente: nenhuma mudança no banco; rodam na CI.
- **Estado do ambiente:** Supabase hospedado e Cloudflare de produção intocados.
- **Próximo passo:** CI e aceite.

### 22/11/2026, 22:15 UTC — Claude Code

- **Feito:** luis aceitou ("aceito tudo"), autorizando o merge e a publicação do site. PR #69 integrado na `main`.
- **Próximo passo:** nenhum nesta tarefa.
