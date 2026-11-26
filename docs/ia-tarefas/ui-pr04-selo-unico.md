# Tarefa: PR-04 do roadmap de interface — selo único e "vence hoje" com cor própria

- **ID:** ui-pr04-selo-unico
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** Visão geral, Validades (cartão e contadores) e ficha passam a usar o `StatusBadge` do PR-03 e os tokens de estado do PR-02. "Vence hoje" fica laranja escuro e "vence amanhã" âmbar (decisão de luis em 26/11). Aceite: mesmos textos de hoje; cor nunca é o único sinal (símbolo + texto em todos os selos); contraste já medido em `tokens.test.ts`; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr04-selo-unico`, base `main` `b668d3a` (PR-03, #84). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `OperationsOverview.tsx`, `BatchPanel.tsx`, `LabelView.tsx`, `src/app/styles.css` (remove `.expiry-badge` e `.mesa-status`; tons dos cartões e contadores com tokens `--status-*`), testes (`OperationsOverview.test`, `LabelView.test` e `ContainerCards.test` trocam a classe `expiry-badge`/`tone-X` por `ui-badge`/`ui-badge-X`, mesma força; `tokens.test`), `docs/IA_ESTADO.md`.
- **Dependências e riscos:** nenhuma migração, regra de validade, dado, permissão, rota ou QR. O cálculo continua em `getExpiryStatus`/`expiryBadgeText`. Mudança visível: selo da Visão geral e da ficha passam a ter símbolo; "vence hoje" muda de âmbar para laranja escuro.
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site). PR-05 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** troca nos três pontos, CSS, testes. Vitest/lint/typecheck verdes; pgTAP, integração e E2E pela CI do PR (Docker local indisponível).
