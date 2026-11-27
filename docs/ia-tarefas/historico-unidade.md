# Tarefa: Histórico da unidade com exportação CSV

- **ID:** historico-unidade
- **Responsável / sessão:** Claude Code (thread do projeto)
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** área Histórico (só proprietário, só leitura) com os registros já guardados, filtros e CSV da lista mostrada. Sem migração, sem mudança de RLS, sem tocar no Supabase hospedado. Aprovada por luis em 27/11/2026 (fatia F).
- **Branch / worktree / base:** `claude/historico-unidade`, base `main` `12fb3f8`
- **Arquivos e recursos em uso:** `src/features/history/*`, `src/features/navigation/*` (área nova), `src/app/App.tsx`, `src/app/configureApp.ts`, `src/app/styles.css`, `tests/integration/history.test.mjs`, `tests/e2e/history.spec.mjs`, `docs/HISTORICO_UNIDADE.md`, `docs/DECISOES.md` (D-079), `docs/IA_ESTADO.md`. Supabase local descartável usado só para testar.
- **Dependências e riscos:** PRs abertos #81 (equipe, D-077), #98 e #102 (fornecedores) tocam `DECISOES.md` e `IA_ESTADO.md`: conflito esperado só nesses dois arquivos. D-078 aparece no código (barra inferior) sem entrada em `DECISOES.md`; este PR usa D-079.
- **Próximo passo:** luis revisar o PR em rascunho; merge só com autorização (publica o site).

## Checkpoints

### 27/11/2026 — Claude Code

- **Feito:** domínio, gateway, tela, CSV, área e testes. Lint, tipos, formato, Vitest (826 + novos), build, integração e E2E do histórico, da navegação, da barra inferior e do tablet verdes no Supabase local.
- **Não executado:** a bateria inteira de pgTAP e de integração (não houve migração) e todos os E2E; a CI roda tudo.
- **Pendência:** a mensagem `Encountered two children with the same key` do E2E já existe na `main`, não vem desta fatia.
