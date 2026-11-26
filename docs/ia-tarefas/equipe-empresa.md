# Tarefa: Equipe da empresa pelo site (fatia B da auditoria, D-077)

- **ID:** equipe-empresa
- **Responsável / sessão:** Claude Code (thread "Criar gestão de equipe no site")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** o proprietário lista a equipe, vincula conta já criada, troca papel, revoga e restaura acesso pelo site, com regras e auditoria no banco. Aceite: bateria inteira verde (lint, formato, tipos, vitest, scripts de CI, build, pgTAP, advisors, integração, E2E), testes novos, capturas antes/depois e aceite de luis. Desenho: seção 5, fatia B, de `docs/AUDITORIA_FUNCIONALIDADES_SEM_TELA.md` (PR #79) e resumo aprovado na thread.
- **Branch / worktree / base:** `claude/gestao-equipe`, base `main` `a504672`.
- **Arquivos:** `supabase/migrations/20261126000000_team_management.sql` (novo), `supabase/tests/team_management.test.sql` (novo), `tests/integration/team-management.test.mjs` (novo), `src/features/team/` (novo: domínio, gateway, painel, testes), `navigation/domain/areas.ts`, `navigation/domain/workspaceAreas.ts` (+ teste), `navigation/components/OperationsNav.tsx`, `app/App.tsx`, `app/configureApp.ts`, `app/styles.css`, `tests/e2e/team.spec.mjs` (novo), `tests/e2e/areas.mjs`, `docs/DECISOES.md`, `docs/IA_ESTADO.md`, `docs/FASE_EQUIPE.md` (novo).
- **Dependências e riscos:** migração nova; o hospedado só recebe com autorização específica de luis (ver `docs/FASE_EQUIPE.md`, "Aplicação no hospedado"). Merge publica o site: sem a migração aplicada antes, a área Equipe mostraria erro de carregamento.
- **Próximo passo:** luis revisar capturas e prévia; autorizar (1) a migração no hospedado e (2) o merge, nessa ordem.

## Checkpoints

### 26/11/2026, 01:30 UTC — Claude Code

- **Feito:** migração com funções `list/add/set_role/revoke/restore_team_member` (privadas SECURITY DEFINER + fachada SECURITY INVOKER), cadeado por empresa, gatilhos de auditoria; área Equipe na interface.
- **Ambiente:** Supabase local nesta máquina de nuvem (Docker iniciado manualmente). E2E local com o Chromium pré-instalado por configuração local não versionada. Nada alterado no hospedado nem no Cloudflare.
- **Testes:** ver o checkpoint seguinte e o PR.

### 26/11/2026, 01:35 UTC — Claude Code

- **Testes (locais, banco recriado com `npm run db:reset`):** `npm run lint` OK, `npm run format:check` OK, `npm run typecheck` OK, `npm test` 63 arquivos / 678 testes OK, `npm run test:ci-scripts` 29 OK, `npm run build` OK, `npm run test:db` 29 arquivos / 1575 OK, `supabase db advisors --type security --level warn --fail-on warn` sem alerta, `npm run test:integration` 68 OK (2 novos), `npm run test:e2e` 45 OK (2 novos).
- **Observação:** o E2E imprime avisos de React "two children with the same key" já nos testes de catálogo e vírgula decimal, que não usam a área nova; não bloqueiam e ficam para outra tarefa.
- **Capturas:** antes (menu Configurações sem Equipe, desktop e celular) e depois (lista, recusa genérica, confirmação de revogação, revogados, celular) em `capturas-equipe-d077/` na pasta do projeto.
- **Próximo passo:** aceite de luis; depois, autorização para a migração no hospedado e, separada, para o merge (ver `FASE_EQUIPE.md` §6).
