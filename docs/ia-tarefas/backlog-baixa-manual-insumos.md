# Tarefa: Backlog da baixa manual de insumos

- **ID:** backlog-baixa-manual-insumos
- **Responsável / sessão:** Claude Code (thread do projeto, pedido de luis em 22/11/2026)
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** registrar o requisito futuro de baixa manual por lote/recipiente, sem implementar. Aceite: documento com as 13 seções pedidas e decisão com número livre em `DECISOES.md`.
- **Branch / worktree / base:** `claude/backlog-baixa-manual-insumos`, base `main` `d9b48c9`.
- **Arquivos e recursos em uso:** `docs/BACKLOG_BAIXA_MANUAL_INSUMOS.md` (novo), `docs/DECISOES.md` (D-073 no fim), `docs/BACKLOG.md` (uma linha), `docs/IA_ESTADO.md` (uma seção). Nenhum código, migração ou banco.
- **Dependências e riscos:** D-071 reservada ao PR #56 do Codex; conflito possível só em `DECISOES.md`/`IA_ESTADO.md` (anexos no fim, conciliar mantendo as duas entradas).
- **Próximo passo:** luis revisar e aceitar a D-073; a implementação começa por auditoria técnica (etapa 1), com aprovação própria.

## Checkpoints

### 22/11/2026 ~02:10 UTC — Claude Code
- **Feito:** documento criado e D-073 registrada. Leitura do código só para citar nomes reais (`stock_movements`, `apply_stock_exit`, `container_balance`, `list_containers`, `MovementPanel`); citados como indícios a confirmar.
- **Interpretação:** o pedido chegou cortado no item 13 ("Status e..."); usado "Status e próximos passos".
- **Testes:** só documentação; nenhum teste local executado. CI do PR é a verificação.
- **Pendências / riscos:** aceite de luis; merge na `main` publica o site e exige autorização explícita.
- **Próximo passo:** aguardar revisão de luis no PR em rascunho.
