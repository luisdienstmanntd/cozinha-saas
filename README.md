# Gestão de cozinha — fundação local

Fase 0 aprovada. Fase 1: React, Vite e TypeScript strict, tela de demonstração em português e testes automatizados. Sem marca final, persistência, login ou conexão com serviços. As etapas exibidas são previstas para fases futuras; esta versão não salva dados.

## Rodar no Windows

Requer Node.js 24 ou superior com npm. Ambiente validado: Node 24.12.0 / npm 11.6.2. Abra o PowerShell na pasta do projeto:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Acesse o endereço local informado pelo Vite (normalmente http://127.0.0.1:5173). Encerre com Ctrl+C. O arquivo `.env` é opcional nesta fase: a ausência de `VITE_APP_MODE` usa `demo`; qualquer outro valor é recusado com mensagem visível. Campos `VITE_*` são públicos no bundle: nunca inserir segredos. Nenhuma credencial Supabase é necessária.

## Verificações

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:coverage
npm run format:check
```

`test` termina após uma execução; `test:watch` acompanha alterações. Cobertura HTML em `coverage/index.html`; arquivos gerados não são versionados. `npm run preview` serve o build local após `build`. `format` formata apenas o código/configuração da fundação e seus documentos operacionais, preservando instruções e documentos anteriores.

Na sandbox Windows do agente, bundlers e processos de testes podem exigir autorização de execução ampliada por restrição de leitura de diretórios ancestrais. O terminal normal do usuário não tem essa restrição específica do agente.

## Organização

- `src/app`: composição inicial e estilos globais.
- `src/features/demo/components`: interface da demonstração.
- `src/features/demo/application`: coordenação de estado/caso de uso.
- `src/features/demo/domain`: regra pura de confirmação do escopo.
- `src/shared/config`: validação da configuração pública com Zod.
- `src/test`: jsdom, matchers e limpeza entre testes.

Features com persistência terão sua própria camada `data` quando necessária. Não há banco simulado ou autorização por filtro de interface. RLS e testes reais de isolamento são obrigatórios na Fase 2 antes de qualquer uso multiempresa. Datas, quantidades, QR e impressão ainda não foram implementados.

## CI e decisões

`.github/workflows/quality.yml` prepara npm ci, lint, typecheck, test e build em Node 24. O arquivo está apenas local: nenhum remoto foi criado, nenhum workflow remoto foi executado e não houve deploy ou contratação. As dependências diretas têm versões exatas e `package-lock.json` deve ser preservado.

O override transitivo de minimatch em `package.json` corrige alerta da ferramenta de lint; rever sua necessidade ao atualizar ESLint/typescript-eslint. TypeScript 5.9 foi mantido por compatibilidade com o parser; jsdom 29 é compatível com o Node instalado.

Consulte [o relatório da Fase 1](docs/FASE_1.md), [as decisões](docs/DECISOES.md), [o debate aprovado](docs/DEBATE_AGENTS.md) e [a política de qualidade](docs/TESTES_QUALIDADE.md). Leia AGENTS.md e o prompt de cada fase antes de alterar código. Subagentes de análise não editam arquivos.

O foco aprovado é uma unidade piloto de restaurante independente. Preparação mínima para operar é obrigatória, com cobrança a decidir. Preço, demanda, datas, permissões e material físico continuam sujeitos às validações do debate. Não iniciar a próxima fase sem aceite humano; não criar serviços, publicar ou contratar equipamentos sem autorização.

## Fase 2 — identidade e isolamento validados localmente

Autenticação local e migração de organizações, unidades e vínculos foram verificadas com pgTAP e integração via API Supabase. Veja [o relatório da Fase 2](docs/FASE_2.md). O modo demo permanece padrão.

Com Docker no PATH e Node 24: `npm run db:start`, `npm run test:db` e `npm run test:integration`. Para testar a reaplicação da migração, `npm run db:reset` recria o banco da instância local descartável deste projeto. A integração cria dados sintéticos com credenciais aleatórias, em organizações e unidades aleatórias; como recebimentos, recipientes e movimentos são append-only para todos os papéis (Fase 6.0a), a limpeza só remove fixtures sem histórico, e o restante fica isolado na instância local até o próximo `npm run db:reset` (a CI parte de banco novo); recusa URL diferente de `http://127.0.0.1:54321`. Não vincular projeto remoto para esses testes.

Modo local da interface requer `VITE_APP_MODE=local`, `VITE_SUPABASE_URL=http://127.0.0.1:54321` e `VITE_SUPABASE_PUBLISHABLE_KEY` obtida da instância local em `.env.local` ignorado pelo Git. Nunca colocar chave administrativa no frontend. Não há provisionamento de contas pela interface nem conta de demonstração permanente; a integração cria e remove contas temporárias.

## Fase 03A — catálogo por estabelecimento

Após entrar, escolha o catálogo do estabelecimento. Membros ativos consultam produtos e fornecedores; proprietários ativos também podem cadastrá-los. O produto exige uma unidade de medida. Fornecedores permanecem independentes dos produtos até o registro de origem do lote em um incremento posterior.

Com a migração aplicada no banco descartável, instale o Chromium de teste com `npx playwright install chromium` e rode `npm run test:e2e`. O fluxo cria e remove dados fictícios, abre a aplicação em `127.0.0.1:5174` e usa uma chave publicável local. Ver [plano e resultados da 03A](docs/FASE_03A.md).

## Fase 03B — recebimento de lotes

No estabelecimento selecionado, o proprietário registra produto, fornecedor, lote de origem, quantidade e validade informada com sua origem. A unidade vem do produto. Em caso de falha de conexão, reenvie os mesmos dados na mesma aba; se fechar a aba, confira a lista antes de registrar novamente. Ver [relatório da 03B](docs/FASE_03B.md).

## Fase 03C — etiqueta de demonstração

O proprietário pode abrir a etiqueta de um recebimento e gerar um PDF provisório de 100 × 100 mm. O QR contém o ID do recipiente e o acesso ao destino exige login. A emissão ou reemissão não altera a quantidade. A etiqueta e a leitura física ainda precisam de ensaio; a URL `127.0.0.1` não aponta ao computador quando aberta em outro dispositivo. Ver [relatório da 03C](docs/FASE_03C.md).

## Fase 03D — consulta e painel de validade

No estabelecimento selecionado, membros ativos consultam validade por produto, lote ou ID de recipiente. O painel classifica a data civil registrada como vencida, hoje, amanhã ou posterior usando o fuso da unidade e o relógio do dispositivo; não calcula nem altera prazos. A consulta percorre páginas e informa erro acima de 10.000 recebimentos, sem apresentar totais parciais. Registros inseridos durante a consulta podem aparecer apenas após atualizar. Consumo, descarte e correção auditável permanecem fora desta fase. Ver [plano e resultados da 03D](docs/FASE_03D.md).

## Pesquisa de mercado e módulos futuros

O estudo comparativo de Fixee, Yeschef, ValidaChef e Etiquetador, incluindo recomendações dos quatro agentes, riscos, fronteiras core/premium e roteiro de validação está em [Pesquisa competitiva e opções de módulos](docs/ESTUDO_COMPETITIVO_E_MODULOS.md). Os recursos e preços mencionados ali são descrições dos próprios fornecedores na data de consulta, não validação independente nem proposta comercial aprovada.

## Revisão da interface — gestão de unidades

Proprietários abrem "Gerenciar unidades" na organização para ver a contagem de vínculos ativos, renomear unidades e criar uma nova unidade com fuso brasileiro, após confirmação. O fuso não é alterado depois da criação e a unidade não pode ser excluída. A área logada passou a ter uma coluna, com alvos de toque de 44 px. Ver [relatório da revisão](docs/REVISAO_INTERFACE_UNIDADES.md).
