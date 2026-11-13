# Estado compartilhado entre assistentes

Leia `COORDENACAO_IA.md` antes de alterar o projeto. Este índice é uma fotografia, não um bloqueio nem garantia de atualidade. Confira sempre o Git e o GitHub; cada tarefa mantém detalhes e checkpoints próprios em `ia-tarefas/`. Para evitar conflitos, edite apenas a linha da tarefa e o resumo necessários, preservando registros de outras sessões.

## Situação verificada em 10/11/2026

- A anulação auditável de movimentações foi publicada na `main` em `f831e22`; a coordenação foi adicionada em `8cbc9b8`. O incremento de anulação foi entregue para aceite humano; não há aceite posterior registrado nesta conversa. Evidências e limitações: `FASE_05_PLANO.md`.
- O [PR #1](https://github.com/luisdienstmanntd/cozinha-saas/pull/1), branch `claude/revisao-interface-unidades`, estava em rascunho e fora da `main`. A integração funcional passou pelos testes em `103f63a`; as instruções de coordenação foram incorporadas à branch em `605f31a`. Confira o HEAD remoto, pois outros commits podem existir. Ver relatório da própria branch `docs/REVISAO_INTERFACE_UNIDADES.md`. A integração requer a decisão/aceite humano aplicável. Criação de unidades ainda não é idempotente e a recarga pode descartar formulários não enviados.
- Havia um worktree separado em `D:/codex-cozinha-revisao` para o PR. `stash@{0}` na cópia principal é um rascunho anterior da fase 03D: preservar, não aplicar nem apagar automaticamente. Caminhos e existência devem ser reconfirmados em cada máquina.
- Pendências de produto antes do piloto incluem recuperação de tentativas após fechamento da aba, saldo pela rota QR, teste físico de etiqueta e condições operacionais descritas no plano da fase. Não presumir que são autorização para iniciar outra fase.

## Tarefas registradas

| Tarefa | Responsável / estado | Referência | Próximo passo |
|---|---|---|---|
| Anulação auditável de movimentações | Codex; aguardando aceite | `ia-tarefas/fase-05-anulacao.md` | Confirmar aceite humano antes da próxima fase. |
| Revisão de interface e unidades | Claude Code e Codex; PR em rascunho | `ia-tarefas/revisao-interface-unidades.md` | Preservar PR, verificar estado remoto e obter aceite antes de integrar. |
| Coordenação entre assistentes | Codex; concluída | `ia-tarefas/coordenacao-assistentes.md` | Consultar o protocolo e iniciar um registro para cada nova tarefa. |
| Revisão 05 — segurança, testes e produto | Claude Code; aguardando aceite (PR rascunho) | `ia-tarefas/revisao-05-seguranca-produto.md` | Conferir CI do job `banco-api-e2e` e decidir propostas do relatório `REVISAO_05_SEGURANCA_PRODUTO.md`. |
| Fase 6, fatia 6.0a — proteção do histórico (P5) | Claude Code; aceita por luis em 13/11/2026 (PR rascunho sobre o PR #2, sem merge) | `ia-tarefas/fase-06a-protecao-historico.md` | Integrar depois do PR #2 quando luis autorizar; 6.0b aguarda aprovação própria. Detalhes em `FASE_06A.md`. |
| Fase 6, fatia 6.0b — RLS por conjunto (P3) | Claude Code; aceita por luis em 13/11/2026 (PR rascunho sobre o PR #5, sem merge) | `ia-tarefas/fase-06b-rls-por-conjunto.md` | Integrar depois do PR #2 e do PR #5 quando luis autorizar; 6.0c aguarda aprovação própria. Detalhes em `FASE_06B.md`. |
| Fase 6, fatia 6.0c — fuso imutável e auditoria (P6) | Claude Code; aceita por luis em 13/11/2026 (PR #7 rascunho sobre o PR #6, sem merge) | `ia-tarefas/fase-06c-fuso-auditoria.md` | Integrar depois dos PRs #2, #5 e #6 quando luis autorizar; 6.1 aguarda aprovação própria. Detalhes em `FASE_06C.md`. |
| Fase 6, fatia 6.1 — saldo por recipiente | Claude Code; aceita por luis em 13/11/2026 (PR #8 rascunho sobre o PR #7, sem merge) | `ia-tarefas/fase-06-1-saldo-recipiente.md` | Integrar depois dos PRs #2, #5, #6 e #7 quando luis autorizar. 6.2 e 6.3 aguardam aprovação própria. Detalhes em `FASE_06_1.md`. |
| Fase 6, fatia 6.2 — painel e QR com saldo | Claude Code; aceita por luis em 13/11/2026 com a D-038 (PR #9 rascunho sobre o PR #8, sem merge) | `ia-tarefas/fase-06-2-painel-saldo.md` | Integrar depois dos PRs #2, #5, #6, #7 e #8 quando luis autorizar. Detalhes em `FASE_06_2.md`. |
| Fase 6, fatia 6.3 — manipulação no banco | Claude Code; aguardando aceite (PR rascunho sobre o PR #9, sem merge) | `ia-tarefas/fase-06-3-manipulacao.md` | Aceite de luis, inclusive da D-039 proposta. Integrar depois dos PRs #2, #5, #6, #7, #8 e #9. Detalhes em `FASE_06_3.md`. |

Novas tarefas devem ter IDs distintos e arquivo próprio, criados a partir de `ia-tarefas/MODELO.md`. Se duas branches tiverem atualizado este índice, concilie as duas entradas; não escolha uma versão descartando a outra.
