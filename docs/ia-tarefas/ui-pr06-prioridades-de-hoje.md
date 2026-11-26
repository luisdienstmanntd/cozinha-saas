# Tarefa: PR-06 do roadmap de interface — Visão geral com "Prioridades de hoje"

- **ID:** ui-pr06-prioridades
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** faixa "Prioridades de hoje" no topo da Visão geral (vencidos + vencem hoje, com selos de texto e link "Ver na lista" para a categoria mais urgente), contadores menores, atalhos ao lado do título no desktop. Aceite: só dados já carregados (`summary`); zero real mostra "Nada vencido nem vencendo hoje."; falha de consulta não mostra número; colaborador não vê "+ Recebimento"; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr06-prioridades`, base `main` `67cb37c` (PR-05, #86). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `OperationsOverview.tsx`, `OperationsOverview.test.tsx` (4 testes novos), `src/app/styles.css`, `tests/e2e/navigation.spec.mjs` (teste novo), `docs/IA_ESTADO.md`.
- **Decisões de escopo:** "Ver todos" da lista de atenção e os atalhos continuam como botões (testes e E2E atuais dependem desse papel); o "Ver na lista" da faixa é o link que leva à categoria mais urgente (vencidos; se não houver, vencem hoje), com Ctrl/Meta abrindo em nova aba. Atalhos viram links por perfil só se luis pedir.
- **Dependências e riscos:** nenhuma migração, regra, dado, permissão, rota ou QR. Mudança visível: faixa nova, contadores com menos altura, atalhos no cabeçalho (≥ 900 px); em ≤ 899 px a faixa vem logo abaixo do título e os atalhos ficam no fim.
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site). PR-07 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** faixa, CSS, testes. Capturas locais 1366×768 e 390×844 conferidas. Bateria inteira local em execução.
