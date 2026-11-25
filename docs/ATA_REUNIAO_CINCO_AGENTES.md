# Ata — revisão com cinco agentes

**Data:** 14/11/2026. **Estado:** reunião concluída; verificação de banco bloqueada pelo Docker local.

**Base em análise:** `origin/main` em `14b448c`, incluindo alterações integradas até o PR #20. O [PR #21](https://github.com/luisdienstmanntd/cozinha-saas/pull/21) está em rascunho e será tratado separadamente.

**Participantes:** analista de cozinha e mercado, estrategista de negócio, arquiteto/QA, especialista em SaaS e desenvolvedor sênior de segurança, organização e escalabilidade. A capacidade de execução limita quantos participam ao mesmo tempo; as rodadas serão registradas aqui conforme as contribuições chegam. As falas abaixo serão atribuídas apenas a mensagens efetivamente recebidas.

## Rodada independente

**Analista de cozinha e mercado:** “A `main` em `14b448c` cobre recebimento, manipulação, armazenamento, consulta por QR, consumo, descarte e anulação. A 6.11 recusa consumo de vencidos e destaca recipientes vencidos com saldo registrado. Isso demonstra o comportamento do sistema, sem comprovar o saldo físico ou a segurança do alimento.” O agente recomenda ensaiar a jornada por turno com equipe e dispositivos, medir esperas e recuperação de erros e manter a preparação própria do PR #21 separada da funcionalidade integrada. Ressalta que uma observação de cozinha não comprova demanda geral.

**Estrategista de negócio:** a recuperação de tentativas, locais, pré-piloto e bloqueio de consumo vencido estão na `main`; o PR #21 permanece fora. Sugere simulação controlada com uma unidade e dados fictícios, seguida de validação com responsável técnico e ensaio físico. A permissão de escrita restrita ao proprietário é uma hipótese a medir no turno. O agente não considera preço nem economia validados e propõe calcular a margem considerando infraestrutura, suporte, consumíveis e implantação.

**Arquiteto/QA:** identificou hipótese de risco de integridade sob concorrência: uma baixa em um lote e uma decisão de ocorrência em outro lote da mesma unidade poderiam usar simultaneamente o mesmo `intent_id`, pois os bloqueios seriam por lote e as verificações entre tabelas ocorreriam antes das gravações. Referências: `supabase/migrations/20261114030000_expired_consumption.sql:34` e `supabase/migrations/20261113090000_conservation_occurrences.sql:864`; o agente recomenda teste em duas conexões e ressalta que o cenário foi inferido do SQL, não executado. A possível consequência é a recuperação por `find_operation` selecionar apenas uma das operações. O agente também observou autorização e bloqueio por lote no fluxo de baixa, RLS nas métricas e gates de banco/API/E2E em `.github/workflows/quality.yml`.

**Especialista em SaaS:** apontou que a configuração atual restringe o Supabase a ambiente local (`src/shared/config/environment.ts:3`) e que o PDF exige origem local (`src/features/labels/application/pdf.ts:161`); hospedagem, acesso pelo celular e validação pré-piloto continuam pendentes. Identificou também risco de recuperação de tentativas se o armazenamento do navegador falhar, expirar ou atingir o limite: `src/features/pending/domain/pending.ts:46` e `src/features/pending/application/trackGateways.ts:51`. A hipótese de duplicação exige resposta perdida e uma nova operação; ainda não foi reproduzida. O catálogo sem paginação, limitado a 1.000 itens, é outro limite a medir antes de priorizar escala.

**Desenvolvedor sênior de segurança, organização e escalabilidade:** avaliou a perda silenciosa da persistência de tentativas como risco alto para continuidade: `pending.ts:46–64,73–77` ignora erros e elimina itens acima do limite, enquanto `trackGateways.ts:51–65` prossegue com o envio. A consequência após resposta incerta ainda não foi reproduzida; propõe teste com falha de `setItem` e resposta perdida antes de escolher bloqueio ou recuperação explícita. Sobre organização, recomenda decompor arquivos grandes com testes e medir os limites de volume, sem antecipar microsserviços. Conferiu que a CI atual já possui gates de banco, API e E2E; não identificou bypass concreto de RLS nesta inspeção e não considera isso prova de segurança completa.

## Debate e críticas cruzadas

**Especialista em SaaS → Arquiteto/QA:** o especialista levou o risco de armazenamento ao arquiteto. O arquiteto classificou-o como P2 condicionado a falha ou descarte do armazenamento, resposta perdida e posterior envio com outra chave; observou que não identificou fallback em memória e pediu testes com `setItem` falhando e limite atingido. O especialista concordou com a prioridade e com reproduzir o caso antes de modificar o produto.

**Estrategista de negócio → arquitetura e SaaS:** “Se uma intenção colidir com registro de outra operação, receber confirmação do tipo errado pode mascarar uma baixa ou entrada incorreta.” Pede reproduzir reutilização de chave e conferir tipo, estabelecimento e alvo. Classifica como relevante para turno real a perda silenciosa de tentativa combinada com resposta incerta. Discorda de bloquear uma demonstração com dados fictícios por falta de QR em outro dispositivo ou da conferência técnica: esses pontos são condições para piloto operacional, não para a demonstração local.

**Analista de cozinha → negócio e arquitetura:** “A colisão aleatória de identificadores, sem evidência, tem prioridade menor. Já um falso sucesso reproduzível — confirmar uma intenção como se fosse outra operação — bloqueia o aceite.” Sugere simular perda de resposta e troca de operador, medir o tempo de reconciliação e manter Q10, QR físico e contingência como pendências para uso real.

**Arquiteto/QA → desenvolvedor sênior e mercado:** aceitou elevar a perda silenciosa de intenção de P2 na demonstração para P1 como condição de liberação do piloto. A diferença é a consequência operacional: persistência falha, resposta se perde e o operador pode reenviar com outra chave. Recomenda testar armazenamento bloqueado, quota, expiração e a 21ª tentativa; depois reproduzir perda de resposta e validar o tipo do resultado. Reconhece que colisão aleatória de UUID é improvável e que a corrida entre tabelas precisa de reprodução.

**Desenvolvedor sênior → negócio e mercado:** concorda que uma demonstração local supervisionada com dados fictícios pode prosseguir. Questiona bloquear toda escrita quando o armazenamento falha: isso pode paralisar o turno. Propõe avaliar fallback em memória com a mesma intenção, aviso de que não sobrevive ao fechamento e bloqueio apenas da operação incerta, condicionado a testes de reabertura e conferência. Considera hipótese não reproduzida tanto a corrida entre tabelas quanto a sobrescrita entre abas; confirma por leitura que a tela não compara o tipo retornado antes de marcar uma tentativa como confirmada.

**Especialista em SaaS → desenvolvedor sênior:** propõe inicialmente recusar o início da escrita se não for possível guardar a intenção, com erro recuperável; admite uma contingência explícita por identificador consultável, sujeita a teste. Pediu ao colega crítica de custo e usabilidade.

**Desenvolvedor sênior → especialista em SaaS:** “Concordo com bloquear a operação afetada enquanto não existir mecanismo confiável de reconciliação; bloquear toda escrita apenas por falha de localStorage pode paralisar o turno.” Explica que fallback em memória requer novos estados e treinamento e não sobrevive ao fechamento; recuperação persistente no servidor exige isolamento multiempresa e testes de concorrência. Um UUID isolado não garante recuperação. O especialista em SaaS concordou que, sem alternativa comprovada, recusar a escrita afetada é o padrão mais seguro, e pediu validação do custo operacional com a equipe.

**Desenvolvedor sênior → grupo:** por inspeção, duas abas do mesmo usuário podem sobrescrever o array de tentativas ao fazer leitura e gravação separadas (`pending.ts:73–77`); o caso ainda precisa de teste com duas abas e respostas perdidas. O conteúdo das tentativas inclui dados operacionais, motivos e identificadores, exigindo avaliação de minimização em dispositivos compartilhados. Não identificou segredos armazenados.

## Conclusões e relatório

### 1. Recuperação de tentativa e integridade — prioridade alta antes de piloto

Por leitura de `src/features/pending/domain/pending.ts:46–77`, erros de leitura/escrita são tratados como lista vazia ou ignorados, e o registro mais antigo pode ser descartado ao ultrapassar 20 entradas; o prazo é de 24 horas. `src/features/pending/application/trackGateways.ts:51–65` prossegue com a operação após tentar salvar. **O comportamento do código foi inspecionado; duplicação efetiva sob falha de armazenamento e resposta perdida não foi reproduzida nesta reunião.**

O grupo recomenda escrever testes que provoquem erro de gravação, quota, 21ª tentativa, expiração, resposta perdida e reabertura, além da disputa entre duas abas. Conferir no banco que há apenas um evento e uma alteração de saldo. Decidir, depois dos testes, entre recusar a operação afetada e um modo degradado explícito; não impor bloqueio geral sem avaliar a operação da cozinha. Até existir alternativa confiável, a recomendação mais segura é não enviar a escrita afetada sem preservar a intenção.

### 2. Confirmação de operação diferente — hipótese a reproduzir

`src/features/pending/components/PendingAttempts.tsx:84–90` trata qualquer resultado encontrado como confirmado. O `find_operation` em `supabase/migrations/20261114010000_locations.sql:340–382` retorna um resultado por ordem de prioridade. O arquiteto identificou cenário possível de reutilização de intenção entre tipos/lotes distintos; **não há teste executado nesta reunião que comprove colisão, corrida ou falso sucesso real**. UUID aleatório colidir é improvável; a verificação com identificador deliberadamente reutilizado testa uma condição de integridade mais concreta.

Recomendação: teste de componente com resposta de tipo diferente e teste de API/DB com duas conexões e lotes distintos; então exigir correspondência de tipo, escopo e alvo antes de confirmar. A correção estrutural da unicidade deve considerar os vínculos intencionais entre operações, sem quebrar replay legítimo. Não se constatou bypass de RLS nesta inspeção.

### 3. Demonstração versus piloto

Os agentes concordam em realizar demonstração supervisionada com dados fictícios para avaliar o fluxo; ela não comprova prontidão para operação em cozinha. Para piloto real, seguem pendentes Q10/responsável técnico, ambiente hospedado autorizado, política de acesso e suporte, restauração de backup, QR acessível pelo dispositivo pretendido, ensaio físico de etiqueta e procedimento de contingência. Consultar `docs/PRE_PILOTO.md` e as decisões da fase. Não prometer prazo sanitário, conformidade ou economia sem validação.

O objetivo comercial sugerido é observar uma unidade, medir tempo, esperas pelo proprietário, erros e tentativas fora do sistema e custo de implantação/suporte. Preço e disposição a pagar seguem hipóteses. O PR #21 trata da próxima fatia de preparação própria e **não integra a base desta revisão**.

### 4. Organização e escala

O limite de catálogo de 1.000 registros e componentes extensos, incluindo `src/features/batches/components/BatchPanel.tsx`, são pontos de manutenção e volume, não prova de problema de desempenho em produção. Medir uso e decompor gradualmente com testes; manter monólito modular e evitar ampliar infraestrutura prematuramente. A CI definida em `.github/workflows/quality.yml` inclui gates de banco, advisors, API e E2E.

### Evidências e limites da reunião

- Base Git inspecionada: `14b448c`; PR #21 em rascunho e não alterado. O índice `docs/IA_ESTADO.md` contém entradas históricas contraditórias com merges posteriores; o Git remoto foi usado para distinguir o estado atual.
- Executados localmente: `npm run lint`, `npm run typecheck`, `npm run test` (237 testes) e `npm run build`: sucesso. Build avisou que o pacote principal excede 500 kB.
- Docker respondeu `Docker Desktop is unable to start`; portanto pgTAP, integração/API, advisors e E2E dependentes da stack não foram executados nesta reunião. Não se declara validação de isolamento, concorrência ou segurança de banco por esses comandos.
- O teste de TOML confirmou que os dois arquivos novos são sintaticamente válidos e têm os nomes correspondentes. Os perfis foram executados nesta reunião como agentes de análise com suas instruções; a disponibilidade automática deles em sessões futuras depende de o cliente carregar os arquivos do projeto.
- Os agentes não editaram arquivos nem alteraram o produto. A priorização é uma recomendação; nenhuma correção de produto foi implementada nesta reunião.
