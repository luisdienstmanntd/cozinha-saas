# Ata — revisão com cinco agentes

**Data:** 14/11/2026. **Estado:** reunião em andamento.

**Base em análise:** `origin/main` em `14b448c`, incluindo alterações integradas até o PR #20. O [PR #21](https://github.com/luisdienstmanntd/cozinha-saas/pull/21) está em rascunho e será tratado separadamente.

**Participantes:** analista de cozinha e mercado, estrategista de negócio, arquiteto/QA, especialista em SaaS e desenvolvedor sênior de segurança, organização e escalabilidade. A capacidade de execução limita quantos participam ao mesmo tempo; as rodadas serão registradas aqui conforme as contribuições chegam. As falas abaixo serão atribuídas apenas a mensagens efetivamente recebidas.

## Rodada independente

**Analista de cozinha e mercado:** “A `main` em `14b448c` cobre recebimento, manipulação, armazenamento, consulta por QR, consumo, descarte e anulação. A 6.11 recusa consumo de vencidos e destaca recipientes vencidos com saldo registrado. Isso demonstra o comportamento do sistema, sem comprovar o saldo físico ou a segurança do alimento.” O agente recomenda ensaiar a jornada por turno com equipe e dispositivos, medir esperas e recuperação de erros e manter a preparação própria do PR #21 separada da funcionalidade integrada. Ressalta que uma observação de cozinha não comprova demanda geral.

**Estrategista de negócio:** a recuperação de tentativas, locais, pré-piloto e bloqueio de consumo vencido estão na `main`; o PR #21 permanece fora. Sugere simulação controlada com uma unidade e dados fictícios, seguida de validação com responsável técnico e ensaio físico. A permissão de escrita restrita ao proprietário é uma hipótese a medir no turno. O agente não considera preço nem economia validados e propõe calcular a margem considerando infraestrutura, suporte, consumíveis e implantação.

**Arquiteto/QA:** identificou hipótese de risco de integridade sob concorrência: uma baixa em um lote e uma decisão de ocorrência em outro lote da mesma unidade poderiam usar simultaneamente o mesmo `intent_id`, pois os bloqueios seriam por lote e as verificações entre tabelas ocorreriam antes das gravações. Referências: `supabase/migrations/20261114030000_expired_consumption.sql:34` e `supabase/migrations/20261113090000_conservation_occurrences.sql:864`; o agente recomenda teste em duas conexões e ressalta que o cenário foi inferido do SQL, não executado. A possível consequência é a recuperação por `find_operation` selecionar apenas uma das operações. O agente também observou autorização e bloqueio por lote no fluxo de baixa, RLS nas métricas e gates de banco/API/E2E em `.github/workflows/quality.yml`.

**Especialista em SaaS:** apontou que a configuração atual restringe o Supabase a ambiente local (`src/shared/config/environment.ts:3`) e que o PDF exige origem local (`src/features/labels/application/pdf.ts:161`); hospedagem, acesso pelo celular e validação pré-piloto continuam pendentes. Identificou também risco de recuperação de tentativas se o armazenamento do navegador falhar, expirar ou atingir o limite: `src/features/pending/domain/pending.ts:46` e `src/features/pending/application/trackGateways.ts:51`. A hipótese de duplicação exige resposta perdida e uma nova operação; ainda não foi reproduzida. O catálogo sem paginação, limitado a 1.000 itens, é outro limite a medir antes de priorizar escala.

**Desenvolvedor sênior de segurança, organização e escalabilidade:** aguardando rodada independente.

## Debate e críticas cruzadas

**Especialista em SaaS → Arquiteto/QA:** o especialista levou o risco de armazenamento ao arquiteto. O arquiteto classificou-o como P2 condicionado a falha ou descarte do armazenamento, resposta perdida e posterior envio com outra chave; observou que não identificou fallback em memória e pediu testes com `setItem` falhando e limite atingido. O especialista concordou com a prioridade e com reproduzir o caso antes de modificar o produto.

As demais críticas cruzadas aguardam a contribuição do desenvolvedor sênior.

## Conclusões e relatório

A consolidar após o debate.
