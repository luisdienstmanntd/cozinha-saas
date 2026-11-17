# Tarefa: plano de integração dos PRs e da fase de preparação para produção

- **ID:** plano-integracao
- **Responsável / sessão:** Claude Code (conversa "Revisão técnica integrada do sistema")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** plano detalhado (riscos, dependências, conflitos, estratégia de merge, critérios por etapa), investigação das instabilidades de CI/E2E e conciliação de nomenclatura da nova fase. Pedido por luis em 17/11/2026, 13:38 UTC. Aceite: aprovação de luis.
- **Branch / base:** `claude/plano-integracao-fase-8`, sobre `claude/revisao-tecnica-integrada` (PR #40). PR em rascunho só com documentação.
- **Arquivos:** `docs/PLANO_INTEGRACAO.md`, este registro, linha em `docs/IA_ESTADO.md`.
- **Riscos:** nenhum código tocado. Merges simulados só em cópia local descartável. Sem merge, deploy ou contratação.
- **Próximo passo:** luis aprova o plano, a nomenclatura, a fatia 8.1 e autoriza a etapa 1.

## Checkpoints

### 17/11/2026 14:30 UTC — Claude Code
- **Feito:** simulação do merge das 17 branches em ordem (zero conflito, árvore final idêntica à ponta do #39); #35 conflita só em documentos; 10 falhas de CI classificadas em A–F.
- **Testes:** nenhum código alterado; nada a executar.
- **Próximo passo:** revisão de luis.

### 17/11/2026 14:10 UTC — Claude Code
- **Aprovação de luis (13:59 UTC):** plano, estratégia A com merge commit, Fase 8 (8.0 a 8.8), Fase 9 para o futuro, fatia 8.1 autorizada antes da integração, proposta de proteção da `main` sem aplicar, #35 fechado sem merge só depois de o #34 estar na `main`. Contagem corrigida para 19 merges. Registrado em `PLANO_INTEGRACAO.md` (seção 10), `DECISOES.md` (D-065), `BACKLOG.md` (F7/F8/F9) e `IA_ESTADO.md`.
- **#35:** o arquivo `container_handling.test.sql` do #34 e da ponta da cadeia é idêntico ao do #35 (verificado por comparação de blobs). O #35 continua aberto até o #34 entrar na `main`.
- **Próximo passo:** fatia 8.1 (PR próprio sobre a `main`) e proposta de proteção da `main`.

### 17/11/2026 15:50 UTC — Claude Code
- **Aceite de luis (15:16 UTC):** fatia 8.1 e D-066; proteção da `main` com 0 aprovações; lote inicial autorizado (proteção, #42, CI, #28, CI, relatório). Registrado em `PLANO_INTEGRACAO.md` (seção 11) e `DECISOES.md` (D-066).
- **Proteção:** tentativa por comando recusada (403 do proxy); luis aplicou no painel, corrigiu métodos de merge e conversas a meu pedido; conferido por leitura.
- **#42 integrado** (merge commit `0685ffc`); CI da `main` verde. **#28 revalidado** com a `main` incorporada (`04d79ee`), CI verde, e integrado (merge commit `1acf671`); CI da `main` verde.
- **Recorrências de instabilidade neste lote:** nenhuma.
- **Próximo passo:** aguardar autorização específica para o próximo lote (etapa 2, #22). Nada mais foi mesclado.

### 17/11/2026 18:00 UTC — Claude Code
- **Segundo lote concluído** (#22 a #27, autorização de luis 16:42 UTC): todos integrados com merge commit, CI verde sobre o resultado combinado e na `main`. Tabela em `PLANO_INTEGRACAO.md` (seção 12). Nenhuma recorrência de instabilidade.
- **Próximo passo:** aguardar autorização específica para a etapa 8 (#29). Nada mais foi mesclado.
