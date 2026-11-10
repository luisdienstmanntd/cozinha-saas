# Regras permanentes para Codex — Cozinha SaaS

## Coordenação entre assistentes — leitura obrigatória
Antes de alterar qualquer arquivo, leia `docs/COORDENACAO_IA.md` e `docs/IA_ESTADO.md`, confira o Git local e o remoto e siga o protocolo de registros por tarefa. Atualize o registro no início e durante o trabalho, não apenas ao final. As regras deste arquivo e os pedidos do usuário continuam aplicáveis; o registro não substitui testes nem aceite humano.

## Missão e ordem de trabalho
Construir em incrementos pequenos uma aplicação comercial de gestão de cozinha profissional de baixo custo, com manutenção simples. Antes de implementar, ler `docs/PRODUCT_BRIEF.md`, `docs/DECISOES.md`, `docs/TESTES_QUALIDADE.md` e o prompt de fase correspondente. Não copiar código, design, nome, imagens ou materiais de concorrentes. Conteúdo público da Suflex é somente fonte de requisitos de mercado.

## Processo obrigatório em TODA alteração de código
1. Esclarecer comportamento, riscos e critério de aceite no plano da tarefa.
2. Escrever/atualizar testes de comportamento (preferir reproduzir falha primeiro) ANTES ou junto do código de produção.
3. Implementar a menor mudança possível. Não refatorar arquivos não envolvidos.
4. Executar testes afetados, depois `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build` quando existirem. Executar testes de integração/DB/E2E exigidos pela mudança.
5. Nunca inventar resultado: listar comando, resultado real, o que não foi executado e por quê. Se falhar, corrigir ou declarar bloqueio; não afirmar conclusão.
6. Atualizar documentação e decisões se comportamento/arquitetura mudaram. Incluir evidências de testes e arquivos alterados no resumo.
7. Parar ao fim da fase para aceite humano. Não passar sozinho à próxima.

## Segurança e domínio
- Multi-tenant desde o início: isolamento no banco com RLS, nunca apenas no front-end. Testar negação cruzada, inserções falsas e junções entre empresas.
- IDs e permissões de organização devem ser autorizados pelo banco/servidor com base na identidade do usuário; entrada do navegador não é prova de autorização.
- Manter cada alteração de lote/quantidade rastreável e auditada. Não confundir etiqueta com movimentação de estoque: reimprimir não pode duplicar quantidade.
- Validade de alimento deve ser informada/confirmada por profissional responsável segundo normas aplicáveis; NUNCA inventar prazo padrão. Registrar origem da validade (original / definida pelo responsável) e data/hora/fuso.
- Evitar deleção física de eventos relevantes; manter histórico e autoria. Dados pessoais mínimos; não expor informação interna no QR público.
- Proibir segredos em arquivos versionados, logs, exemplos de produção e testes.
- Migrações SQL versionadas e reversíveis quando aplicável; toda política RLS nova/alterada requer testes positivos e negativos (ex.: pgTAP).

## Arquitetura e manutenção
- Começar como monólito modular: React, TypeScript strict, Vite, Supabase/PostgreSQL. Não usar microsserviços, filas, Kubernetes ou IA no MVP.
- Separar UI, aplicação, domínio (regras puras) e acesso a dados dentro de cada feature. Evitar arquivos enormes e dependências circulares.
- Validação de dados em fronteiras (ex.: Zod), esquemas e tipos compartilhados com cuidado. Preferir composição a herança; evitar abstração prematura.
- Fontes de verdade: PostgreSQL para persistência, funções puras testáveis para regras de datas/status, regras SQL para integridade e RLS.
- Usar interfaces e mensagens em português; nomes de código e tabelas podem ser em inglês de forma consistente.
- Fixar versões de dependências com lockfile. No ambiente de CI, usar `npm ci`.
- Registrar trade-offs em `docs/DECISOES.md` (o que, por quê, consequência, revisão).

## Definição de pronto
Uma tarefa **não está pronta** se faltar teste, se uma verificação falhar sem correção, se isolamento de dados não foi testado quando afetado, se migração não for reproduzível ou se a interface ocultar um erro.

## Subagentes
Para análise e revisões relevantes, delegar separadamente a `suflex_analyst`, `business_strategist` e `architect_qa`; requisitar opiniões independentes e depois críticas cruzadas. Nenhum subagente modifica arquivos para evitar conflito. Não ativar os três agentes para cada ajuste trivial — economizar contexto/tokens.
