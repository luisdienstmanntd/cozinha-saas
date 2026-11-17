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
