# Tarefa: revisão de interface e gestão de unidades

- **Responsáveis / estado:** Claude Code e Codex; PR #1 em rascunho, aguardando decisão humana.
- **Branch / base:** `claude/revisao-interface-unidades`, integração funcional `103f63a` e incorporação das instruções de coordenação `605f31a`, verificados em 10/11/2026; worktree então observado em `D:/codex-cozinha-revisao`. Confirmar o HEAD remoto e a existência do worktree antes de editar.
- **Escopo:** gestão de unidades, correção de callback após desmontagem e layout responsivo. Relatório completo, incluindo arquivos e limitações, está em `docs/REVISAO_INTERFACE_UNIDADES.md` na branch do PR; não presumir que já esteja na `main`.
- **Última evidência registrada:** no conjunto, lint, typecheck, 105 testes, build, 6 E2E, 135 pgTAP, 17 testes de integração e advisor de segurança passaram. Conferir o relatório da branch para comandos e detalhes.
- **Pendências:** PR segue fora da `main`; criação de unidade sem idempotência, nomes repetidos e perda de formulário ainda não enviado após recarga são riscos documentados. Não fazer merge apenas por este registro.
- **Próximo passo:** verificar o estado atual do PR e obter a decisão humana aplicável antes de integrá-lo.
