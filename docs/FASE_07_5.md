# Fase 7, fatia 7.5 — porcionar preparação na tela e métricas do piloto

> Autorizada por luis em 14/11/2026 (16:41 UTC), junto com o aceite da 7.4: "Autorizo o início da Fase 7.5 — Porcionamento de preparações na interface e métricas do piloto, conforme o desenho aprovado." Segue o [desenho da Fase 7](FASE_07_DESENHO.md) (seções 4.3, 9 e 16.B), a D-049 e as D-050 a D-053. Decisão proposta: **D-054** (abaixo), **aguardando aceite de luis**. **Nada aqui afirma conformidade sanitária**; a conferência pela nutricionista RT (Q10) e a impressão física seguem como pendências do piloto (`PRE_PILOTO.md`, seção 5). Dados de teste sintéticos.

## O que mudou

### Banco (migração `20261114060000_production_portioning.sql`)

- **Horário mínimo do porcionamento de preparação:** o integral de um lote produzido pode ser porcionado a partir do horário da produção (`batch_productions.produced_at`), não do registro do lote. Era o limite 1 da 7.1. Para recebimento, nada muda.
- **Validade da porção de preparação = validade do recipiente de origem** (decisão B de luis, 14/11/2026 15:47 UTC: "igual à do lote" por padrão). Vale para porção de porção também. A opção "igual ou menor" é configuração da 7.6; validade maior continua recusada pela regra da 6.3. O sistema não calcula prazo: só confere que a data é a mesma.
- "Abrir" preparação continua recusado pelo gatilho da 7.1, com a mesma mensagem.
- **`pilot_metrics`** ganha, no fim, as métricas de produção (só leitura, pela RLS, SECURITY INVOKER; recriada como na 6.11): `productions_total`, `productions_late`, `production_delay_p50_seconds`, `production_delay_max_seconds` (registro menos horário da produção), `production_voids_total`, `production_portionings_total` e `occurrences_late_production`. As colunas anteriores ficam iguais.

### Tela

- Para preparação própria, o botão da lista de recipientes e da página do QR diz **"Porcionar"**.
- O formulário não oferece "Abrir embalagem" e explica: "Preparação própria não é aberta: divida em porções."
- **Sem campo de validade:** a tela mostra "Validade da porção: dd/mm/aaaa" com a explicação de que é a mesma do lote, informada pelo responsável na produção. A revisão repete "(a mesma do lote)".
- Horário: "Porcionado em". Sobra no integral: "O restante continua no recipiente da produção?".
- As etiquetas das porções saem no modelo "Preparação própria" (7.4).

## Testes

Todos executados neste ambiente, com o banco local recém-recriado (`npm run db:reset`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | ok |
| `npm run test` (Vitest) | 275 passaram (2 novos no formulário de porcionar) |
| `npm run test:db` (pgTAP) | 1223 passaram (22 arquivos; `production_portioning.test.sql` com 21 novos) |
| `npx supabase db advisors --type security --level warn --fail-on warn` | sem problemas |
| `npm run test:integration` | 35 passaram (`production-portioning.test.mjs` novo) |
| Playwright (config local com o Chromium do ambiente) | 17 passaram |

Testes alterados, sem enfraquecer: no `production.spec.mjs` da 7.4 (ainda sem merge), o porcionamento da preparação passou a usar o botão "Porcionar", confere que "Abrir embalagem" e o campo de validade não aparecem e que a validade da porção é a do lote. Antes ele digitava uma validade menor, o que agora o banco recusa.

Na primeira rodada do pgTAP, o teste 54 de `production.test.sql` ("abrir preparação é recusado") recebeu a mensagem nova de validade em vez da recusa de abrir. A regra nova passou a valer só para porcionamento, e a recusa de abrir voltou a aparecer com a mesma mensagem. O teste não foi alterado.

## Limites conhecidos

1. **Sem tela de métricas:** as métricas são lidas pela função `pilot_metrics`, como as da 6.10 e 6.11.
2. A tela reconhece a preparação pelo lote sem código de fabricante, que o banco garante só para lote produzido (D-050).
3. As configurações por unidade (quem registra, janela por preparação, tempo sem etiqueta, regra "igual ou menor" da porção) são das fatias 7.6 a 7.9 e exigem aprovação própria.

## Pontos para luis decidir

1. **Porção sem campo de validade:** até a configuração da 7.6, a tela não deixa digitar e mostra a validade do lote. Proposta: manter.
2. **Sobra no recipiente da produção:** ao porcionar só parte do lote, o restante pode continuar no recipiente original da produção (mesmo saldo, mesma etiqueta). Proposta: manter.
3. **Métricas de produção pela função**, sem tela nesta fatia. O atraso (registro menos produção) responde ao risco R-1 (gargalo do proprietário, D-019). Proposta: manter; uma tela de métricas, se for útil, vira fatia própria.

## Decisão proposta para `DECISOES.md`

> **D-054 — Porcionar preparação e métricas de produção (14/11/2026).** Status: proposta, aguardando aceite de luis; implementada na fatia 7.5 ([registro](FASE_07_5.md)). Decisão: preparação própria só é porcionada; o porcionamento do integral vale a partir do horário da produção; a porção leva a mesma validade do recipiente de origem (decisão B, padrão até a configuração da 7.6) e a tela não oferece campo de data; a sobra pode ficar no recipiente da produção; `pilot_metrics` ganha produções, produções tardias, atraso de registro (mediana e máximo), anulações de produção, porcionamentos de preparação e ocorrências de produção tardia. Motivo: D-049, D-050, D-053, decisão B de luis (14/11/2026), R-1 do desenho da Fase 7. Consequência: a 7.6 transforma a regra da porção em configuração ("igual" ou "igual ou menor", nunca maior). Revisar quando: a 7.6 chegar ou a observação do piloto mostrar outra necessidade.

## Próximo passo

Aceite de luis (3 pontos e D-054). Com a 7.5, o mínimo da Fase 7 (7.1 a 7.4) e o ajuste da 7.5 estão feitos; as fatias 7.6 a 7.9 exigem aprovação própria. Sem merge, deploy ou mudança fora do escopo sem autorização específica de luis.
