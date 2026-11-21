# Revisão de uso por compras e cozinha

- **ID:** ux-compras-cozinha
- **Responsável / sessão:** Codex /root
- **Estado:** em_andamento
- **Objetivo e aceite:** reduzir navegação administrativa, orientar cadastros ausentes conforme permissão e ordenar processos de recebimento/produção; preservar validações, rascunhos e regras de autorização.
- **Branch / worktree / base:** codex/ux-compras-cozinha, /workspace/work/cozinha-saas, main 820f77d.
- **Arquivos e recursos em uso:** navegação, BatchPanel, ProductionPanel, estilos e testes relacionados. Nenhum banco hospedado.
- **Dependências e riscos:** três revisões independentes e crítica cruzada concluídas; grupos recolhidos exigem adaptar helper E2E. Sem mudança de permissões, migrações ou prazos.
- **Próximo passo:** testes de comportamento, implementação e gates.

## Checkpoint — 21/11/2026
- Site publicado observado no navegador, mas sessão não autenticada impede inspecionar processos hospedados. Sem credenciais solicitadas ou dados reais alterados.
- Revisão estática identificou grupos administrativos abertos, campos de temperatura intercalados na identificação, falta de próximos passos nos selects vazios e rótulo de estoque sem funcionalidade correspondente.
- Compras significa produtos, fornecedores e recebimentos existentes; pedidos de compra continuam fora do escopo.
- Planejado: administração recolhida com grupo ativo aberto; seções identificação/validade/temperatura; orientação por pré-requisito; produção com campos em grid responsivo. Testes ainda não executados.

## Checkpoint de implementação
- Navegação recolhida com abertura do grupo da página; rótulo Locais de armazenamento; orientações com links de área; recebimento sequenciado; produção responsiva.
- 42 testes focados passaram. Primeiro lint encontrou sincronização de estado por efeito, corrigida para ajuste guardado de estado na troca de página. Typecheck apontou opção de matcher indevida nos testes novos, corrigida.
- Primeira bateria completa: 600 passaram, 1 falhou por uso da palavra genérica proibida pelo teste de textos; redação corrigida sem alterar a política. Nova execução pendente.
- Navegador com componentes reais e gateways simulados: recebimento refrigerado, aviso de bloqueio sem medição, produção e navegação em desktop e janela de cerca de 500 px observados. Prévia local não versionada, sem escrita em banco. Ainda não equivale ao E2E autenticado.
- Supabase local não iniciado: apenas 1,1 GB livre no ambiente, insuficiente para a pilha. E2E/banco serão conferidos pela CI descartável.

## Checkpoint de verificação local
- Passaram lint, typecheck, build e bateria completa com 601 testes; `test:ci-scripts` passou 29 testes. Nova checagem focada após esconder o título de temperatura vazio em execução.
- Revisão independente final de arquitetura/QA sem bloqueadores; observação do título vazio atendida.
- E2E atualizado com navegação administrativa recolhida e percursos em 390 e 320 px: cadastro de produto/fornecedor, retorno ao rascunho de recebimento, cadastro de preparação e retorno ao rascunho de produção. Resultado autenticado ainda pendente da CI.
- Próximo passo: publicar branch e PR para CI e prévia. Sem merge nem produção neste incremento antes do aceite.
