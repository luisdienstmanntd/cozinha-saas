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

Planejamento inicial; implementação e testes ainda não executados. A revisão independente de arquitetura, negócio e mercado identificou os requisitos acima; não representa aprovação da implementação.
