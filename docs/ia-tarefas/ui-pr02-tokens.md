# Tarefa: PR-02 do roadmap de interface — tokens de tipografia, estado e densidade

- **ID:** ui-pr02-tokens
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** acrescentar em `src/app/tokens.css` os tokens que o diagnóstico de 26/11/2026 pediu (escala tipográfica, cinco estados de validade com texto/fundo/borda, densidade, sombra de camada) **sem usá-los ainda**, e um teste que lê o arquivo real e mede o contraste de cada par. Aceite: nada muda na tela; teste de contraste passa (≥ 4,5:1 texto, ≥ 3:1 borda funcional); "vence hoje" e "vence amanhã" com cores diferentes; o laranja da marca não é cor de alerta; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr02-tokens`, base `main` `843e759` (inclui o PR-01, #82). O PR #81 (Equipe) entra depois e não foi tocado.
- **Arquivos:** `src/app/tokens.css`, `src/app/tokens.test.ts` (novo), `docs/IA_ESTADO.md`.
- **Dependências e riscos:** nenhuma migração. Risco mínimo: variáveis CSS novas que nenhuma regra usa. Uso real nos PR-04 (selo único e hoje × amanhã) e seguintes.
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site). PR-03 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code
- **Feito:** tokens `--text-*`, `--status-{overdue,today,tomorrow,later,depleted}-{text,surface,edge}`, `--nav-item-h`, `--nav-item-h-pointer`, `--panel-pad`, `--row-h`, `--shadow-overlay`. Teste `tokens.test.ts` (30 casos): contraste dos estados sobre o fundo do selo e sobre o painel, bordas funcionais, estados distintos, marca fora dos alertas, pares de tokens já existentes, escala tipográfica crescente em rem, 16 px no corpo, 44 px em toque.
- **Teste antes da correção:** sem os tokens novos, 20 dos 30 casos falham; com eles, 30/30.
