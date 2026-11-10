# Coordenação entre assistentes

Este protocolo permite que Codex, Claude Code e outros assistentes retomem trabalho com contexto verificável. `IA_ESTADO.md` é o índice resumido; `docs/ia-tarefas/` contém um arquivo por tarefa, criado a partir do modelo. Os registros são evidências datadas, não garantem que uma sessão continue ativa nem substituem o estado real do Git.

## Antes de alterar qualquer coisa

1. Leia `AGENTS.md`, este protocolo, `docs/IA_ESTADO.md`, os registros das tarefas relacionados e a documentação exigida pela fase. Claude Code também lê `CLAUDE.md`. Se o usuário nomear uma tarefa anterior, localize sua branch, PR e último checkpoint.
2. Consulte `git status --short --branch`, `git worktree list`, `git log` e `git stash list`; preserve alterações e stashes existentes. Confira o remoto com `git fetch origin`, `git branch -r` e, quando disponível, `gh pr list --state open`. Uma branch ou um PR pode conter trabalho ausente da `main`. Compare commits e arquivos relevantes antes de agir; não presuma que um documento ou conversa está atualizado.
3. Identifique tarefas que possam tocar os mesmos arquivos, banco, migrações, ambiente ou testes. Se houver proprietário ativo, intenção conflitante, resultado incerto ou estado impossível de reconciliar, não sobrescreva nem continue a mesma parte em paralelo. Coordene com o responsável ou peça orientação ao usuário; trabalho comprovadamente independente pode continuar. Não trate silêncio ou um registro antigo como liberação automática.
4. Divida a tarefa em incrementos pequenos e verificáveis. Anote objetivo, critérios, riscos, responsável/sessão identificável sem dados sensíveis, branch/worktree, base, arquivos previstos, dependências e próximo passo. Crie `docs/ia-tarefas/<id-descritivo>.md` antes da primeira mudança funcional e registre o início em `IA_ESTADO.md`. Se a tarefa já existir, acrescente uma entrada datada em vez de apagar o histórico. Quando aplicável, indique também decisões e prompt da fase.
5. Para trabalho em paralelo, prefira branches e worktrees separados; comunique a reserva dos arquivos e recursos antes de editar. Em máquinas diferentes, publique o checkpoint em uma branch de trabalho e confira novamente o remoto antes de começar. Um arquivo versionado ou um `git fetch` **não é um bloqueio distribuído**: duas IAs podem iniciar ao mesmo tempo. Se não for possível confirmar exclusividade, não trabalhem simultaneamente na mesma área.

## Checkpoints durante a tarefa

- Registre antes de cada mudança relevante o que será feito e atualize depois de cada marco pequeno: arquivos e migrações realmente alterados, decisões, estado da branch/commit, comandos executados com resultado real, falhas, bloqueios e próximo passo concreto. Inclua efeitos no banco local ou em serviços que outra sessão precise conhecer, sem dados ou segredos. Registre também mudança de escopo, interrupção e dependências de outra tarefa.
- Faça checkpoints com frequência suficiente para sobreviver à interrupção; em trabalho longo, atualize ao menos a cada marco verificável e antes de iniciar uma operação demorada, arriscada ou difícil de interromper. Não dependa de escrever tudo ao encerrar: limites de créditos, interrupção e perda de conexão podem ocorrer sem aviso.
- Quando precisar compartilhar progresso entre máquinas, faça commit e push da branch de trabalho depois de verificar seu conteúdo. Se o trabalho estiver incompleto, identifique o checkpoint como **WIP**, informe testes que falham ou não foram executados e não o apresente como pronto. Não integre WIP à `main` nem avance a fase com testes falhando ou bloqueados. Preserve a política do usuário sobre commit/push e não inclua segredos, tokens, dados reais ou saída de ferramentas que os contenha.
- Se não for possível publicar por falta de conexão ou permissão, deixe o registro e as alterações locais preservados, informe explicitamente que outra máquina ainda não os verá e forneça branch/worktree e próximo passo. Não use `git reset`, `checkout`, `clean`, `stash drop`, force-push ou exclusão de worktree para apagar trabalho de outra sessão.

## Ao retomar ou encerrar

1. Leia o último checkpoint e compare-o com `git status`, commits, branch remota e PR. Verifique se o responsável anterior ainda está trabalhando quando possível. Se houver diferenças, registre-as e investigue; não anuncie trabalho como concluído apenas porque o registro diz isso.
2. Retome do próximo passo demonstrado. Se houver testes falhando, bloqueados ou migração parcialmente aplicada, resolva ou registre o bloqueio antes de avançar. Execute novamente os testes exigidos pela mudança e indique resultados reais e lacunas. Não transforme teste não executado em sucesso.
3. Ao terminar, interromper ou transferir, marque a tarefa como `em_andamento`, `aguardando_aceite`, `concluida` ou `bloqueada`; registre o motivo, testes, commits/PR, riscos e próximo passo. Atualize `IA_ESTADO.md` de forma concisa. `concluida` exige os critérios de aceite e gates do projeto; parada ao fim de fase exige aceite humano conforme `AGENTS.md`.
4. Sincronize o registro com o GitHub conforme autorizado e confira o estado após o push. Informe ao usuário o que ficou local, remoto, em rascunho ou pendente de aceite. Não faça merge, deploy ou publicação apenas porque um checkpoint existe.

## Economia de contexto e créditos

Leia primeiro o índice e apenas os registros, diffs e arquivos relevantes; agrupe consultas independentes, evite repetir exploração e use subagentes conforme as regras do projeto. Prefira mudanças pequenas, testes significativos e documentação objetiva. Não reduza segurança, revisão ou gates para economizar tokens.

Antes de iniciar uma etapa grande, avalie se é divisível em um marco que possa ser testado e registrado; se houver indicação de limite próximo, conclua ou registre um checkpoint seguro antes de iniciar outra parte. Nem todas as ferramentas expõem créditos ou tokens restantes e uma interrupção pode ser inesperada: não invente orçamento disponível nem prometa impedir toda interrupção. Se a capacidade restante for desconhecida, use incrementos menores e checkpoints frequentes.
