# Proteção de formulários não salvos

- **ID:** proteger-rascunhos-completo
- **Responsável / sessão:** Codex (branch isolada desta sessão)
- **Estado:** em_andamento
- **Objetivo e aceite:** concluir a proteção contra perda de formulários alterados em atualização de acesso, renovação de dados que desmonta a unidade e navegação que descarta conteúdo. Detectar alterações feitas sem foco; tratar salvamento, reset (inclusive cancelado), formulários que aparecem/desaparecem e fim de sessão sem alertas falsos nem perda silenciosa. Troca de unidade que mantém os painéis montados preserva o rascunho sem confirmação; Sair mantém o comportamento voluntário atual. Interface usa mensagens curtas de produto, sem notas internas ou mensagens de teste.
- **Branch / worktree / base:** `codex/proteger-rascunhos-completo` / `work-pr68-complete` / `origin/main` local `896c03cda1467969ee5031c1b9b6f9dd9b30f61a`.
- **Arquivos e recursos em uso:** `IdentityHome.tsx`, testes de identidade, hook compartilhado de rascunhos, cobertura E2E existente de recebimento; este registro e `IA_ESTADO.md`. Sem banco/migração.
- **Dependências e riscos:** #68 é WIP de outro branch e não será alterado; esta implementação é sucessora isolada. Requisições `changed`/renomeação renovam acesso; formulários que salvam com sucesso precisam sair do estado sujo antes da renovação, falhas devem manter dados. Controles customizados sem estado DOM requerem delimitar o suporte e testar os formulários reais. Sem Docker nesta máquina, banco/integração/E2E autenticado dependem da CI remota.
- **Próximo passo:** completar o detector e conectar os fluxos de revisão, cancelamento e salvamento assíncrono.

## Checkpoints

### 22/11/2026 — início da retomada

- **Planejado / feito:** criado registro antes de mudanças funcionais. Confirmado `main` em `896c03c`, branch de trabalho limpa e PR #68 único aberto no GitHub. Consultado `AGENTS.md`, protocolo, brief e registros. `git fetch origin` falhou por bloqueio/conectividade com `github.com:443`; não alego atualização do remoto. A conexão integrada confirmou PR #68 como WIP, com limitações declaradas no próprio corpo.
- **Alterações e commits:** somente este registro e índice; ainda não commitados. Branch original #68 não foi modificada.
- **Testes:** `npm ci --offline` instalou 314 pacotes, auditoria reportou 0 vulnerabilidades. Antes do código, `npm test -- --run src/features/identity/components/IdentityDrafts.test.tsx`: 2 passaram e 2 falharam como esperado (sem aviso para edição sem foco; sem aviso após o formulário sair do DOM para revisão). Sem Docker.
- **Estado do ambiente:** Windows sem Docker, com CI remota disponível via PR.
- **Pendências / riscos:** revisão independente identificou também o refresh interno após mudanças em ferramentas de organização e a limpeza incorreta de campos removidos no WIP #68. A leitura confirmou Settings/Produção trocam para etapa de revisão com campos removidos; tracker deve manter dados por formulário até sucesso ou descarte explícito.
- **Próximo passo:** implementar tracking associado ao formulário/escopo e integrar sucesso/cancelamento nos fluxos em etapas.

### 22/11/2026 — implementação e validação local

- **Planejado / feito:** detector por formulário/escopo com snapshots estáveis, controles sem foco, formulários removidos na etapa de revisão, confirmação ao cancelar, resets nativos sem limpar indevidamente e evento explícito de limpeza após salvamento confirmado. Atualização de acesso carrega primeiro e só troca as telas após sucesso e confirmação; falha de conexão preserva acesso e rascunhos. Logout e expiração limpam o estado da sessão. Arquivos alterados: identidade, cadastros de unidade/organização, configurações, produção, manipulação, ocorrências e movimentações; teste E2E adicionado.
- **Alterações e commits:** alterações locais ainda não commitadas. Branch #68 original permanece intacta. `npm ci --offline`: 314 dependências instaladas, 0 vulnerabilidades reportadas.
- **Testes:** antes da última revisão do evento de limpeza, suíte completa `npm test -- --maxWorkers=1`: 60 arquivos, 649/649 aprovados. Depois da revisão, `IdentityDrafts.test.tsx`: 11/11 aprovados. `typecheck`, lint e build passaram; build mantém apenas avisos preexistentes do Vite/chunk. Prettier e `git diff --check` passaram. E2E autenticado, pgTAP e integração não executados localmente por falta de Docker; dependem de CI remota.
- **Estado do ambiente:** Windows sem Docker. Fetch atualizado com sucesso após configurar `safe.directory` somente no comando; `origin/main` está em `4b68219` (#74), dois commits à frente da base inicial. Merge da base e repetição das verificações pendentes antes do push.
- **Pendências / riscos:** CI E2E/banco ainda não executada; não publicar/mesclar até CI completa. Não fechar nem alterar PR #68 porque a branch original deve permanecer preservada.
- **Próximo passo:** salvar checkpoint da implementação, integrar a ponta atual da `main`, reexecutar a suíte completa e checks; então publicar branch/PR isolado.
