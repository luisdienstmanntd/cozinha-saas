# Tarefa: Revisão visual e de uso da interface após a Fase 7

- **ID:** revisao-visual-fase-07
- **Responsável / sessão:** Claude Code (sessão de projeto)
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** percorrer todas as telas como proprietário e colaborador, em desktop e celular, e entregar achados priorizados (bloqueia piloto, melhora, detalhe) com capturas e propostas de correção. Sem alterar código.
- **Branch / worktree / base:** `claude/revisao-visual-fase-07` sobre `claude/fase-07-9-temperatura-opcional` (PR #30, `b3092c2`).
- **Arquivos e recursos em uso:** `docs/REVISAO_VISUAL_FASE_07.md`, `docs/capturas/revisao-visual-07/`, este registro e uma linha em `IA_ESTADO.md`. Nenhum arquivo de `src/`, `supabase/` ou `tests/`.
- **Dependências e riscos:** as correções (fatias V1 a V5) exigem aprovação própria de luis. A V2 (sessão persistente, D-025) mexe em segurança.
- **Próximo passo:** luis decide quais fatias V1 a V5 seguem e em que ordem.

## Checkpoints

### 14/11/2026, 23:20 UTC — Claude Code

- **Feito:** Supabase local com todas as migrações, `npm run dev` em modo local, empresa sintética via `scripts/provision.mjs`, percurso por script Playwright (fora do repositório) em 1366 × 900 e iPhone 13 emulado. Relatório e 19 capturas reduzidas.
- **Alterações e commits:** só documentação; ver o PR da branch.
- **Testes:** nenhum teste do projeto foi alterado. A bateria não foi executada, porque não há mudança de código.
- **Pendências / riscos:** a revisão não usou aparelho físico, leitura real de QR nem impressão.
- **Próximo passo:** aceite de luis e escolha das fatias.
