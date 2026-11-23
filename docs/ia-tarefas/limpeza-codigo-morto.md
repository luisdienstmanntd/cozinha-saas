# Tarefa: limpeza de código e arquivos sem uso

- **ID:** limpeza-codigo-morto
- **Responsável / sessão:** Claude Code (thread "Limpar código e arquivos duplicados")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** remover só o que está provadamente sem uso, sem regressão: lint, tipos, prettier, Vitest, scripts da CI e build verdes localmente; pgTAP, integração e E2E verdes na CI. Nenhum teste de comportamento ativo removido ou enfraquecido; migrações, rollbacks, `FASE_*.md`, decisões e capturas preservados.
- **Branch / worktree / base:** `claude/limpeza-codigo`, base `main` 896c03c.
- **Arquivos e recursos em uso:** `src/features/navigation/` (UnitNav, catalogSections, areas), `src/app/styles.css` (regras `.unit-nav*`). Sem banco, migração ou serviço hospedado.
- **Dependências e riscos:** Codex trabalha na `main` (PR #68 toca `IdentityHome.tsx` e `navigation.spec.mjs`, sem sobreposição). Merge publica o site: só com aval de luis.
- **Próximo passo:** luis revisa o PR e decide os itens "mantidos por dúvida".

## Checkpoints

### 23/11/2026 02:10 UTC — Claude Code
- **Planejado / feito:** levantamento com o compilador TypeScript (arquivos não importados, exports usados só em testes), varredura de classes CSS sem uso, arquivos idênticos, dependências do `package.json`, exports de scripts e testes `.mjs`, capturas sem referência e blocos repetidos.
- **Removido (prova):**
  - `navigation/components/UnitNav.tsx` e `UnitNav.test.tsx` (3 testes): menu da V1 substituído pelo `OperationsNav` da Mesa operacional; nenhum arquivo de produção o importa (só o próprio teste).
  - `navigation/domain/catalogSections.ts`: importado apenas por `UnitNav.tsx`.
  - `areasFor`, `resolveArea` e `DEFAULT_AREA` em `navigation/domain/areas.ts` e seus 4 testes: usados só pelo teste e pelo `UnitNav`; a regra ativa de áreas por perfil é `workspaceAreas.ts`, coberta por `workspaceAreas.test.ts`. `parseArea`, `parsePlace` e `placeSearch` (ativos) e seus testes ficam.
  - 22 regras CSS `.unit-nav*` (e um `@media` que ficou vazio): só o `UnitNav` usava essas classes; os E2E procuram a navegação pelo nome acessível "Áreas da unidade", que é do `OperationsNav`.
- **Mantido por dúvida (decisão de luis):** ver PR. Capturas em `docs/capturas/` (referenciadas por pasta nos relatórios das fases), `COZZIGO_UI_UX_ROADMAP.md` na raiz (editado pelo Codex em 22/11), `DEBATE_PRELIMINAR.md`, `prompts/`, exports usados só internamente, blocos de JSX repetidos entre formulários.
- **Sem achado:** nenhum arquivo idêntico versionado; todas as dependências do `package.json` têm uso; todos os scripts em `scripts/` são chamados por CI, testes ou README.
- **Testes:** `npm run lint`, `typecheck`, `format:check` ok; `npm test` 58 arquivos, 632 testes ok (eram 639: os 7 removidos cobriam só o código morto); `test:ci-scripts` 29 ok; `build` ok. pgTAP, integração e E2E: CI do PR.
- **Próximo passo:** CI do PR verde; aval de luis para merge (publica o site).
