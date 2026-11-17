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
