# Tarefa: PR-03 do roadmap de interface — componentes base

- **ID:** ui-pr03-componentes-base
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** criar em `src/shared/ui/` `ActionLink`, `StatusBadge`, `StatTile`, `StatePanel` e `PageHeader`, com CSS próprio (`ui.css`, prefixo `ui-`, só tokens), **sem usá-los ainda nas áreas**. Aceite: componentes cobertos por testes de papel e nome acessível (carregando = `role=status`; erro = `role=alert` + "Tentar novamente"; vazio com próxima ação; zero real; selo com símbolo + texto; link com Ctrl/Meta/Shift/Alt/botão do meio não intercepta); nada muda na tela; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr03-componentes-base`, base `main` `b0dc408` (PR-02, #83, mesclado). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `src/shared/ui/{ActionLink,StatusBadge,StatTile,StatePanel,PageHeader}.tsx`, `src/shared/ui/ui.css`, `src/shared/ui/baseComponents.test.tsx`, `src/app/styles.css` (uma linha `@import`), `docs/IA_ESTADO.md`.
- **Dependências e riscos:** nenhuma migração, regra, dado, permissão, rota ou QR. Risco baixo: código novo e CSS com prefixo `ui-` que nenhuma tela usa. `DataTable` do diagnóstico fica para quando uma área precisar (não faz parte deste PR). Uso real: PR-04 (selo) e PR-05 (cabeçalho).
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site). PR-04 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** cinco componentes e `ui.css`; teste `baseComponents.test.tsx`. Vitest dos arquivos novos verde; bateria inteira em execução.
