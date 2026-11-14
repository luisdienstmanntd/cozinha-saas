# Tarefa: Fase 6, fatia 6.11 — consumo de vencido recusado e métricas do piloto

- **ID:** fase-06-11-vencido-metricas
- **Responsável / sessão:** Claude Code (sessão de projeto, thread "Bloquear consumo de vencido e medir piloto")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** banco recusa consumo de recipiente vencido (validade do recipiente, data da unidade), descarte permitido; faixa VENCIDO no painel e no QR; `pilot_metrics` com vencidos com saldo; procedimento manual para etiquetas fora do sistema. Bateria inteira verde, nenhum teste removido ou enfraquecido.
- **Branch / worktree / base:** `claude/fase-06-11-vencido-metricas`, base `claude/fase-06-10-pre-piloto` (PR #18, 4571c57).
- **Arquivos e recursos em uso:** `supabase/migrations/20261114030000_expired_consumption.sql`, `supabase/rollback/expired_consumption.sql`, testes novos e ajustados (ver `FASE_06_11.md`), `BatchPanel`, `MovementPanel`, `LabelView`, `docs/PRE_PILOTO.md`.
- **Dependências e riscos:** PRs #15 a #18 fora da `main` (ordem #15 → #16 → #17 → #18 → este). PR #19 (desenho da preparação própria) usa recipiente integral e reserva a D-049; esta fatia usa a D-048. Q10 pendente.
- **Próximo passo:** aceite de luis dos 5 pontos e da D-048; sem merge sem pedido dele.

## Checkpoints

### 14/11/2026 03:35 UTC — Claude Code
- **Feito:** migração e teste pgTAP (falha sem a migração, passa com ela); domínio `isExpired`, faixa no painel, movimentações e QR; Vitest. Commit WIP local d1d414a.
- **Testes:** test:db 1089 ok; Vitest 237 ok.
- **Estado do ambiente:** dockerd caiu uma vez e foi reiniciado; banco local recriado por `db:start`.

### 14/11/2026 03:50 UTC — Claude Code
- **Feito:** integração e E2E novos; testes antigos com datas fixas de 2027 ajustados (ver `FASE_06_11.md`); "Abrir / porcionar" escondido também no QR do vencido; procedimento manual em `PRE_PILOTO.md` 4.1; D-048 proposta.
- **Testes:** ver PR (bateria completa).
- **Próximo passo:** PR em rascunho e CI.
