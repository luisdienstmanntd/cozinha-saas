# Estado compartilhado entre assistentes

Leia `COORDENACAO_IA.md` antes de alterar o projeto. Este índice é uma fotografia, não um bloqueio nem garantia de atualidade. Confira sempre o Git e o GitHub; cada tarefa mantém detalhes e checkpoints próprios em `ia-tarefas/`. Para evitar conflitos, edite apenas a linha da tarefa e o resumo necessários, preservando registros de outras sessões.

## Situação verificada em 13/11/2026

- Com autorização de luis (13/11/2026), os PRs #1 a #12 foram integrados na `main` com commits de merge, na ordem #2, #1, #3, #4, #5 a #12. Os conflitos foram só em `DECISOES.md` e `IA_ESTADO.md`, conciliados mantendo as duas entradas. D-034 a D-041 passaram dos registros das fatias para `DECISOES.md`.
- Branches novas partem da `main`. A Fase 5 do Codex (anulação de movimentações) foi aceita por luis em 12/11/2026.

## Situação verificada em 10/11/2026

- A anulação auditável de movimentações foi publicada na `main` em `f831e22`; a coordenação foi adicionada em `8cbc9b8`. O incremento de anulação foi entregue para aceite humano; não há aceite posterior registrado nesta conversa. Evidências e limitações: `FASE_05_PLANO.md`.
- O [PR #1](https://github.com/luisdienstmanntd/cozinha-saas/pull/1), branch `claude/revisao-interface-unidades`, estava em rascunho e fora da `main`. A integração funcional passou pelos testes em `103f63a`; as instruções de coordenação foram incorporadas à branch em `605f31a`. Confira o HEAD remoto, pois outros commits podem existir. Ver relatório da própria branch `docs/REVISAO_INTERFACE_UNIDADES.md`. A integração requer a decisão/aceite humano aplicável. Criação de unidades ainda não é idempotente e a recarga pode descartar formulários não enviados.
- Havia um worktree separado em `D:/codex-cozinha-revisao` para o PR. `stash@{0}` na cópia principal é um rascunho anterior da fase 03D: preservar, não aplicar nem apagar automaticamente. Caminhos e existência devem ser reconfirmados em cada máquina.
- Pendências de produto antes do piloto incluem recuperação de tentativas após fechamento da aba, saldo pela rota QR, teste físico de etiqueta e condições operacionais descritas no plano da fase. Não presumir que são autorização para iniciar outra fase.

## Tarefas registradas

| Tarefa | Responsável / estado | Referência | Próximo passo |
|---|---|---|---|
| Anulação auditável de movimentações | Codex; aguardando aceite | `ia-tarefas/fase-05-anulacao.md` | Confirmar aceite humano antes da próxima fase. |
| Revisão de interface e unidades | Claude Code e Codex; integrada na `main` em 13/11/2026 (PR #1) | `ia-tarefas/revisao-interface-unidades.md` | Nenhum. |
| Desenho da Fase 6 | Claude Code; aprovado para planejamento e integrado na `main` em 13/11/2026 (PR #3) | `ia-tarefas/fase-06-desenho.md` | Seguir a ordem da seção 10; cada fatia exige aceite próprio. |
| Revisão cruzada da Fase 6 | Claude Code; B-1 a B-3 decididos por luis e incorporados ao desenho; integrada em 13/11/2026 (PR #4) | `ia-tarefas/revisao-cruzada-fase-06.md` | Nenhum. |
| Coordenação entre assistentes | Codex; concluída | `ia-tarefas/coordenacao-assistentes.md` | Consultar o protocolo e iniciar um registro para cada nova tarefa. |
| Revisão 05 — segurança, testes e produto | Claude Code; aceita e integrada na `main` em 13/11/2026 (PR #2) | `ia-tarefas/revisao-05-seguranca-produto.md` | Propostas P3, P5 e P6 executadas nas fatias 6.0a a 6.0c; demais seguem no desenho. |
| Fase 6, fatia 6.0a — proteção do histórico (P5) | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #5, D-034) | `ia-tarefas/fase-06a-protecao-historico.md` | Nenhum. |
| Fase 6, fatia 6.0b — RLS por conjunto (P3) | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #6, D-035) | `ia-tarefas/fase-06b-rls-por-conjunto.md` | Nenhum. |
| Fase 6, fatia 6.0c — fuso imutável e auditoria (P6) | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #7, D-036) | `ia-tarefas/fase-06c-fuso-auditoria.md` | Nenhum. |
| Fase 6, fatia 6.1 — saldo por recipiente | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #8, D-037) | `ia-tarefas/fase-06-1-saldo-recipiente.md` | Nenhum. |
| Fase 6, fatia 6.2 — painel e QR com saldo | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #9, D-038) | `ia-tarefas/fase-06-2-painel-saldo.md` | Nenhum. |
| Fase 6, fatia 6.3 — manipulação no banco | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #10, D-039) | `ia-tarefas/fase-06-3-manipulacao.md` | Nenhum. |
| Fase 6, fatia 6.4 — anulação de manipulação no banco | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #11, D-040) | `ia-tarefas/fase-06-4-anulacao.md` | Nenhum. |
| Fase 6, fatia 6.5a — conservação, temperatura e ocorrências no banco | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #12, D-041) | `ia-tarefas/fase-06-5a-conservacao.md` | Nenhum. |
| Fase 6, fatia 6.5b — recebimento com conservação e temperatura, decisão de ocorrência e bloqueio na interface | Claude Code; aceita por luis em 13/11/2026 com a D-042 (PR #13 rascunho sobre a `main`, sem merge) | `ia-tarefas/fase-06-5b-recebimento-ui.md` | Merge só com pedido de luis; 6.6 exige aprovação própria. |
| Fase 6, fatia 6.6 — telas de abrir, porcionar e anular, QR com origem e derivados | Claude Code; aceita por luis em 13/11/2026 com a D-043 (PR #14, integrada na `main` em 13/11/2026) | `ia-tarefas/fase-06-6-telas-manipulacao.md` | Nenhum. |
| Fase 6, fatia 6.7 — etiquetas de recebimento e de produto aberto (PDF) | Claude Code; aprovada por luis em 13/11/2026; aguardando aceite com a D-044 (PR em rascunho sobre a `main`) | `ia-tarefas/fase-06-7-etiquetas.md` | Aceite de luis; sem merge sem pedido dele; 6.8 exige aprovação própria. |

Novas tarefas devem ter IDs distintos e arquivo próprio, criados a partir de `ia-tarefas/MODELO.md`. Se duas branches tiverem atualizado este índice, concilie as duas entradas; não escolha uma versão descartando a outra.
