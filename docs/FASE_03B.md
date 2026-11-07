# Fase 03B — registro de recebimento de lote

Autorizada em 06/11/2026 após aceite da 03A. Escopo: registrar e consultar recebimento de lote no estabelecimento selecionado, com produto e fornecedor do mesmo estabelecimento, identificação de origem, quantidade positiva na unidade do produto e validade informada. Cada registro mantém autoria, instante e fuso do estabelecimento. Não gerar prazo sanitário nem tratar papel de proprietário como qualificação profissional.

## Plano e critérios de aceite

- Lote de recebimento imutável, sem saldo calculado, fracionamento, etiqueta ou movimentações de saída. Correção auditável será definida antes do piloto.
- Produto e fornecedor referenciados por chaves compostas de organização e estabelecimento. A unidade de medida é obtida do produto pelo banco; quantidade decimal exata positiva, com escala e limites explícitos, sem arredondamento silencioso.
- Data civil de validade explicitamente informada, com origem original ou definida pelo responsável; preservar a validade original quando conhecida e registrar autoria. Sem cálculo de prazo e sem confundir data civil com instante UTC.
- Autor e instante determinados pelo banco. Leitura por membro ativo; cadastro por proprietário ativo enquanto não houver decisão de delegação.
- Identificador de intenção estável por tentativa. Repetição com mesmos dados devolve o mesmo registro, repetição com dados divergentes falha e uma nova intenção permite outro recebimento legítimo com mesmo código de lote. Revalidar autorização no replay, inclusive após revogação. Operação atômica também sob concorrência real.
- Estados de carregamento, erro, envio e confirmação na interface; preservar formulário em erro e impedir dados de unidade anterior após troca ou logout.
- Testes obrigatórios: funções puras e componentes; pgTAP e cliente real com duas organizações e referências adulteradas, autoria, quantidade e datas inválidas; concorrência, replay após perda de resposta e após revogação; E2E login, cadastro, consulta após nova sessão e erro. Executar regressões, rollback/reaplicação, lint, typecheck, test, build e revisão independente. Não iniciar 03C sem aceite.

## Estado

Implementada e validada localmente em 06/11/2026, aguardando aceite humano. O cadastro usa a função `receive_batch`: o banco autoriza, deriva a unidade e o fuso, grava a autoria e impede alterações/deleções pelo cliente. A chave de reenvio fica no armazenamento da aba, isolada por usuário e estabelecimento; sobrevive à recarga e à troca de unidade na mesma aba. Após perda de resposta, é necessário preencher os mesmos dados para reaproveitar a intenção. Ao fechar a aba ou limpar seus dados, essa recuperação deixa de estar disponível; confira os recebimentos antes de tentar novamente. Um conflito com dados diferentes exige conferência e ação explícita para iniciar outra tentativa.

## Verificações locais

- `supabase db reset --no-seed`: exit 0 após executar o rollback de 03B com `psql -v ON_ERROR_STOP=1`; lote removido e catálogo preservado, três migrações reaplicadas.
- `supabase test db`: exit 0, 81 verificações pgTAP, incluindo as regressões das Fases 2 e 03A. `node --test tests/integration/*.test.mjs`: exit 0, 11 testes incluindo dois envios concorrentes, payload alterado, outra empresa e revogação.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` e `npm run test:e2e`: exit 0. Vitest: 39 testes em 9 arquivos; E2E: um fluxo Chromium de cadastro, recebimento, troca de unidade e nova sessão. Build: aviso informativo de JS de 543,35 kB (154,93 kB gzip).
- `supabase db advisors --type security --level warn --fail-on warn`: exit 0, sem ocorrências.
- `npm run test:coverage`: exit 0, 38 testes antes do último ajuste do fluxo de conflito; linhas totais 70,31%. Por arquivo: BatchPanel 57,57%, CatalogPanel 100%, IdentityHome 94,73%, App 40%, configureApp 66,66%, adapters Supabase 0% em Vitest. Cobertura não mede E2E, testes via API ou RLS; ramos não cobertos permanecem lacuna.
- Um teste E2E falhou inicialmente por seletor ambíguo e outro por seletor de rótulo incompatível; corrigidos e reexecutados com sucesso. A revisão arquitetural identificou validade original nula, datas fora do intervalo suportado, código com espaços especiais, catálogo desatualizado e conflitos entre usuários na mesma aba; correções aplicadas com testes. Também identificou que a lista podia estar desatualizada em conflito: a interface agora exige atualização bem-sucedida antes de liberar nova tentativa.

Não há edição, estorno, saldo, etiqueta ou painel de validade. O formulário usa a lista limitada a 1.000 produtos e fornecedores por estabelecimento. Antes do piloto, definir correção auditável e recuperação de intenção após encerramento da aba. Sem deploy. Aceite humano recebido em 07/11/2026, autorizando a 03C.
