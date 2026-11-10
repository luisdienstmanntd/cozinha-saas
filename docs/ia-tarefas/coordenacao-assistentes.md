# Tarefa: coordenação entre assistentes

- **Responsável / sessão:** Codex, conversa atual.
- **Estado:** em_andamento.
- **Objetivo e aceite:** instruções de leitura e registros de andamento compatíveis com Codex e Claude Code; preservar situação das tarefas existentes e orientar checkpoints sem prometer evitar interrupções inesperadas.
- **Branch / base:** `main`, base `f831e22`; confirmar o commit e o remoto após a publicação.
- **Arquivos em uso:** `AGENTS.md`, `CLAUDE.md`, `docs/COORDENACAO_IA.md`, `docs/IA_ESTADO.md` e `docs/ia-tarefas/`.
- **Riscos:** registros não são bloqueios distribuídos; sincronização entre máquinas depende de commit/push; não alterar ou apagar o stash e worktree existentes.
- **Próximo passo:** verificar links, diferenças, conteúdo e sincronização; atualizar este registro com os resultados reais.

## Checkpoint — 10/11/2026, Codex

- Foi verificado que `main` local e remoto estavam em `f831e22`, que o PR #1 seguia em rascunho em `103f63a` e que havia um stash anterior preservado. Docker ou testes de produto não são necessários para esta alteração exclusivamente documental.
- Arquivos de coordenação e pontos de entrada para os dois assistentes foram preparados; verificação documental e commit/push ainda pendentes neste checkpoint.
