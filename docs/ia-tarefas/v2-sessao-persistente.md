# Tarefa: V2 — sessão persistente (D-025, D-059)

- **ID:** v2-sessao-persistente
- **Responsável / sessão:** Claude Code (sessão de projeto)
- **Estado:** concluida (aceita por luis em 16/11/2026, CI verde); sem merge nem deploy
- **Objetivo e aceite:** definições de luis (16/11/2026): inatividade de 30 min, recarregar e QR sem novo login, Sair visível e efetivo, uma conta por pessoa em aparelho compartilhado, sessão expirada sem operação protegida (servidor/RLS), RLS e permissões preservadas, testes de expiração, recarga, QR, logout, troca de usuário e acesso não autorizado, revisão de segurança com limitações.
- **Branch / base:** `claude/revisao-v2-sessao-persistente` sobre `claude/revisao-visual-fase-07` (PR #31).
- **Arquivos:** migração `20261116000000_session_inactivity.sql` e rollback, `src/features/identity/**`, `src/app/configureApp.ts`, `styles.css`, testes novos, três E2E ajustados, `docs/V2_SESSAO.md`, D-059.
- **Dependências e riscos:** muda `has_membership` e `member_organizations`. V1 é a próxima e exige aprovação própria. Sem merge nem deploy sem autorização de luis.
- **Próximo passo:** aceite de luis (D-059 e limitações de `V2_SESSAO.md`).

## Checkpoints

### 16/11/2026 — Claude Code

- **Feito:** implementação, testes e documento. Bateria completa verde (ver `V2_SESSAO.md`).
- **Testes alterados:** E2E `catalog`, `locations`, `pending` (recarregar não derruba mais a sessão); asserções mantidas.
- **Pendências:** aceite; teste em aparelho físico; verificação no projeto hospedado.

### 16/11/2026 — Claude Code

- luis aceitou a V2 e a D-059 com a condição de CI verde (confirmada: `quality` e `banco-api-e2e`). Riscos conhecidos e checklist pré-deploy registrados em `V2_SESSAO.md`. Próximo: V1, com PR próprio.
