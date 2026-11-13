# Fase 5 — plano de consumo, descarte e histórico

Escopo inicial: registrar consumo ou descarte parcial de um recebimento, na unidade original; manter quantidade de entrada imutável e histórico de eventos com autor, instante e fuso do estabelecimento. O saldo registrado é a entrada menos as saídas; não comprova conferência física. A etiqueta e sua reimpressão não movimentam quantidade. A interface deve mostrar o contexto e saldo antes da confirmação e não presumir descarte ou decisão sanitária pela validade.

Critérios: apenas owner autorizado registra; membros autorizados consultam; anônimo, organização diferente, vínculo revogado, IDs de unidade falsificados e escritas diretas não acessam indevidamente. Quantidades positivas de até três casas decimais, inteiras para unidade `un`; sem saldo negativo mesmo em concorrência. Identificador de intenção garante reenvio sem duplicação, rejeitando reutilização com conteúdo ou autoria diferentes. Falhas devem ser visíveis e não apresentar sucesso fictício. Auditoria não permite edição ou remoção pelo cliente.

Testes primeiro: pgTAP positivo e negativo, integração via API com concorrência e reenvio, domínio e componente, E2E pertinente e gates gerais. Migração versionada, rollback testado e verificação de segurança. Sem deploy. A fase deve parar para aceite humano depois dos gates.

Riscos: correção de uma baixa incorreta exige evento compensatório auditado, antes de uso em piloto; perda da intenção após fechamento da aba exige estratégia de recuperação segura. Sem conversões, transferências, fracionamento, prazo sanitário automático ou estoque físico reconciliado. Revisões independentes de arquitetura, negócio e fluxo de cozinha apontaram esses requisitos; agentes não alteram arquivos.

## Base de banco — andamento

A migração adiciona eventos protegidos por RLS e função transacional para baixas. O teste inicial falhou por ausência da funcionalidade e passou após implementação. Os gates locais passaram: `npm run lint`, `npm run typecheck`, `npm run test` (62), `npm run build`, `npm run test:e2e` (3); `supabase test db` (107 verificações), `node --test tests/integration/*.test.mjs` (13) e `supabase db advisors --type security --level warn --fail-on warn` (sem ocorrências). O build mantém aviso de bundle 976,89 kB. A reversão em banco local sem movimentos e `supabase migration up` passaram; a reversão recusa remover histórico não vazio.

O teste concorrente real confirma que duas baixas que excederiam o saldo geram apenas uma saída, e que reenvios concorrentes idênticos geram um único evento. Quando a base foi concluída, ainda faltavam interface, integração E2E da nova jornada, correção auditável e recuperação segura após fechamento de aba.

## Interface demonstrativa — andamento

O painel passou a permitir consultar até 1.000 eventos, calcular saldo registrado e confirmar consumo ou descarte. A intenção é mantida por usuário, unidade e recebimento no armazenamento da aba para reenvio idempotente após erro incerto. O descarte exige motivo; o usuário pode corrigir antes do primeiro envio. Após recusa definitiva, atualiza o histórico antes de iniciar outra tentativa. Falha ao limpar a tentativa após confirmação é apresentada como saída confirmada. Etiqueta e consulta indicam quantidade inicial; a impressão não gera movimentação.

A revisão cruzada encontrou e motivou testes para correção antes do envio, recuperação de recusa e comunicação de falha local após confirmação. A interface exibe o limite de consulta sem saldo parcial. O fluxo ainda não resolve correção auditável de eventos, recuperação da intenção após fechar a aba, nem a consulta de saldo pela rota do QR; não é um piloto pronto. Contagens de validade continuam sendo de recebimentos históricos, inclusive os esgotados.

A resposta atrasada de uma tela anterior não pode apagar uma intenção mais recente: um teste reproduziu a falha antes de corrigi-la com guarda de montagem e conferência do identificador. A revisão arquitetural verificou a correção. A geração de PDF explicita quantidade inicial, sem movimentar saldo.

### Verificação da interface

- `npm run lint`, `npm run typecheck`, `npm run test`: sucesso, 70 testes em 17 arquivos. `npm run build`: sucesso, com aviso de bundle principal de 984,35 kB.
- `npm run test:e2e`: sucesso, 3 testes Chromium. A jornada inclui consumo parcial, nova sessão, descarte do restante e histórico; reimpressão mantém a quantidade original.
- `npm run test:coverage`: sucesso, 70 testes e 76,76% de linhas no total; `MovementPanel.tsx` 92% e `supabaseMovements.ts` 46,66%. Cobertura não inclui integração e E2E; adaptadores com lacunas permanecem explícitos no relatório.
- Os gates de banco e API descritos na seção anterior passaram antes da interface; não houve nova migração desde então. Alterados: configuração da aplicação, painel de lotes, componentes/gateway/testes de movimentações, etiqueta/PDF, E2E e decisões.

O usuário aceitou este incremento demonstrativo. Correção auditável, recuperação após fechar a aba e consulta de saldo pela rota do QR permanecem pendências; sem elas, não apresentar o sistema como pronto para piloto.

## Próximo incremento: estorno auditável

O proprietário poderá estornar integralmente uma baixa específica mediante motivo obrigatório e confirmação. O evento original permanece imutável e o evento compensatório registra vínculo, autoria, instante e fuso. O saldo registrado volta a refletir a compensação; isso não significa retorno físico de alimento. Não há estorno parcial nem estorno de estorno. Para corrigir quantidade, o usuário estorna a saída e registra nova baixa separadamente.

Aceite: autorização pelo banco e isolamento entre empresas; replay idêntico retorna o mesmo evento; reutilização com dados alterados e segundo estorno são recusados; operações concorrentes serializam no recebimento; nenhum saldo fica acima da quantidade inicial ou abaixo de zero; histórico, motivo e autor permanecem íntegros. Testes pgTAP, API concorrente, interface e E2E precedem ou acompanham a implementação. Recuperação após fechamento da aba permanece limitação explícita deste incremento.

## Anulação auditável — revisão e comportamento

A anulação cria compensação integral com motivo, autor, data, fuso e referência ao movimento original, sem alterar os eventos anteriores. Duas anulações concorrentes não duplicam o crédito. O replay é autorizado novamente e não cria outro evento; uma saída original já anulada também mantém sua identidade em replay. O saldo deriva das saídas menos as anulações. A confirmação identifica o lançamento original e explica que não há retorno físico de alimento; para substituir a saída, o operador registra outra separadamente.

As revisões independentes e críticas cruzadas de arquitetura, negócio e cozinha motivaram testes para motivo composto por espaços invisíveis, concorrência, identificação do alvo, armazenamento inválido e conflito após outra anulação. O banco recusa motivo sem conteúdo; na interface, um conflito confirmado permite consultar o histórico antes de iniciar outra tentativa. Um resultado de rede incerto continua associado à mesma intenção na aba. O limite de 1.000 eventos continua recusando consulta parcial.

A revisão paralela de unidades do Claude está no PR #1, ainda em rascunho e fora da `main`. Uma falha de callback após troca de sessão foi reproduzida e corrigida no commit `634eecc` dessa branch; os riscos de criação de unidade sem idempotência e de perda de formulário após atualização de acesso permanecem documentados naquele PR.

Limitações antes de piloto: a intenção não sobrevive ao fechamento da aba; a rota do QR ainda não consulta saldo; correções de recebimento, validade e cadastro não fazem parte desta anulação; o modelo físico do QR/PDF e as rotinas de operação ainda precisam de validação. Nunca interpretar anulação como recuperação física do produto.

### Verificação da anulação

- `supabase test db`: sucesso, 118 verificações; `node --test tests/integration/*.test.mjs`: sucesso, 13 testes, incluindo anulação concorrente, disputa com nova baixa e revogação; `supabase db advisors --type security --level warn --fail-on warn`: sem ocorrências.
- Rollback em banco local sem anulações e `supabase migration up`: sucesso. O rollback contém proteção que recusa remover histórico com anulações; não foi executado contra histórico real.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`: sucesso, 76 testes em 17 arquivos. O build manteve aviso de bundle principal de 987,32 kB.
- `npm run test:e2e`: sucesso, 3 testes Chromium, incluindo criação de saída, descarte e anulação com histórico. Uma execução anterior expirou aguardando a consulta de histórico em 5 segundos; a repetição passou. Foi adicionada indicação de carregamento e a bateria completa posterior passou. Não foi determinada a causa da demora pontual.
- `npm run test:coverage`: sucesso, 76 testes e 77,07% de linhas no total; `MovementPanel.tsx` 90,55% e `supabaseMovements.ts` 54,54%. Cobertura unitária não inclui API nem navegador.
- Arquivos alterados: migração e rollback de anulação, pgTAP e integração, domínio/gateway e interface de movimentação, testes de componente e E2E, decisões e este plano. O PR de unidades permanece fora da `main`; sua branch de rascunho foi atualizada com a anulação e validada em conjunto, conforme `REVISAO_INTERFACE_UNIDADES.md`.
