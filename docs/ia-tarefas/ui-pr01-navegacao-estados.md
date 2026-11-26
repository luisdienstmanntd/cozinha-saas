# Tarefa: PR-01 do roadmap de interface — correções de navegação e estados

- **ID:** ui-pr01-navegacao-estados
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** corrigir quatro defeitos confirmados no diagnóstico de 26/11/2026 (D1 a D4), sem mudar regra, dado, permissão, rota ou QR. Aceite: (a) Escape no botão "Menu" fecha o menu e deixa o foco no botão; (b) o aviso "Recebimento registrado." aparece só em Recebimentos; (c) carregamentos anunciados com `role="status"` e nome certo por área; (d) em 1366×768 o menu lateral não tem rolagem própria com Cadastros aberto, mantendo 44 px em toque; bateria inteira verde; luis aceita.
- **Branch / worktree / base:** `claude/ui-pr01-navegacao-estados`, base `main` `a504672`. O PR #81 (Equipe) entra depois, por decisão de luis; não foi tocado.
- **Arquivos:** `src/features/navigation/components/OperationsNav.tsx` e `.test.tsx`, `src/features/batches/components/BatchPanel.tsx` e `BatchPanel.test.tsx`, `ProductionPanel.tsx`, `LocationsPanel.tsx`, `SettingsPanel.tsx`, `src/app/styles.css`, `tests/e2e/navigation.spec.mjs`, `docs/IA_ESTADO.md`.
- **Dependências e riscos:** sem migração, sem banco hospedado. Conflito provável com o PR #81 em `OperationsNav.tsx` e `styles.css` (rebase quando ele entrar). Merge publica o site: só com autorização específica de luis.
- **Próximo passo:** luis revisar o PR em rascunho e as capturas; merge só com autorização específica (publica o site). PR-02 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code
- **Planejado:** apêndice A do diagnóstico (`DIAGNOSTICO_E_ROADMAP_INTERFACE.md`, nos arquivos do projeto, fora do repositório). Testes escritos antes das correções.
- **Feito:** (D1) Escape também no botão "Menu"; (D2) o aviso de recebimento ou de decisão de ocorrência aparece só na área em que nasceu; (D3) os carregamentos de Recebimentos/Validades, recipientes, ocorrências, produção, locais e configurações têm `role="status"`, e Validades diz "Carregando validades…"; (D4) com mouse (`pointer: fine`, ≥ 900 px) os itens do menu têm 36 px, em toque continuam 44 px.
- **Testes escritos antes da correção e falhando:** `OperationsNav.test.tsx` (Escape no botão), `BatchPanel.test.tsx` (aviso só em Recebimentos; carregamento como status por área), `tests/e2e/navigation.spec.mjs` (menu sem rolagem própria em 1366×768: 53 px antes, 0 depois; 44 px no celular).
- **Testes (26/11/2026):** lint OK, typecheck OK, format:check OK, `npm test` 62 arquivos / 665 testes OK, `test:ci-scripts` OK, build OK, `test:db` 28 arquivos / 1500 OK (em banco limpo; a primeira rodada no banco usado por E2E falhou 3 casos de `hosted_provisioning` por dados deixados, como já registrado), advisors sem alerta, integração 66 OK, E2E 44 OK (1 novo).
- **Ambiente:** E2E rodou com o Chromium do ambiente (`executablePath`), via config fora do repositório; nada alterado no hospedado.
- **Capturas antes/depois:** pasta `capturas-pr01-navegacao` nos arquivos do projeto (fora do repositório).
- **Fora do escopo, anotado:** o erro (`role="alert"`) de um recebimento também aparece em Validades; fica para outro PR se luis quiser.
