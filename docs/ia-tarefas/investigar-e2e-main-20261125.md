# Tarefa: investigar E2E da main

- **Responsável / sessão:** Codex, retomada em casa em 25/11/2026.
- **Estado:** em_andamento.
- **Objetivo e aceite:** investigar a falha do teste de catálogo na CI da `main` (`45102070813`, botão “Repetir tentativa”); reproduzir e corrigir se houver defeito comprovado, sem enfraquecer o teste. Executar testes afetados e gates pertinentes; não avançar com falhas ou bloqueios.
- **Branch / worktree / base:** `codex/investigar-e2e-20261125`, `D:/codex-e2e-main-20261125`, base `5f0ca12` (`origin/main` na abertura). Os perfis e a ata da reunião foram preservados separadamente na branch `codex/reuniao-cinco-agentes-20261114`, commit `4785507`.
- **Arquivos e recursos:** testes E2E de catálogo, área de movimentações/pendências e fixture local, sujeitos à investigação. O banco Supabase local existente é recurso compartilhado; não resetar ou apagar dados. `IA_ESTADO.md` também está em alteração no PR #76: preservar ambas as entradas em eventual integração.
- **Riscos:** último CI da main falhou, CI posterior do PR #76 passou em outro commit; não presumir instabilidade sem evidência. `main` publica automaticamente; não fazer merge ou deploy sem autorização específica. Preservar stash e outros worktrees.
- **Próximo passo:** verificar compatibilidade do banco local, preparar ambiente não destrutivo, reproduzir o teste e identificar a causa.

## Checkpoint — 25/11/2026

- **Feito:** Docker Desktop iniciado; `docker version` confirmou servidor 29.6.2. GitHub consultado; ata anterior enviada como commit `4785507`. Worktree isolado criado em D:; dependências existentes compartilhadas via junction, com lockfile igual ao da cópia original.
- **Banco:** stack local existente tem migrações até `20261108125109`; as demais migrações da `main` ainda não foram aplicadas. Consulta apenas de contagens retornou zero organizações, recebimentos, vínculos e usuários; não houve reset nem consulta a dados pessoais. Stack `calchub` não pertence à tarefa e será preservada.
- **Testes:** nenhum executado ainda sobre a `main` nesta retomada; CI histórica da `main` falhou e não será interpretada como aprovada.
