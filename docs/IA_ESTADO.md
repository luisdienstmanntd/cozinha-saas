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
| Desenho da Fase 6 | Claude Code; aprovado para planejamento, aguardando aceite da sequência (PR #3 em rascunho, só documentação) | `ia-tarefas/fase-06-desenho.md` | Correções do PR #4 incorporadas; aguardando aprovação de luis para iniciar a 6.0a (depois da Fase 5 e do PR #2). |
| Revisão cruzada da Fase 6 | Claude Code (sessão independente do desenho); aguardando aceite (PR em rascunho contra `claude/fase-06-desenho`, só documentação) | `ia-tarefas/revisao-cruzada-fase-06.md` | luis decide sobre B-1 a B-3 e demais ajustes; depois atualizar o desenho no PR #3. |
| Coordenação entre assistentes | Codex; concluída | `ia-tarefas/coordenacao-assistentes.md` | Consultar o protocolo e iniciar um registro para cada nova tarefa. |
| Revisão 05 — segurança, testes e produto | Claude Code; aguardando aceite (PR rascunho) | `ia-tarefas/revisao-05-seguranca-produto.md` | Conferir CI do job `banco-api-e2e` e decidir propostas do relatório `REVISAO_05_SEGURANCA_PRODUTO.md`. |

Novas tarefas devem ter IDs distintos e arquivo próprio, criados a partir de `ia-tarefas/MODELO.md`. Se duas branches tiverem atualizado este índice, concilie as duas entradas; não escolha uma versão descartando a outra.
