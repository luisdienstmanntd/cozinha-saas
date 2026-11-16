# V5 — Vírgula decimal nas quantidades (D-063)

Item M5 da [revisão visual](REVISAO_VISUAL_FASE_07.md). **Autorizada por luis em 16/11/2026, 21:10 UTC**, na mesma mensagem do aceite final da V4, com sete requisitos. Implementada na branch `claude/revisao-v5-virgula-decimal`, sobre a ponta da V4 (PR #37). **D-063 aceita por luis em 16/11/2026, 22:08 UTC** (ver Aceite). Sem merge nem deploy.

Só interface: nenhuma migração, política RLS, função do banco, esquema de domínio, regra de validade, saldo, movimentação, permissão ou auditoria mudou.

## Requisitos de luis e como foram atendidos

| Nº  | Requisito                                                              | Como ficou                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Aceitar vírgula e ponto como separadores decimais                      | `2,5` e `2.5` valem o mesmo nas quatro telas que recebem quantidade digitada: recebimento, saída (consumo/descarte), abrir/porcionar e produção.                                                    |
| 2   | Evitar interpretações ambíguas, com regras explícitas                  | Regra única em `src/shared/format/quantity.ts` (seção abaixo). `1.000,50`, `1,000.50` e `1.500` são recusados com mensagem própria, antes de qualquer envio.                                        |
| 3   | Manter validações de quantidade, precisão e limites                    | Os esquemas de domínio (`batch.ts`, `handling.ts`, `production.ts`) e a validação da saída não mudaram: até 10 dígitos inteiros, até 3 casas, maior que zero, até um bilhão, unidade inteira.     |
| 4   | Não modificar saldos ou movimentações já registrados                   | Nenhuma migração nem escrita nova. Só muda o texto aceito na digitação; o que já está gravado continua igual.                                                                                     |
| 5   | Manter cálculos e persistência no formato numérico existente           | A tela converte o texto para a forma com ponto (`2,5` → `2.5`) e entrega aos mesmos esquemas e às mesmas funções do banco, como antes. As contas da tela continuam em milésimos inteiros.          |
| 6   | Testes unitários, de integração e E2E para valores brasileiros e inválidos | 80 testes unitários novos, 1 de integração com o banco real e 2 E2E (seção Testes).                                                                                                           |
| 7   | Preservar permissões, segurança, RLS e auditoria                       | Nada no banco mudou. A integração confirma que a API continua recusando vírgula e milhar enviados direto, que a outra empresa continua sem acesso e que o saldo acima do registrado é recusado.  |

## Regra de leitura da quantidade (D-063)

A quantidade digitada passa por `parseQuantity` antes da validação de sempre:

1. Espaços nas pontas são ignorados. Espaço no meio (`1 500`), sinal (`-1`, `+1`), letra (`2,5 kg`, `1e3`) e separador sem número de um dos lados (`,5`, `2,`) são recusados.
2. **No máximo um separador.** Vírgula e ponto juntos (`1.000,50`, `1,000.50`) ou o mesmo separador repetido (`1.000.000`) são recusados: o sistema **não aceita separador de milhar**. Mensagem: "Quantidade com mais de um separador: não use separador de milhar. Escreva, por exemplo, 1500 ou 1500,5."
3. **Vírgula é sempre decimal** (padrão brasileiro): `1,5`, `1,500` e `0,250` são um e meio, um e meio e um quarto.
4. **Ponto é decimal, exceto quando vem seguido de exatamente três dígitos e a parte inteira não é zero** (`1.500`, `2.000`, `12.125`). No costume brasileiro isso é milhar; no americano, decimal. É recusado como ambíguo. Mensagem: "Quantidade ambígua: "1.500" pode ser milhar ou decimal. Para decimais use vírgula (por exemplo 1,5); para milhar escreva sem separador (por exemplo 1500)." `0.250`, `1.25` e `2.5` não são ambíguos e continuam aceitos.
5. Depois da conversão, valem as validações de antes, sem mudança: zero, zero à esquerda (`01,5`), mais de três casas (`1,2345`), acima de um bilhão e fração em produto medido em unidades (`2,5 un`) continuam recusados com as mensagens de sempre.

| Digitado           | Resultado               |
| ------------------ | ----------------------- |
| `2,5` / `2.5`      | 2.5                     |
| `0,250` / `0.250`  | 0.25                    |
| `1,500`            | 1.5                     |
| `1500` / `1500,5`  | 1500 / 1500.5           |
| `1.500` / `2.000`  | recusado (ambíguo)      |
| `1.000,50`         | recusado (milhar)       |
| `1,000.50`         | recusado (milhar)       |
| `1,2345`           | recusado (4 casas)      |
| `0,0`              | recusado (zero)         |

**Mudança de comportamento (confirmada por luis em 16/11/2026, 22:08 UTC):** antes da V5, a tela pedia "use ponto" e aceitava `1.500` como um e meio. Agora `1.500` é recusado e a mensagem orienta a digitar `1,5`. Quem se acostumou com o ponto e três casas (por exemplo `1.250` kg) vai ver a recusa uma vez. `1.25` e `0.250` continuam aceitos. Alternativa, se luis preferir: aceitar ponto com três casas como decimal (o comportamento antigo) e recusar só as formas com dois separadores. A recomendação é manter a recusa, porque na cozinha brasileira `1.500` é mais provável como mil e quinhentos do que como um e meio, e um erro de mil vezes no saldo é pior do que pedir para digitar de novo.

## O que mudou nas telas

- **Recebimento:** aceita `12,5`; separador de milhar e entrada ambígua ganham a mensagem própria no lugar de "Confira produto, fornecedor, quantidade e datas informadas."
- **Saída:** a dica passou de "Use ponto para decimais, por exemplo 0.5." para "Use vírgula ou ponto para decimais, por exemplo 0,5. Não use separador de milhar." A tentativa pendente e o saldo previsto aparecem com vírgula ("consumo de 0,75 kg", "Saldo após a operação, se confirmada: 11,75 kg").
- **Abrir / porcionar:** mesma dica; soma, sobra e revisão com vírgula ("Soma: 2,25 kg de 11,75 kg — sobra: 9,5 kg."). "Dividir igualmente" preenche com vírgula (`3,333`), o que evita que o próprio preenchimento caia na regra do ponto com três casas.
- **Produção:** a mensagem de quantidade inválida fala em vírgula ou ponto; a revisão mostra "Quantidade: 3,5 l".
- **Temperatura** (recebimento e produção) ficou fora: a V5 trata de quantidades. A temperatura da produção já aceitava vírgula; a do recebimento ainda pede ponto (ver Pendências).

## Arquivos

- Novo: `src/shared/format/quantity.ts` (regra, conversão, mensagens e formato com vírgula) e `src/shared/format/quantity.test.ts`.
- Telas: `BatchPanel.tsx`, `MovementPanel.tsx`, `HandlingForm.tsx`, `ProductionPanel.tsx`.
- Testes de tela: `BatchPanel.test.tsx`, `MovementPanel.test.tsx`, `HandlingScreens.test.tsx`, `production.test.tsx` (casos novos, nenhum caso antigo alterado ou removido).
- Integração: `tests/integration/decimal-comma.test.mjs`. E2E: `tests/e2e/decimal-comma.spec.mjs`.
- Documentação: este relatório, D-063 em `DECISOES.md`, `ia-tarefas/v5-virgula-decimal.md`, `IA_ESTADO.md`.

Nenhum teste existente foi alterado, enfraquecido ou removido. Os esquemas de domínio não mudaram, e por isso os testes de domínio antigos (inclusive o que recusa `1,5` em `isQuantity`, que confere a forma já convertida) seguem como estavam.

## Testes

Bateria completa em 16/11/2026, 21:20–21:35 UTC, no ambiente de nuvem (Node 24, Supabase local): `npm run lint`, `typecheck`, `format:check` e `build` ok; `npm run test` (vitest) 455 de 455 (antes 375); `npm run test:db` (pgTAP) 1433 de 1433; `supabase db advisors --type security --level warn` sem problemas; `npm run test:integration` 50 de 50 (antes 49); `npm run test:e2e` 33 de 33 (antes 31). Tudo verde.

Novos testes:

- **Unitários (80):** `quantity.test.ts` com 12 entradas aceitas, 21 recusadas por motivo, as bordas de vírgula/ponto com três casas, a conversão seguida da validação de sempre (14 recusas mantidas, limites de um bilhão e três casas) e a repetição do esquema na camada de dados; telas de recebimento, saída, abrir/porcionar e produção com valor brasileiro aceito e enviado com ponto, milhar, ambíguo, quatro casas, zero e texto recusados sem enviar, e fração recusada em produto medido em unidades.
- **Integração (1):** valor brasileiro convertido pela função real da tela grava no banco o mesmo número que o valor com ponto (recebimento e saída); vírgula e milhar enviados direto à API são recusados pelo banco; quatro casas e saldo acima do registrado continuam recusados; a outra empresa não registra saída no lote e não vê movimentação.
- **E2E (2):** recebimento `12,5`, saída `0,75` e abrir `2,25` com vírgula, e `1.000,50`, `1,000.50` e `1.500` recusados em cada tela; produção `3,5` com vírgula na revisão e recusas de milhar e ambiguidade.

## Limitações e pendências

- Fora da V5, a decidir: as listas, cartões, histórico, QR e etiquetas PDF continuam mostrando os valores gravados com ponto (`12.5 kg`). Só os textos de conferência da digitação (tentativa pendente, saldo previsto, soma, sobra, revisão) passaram a usar vírgula. Mostrar vírgula em todo lugar seria uma fatia pequena, só de exibição.
- Temperatura do recebimento ainda pede ponto ("por exemplo -18.5"); a da produção já aceita vírgula. Pode entrar junto da fatia acima.
- Teclado do celular: o campo continua `inputMode="decimal"`. Em alguns teclados Android a tecla mostrada é só o ponto ou só a vírgula, conforme o idioma; as duas funcionam. Não verificado em aparelho físico.
- A regra recusa `1.500` mesmo quando a pessoa quis dizer um e meio; luis confirmou que é o comportamento desejado.

## Aceite

**Aceite de luis em 16/11/2026, 22:08 UTC** (PR #38, CI verde): aprovou a implementação da V5 e a D-063 e considerou a V5 tecnicamente aceita. Confirmou expressamente que valores ambíguos como `1.500`, `1.000,50` e `1,000.50` continuam recusados, com mensagem explicativa. Manter: vírgula e ponto como separadores decimais quando não houver ambiguidade; ausência de separador de milhar; limites de quantidade, precisão e validações existentes; nenhuma alteração em saldos, históricos, permissões ou regras do banco. Na mesma mensagem autorizou **preparar a proposta** de uma fatia complementar (exibição com vírgula e temperatura do recebimento), **sem implementar**: ver [V5B_PROPOSTA.md](V5B_PROPOSTA.md). Sem merge nem deploy sem autorização específica.
