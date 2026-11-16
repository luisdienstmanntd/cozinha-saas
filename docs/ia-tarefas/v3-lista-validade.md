# Tarefa: V3 — Lista de validade legível (D-061)

- **ID:** v3-lista-validade
- **Responsável / sessão:** Claude Code (sessão de projeto)
- **Estado:** concluida: aceita por luis em 16/11/2026, 12:43 UTC (D-061), tecnicamente encerrada com CI verde; sem merge nem deploy
- **Objetivo e aceite:** prioridades de luis (16/11/2026, 02:26 UTC): cartões compactos; destaque para produto, código curto, saldo e validade; indicadores visuais e textuais de vencimento; validade fácil de ver no celular; sem UUID completo na lista; datas e horários brasileiros; ficha do recipiente direto pela lista; regras de validade, estoque, RLS e auditoria preservadas. Testes sem enfraquecer; revisão em desktop e celular.
- **Branch / base:** `claude/revisao-v3-lista-validade` sobre `claude/revisao-v1-navegacao` (PR #33, aceita).
- **Arquivos:** `src/features/batches/**` (painel, selo, testes), `src/shared/format/dates.ts`, `LabelView.tsx`, `MovementPanel.tsx`, `styles.css`, E2E afetados e `tests/e2e/expiry-cards.spec.mjs`, `docs/V3_LISTA_VALIDADE.md`, capturas, D-061.
- **Dependências e riscos:** depende da V1. Sem mudança de banco, RLS ou regra. V4 e V5 exigem autorização própria.
- **Próximo passo:** nenhum nesta tarefa; proposta da V4 em PR #36 aguardando luis.

## Checkpoints

### 16/11/2026 — Claude Code

- **Feito:** cartões, selo com texto, datas dd/mm/aaaa e HH:mm no fuso da unidade, ficha pela lista (leitura, também colaborador e derivado), nome de quem registrou no histórico com identificadores recolhidos, selo no topo da ficha/QR. Testes novos e ajustados (ver relatório).
- **Testes:** format, lint, tipos, build, vitest (361), integração (49) e E2E (30) verdes; pgTAP 1433 verde às 02:50 UTC. Às 03:03 UTC, `container_handling` teste 69 falhou por depender do horário logo após a meia-noite em São Paulo (instabilidade anterior, sem mudança de banco na V3; correção proposta como tarefa própria).
- **Pendências:** aceite de luis; aparelho físico.

### 16/11/2026, 12:50 UTC — Claude Code

- **Aceite:** D-061 aceita; correção do teste 69 (PR #35) aprovada tecnicamente e levada a esta branch por cherry-pick (conflitos só em `IA_ESTADO.md` e `TESTES_QUALIDADE.md`, mantidas as duas seções). Backlog de filtros por categoria registrado.

### 16/11/2026, 13:05 UTC — Claude Code

- **Encerramento técnico:** bateria completa verde no `997a550` (pgTAP 1433, integração 49, E2E 30, vitest 361), CI verde. Reprodução da meia-noite: antiga falha, corrigida passa. Nenhuma regra alterada.
