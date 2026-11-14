# Fase 7, fatia 7.9 — temperatura opcional da produção

> Autorizada por luis em 14/11/2026 (21:20 UTC), junto com o aceite da 7.8: "Autorizo o início da Fase 7.9, exclusivamente conforme o desenho existente." Segue o [desenho da Fase 7](FASE_07_DESENHO.md) (7.9 e resposta 7 de luis: "temperatura no fim do resfriamento ou no reaquecimento: não obrigatória, mas a função deve existir"; "sem classificar como conforme", como a D-027). Decisão: **D-058** (abaixo), **aceita por luis em 14/11/2026, 21:42 UTC (3 pontos)**. **Nada aqui afirma conformidade sanitária**: o sistema só guarda o número que a pessoa mediu, não diz se está adequado e não usa faixa alguma, porque nenhuma faixa foi aprovada pela nutricionista RT (Q10, pendente). O teste físico de impressão também segue pendente. Dados de teste sintéticos.

## O que mudou

### Banco (migração `20261114100000_production_temperature.sql`)

- **`production_temperatures`:** registro append-only (ninguém altera, apaga ou trunca, nem o `service_role`) de cada medição: lote, momento (`fim do resfriamento` ou `reaquecimento`), temperatura (de -50 a 80 °C, uma casa decimal), horário da medição, quem registrou e o **nome dele copiado** no registro (a leitura do colaborador não alcança os outros vínculos). Repetir a medição cria outra linha; nada é sobrescrito.
- **`record_production_temperature(empresa, unidade, lote, momento, temperatura, horário)`:** só lote **produzido pela cozinha** (recebimento tem a temperatura do recebimento, D-027); produção anulada recusa; o horário não pode estar no futuro nem (em minutos) antes da produção; quem registra precisa ter nome de exibição.
- **Quem registra:** o proprietário e, quando a unidade deixa o colaborador registrar produção (7.6), o colaborador **só da própria produção**. No padrão, só o proprietário (D-019).
- **Sem classificação:** a tabela não tem coluna de resultado, não cria ocorrência, não bloqueia o lote e não usa faixa. 80 °C e -50 °C são aceitos como qualquer valor dentro da faixa técnica; ela só recusa digitação absurda.
- **Não é estoque (D-003):** não cria lote, recipiente, saldo nem movimento. Um teste confere as contagens antes e depois.
- **Proteção do histórico:** `private.assert_history_protected()` passou a incluir a tabela nova (as listas fixas dos testes só cresceram).

### Tela (Produção da cozinha)

- **"Registrar temperatura {recipiente}"** em cada produção não anulada, para quem pode registrar (proprietário; colaborador só na própria produção, no modo da 7.6). Formulário com momento, temperatura (aceita vírgula) e horário da medição (padrão: agora, no fuso da unidade), com o aviso "O sistema não avalia se a temperatura está adequada, não cria ocorrência e não bloqueia o lote."
- **Lista por produção:** "Fim do resfriamento: 4,5 °C, medida em …, registrada por … (informada; o sistema não avalia)".
- O banco decide quem pode; a tela só repete as mensagens conhecidas (lista exata, conferida contra as migrações por teste).

## Testes

Todos executados neste ambiente, com o banco local recém-recriado (`npm run db:reset`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | ok |
| `npm run test` (Vitest) | 319 passaram (11 novos: esquema, tela e papéis) |
| `npm run test:db` (pgTAP) | 1412 passaram (26 arquivos; `production_temperature.test.sql` com 52 novos; 2 rodadas seguidas verdes) |
| `npx supabase db advisors` | sem problemas |
| `npm run test:integration` | 39 passaram (`production-temperature.test.mjs` novo) |
| Playwright (config local com o Chromium do ambiente) | 21 passaram (1 novo) |

O pgTAP novo cobre: tabela, RLS, privilégios, gatilho append-only, papéis (proprietário, colaborador no padrão e no modo da 7.6 só na própria produção, outra empresa, vínculo revogado), valores (limites, casas decimais, NaN, nulo, momento desconhecido), horário (futuro, antes da produção, mesmo minuto), lote certo (recebimento e inexistente recusados), produção anulada, nome de exibição obrigatório, ausência de ocorrência e de efeito no estoque, ausência de coluna de classificação e leitura isolada por empresa.

**Mudanças em testes existentes (só crescimento de listas fixas, nenhum teste enfraquecido):** `rls_set_based.test.sql` (política `production_temperatures_read`) e `security_guard.test.sql` (a tabela nova entra nas listas de histórico).

**Um achado durante o E2E, corrigido antes da entrega:** o horário padrão da medição é o minuto atual, e a produção registrada na hora tem segundos; a primeira versão recusava "antes da produção" por segundos. A regra passou a comparar em minutos (a tela trabalha em minutos), com teste novo no pgTAP. Nada foi relaxado além disso: medições de horas antes da produção continuam recusadas.

O arquivo de teste novo se chama `production_temperature.test.sql`, depois de `handling_void.test.sql` na ordem alfabética.

## Limites conhecidos

1. **Sem faixa, sem alerta, sem selo.** Nenhum valor é "conforme" ou "fora"; a avaliação continua com a cozinha e com a nutricionista RT.
2. **Sem correção nem anulação de medição.** Um valor digitado errado fica no histórico; registra-se outro. Uma anulação com motivo seria fatia própria.
3. **Sem repetição segura por identificador.** Um clique duplo pode gravar duas linhas iguais (o botão fica desabilitado durante o envio, e as duas aparecem na lista com o horário).
4. **A temperatura não aparece na etiqueta nem no painel de vencimentos**, só na tela de Produção.
5. **Só lote produzido pela cozinha.** A temperatura de recebimento continua sendo a da D-027.
6. **Sem módulo de equipamentos:** o número é digitado, não vem de termômetro.

## Pontos para luis decidir

1. **Quem registra a temperatura.** Proposta: o proprietário em qualquer produção; o colaborador só na própria, e só se a unidade permitir produção por colaborador (7.6). A alternativa seria deixar qualquer pessoa com vínculo registrar, o que abriria uma escrita nova no padrão.
2. **Faixa técnica de -50 a 80 °C** (a mesma já usada no recebimento) só para recusar digitação absurda, sem significado sanitário. Proposta: manter.
3. **Medição não é corrigida nem anulada nesta fatia** (limite 2). Proposta: aceitar e avaliar no piloto se faz falta.

## Decisão proposta para `DECISOES.md`

> **D-058 — Temperatura opcional da produção (14/11/2026).** Status: aceita por luis em 14/11/2026, 21:42 UTC (3 pontos). Implementada na fatia 7.9 ([registro](FASE_07_9.md)). Decisão: a produção da cozinha pode ter temperaturas registradas (fim do resfriamento, reaquecimento), de forma opcional, em tabela append-only, por quem pode registrar produção (D-019 e 7.6; o colaborador só da própria). O sistema não classifica, não usa faixa, não cria ocorrência, não bloqueia e não mexe no estoque (D-003, como a D-027). Motivo: resposta 7 de luis ao questionário e desenho da Fase 7. Consequência: encerra o mínimo e as fatias 7.1 a 7.9 do desenho; o que sobrar fica em `FASE_07_DESENHO.md`, seção 8. Revisar quando: a nutricionista RT definir faixas e a observação do piloto mostrar se falta correção ou anulação de medição.

## Aceite de luis (14/11/2026, 21:42 UTC)

1. **Aprovado:** o proprietário registra temperatura em qualquer produção da unidade; o colaborador só na própria produção, quando a permissão da unidade (7.6) estiver habilitada.
2. **Aprovado:** a faixa técnica de -50 a 80 °C vale **exclusivamente como validação de entrada**. O sistema não usa esses valores para afirmar conformidade sanitária, liberar produtos nem definir condições adequadas de conservação.
3. **Aprovado provisoriamente:** medição incorreta permanece no histórico e pode-se registrar nova medição. A futura funcionalidade de **invalidar uma medição, com motivo obrigatório e sem excluir nem alterar o registro original**, está no `BACKLOG.md`.

Aprovou a D-058 e deu por **aceito o desenvolvimento funcional das fatias 7.1 a 7.9**, sujeito à integração dos PRs, à revisão final e aos testes completos. Pediu o relatório de encerramento técnico da Fase 7 ([FASE_07_ENCERRAMENTO.md](FASE_07_ENCERRAMENTO.md)). A validação sanitária e a impressão física seguem pendentes antes do piloto operacional.

## Próximo passo

Relatório de encerramento (feito). Sem merge, deploy ou mudança fora do escopo sem autorização específica. A validação normativa da nutricionista RT e o teste físico de impressão seguem obrigatórios antes do piloto operacional.
