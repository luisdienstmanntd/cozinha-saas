# Tarefa: V1 — Navegação e estrutura (D-060)

- **ID:** v1-navegacao
- **Responsável / sessão:** Claude Code (sessão de projeto)
- **Estado:** em revisão (PR em rascunho); aceite de luis pendente; sem merge nem deploy
- **Objetivo e aceite:** 10 requisitos de luis (16/11/2026): cinco áreas, abrir em Validade, menu lateral/inferior, unidade e Sair acessíveis, áreas por perfil sem mexer no banco, nada perdido, dados digitados preservados, links/QR com sessão da V2, testes sem enfraquecer, revisão visual.
- **Branch / base:** `claude/revisao-v1-navegacao` sobre `claude/revisao-v2-sessao-persistente` (PR #32).
- **Arquivos:** `src/features/navigation/**`, `src/app/App.tsx`, `styles.css`, `IdentityHome.tsx`, `BatchPanel.tsx`, E2E, `docs/V1_NAVEGACAO.md`, capturas, D-060.
- **Dependências e riscos:** depende da V2. Sem mudança de banco. V3 a V5 exigem aprovação própria.
- **Próximo passo:** aceite de luis.

## Checkpoints

### 16/11/2026 — Claude Code

- **Feito:** implementação, testes novos, E2E ajustados sem relaxar asserções, revisão visual. Bateria completa verde (pgTAP 1433, integração 49, E2E 29).
- **Pendências:** aceite; aparelho físico; V3 (Validade no celular).
