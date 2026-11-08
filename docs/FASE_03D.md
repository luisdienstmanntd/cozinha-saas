# Fase 03D — consulta e painel de validade

## Plano e critérios de aceite

Escopo somente leitura alinhado ao brief 0.1: localizar recebimentos por nome do produto, lote de origem ou ID do recipiente, e resumir validade registrada para hoje, amanhã e dias anteriores a hoje. O dia de referência usa o fuso IANA do estabelecimento. A data salva é civil; não converter para instante, não inferir nem alterar prazo sanitário.

- A lista reutiliza a leitura autenticada e RLS existentes. Não adicionar operação de escrita, tabela, função privilegiada ou dado derivado persistido.
- A consulta trabalha sobre o limite atual de até 1.000 recebimentos por unidade e mostra aviso quando a lista atinge esse limite. Busca por ID considera recipiente já criado; abrir etiqueta continua sendo ação explícita do proprietário.
- Busca sem distinção entre maiúsculas/minúsculas e ignora espaços externos. Campo vazio mostra todos os recebimentos carregados.
- Resumo e lista filtrada devem refletir o escopo selecionado e dados atuais. Estados de carregamento, erro/recarregamento e vazio continuam visíveis.
- Cada resultado mostra produto, lote, quantidade/unidade, validade registrada, origem da validade e situação (vencido, vence hoje, vence amanhã ou posterior).
- Datas limítrofes devem ser calculadas para o fuso da unidade, inclusive virada de dia e mudança de horário. Uma data igual ao dia local é “vence hoje”; o dia seguinte é “vence amanhã”; anteriores são “vencido”.
- Membros ativos podem consultar; nenhuma permissão de escrita é ampliada. A identidade do recipiente não altera quantidade nem gera evento.
- Testes: função pura com datas/fusos e limites; componente com busca por produto/lote/ID, estados vazio e resumo; integração do mapeamento de recipiente; regressões Vitest, pgTAP/API existentes, lint, typecheck, build e E2E aplicável.

## Fora deste incremento

Consumo, descarte, saldo, correção/estorno, alteração de validade, notificações, paginação e recomendação de prazo. Correção auditável e recuperação de tentativa após fechamento da aba continuam gates para operação piloto. Ensaio físico da etiqueta continua obrigatório antes do uso em cozinha.

## Estado

Plano autorizado após revisão das fases 03A–03C e continuidade solicitada em 07/11/2026. Implementação local concluída; validação de integração/DB/E2E pendente porque o Supabase local não está disponível neste ambiente. Sem deploy.

## Evidências locais — 07/11/2026

- `npm ci`: exit 0, instalou as dependências do lockfile; 0 vulnerabilidades reportadas. Node 24.14.1 / npm 11.11.0.
- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run test`: exit 0, 51 testes em 15 arquivos. `npm run build`: exit 0; bundle principal 974,74 kB (296,76 kB gzip), aviso de chunk acima de 500 kB.
- `npm run test:coverage`: exit 0; 51 testes, cobertura de linhas 69,80%. `BatchPanel.tsx` 65,34%, `supabaseBatches.ts` 50%, `IdentityHome.tsx` 94,73%. Cobertura não inclui RLS/API ou E2E.
- Testes novos verificam dia civil no fuso de São Paulo e UTC, transição de horário sazonal, busca por produto/lote/ID de recipiente e mapeamento do ID opcional do recipiente.
- `npm run test:db`: tentou iniciar, mas a CLI não conseguiu gravar telemetria em `%USERPROFILE%\\.supabase` devido à permissão do sandbox. `docker info` falhou porque `docker` não está no PATH.
- `npm run test:integration` e `npm run test:e2e`: exit 1; ambos exigem a API descartável Supabase local e retornaram “Supabase local indisponível”. Não foram aprovados nem substituídos por mocks. Sem migração nesta fase; a consulta permanece sujeita às RLS existentes, mas a junção de recipiente ainda precisa ser confirmada pela integração real.
- `npm run format:check`: falhou em 41 arquivos preexistentes não alterados. `prettier --check` nos arquivos alterados passou; `git diff --check` também passou.

Arquivos alterados: `BatchPanel`, domínio/consulta de lotes, repasse do fuso da unidade, testes unitários/componentes, integração e E2E, README, decisões e este relatório. Sem deploy. Fase aguardando os gates que dependem do Supabase local.
