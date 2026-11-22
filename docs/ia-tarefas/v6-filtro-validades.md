# Tarefa: V6 — filtrar Validades pelos contadores (implementação)

- **ID:** v6-filtro-validades
- **Responsável / sessão:** Claude Code (thread "Propor filtros de validade pelos contadores")
- **Estado:** concluida
- **Objetivo e aceite:** os quatro contadores de Validades filtram a lista pelo servidor; os da Visão geral levam a Validades filtrada; o filtro fica no endereço. Aceite: bateria inteira verde na CI sem enfraquecer testes, capturas revisadas por luis. Proposta: `docs/V6_PROPOSTA.md` (PR #57). Decisão: D-072.
- **Branch / worktree / base:** `claude/v6-filtro-validades`, base `main` `820f77d`.
- **Arquivos e recursos em uso:** `src/features/batches/domain/expiryFilter.ts` (novo), `BatchPanel.tsx`, `OperationsOverview.tsx`, `navigation/domain/areas.ts`, `app/App.tsx`, `app/styles.css`; testes novos em `expiryFilter.test.ts`, `BatchPanelV6.test.tsx`, `OperationsOverview.test.tsx`, `areas.test.ts`, `supabase/tests/list_containers.test.sql` (4 casos), `tests/e2e/expiry-filter.spec.mjs` (2 casos).
- **Dependências e riscos:** PR #56 (Codex, D-071) mexe em `BatchPanel.tsx` na parte de Recebimentos (outra região) e em `IA_ESTADO.md`/`DECISOES.md`/roadmap (conflito só de texto, conciliar mantendo as duas entradas). Sem migração; hospedado intocado.
- **Próximo passo:** nenhum. Integrada na `main` em 22/11/2026 (PR #59, `2f4f9bd`).

## Checkpoints

### 22/11/2026, 00:45 UTC — Claude Code
- **Planejado / feito:** função pura do intervalo (cursor de início e corte do fim), filtro controlado pelo endereço no Workspace, contadores como botões `aria-pressed`, "Limpar filtro", regra com "Mostrar esgotados", contadores da Visão geral como links (Ctrl+clique abre outra aba).
- **Alterações e commits:** ver o PR da branch.
- **Testes:** locais — `npm run lint` OK, `npm run typecheck` OK, `npm run format:check` OK, `npm test` 56 arquivos / 612 testes OK, `npm run build` OK, `npm run test:ci-scripts` 29 OK. pgTAP, integração e E2E NÃO executados aqui: o Supabase local não sobe neste ambiente de nuvem; rodam pela CI do PR.
- **Estado do ambiente:** nada alterado no Supabase hospedado nem no Cloudflare de produção.
- **Pendências / riscos:** resultado da CI (pgTAP novo e E2E novo); capturas; aceite.
- **Próximo passo:** conferir a CI e anexar capturas ao PR.

### 22/11/2026, 01:00 UTC — Claude Code
- **Planejado / feito:** CI do PR #59 verde em `183b409` (quality e banco-api-e2e: pgTAP 1500, E2E 37). luis autorizou no cartão de decisão o merge, aceitando que o Cloudflare publique o site a partir da `main`. PR #59 mesclado com commit de merge `2f4f9bd`.
- **Estado do ambiente:** Supabase hospedado intocado (sem migração nesta fatia). Publicação do Cloudflare feita pelo merge, com aceite de luis.
- **Pendências / riscos:** PR #56 (Codex, D-071) terá conflito só de texto em `DECISOES.md`, `IA_ESTADO.md` e roadmap; conciliar mantendo as duas entradas.
- **Próximo passo:** nenhum para a V6.

