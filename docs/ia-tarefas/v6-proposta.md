# Tarefa: V6 — filtrar Validades pelos contadores (proposta)

- **ID:** v6-proposta
- **Responsável / sessão:** Claude Code (thread "Propor próxima fatia de interface")
- **Estado:** concluída (proposta aprovada por luis em 22/11/2026 e implementada no PR #59, D-072)
- **Objetivo e aceite:** propor, sem implementar, a próxima fatia de interface depois da Mesa operacional. Aceite: luis aprova ou ajusta a proposta em `docs/V6_PROPOSTA.md`.
- **Branch / worktree / base:** `claude/v6-proposta`, base `main` `820f77d`.
- **Arquivos e recursos em uso:** só documentação (`docs/V6_PROPOSTA.md`, este registro, `docs/IA_ESTADO.md`).
- **Dependências e riscos:** PR #56 (Codex, D-071) aberto e com sobreposição pequena em `BatchPanel.tsx`; linha do roadmap "Os totais não são controles de filtro" contradiz o pedido do backlog. Hospedado intocado.
- **Próximo passo:** nenhum.

## Checkpoints

### 22/11/2026, 00:20 UTC — Claude Code
- **Planejado / feito:** revisadas a `main` (`820f77d`), `IA_ESTADO.md`, `BACKLOG.md`, D-068 a D-070, roadmap CozziGo, `redesign-estrutural.md`, PR #56 e a função `list_containers`. Proposta escrita.
- **Alterações e commits:** só documentação nesta branch.
- **Testes:** nenhum executado; não há mudança de código.
- **Estado do ambiente:** nada alterado no Supabase hospedado nem no Cloudflare.
- **Pendências / riscos:** ver seção 5 da proposta.
- **Próximo passo:** decisão de luis.

### 23/11/2026 — Claude Code
- **Feito:** a proposta foi aprovada e implementada no PR #59 (D-072), mas este documento nunca chegou à `main`, onde `ia-tarefas/v6-filtro-validades.md` já o cita. Branch sincronizada com a `main` (conflito só em `IA_ESTADO.md`, mantidas todas as entradas) e estado atualizado para concluída.
- **Próximo passo:** nenhum; merge só com aval de luis (publica o site, sem mudança de código).
