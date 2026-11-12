# Tarefa: Desenho da Fase 6

- **ID:** fase-06-desenho
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Projetar próxima fase do sistema")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** documento de desenho da próxima fase (escopo, modelo de dados, RLS, fluxos, aceite, testes de segurança, riscos e fatias) e decisões propostas, sem migração nem tela. Aceite: luis aprova, ajusta ou recusa o desenho e as decisões D-020 a D-026.
- **Branch / worktree / base:** `claude/fase-06-desenho`, a partir de `origin/main` em `4c39e9f`.
- **Arquivos e recursos em uso:** `docs/FASE_06_DESENHO.md` (novo), `docs/DECISOES.md` (acréscimo de D-019 a D-026 no fim), `docs/BACKLOG.md` (linhas F6 a F8), este registro e uma linha de `IA_ESTADO.md`. Nenhum código, migração ou teste.
- **Dependências e riscos:** depende do aceite da Fase 5 e do PR #2 antes de qualquer implementação. Conflito provável em `DECISOES.md` com o PR #1 (D-017) e com novas decisões do Codex: conciliar acrescentando, sem descartar entradas. A fatia 6.1 recria funções de movimento; reservar com o Codex antes de iniciar.
- **Próximo passo:** aguardar resposta de luis às questões Q1–Q6 do desenho e o aceite; só então abrir registro da fatia 6.0.

## Checkpoints

### 12/11/2026 16:40 UTC — Claude Code
- **Planejado / feito:** leitura de AGENTS, coordenação, estado, brief, decisões, backlog, riscos, plano da Fase 5, migrações e revisão 05 (branch do PR #2). Desenho escrito; decisões e backlog atualizados.
- **Alterações e commits:** ver PR rascunho da branch `claude/fase-06-desenho`.
- **Testes:** não aplicável (somente documentação); nenhum gate de código executado porque nada de código mudou.
- **Estado do ambiente:** nenhum efeito fora do container.
- **Pendências / riscos:** aceite humano; respostas do responsável técnico (Q1–Q3).
- **Próximo passo:** aguardar aceite.
