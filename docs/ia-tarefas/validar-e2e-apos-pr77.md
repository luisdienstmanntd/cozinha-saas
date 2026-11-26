# Tarefa: validar retomada após PR #77

- **Responsável / estado:** Codex; em_andamento.
- **Base / branch:** `a504672` (`origin/main` em 26/11/2026), branch `codex/validar-e2e-20261126`, worktree `D:/codex-validar-e2e-20261126`.
- **Objetivo:** conferir o que o Claude concluiu e preservar apenas verificações adicionais que não enfraqueçam nem dupliquem sua correção do aviso falso. Confirmar retomada após cancelamento e exatamente uma baixa; nenhuma alteração de produto ou migração.
- **Arquivos:** `IdentityDrafts.test.tsx`, `tests/e2e/catalog.spec.mjs`, este registro e índice. PR #81 atua em equipe e também atualiza o índice; preservar ambas as entradas sem alterar aquela branch.
- **Riscos:** a proposta anterior de aceitar qualquer diálogo ficaria mais fraca do que o teste do PR #77 e não será aproveitada. A main publica automaticamente; não fazer merge/deploy sem autorização específica. Banco local contém migrações da main aplicadas; não resetar dados.
- **Próximo passo:** adicionar duas verificações de comportamento independentes da correção do Claude, executar testes afetados e gates completos; se houver falha, investigar antes de avançar.

## Checkpoint — 26/11/2026

- O Claude corrigiu o aviso falso no PR #77 (commit `c07d9ec`, merge `74a0863`) e tornou o E2E mais estrito, exigindo ausência de diálogo. A `main` avançou a `a504672`, com PR #78 de interface e #80 de indicadores. Os checks da `main` e do #77 consultados estavam verdes. PRs #79 e #81 continuam em rascunho, sem alterações desta sessão.
- A investigação anterior está preservada no commit WIP `2961558` em `codex/investigar-e2e-20261125`; seu ajuste de aceitar diálogo é explicitamente superado. Não reaplicar esse ajuste.
- Na execução anterior, cinco testes de `test:ci-scripts` falharam no Windows por pressupor Bash/Linux; os cinco passaram no Ubuntu/WSL com Node 24.22.3 e arquivos de teste/script em LF. Os demais testes do comando tinham passado no Windows. Este fato não substitui nova validação do estado atual.

## Checkpoint — verificação complementar

- Adicionados somente testes: cancelamento de atualização após renomeação preserva revisão de outro formulário; no E2E de catálogo, a retomada é conferida no banco como um único consumo. O teste estrito do Claude, que reprova diálogo inesperado, foi mantido integralmente.
- Teste focado de rascunhos: 14 passaram. E2E de catálogo repetido três vezes na `main` atual com a conferência adicional: 3 passaram; avisos de chaves React duplicadas continuam observados e não foram corrigidos nesta tarefa.
- A checagem inicial de formatação dos dois testes falhou; aplicada formatação dirigida. Lint, typecheck, suíte, build e scripts de CI estão sendo executados. Banco local contém as migrações da main e não foi resetado; faltam pgTAP, integração e E2E completos.

## Checkpoint — gates e isolamento do banco

- `npm run lint`, `npm run typecheck`, `npm run test` (663 testes) e `npm run build` passaram; build manteve avisos preexistentes. Scripts de CI: cinco falhas no Windows por pressupostos de Bash/LF; no Ubuntu/WSL, checkout LF e Node 24, passaram 29/29.
- `npm run test:db` falhou em 3 de 1500 verificações de `hosted_provisioning.test.sql`, que exigem contagens de banco vazio. Antes dos E2E a base local estava vazia; depois, verificação identificou 22 empresas de teste e 33 usuários `@example.test`, preservados por histórico. Não apagar dados nem resetar a instância existente.
- Próximo passo: executar pgTAP em segunda instância local isolada, com portas e projeto próprios em D:, preservando a primeira; após aprovação, executar integração e E2E completos. Falhas continuam registradas até validação efetiva.

## Checkpoint — banco aprovado; integração bloqueada

- Instância local isolada `codex-ci-isolado-20261126`, diretório `D:/codex-supabase-isolado-20261126`, portas 5532x: `supabase test db` passou 1500/1500 em 28 arquivos. Instância isolada parada depois, volumes preservados; a instância original não foi parada nem resetada.
- `npm run test:integration` foi iniciado no Windows: a primeira captura foi perdida e o processo foi interrompido após identificação; na segunda tentativa houve sobreposição temporária com essa execução e com o banco isolado. Houve falhas, incluindo teste que exige exatamente um banco Supabase ativo; várias provas de sessão e operações também falharam. A execução foi interrompida depois das falhas, sem resumo final. Não considerar a integração aprovada nem atribuir todas as falhas a uma causa sem evidência.
- Identificados requisitos adicionais: teste de sessão invoca `psql` (não encontrado no Windows ou Ubuntu/WSL); teste de provisionamento verifica modo Unix 0600, não confiável em Windows. Próximo passo: prover ambiente Linux com psql e permissões Unix reais, apenas um banco local ativo, executar integração completa, investigar qualquer falha persistente e só então executar E2E completo. WSL disponível, mas ainda sem psql; testar previamente acesso à CLI Docker e permissões Unix. Não alterar nem resetar a base existente.
- `test:e2e` completo não executado devido ao gate de integração reprovado. O teste E2E focado passou três vezes, mas não substitui a suíte. Não fazer merge/deploy; preservar registros e mudanças do Claude.
- Diagnóstico adicional no Ubuntu/WSL: `psql` ausente, `sudo -n` indisponível e integração Docker Desktop com a distribuição não habilitada. Evitar execução incompleta ou apontada para outro banco; configurar ambiente Linux apropriado antes de repetir.

## Retomada — 26/11/2026, execução Linux isolada

- Codex retoma a validação na mesma branch; `origin/main` permanece `a504672`, uma única instância Supabase principal ativa. Prova de conectividade: contêiner `postgres:16-alpine` com rede host alcança a porta local 54322.
- Plano: preparar checkout LF e ambiente Linux de testes em D:, com Node, psql, CLI Docker e acesso à instância local já existente; executar a integração uma única vez e capturar saída. O ambiente temporário de testes não alterará migrações ou código de produto. Prosseguir ao E2E somente após aprovação da integração. Preservar dados e containers existentes.
