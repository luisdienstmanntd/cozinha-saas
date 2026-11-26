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

## Checkpoint — diagnóstico inicial

- **Ambiente:** `supabase migration up` aplicou as 23 migrações pendentes somente à stack local `cozinha-saas`, depois da consulta que mostrou zero organizações, recebimentos, vínculos e usuários. Nenhum reset; `calchub` preservado.
- **Causa observada na CI:** revisão independente do artefato `45102070813` encontrou aviso de atualização cancelada por alterações em outros formulários e o botão `Confirmar saída`; o teste esperava `Repetir tentativa`, que pressupõe remontagem. A CI do PR #76 contém o mesmo código de produto/teste e passou, portanto não comprova correção.
- **Teste local:** `npm run test:e2e -- tests/e2e/catalog.spec.mjs --grep 'proprietário cadastra' --repeat-each=3 --workers=1`: 3 passaram. O Vite registrou aviso de chaves React duplicadas `1`, ainda sem investigação. A variação da CI não foi reproduzida localmente nessas três execuções.
- **Próximo passo:** corrigir o teste para controlar explicitamente a confirmação da atualização e verificar o resultado de atualização, mantendo cobertura de recuperação após remontagem. A preservação quando o usuário cancela já tem teste de comportamento dedicado; confirmar resultados e repetir gates. Não alterar produto apenas para satisfazer o teste.

## Checkpoint — correção do teste

- `tests/e2e/catalog.spec.mjs` agora aceita explicitamente qualquer diálogo de confirmação da atualização durante a renomeação, exige o aviso exato de atualização concluída e mantém a recuperação por `Repetir tentativa`; foi acrescentada conferência de uma única baixa no banco. Não houve alteração do comportamento de produto.
- `IdentityDrafts.test.tsx` ganhou cenário independente: se o usuário cancela a atualização após renomear, a revisão de outro formulário permanece. Teste focado: 13 passaram.
- Após controle explícito do diálogo, o E2E de catálogo foi repetido cinco vezes: 5 passaram. A conferência adicional de unicidade foi escrita depois do início dessa rodada e ainda precisa ser executada na bateria seguinte. Os avisos preexistentes de chaves React duplicadas também apareceram; não são a causa comprovada do timeout e requerem investigação separada.
- **Próximo passo:** executar lint, typecheck, suíte unitária, build, pgTAP, integração e E2E completos na base atual; registrar saídas reais e não avançar se falharem.

## Checkpoint — 26/11/2026, trabalho paralelo do Claude

- O Claude identificou a causa raiz e corrigiu o aviso falso no PR #77, integrado à `main` em `74a0863`; o teste de catálogo agora exige que não apareça diálogo. A abordagem local que aceitava qualquer diálogo fica **superada e não deve ser integrada**, pois poderia esconder essa regressão. Preservada neste WIP para rastreabilidade.
- Cinco testes de `test:ci-scripts` falharam na execução Windows (`ENOENT` nos arquivos criados por Bash); executados novamente no Ubuntu/WSL com Node 24.22.3 e cópias com finais de linha LF, os cinco passaram. Os demais testes de scripts haviam passado no Windows. O arquivo de teste de aplicação e o E2E modificados aqui não foram integrados.
- A `main` avançou para `a504672` com interface e indicadores; PRs #79 e #81 permanecem em rascunho. Foi criado o worktree `D:/codex-validar-e2e-20261126` para confirmar o estado atual e reaproveitar apenas testes adicionais que não conflitem com o PR #77.
