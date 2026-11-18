# V5B — Proposta: exibição com vírgula e temperatura do recebimento

**Proposta, sem implementação.** Preparada por autorização de luis em 16/11/2026, 22:08 UTC (aceite da V5/D-063, PR #38). Nada aqui foi implementado; o levantamento foi feito só lendo o código. Depende da V5 (vírgula nas quantidades digitadas). Sem merge nem deploy. Se aprovada, entraria como D-064.

## Objetivo

1. Mostrar toda quantidade com vírgula decimal nas telas, no histórico, nas fichas, na página do QR e nas etiquetas PDF.
2. Aceitar vírgula na temperatura medida no recebimento, com as mesmas validações de hoje.
3. Não mexer em valores nem precisão no banco.
4. Manter etiquetas e QR legíveis e consistentes.

## Situação hoje

Depois da V5, só os textos de conferência da digitação usam vírgula. O resto mostra o número como o banco devolve, com ponto (`12.5 kg`).

Pontos de exibição de quantidade encontrados (23, em 8 arquivos):

| Onde                                       | Arquivo                                  | O que mostra                                          |
| ------------------------------------------ | ---------------------------------------- | ----------------------------------------------------- |
| Cartão da lista de validade                | `BatchPanel.tsx` (~755)                  | saldo "de" quantidade inicial                         |
| Movimentações                              | `MovementPanel.tsx` (331, 376, 398, 554) | quantidade inicial, saldo registrado, histórico, anulação |
| Ficha / página do QR do recipiente         | `LabelView.tsx` (231, 245, 440, 480, 502) | quantidade inicial, saldo atual, sobras, derivados    |
| Abrir/porcionar (contexto e resultado)     | `HandlingForm.tsx` (385, 414, 420, 520)  | saldo, quantidade das porções, sobras                 |
| Ocorrências                                | `OccurrencePanel.tsx` (187)              | saldo do recipiente                                   |
| Lista de produções                         | `ProductionPanel.tsx` (425)              | quantidade produzida                                  |
| Rótulos das tentativas pendentes           | `trackGateways.ts` (87, 100, 141)        | quantidade no texto da tentativa                      |
| Etiquetas PDF                              | `pdf.ts` (107, 108, 148, 202)            | quantidade produzida, da porção, inicial, na criação  |

Temperatura:

- A do recebimento (`BatchPanel.tsx`) aceita só ponto; o texto de ajuda diz "por exemplo -18.5". A da produção já aceita vírgula e mostra com vírgula (`formatTemperature`).
- Não encontrei nenhum lugar que mostre a temperatura do recebimento depois de gravada (nem na tela, nem no PDF). Então o item 2 é só de entrada.
- O QR da etiqueta leva só a URL e o ID opaco do recipiente (`pdf.ts`), nunca quantidade. O QR em si não muda; o que muda é o texto ao lado dele e a página que ele abre.

## Proposta

### 1. Uma função de exibição só

Trocar o `formatQuantity` atual (que só troca o ponto por vírgula no texto) por uma função única em `src/shared/format/quantity.ts`, usada por todas as telas e pelo PDF:

- aceita número do banco ou texto com ponto;
- usa `Intl.NumberFormat('pt-BR')` com no máximo 3 casas e **sem separador de milhar**, coerente com a regra da D-063 (`1500`, nunca `1.500`);
- mostra só as casas necessárias (`12,5`, não `12,500`; `3`, não `3,000`);
- nunca arredonda além do que o banco guarda (até 3 casas), e não faz conta: só formata o que já foi calculado em milésimos inteiros.

O PDF usa a mesma função, então tela e etiqueta mostram o mesmo texto para o mesmo valor.

### 2. Temperatura do recebimento

Aceitar `-18,5` e `-18.5`, trocando a vírgula por ponto na tela antes do esquema de sempre (`^-?(?:0|[1-9]\d?)(?:\.\d)?$`, de -50 a 80 °C, uma casa decimal). Sem ambiguidade a tratar: a temperatura tem no máximo dois dígitos inteiros e uma casa, então `1.000` ou `1,000` já são recusados pela regra de uma casa. Nenhum limite novo, nenhuma classificação de "dentro" ou "fora" da faixa e nenhum texto sanitário novo: o sistema continua só registrando o que a pessoa mediu. Uma função compartilhada (`toDotTemperature`) substitui o `replace(',', '.')` da tela de temperatura da produção, para as duas telas seguirem a mesma regra. Atualizar o texto de ajuda para "por exemplo -18,5".

### 3. O que não muda

Nenhuma migração, função do banco, esquema de domínio, política RLS, permissão ou auditoria. Nenhuma escrita nova. O que a tela envia continua sendo a forma com ponto de sempre. Saldos, movimentações e históricos gravados ficam iguais; só muda como são mostrados.

## Impacto

- **Código:** 1 função nova de exibição, 23 pontos trocados para usá-la, 1 função de temperatura. Estimativa: uma fatia pequena, no mesmo molde da V5.
- **Testes existentes:** cerca de 30 asserções em 7 arquivos conferem textos com ponto (`12.5 kg`, `Saldo registrado: 11.75 kg`, `sobra de 6 kg`). Quando o valor é inteiro, o texto não muda; quando tem casa decimal, o texto esperado passa a ter vírgula. **Nenhum teste seria enfraquecido:** só o literal esperado muda, na mesma asserção, e cada uma ganha um teste que garante que o formato antigo (`12.5 kg`) não aparece mais. Cada alteração entraria listada no relatório.
- **Etiquetas já impressas:** ficam com ponto (por exemplo `Quantidade produzida: 2.5 l`); as novas saem com vírgula. As duas são legíveis; o QR de uma etiqueta antiga continua abrindo a mesma ficha.

## Riscos e mitigação

| Risco                                                       | Mitigação                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Esquecer algum ponto de exibição e mostrar formato misturado | Teste de varredura: renderiza cada tela com valores decimais e falha se aparecer `\d\.\d+ (kg\|l\|un)` no texto.     |
| Tela e PDF mostrarem textos diferentes                      | Função única; teste compara a quantidade mostrada na tela com a do PDF baixado.                                   |
| Valor mostrado com vírgula e copiado de volta no formulário | Funciona: a V5 já aceita vírgula na digitação.                                                                    |
| Arredondar ou perder precisão na exibição                   | Máximo de 3 casas, igual ao banco; testes de ida e volta nos extremos (`0,001`, `999999999,999`) e com 1 a 3 casas. |
| Etiqueta com texto mais largo                               | `,` ocupa o mesmo espaço que `.` na fonte do PDF; sem separador de milhar o texto não cresce. Conferir nos testes do modelo com nome longo. |
| Impressão física                                            | Continua pendência do piloto (teste físico de impressão); a mudança não a antecipa nem a substitui.               |
| Diferença entre idiomas do aparelho                         | A formatação é fixa em `pt-BR`, não depende do idioma do navegador.                                               |

## Testes previstos

- **Unitários:** função de exibição (inteiros, 1 a 3 casas, extremos, sem milhar, números do banco como `0.1+0.2`), ida e volta com a leitura da V5, temperatura (`-18,5`, `-18.5`, `4,0`, recusas: duas casas, `80,1`, `-50,1`, `1,2,3`), varredura de formato por tela.
- **Telas:** lista de validade, movimentações, ficha/QR, abrir/porcionar, ocorrências, produções e tentativa pendente com valores decimais.
- **PDF:** o texto desenhado traz a vírgula (conferido nos bytes, como já faz o E2E de etiquetas) e o QR continua com a mesma URL.
- **Integração:** valor gravado pela API lido de volta e formatado sem perder casa; temperatura `-18,5` convertida grava `-18.5`; limites e recusas do banco inalterados.
- **E2E:** fluxo recebimento → lista → movimentações → ficha → etiqueta PDF com valores decimais, e recebimento com temperatura em vírgula.
- **Bateria completa** (lint, tipos, vitest, pgTAP, advisors, integração, E2E) verde e CI verde, como nas fatias anteriores.

## Decisões pedidas a luis

1. **Sem separador de milhar na exibição**, igual à regra de digitação (`1500 kg`)? Recomendo sim. A alternativa (`1.500 kg`) reintroduz a ambiguidade que a D-063 recusou.
2. **Só as casas necessárias** (`12,5 kg`) ou sempre três (`12,500 kg`)? Recomendo só as necessárias.
3. **Trocar também a regra da temperatura da produção** pela função compartilhada? Recomendo sim; o comportamento para quem usa hoje não muda.
4. **Etiquetas já impressas** não são reimpressas. Confirma?

## Fora desta proposta

Datas e horas (já em formato brasileiro desde a V3), filtros por categoria, aviso de formulário não salvo, teste físico de impressão e conferência normativa pela nutricionista RT (Q10).

## Aceite

Aguardando a aprovação de luis. Sem implementação, merge ou deploy até lá.
