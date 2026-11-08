# Fase 03D — consulta e painel de validade

## Plano e critérios de aceite

Escopo somente leitura alinhado ao brief 0.1: localizar recebimentos por nome do produto, lote de origem ou ID do recipiente, e resumir validade registrada para hoje, amanhã e dias anteriores a hoje. O dia de referência usa o fuso IANA do estabelecimento. A data salva é civil; não converter para instante, não inferir nem alterar prazo sanitário.

- A lista reutiliza a leitura autenticada e RLS existentes. Não adicionar operação de escrita, tabela, função privilegiada ou dado derivado persistido.
- Plano original de 07/11: consultar até 1.000 recebimentos com aviso. Substituído pela correção de 08/11 descrita abaixo. Busca por ID considera recipiente já criado; abrir etiqueta continua sendo ação explícita do proprietário.
- Busca sem distinção entre maiúsculas/minúsculas e ignora espaços externos. Campo vazio mostra todos os recebimentos carregados.
- Resumo e lista filtrada devem refletir o escopo selecionado e dados atuais. Estados de carregamento, erro/recarregamento e vazio continuam visíveis.
- Cada resultado mostra produto, lote, quantidade/unidade, validade registrada, origem da validade e situação (vencido, vence hoje, vence amanhã ou posterior).
- Datas limítrofes devem ser calculadas para o fuso da unidade, inclusive virada de dia e mudança de horário. Uma data igual ao dia local é “vence hoje”; o dia seguinte é “vence amanhã”; anteriores são “vencido”.
- Membros ativos podem consultar; nenhuma permissão de escrita é ampliada. A identidade do recipiente não altera quantidade nem gera evento.
- Testes: função pura com datas/fusos e limites; componente com busca por produto/lote/ID, estados vazio e resumo; integração do mapeamento de recipiente; regressões Vitest, pgTAP/API existentes, lint, typecheck, build e E2E aplicável.

## Fora deste incremento

Consumo, descarte, saldo, correção/estorno, alteração de validade, notificações e recomendação de prazo. Paginação foi adicionada posteriormente para corrigir a omissão documentada abaixo. Correção auditável e recuperação de tentativa após fechamento da aba continuam gates para operação piloto. Ensaio físico da etiqueta continua obrigatório antes do uso em cozinha.

## Estado

Plano autorizado após revisão das fases 03A–03C e continuidade solicitada em 07/11/2026. A implementação do trabalho foi sincronizada e validada em casa; as pendências identificadas foram corrigidas em 08/11, conforme evidências abaixo. Aguardando aceite humano. Sem deploy.

## Evidências locais — 07/11/2026

- `npm ci`: exit 0, instalou as dependências do lockfile; 0 vulnerabilidades reportadas. Node 24.14.1 / npm 11.11.0.
- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run test`: exit 0, 51 testes em 15 arquivos. `npm run build`: exit 0; bundle principal 974,74 kB (296,76 kB gzip), aviso de chunk acima de 500 kB.
- `npm run test:coverage`: exit 0; 51 testes, cobertura de linhas 69,80%. `BatchPanel.tsx` 65,34%, `supabaseBatches.ts` 50%, `IdentityHome.tsx` 94,73%. Cobertura não inclui RLS/API ou E2E.
- Testes novos verificam dia civil no fuso de São Paulo e UTC, transição de horário sazonal, busca por produto/lote/ID de recipiente e mapeamento do ID opcional do recipiente.
- `npm run test:db`: tentou iniciar, mas a CLI não conseguiu gravar telemetria em `%USERPROFILE%\\.supabase` devido à permissão do sandbox. `docker info` falhou porque `docker` não está no PATH.
- `npm run test:integration` e `npm run test:e2e`: exit 1; ambos exigem a API descartável Supabase local e retornaram “Supabase local indisponível”. Não foram aprovados nem substituídos por mocks. Sem migração nesta fase; a consulta permanece sujeita às RLS existentes, mas a junção de recipiente ainda precisa ser confirmada pela integração real.
- `npm run format:check`: falhou em 41 arquivos preexistentes não alterados. `prettier --check` nos arquivos alterados passou; `git diff --check` também passou.

Arquivos alterados: `BatchPanel`, domínio/consulta de lotes, repasse do fuso da unidade, testes unitários/componentes, integração e E2E, README, decisões e este relatório. Sem deploy. Fase aguardando os gates que dependem do Supabase local.

## Retomada em casa — 08/11/2026

O usuário informou que o projeto havia avançado no outro computador; esta cópia foi atualizada por fast-forward até `bf8411d`. O rascunho local anterior foi preservado em `stash@{0}` (identificado como “rascunho local 03D antes de sincronizar GitHub”). Docker 29.6.2 e Supabase descartável local estavam disponíveis.

- `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build`: exit 0. Vitest: 51 testes em 15 arquivos; build com aviso informativo de bundle principal de 974,74 kB (296,76 kB gzip).
- `supabase test db`: exit 0, 88 verificações pgTAP. `node --test tests/integration/*.test.mjs`: exit 0, 12 testes. `supabase db advisors --type security --level warn --fail-on warn`: exit 0, sem ocorrências.
- `npm run test:e2e`: exit 0, 2 testes Chromium. Estes resultados substituem apenas os gates anteriormente bloqueados; não houve deploy.
- Revisão arquitetural somente leitura identificou pendências: painel aberto não atualiza automaticamente na virada de dia; busca por nome depende de catálogo limitado a 1.000 produtos e pode não encontrar um produto além desse limite; resumo e busca consideram apenas os últimos 1.000 recebimentos e não são totais completos da unidade, mesmo com aviso de limite. A consulta usa relógio do dispositivo; a revisão recomenda referência única por atualização e explicitação dessa fonte. A junção de recipiente passou no teste de integração real. Essas questões ainda não foram corrigidas nem aceitas como limitações operacionais.

A revisão identificou as pendências acima; o usuário autorizou corrigi-las antes de avançar. As correções e resultados posteriores estão registrados a seguir.

## Correções e verificação final — 08/11/2026

- O painel recalcula a classificação a cada minuto, ao recuperar foco e ao mudar a visibilidade da aba. Todas as linhas e contagens do mesmo render usam o mesmo instante. Exibe fuso, data de referência, última consulta e dependência do relógio do dispositivo. Se o fuso não for interpretável, exibe erro sem classificar. Após alteração do fuso na unidade, é necessário atualizar o acesso.
- A consulta obtém o nome do produto pela relação autorizada, não pelo catálogo limitado. Pagina por ID estável em páginas de 500, valida o acesso à unidade ao final e recusa exibir resultados acima de 10.000 registros ou após erro/revogação. Um índice versionado por organização, unidade e ID sustenta a paginação; RLS existente não foi alterada.
- A leitura não é snapshot entre requisições. Um recebimento inserido atrás do cursor durante a consulta pode aparecer somente após clicar em “Atualizar recebimentos”. O painel informa que novos registros podem exigir atualização. A classificação e a data mudam periodicamente, mas a leitura dos registros não é atualizada automaticamente em tempo real.
- Testes novos primeiro reproduziram as três falhas. Cobrem passagem da meia-noite em São Paulo, busca de produto ausente do catálogo, mais de 1.000 registros, erro explícito acima de 10.000, fuso inválido e revogação ao consultar. E2E cria 1.001 recebimentos e um produto fora dos primeiros 1.000 do catálogo; insere outro recebimento atrás do cursor durante a paginação e verifica que surge após atualizar.
- Revisão arquitetural verificou paginação, RLS e referência temporal, e pediu explicitação do limite e teste de inserção concorrente; ambos corrigidos. Negócio e mercado confirmaram a necessidade de exibir última consulta, relógio do dispositivo e limite. Os agentes não editaram arquivos.

### Resultados dos comandos

- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`: exit 0; 59 testes em 15 arquivos. Bundle principal 976,45 kB (297,33 kB gzip), com aviso informativo de tamanho.
- `npm run test:e2e`: exit 0; 3 testes Chromium, incluindo o teste com 1.001 registros e inserção concorrente atrás do cursor. Após atualizar, os 1.002 registros apareceram.
- Rollback de `batch_scope_pagination.sql` com `psql -v ON_ERROR_STOP=1`: exit 0; índice removido e tabela preservada. `supabase db reset --no-seed`: exit 0, cinco migrações reaplicadas. `supabase test db`: exit 0, 89 verificações pgTAP. `node --test tests/integration/*.test.mjs`: exit 0, 12 testes. `supabase db advisors --type security --level warn --fail-on warn`: exit 0, sem ocorrências.
- `npm run test:coverage`: exit 0, 58 testes antes do último teste de falha de página; cobertura de linhas total 71,17%. Por arquivo: BatchPanel 68,59%, supabaseBatches 69,69%, CatalogPanel 100%, IdentityHome 94,73%, LabelView 81,25%, PDF 30%, App 33,33%, configureApp 66,66%; demais adapters Supabase 0% em Vitest. Cobertura não inclui E2E ou integração real e não prova segurança por si só.
- A consulta foi testada com acesso revogado e falha de paginação, sem exibir painel parcial. O limite explícito de 10.000 e a concorrência entre páginas permanecem restrições do protótipo. Busca e contagens incluem todos os registros obtidos, não são saldo físico disponível.

Arquivos alterados: `BatchPanel`, domínio e gateway de lotes, testes de componente e gateway, E2E e integração; migração/rollback de índice e pgTAP; README, decisões, atualização contextual da pesquisa competitiva e este relatório. Nenhuma política RLS foi alterada. As três pendências foram corrigidas; 03D aguarda aceite humano antes do próximo incremento.
