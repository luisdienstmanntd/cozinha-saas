# Tarefa: Indicadores da unidade (fatia A da auditoria, D-076)

- **ID:** indicadores-unidade
- **Responsável / sessão:** Claude Code (thread "Criar painel de métricas do piloto")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** dar tela à função `pilot_metrics`, só leitura, para o proprietário, sem migração e sem tocar no Supabase hospedado. Aceite: bateria inteira verde (lint, tipos, vitest, scripts de CI, build, pgTAP, advisors, integração, E2E), testes novos para a tela, capturas antes/depois e aceite de luis. Desenho: seção 5, fatia A, de `docs/AUDITORIA_FUNCIONALIDADES_SEM_TELA.md` (PR #79, ainda em rascunho).
- **Branch / worktree / base:** `claude/painel-indicadores-piloto`, base `main` `1baa836`.
- **Arquivos:** `src/features/metrics/` (novo: domínio, gateway, painel, testes), `navigation/domain/areas.ts`, `navigation/domain/workspaceAreas.ts` (+ teste), `navigation/components/OperationsNav.tsx`, `app/App.tsx`, `app/configureApp.ts`, `app/styles.css`, `tests/e2e/metrics.spec.mjs` (novo), `docs/DECISOES.md`, `docs/IA_ESTADO.md`.
- **Dependências e riscos:** nenhuma migração. Conflito possível só de texto com o PR #79 em `IA_ESTADO.md`. A função não restringe a proprietário no banco (ver D-076).
- **Próximo passo:** luis revisar as capturas e a prévia; merge só com autorização específica (publica o site).

## Checkpoints

### 26/11/2026, 00:45 UTC — Claude Code

- **Feito:** área Indicadores (proprietário), períodos 7/30/90 dias, grupos de indicadores, atalho "Ver vencidos em Validades", estados de carregamento e erro sem detalhe técnico, layout de celular sem rolagem lateral.
- **Testes novos:** `src/features/metrics/metrics.test.tsx` (domínio, gateway, painel: grupos, participações, tempos, troca de período, erro e nova tentativa, sem termos internos), `workspaceAreas.test.ts` (área só do proprietário), `tests/e2e/metrics.spec.mjs` (proprietário com número vindo do banco e atalho; colaborador sem a área e endereço direto volta à Visão geral).
- **Ambiente:** Supabase local subiu nesta máquina de nuvem (Docker); resultados da bateria no PR. Nada alterado no hospedado nem no Cloudflare.
- **Testes (locais, 26/11/2026):** `npm run lint` OK, `npm run typecheck` OK, `npm run format:check` OK, `npm test` 62 arquivos / 662 testes OK, `npm run test:ci-scripts` 29 OK, `npm run build` OK, `npm run test:db` 28 arquivos / 1500 OK, advisors de segurança sem alerta, `npm run test:integration` 66 OK, `npm run test:e2e` 43 OK (2 novos). Observação: uma primeira rodada do pgTAP depois de rodar E2E no mesmo banco falhou 3 casos em `hosted_provisioning` (dados que sobram do E2E); com `supabase db reset --local` passou 1500/1500, como já registrado para este ambiente. A CI roda em banco limpo.
- **Capturas:** antes (menu sem Indicadores) e depois (menu, página vazia, página com vencido, celular) na pasta do projeto, fora do repositório.
