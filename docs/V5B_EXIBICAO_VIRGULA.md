# V5B — Exibição com vírgula e temperatura com vírgula (D-064)

Complementa a [V5](V5_VIRGULA_DECIMAL.md) (D-063, aceita). Proposta em [V5B_PROPOSTA.md](V5B_PROPOSTA.md), **aprovada por luis em 16/11/2026, 22:40 UTC**, com quatro decisões e requisitos adicionais. Implementada na branch `claude/revisao-v5b-exibicao-virgula`, sobre a ponta da V5 (PR #38). **D-064 ACEITA por luis em 17/11/2026.** Sem merge nem deploy.

Só exibição e leitura da temperatura digitada: nenhuma migração, política RLS, função do banco, esquema de domínio, saldo, movimentação, validade, permissão ou auditoria mudou.

## Decisões de luis e como foram atendidas

| Decisão / requisito                                                  | Como ficou                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Sem separador de milhar na exibição (`1500 kg`)                   | `formatQuantity` nunca agrupa milhares; teste confirma o formato `^\d+(,\d{1,3})?$` para qualquer valor.                                                                                  |
| 2. Só as casas necessárias, até 3 (`12,5 kg`, não `12,500 kg`)       | Zeros finais saem (`12.500` → `12,5`, `3.000` → `3`); nunca mais de 3 casas.                                                                                                               |
| 3. Função compartilhada de temperatura (recebimento e produção)      | `toDotTemperature` (`src/shared/format/temperature.ts`) usada nos dois formulários; faixa de -50 a 80 °C, uma casa decimal e demais validações são as do esquema de sempre.               |
| 4. Etiquetas já impressas intactas; novas no formato brasileiro      | Nada é reimpresso nem regravado; a etiqueta PDF gerada a partir de agora usa `formatQuantity`.                                                                                             |
| 23 pontos de exibição padronizados                                   | Telas, histórico, ficha/QR, abrir/porcionar, ocorrências, produções, texto das tentativas pendentes e PDFs (tabela abaixo).                                                                |
| Função centralizada, sem divergência                                 | Uma só função de exibição; teste de varredura falha se algum texto voltar a mostrar quantidade ou saldo cru.                                                                               |
| Não alterar saldos, históricos, precisão, validade, RLS, auditoria   | Nenhuma escrita nova; a tela continua enviando a forma com ponto de sempre. Integração e E2E conferem o valor guardado antes e depois.                                                     |
| Sem novos limites sanitários para temperatura                        | Nenhum limite, faixa ou classificação novos; só a vírgula decimal passa a ser aceita.                                                                                                      |
| Preservar o identificador e o conteúdo do QR                         | O QR continua sendo gerado só com a URL e o ID do recipiente; teste confere o texto codificado antes e depois, com quantidades diferentes.                                                |
| Evitar arredondamento que altere o valor guardado                    | A função opera sobre o texto do número; ida e volta (mostrar, digitar de novo) volta ao mesmo número nos extremos `0,001` e `999999999,999`.                                              |
| Atualizar testes sem enfraquecer                                     | 19 asserções antigas trocaram só o literal esperado (ponto → vírgula), cada uma na mesma asserção e com o mesmo rigor (lista abaixo).                                                     |
| Unitários, integração, E2E e CI                                      | Ver "Testes".                                                                                                                                                                               |
| PDF com valores decimais e nomes longos                              | Unitários (recebimento 107 caracteres, preparação 80, fracionado 53) e E2E (recebimento com nome de 107 caracteres e preparação com 80), todos em uma página e com a vírgula.            |

## A função de exibição

`formatQuantity(valor)` em `src/shared/format/quantity.ts`, usada por tela e PDF:

- Aceita o número que o banco devolve ou o texto com ponto.
- Troca o ponto por vírgula, tira zeros finais, nunca agrupa milhares.
- Não faz conta: opera sobre o texto do número. Só quando o número traz mais de 3 casas (resíduo de conta em ponto flutuante, que o banco nunca guarda, por exemplo `0.1 + 0.2`) ele é **arredondado** para 3 casas (`toFixed(3)`, que arredonda e não trunca; por exemplo `0.30000000000000004` vira `0,3` e `1.2346` vira `1,235`). Esse caminho nunca é percorrido por valor válido do banco: todo valor guardado (até 3 casas) é preservado exatamente, e há teste de ida e volta nos extremos `0,001` e `999999999,999`.
- Texto que não é número volta como veio.

| Guardado no banco | Mostrado          |
| ----------------- | ----------------- |
| `0.001`           | `0,001`           |
| `12.5`            | `12,5`            |
| `1.250`           | `1,25`            |
| `3.000`           | `3`               |
| `1500`            | `1500`            |
| `999999999.999`   | `999999999,999`   |

## Os 23 pontos

| Onde                                       | Arquivo                                   | Pontos |
| ------------------------------------------ | ----------------------------------------- | ------ |
| Cartão da lista de validade                | `BatchPanel.tsx`                          | 2      |
| Movimentações, histórico e anulação        | `MovementPanel.tsx`                       | 4      |
| Ficha e página do QR do recipiente         | `LabelView.tsx`                           | 5      |
| Abrir/porcionar (contexto e resultado)     | `HandlingForm.tsx`                        | 4      |
| Ocorrências                                | `OccurrencePanel.tsx`                     | 1      |
| Lista de produções                         | `ProductionPanel.tsx`                     | 1      |
| Texto das tentativas pendentes             | `trackGateways.ts`                        | 3      |
| Etiquetas PDF (4 linhas de texto, 3 pontos no código) | `pdf.ts`                       | 3      |

O texto de conferência da digitação (V5) já usava `formatQuantity` e passou a usar a versão nova, sem mudança visível.

## Temperatura

- Recebimento: `BatchPanel.tsx` converte com `toDotTemperature` antes do esquema de sempre. Ajuda: "Use vírgula ou ponto para decimais, por exemplo -18,5."
- Produção: `RecordTemperature.tsx` troca o `replace(',', '.')` próprio pela mesma função.
- `toDotTemperature` só troca uma vírgula decimal por ponto quando há exatamente um separador, e nenhum outro. `3,5,5`, `1.5,2` e `4,,5` ficam como foram digitados e o esquema recusa. Faixa (-50 a 80 °C) e uma casa decimal seguem as do esquema; `80,1`, `-50,1` e `4,25` continuam recusados na tela e, enviados direto, no banco.
- Não há exibição da temperatura do recebimento depois de gravada (nem na tela, nem no PDF), então nada mudou nesse sentido. A da produção já era exibida com vírgula (`formatTemperature`).

## Testes alterados

Só o texto esperado mudou, na mesma asserção, de ponto para vírgula. Nenhuma foi removida, relaxada (`toContain` no lugar de igualdade, regex mais frouxa) ou pulada.

| Arquivo                                          | Asserções |
| ------------------------------------------------ | --------- |
| `MovementPanel.test.tsx`                         | 7         |
| `LabelView.test.tsx`                             | 1         |
| `ExpiryDashboard.test.tsx`                       | 1         |
| `pdf.test.ts`                                    | 1         |
| `tests/e2e/catalog.spec.mjs`                     | 9         |
| **Total de testes antigos**                      | **19**    |
| `tests/e2e/decimal-comma.spec.mjs` (da própria V5, no PR #38) | 4 |

Reforços: o E2E `catalog.spec.mjs` ganhou conferência da vírgula e da ausência de `1.25 kg` no PDF, e o E2E de nome longo passou a conferir a vírgula e uma página só (antes só conferia o cabeçalho `%PDF-`).

## Testes novos

- **Unitários (+64):** `formatQuantity` (18 valores, ausência de milhar, resíduo de ponto flutuante, ida e volta nos extremos `0,001` a `999999999,999`, texto que não é número); `toDotTemperature` (6 entradas, 6 que ficam como digitadas e a equivalência das validações do esquema, com limites e recusas); **varredura** que falha se algum texto voltar a mostrar quantidade ou saldo crus (e confere que ela reconhece os padrões que deve barrar); **PDF** com recebimento de nome longo (107 caracteres), preparação com `1,25`, `0,001`, `3`, `1500` e `999999999,999` (nome de 80 caracteres), porção, produto fracionado, nome longo demais ainda recusado, uma página só e sem ponto decimal, e o texto codificado no QR igual ao de antes com quantidades diferentes; telas de movimentações, ficha, abrir/porcionar, ocorrências, lista de produções e tentativas pendentes com valores decimais; temperatura do recebimento (5 entradas aceitas e enviadas com ponto, 6 recusadas sem limite novo, texto de ajuda).
- **Correção pedida no aceite (17/11/2026):** testes de que o que passa de 3 casas é arredondado e não truncado (`0.0006` → `0,001`, `0.9996` → `1`, `1.2346` → `1,235`) e teste exaustivo de que cada valor válido (todos os milésimos de `0,001` a `25,000`, os últimos 20 000 milésimos da faixa e uma varredura de passo largo até `999999999,999`) sai com as mesmas casas, como texto e como número.
- **Integração (+1):** valores guardados com 1 a 3 casas lidos pela API e mostrados sem perder casa nenhuma, ida e volta ao mesmo número, temperatura `-18,5` gravada como `-18.5`, limites do banco intactos (`80,1` e `-50,1` recusados; `80,0` e `-50,0` aceitos) e leitura repetida igual.
- **E2E (+2):** recebimento de produto de nome longo com `12,5` e temperatura `-18,5` (recusas de `80,1`, `-50,1` e `4,25`), lista, saída de `0,25`, histórico, ficha, rota do QR e etiqueta PDF (vírgula, nome inteiro, uma página, mesmo ID), valor guardado conferido no banco; produção `2,5 l` com preparação de nome longo, lista e etiqueta PDF.

## Testes executados

Bateria completa em 16/11/2026, 22:40–23:20 UTC, no ambiente de nuvem (Node 24, Supabase local): `npm run lint`, `typecheck`, `format:check` e `build` ok; `npm run test` (vitest) **521 de 521** (antes 455; 519 na primeira bateria e +2 do aceite); `npm run test:db` (pgTAP) **1433 de 1433** (sem mudança: nenhuma migração); `supabase db advisors --type security --level warn` sem problemas; `npm run test:integration` **51 de 51** (antes 50); `npm run test:e2e` **35 de 35** (antes 33). Tudo verde. A CI do PR é registrada no PR.

## Limitações e pendências

- Etiquetas impressas antes da V5B continuam com ponto (por exemplo `2.5 l`); não são alteradas nem reimpressas, como decidido. O QR delas continua abrindo a mesma ficha.
- Impressão física continua pendente (pendência do piloto); a V5B não a antecipa nem a substitui. Em quantidade muito larga (`999999999,999`) o modelo da preparação quebra a linha, e o conteúdo continua inteiro.
- Nome longo demais para o modelo (107 caracteres na preparação) continua sendo recusado pela etiqueta em vez de impresso cortado; é o comportamento de antes e tem teste.
- Datas e horários, filtros, aviso de formulário não salvo e a conferência normativa pela nutricionista RT (Q10) ficam fora.
- Se uma exportação de dados for criada, ela precisa decidir o formato próprio das quantidades.

## Aceite

**ACEITA por luis em 17/11/2026, 13:17 UTC** (aceite final da V5B e da D-064), com a correção da divergência de redação sobre `toFixed(3)`, que arredonda e não trunca; o código não mudou de comportamento, só comentário, nome de teste e documentação. Com isso luis encerrou a etapa de melhorias de interface V1 a V5B; não há novas funcionalidades até nova autorização. Sem merge nem deploy sem autorização específica.
