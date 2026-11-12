# Tarefa: Desenho da Fase 6

- **ID:** fase-06-desenho
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Projetar próxima fase do sistema")
- **Estado:** aguardando_aceite (desenho aprovado para planejamento em 12/11/2026; sequência de implementação aguardando aceite)
- **Objetivo e aceite:** documento de desenho da próxima fase (escopo, modelo de dados, RLS, fluxos, aceite, testes de segurança, riscos e fatias) e decisões propostas, sem migração nem tela. Aceite: luis aprova, ajusta ou recusa o desenho e as decisões D-020 a D-030.
- **Branch / worktree / base:** `claude/fase-06-desenho`, a partir de `origin/main` em `4c39e9f`.
- **Arquivos e recursos em uso:** `docs/FASE_06_DESENHO.md` (novo), `docs/DECISOES.md` (acréscimo de D-019 a D-030 no fim), `docs/BACKLOG.md` (linhas F6 a F8), este registro e uma linha de `IA_ESTADO.md`. Nenhum código, migração ou teste.
- **Dependências e riscos:** depende do aceite da Fase 5 e do PR #2 antes de qualquer implementação. Conflito provável em `DECISOES.md` com o PR #1 (D-017) e com novas decisões do Codex: conciliar acrescentando, sem descartar entradas. A fatia 6.1 recria funções de movimento; reservar com o Codex antes de iniciar.
- **Próximo passo:** revisão cruzada do PR #3 pelo Codex (pedido preparado para luis) e aceite da sequência; só então abrir registro da fatia 6.0, depois do aceite da Fase 5 e do PR #2.

## Checkpoints

### 12/11/2026 16:40 UTC — Claude Code
- **Planejado / feito:** leitura de AGENTS, coordenação, estado, brief, decisões, backlog, riscos, plano da Fase 5, migrações e revisão 05 (branch do PR #2). Desenho escrito; decisões e backlog atualizados.
- **Alterações e commits:** ver PR rascunho da branch `claude/fase-06-desenho`.
- **Testes:** não aplicável (somente documentação); nenhum gate de código executado porque nada de código mudou.
- **Estado do ambiente:** nenhum efeito fora do container.
- **Pendências / riscos:** aceite humano; respostas do responsável técnico (Q1–Q3).
- **Próximo passo:** aguardar aceite.

### 12/11/2026 17:10 UTC — Claude Code
- **Planejado / feito:** avaliada a análise sanitária trazida por luis (respostas a Q1–Q6). Incorporadas ao desenho: validade após abertura limitada à origem, origem vencida recusada, abertura parcial, `handled_by` separado de `created_by`, código curto, dois modelos de etiqueta, conservação e temperatura no recebimento (fatia 6.9), locais como fatia opcional 6.10. D-021 e D-024 revistas; D-027 e D-028 propostas. Seção 13 do desenho registra o que foi adotado, ajustado e adiado.
- **Alterações e commits:** mesma branch `claude/fase-06-desenho`, PR #3.
- **Testes:** não aplicável (somente documentação).
- **Pendências / riscos:** referências normativas não conferidas no texto oficial (R11); Q7–Q10 abertas; aceite humano.
- **Próximo passo:** aguardar aceite.

### 12/11/2026 17:30 UTC — Claude Code
- **Planejado / feito:** incorporadas as decisões de luis sobre Q7–Q10. Desenho marcado como aprovado para planejamento (não autoriza implementação). Novos: ocorrência de recebimento sem medição com bloqueio de uso e decisão auditada (4.8, D-029), locais e transferências na fatia 6.9 (4.9, D-030), aviso de não declarar conformidade e teste de textos (10c), riscos R11 e R12. Fatias renumeradas na ordem de execução, 6.0 a 6.10 (os checkpoints anteriores usam a numeração antiga).
- **Alterações e commits:** mesma branch, PR #3.
- **Testes:** não aplicável (somente documentação).
- **Pendências / riscos:** revisão cruzada pelo Codex; aceite da sequência; conferência normativa pré-piloto (profissional ainda não escolhido).
- **Próximo passo:** aguardar revisão cruzada e aceite.

