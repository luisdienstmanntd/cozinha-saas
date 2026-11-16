# V3 — Lista de validade legível

Autorizada por luis em 16/11/2026, 02:26 UTC, junto com o aceite da V1 (D-060). Resolve B3, B4, M3, M4 e M6 de `REVISAO_VISUAL_FASE_07.md`. Proposta de decisão: **D-061** (aceite pendente). Sem merge nem deploy. V4 e V5 não foram iniciadas.

## O que mudou

### Cartão de recipiente (B3)

Cada recipiente da lista de Validade é um cartão compacto, sempre na mesma ordem:

1. **Produto** (negrito) e **código curto** `C-xxxxxx`, com "(derivado)" e o lote na mesma linha.
2. **Selo de vencimento** à direita (no celular, abaixo do nome).
3. **Validade** em dd/mm/aaaa, em destaque, com a origem entre parênteses (original, definida pelo responsável, após manipulação).
4. **Saldo** em destaque ("8 kg de 10 kg") e **Local**, quando houver.
5. Faixas existentes sem mudança de texto: `VENCIDO - somente descarte` e `BLOQUEADO - …`.
6. Ações numa linha fixa: **Ver ficha**, Ver movimentações, Abrir / porcionar, Mudar de local (as mesmas condições de antes para aparecer).

O **UUID não aparece mais na lista**. A busca por "ID do recipiente" continua (é feita no servidor); o UUID fica na ficha ("Identificação").

### Selo e contadores (B4)

- Selo com **texto, símbolo e cor**: "⛔ Vencido há N dias", "⚠ Vence hoje", "● Vence amanhã", "✓ Vence em N dias", "○ Esgotado". O símbolo é decorativo (`aria-hidden`); o texto sempre diz o status.
- O cartão tem uma borda colorida pelo mesmo status, e o vencido tem fundo levemente avermelhado.
- Os contadores viram quatro blocos coloridos (Vencidos, Vence hoje, Vence amanhã, Posteriores). Continuam somente leitura (ver limitações).
- A ficha (e a página do QR, que é a mesma tela) mostra o mesmo selo no topo, ao lado do produto e do código.
- **Nenhuma regra mudou.** O status continua vindo de `getExpiryStatus` (data de hoje no fuso da unidade, a mesma regra do banco). "Em N dias" é só a diferença de dias de calendário até a validade registrada (`daysUntil`). Não há faixa nova ("vence em breve") nem prazo calculado.

### Datas e horários (M3)

- Validade, data de referência e datas da ficha em **dd/mm/aaaa**.
- "Última consulta" e horários do histórico em **dd/mm/aaaa HH:mm**, no fuso da unidade (antes: ISO cru).
- O fuso aparece com nome legível e o identificador entre parênteses, por exemplo "Horário Padrão de Brasília (America/Sao_Paulo)". O nome vem do navegador; se ele não souber, mostra só o identificador.
- Funções em `src/shared/format/dates.ts`, só de formatação.

### Histórico de movimentações (M4)

- Cada registro mostra "por **Nome**" (nome de exibição da organização). Sem nome: "pessoa sem nome de exibição". Se os nomes não puderem ser lidos: "pessoa da organização" (o histórico continua aparecendo).
- O identificador do registro, do autor, do movimento original, o fuso e o instante ISO ficam em "Identificadores (suporte)", recolhido.
- Na revisão de uma anulação, o registro original continua mostrando o ID completo (é uma confirmação de ação que não pode ser desfeita).

### Ficha pela lista (M6, M7)

- "Ver ficha" substitui "Abrir etiqueta" e aparece em **todo cartão**, inclusive para o **colaborador** e para **recipientes derivados** (antes: só proprietário e só integral).
- A ficha abre **no lugar da lista**, com "← Voltar para a lista" no alto. A lista fica oculta, não desmontada: busca, "Mostrar esgotados" e formulários abertos continuam. Voltar devolve o foco ao botão do cartão de onde a pessoa saiu.
- Abrir a ficha **só lê** (`labels.get`, protegido pela RLS). Antes, "Abrir etiqueta" chamava `ensure_container` (função de escrita); a lista já traz o recipiente, então a chamada era desnecessária. Ações de escrita na ficha continuam só para o proprietário ("Somente o proprietário abre, porciona ou anula").

### Validade no celular

- Ordem da área Validade: título, **aviso curto de bloqueios** (quando houver ocorrência aberta, com o atalho "Ver bloqueios e ocorrências"), contadores, busca, **lista**, explicação da ordem e da data de referência, e o **painel completo de bloqueios** depois da lista.
- O texto dos avisos foi mantido integralmente; só mudou de posição. O bloqueio continua também na faixa de cada cartão.
- No iPhone 13 emulado, os contadores aparecem na primeira tela e o primeiro cartão começa logo abaixo da busca. Em 390 × 844 (E2E), o selo do primeiro cartão está na primeira tela.

## O que não mudou

- Banco: nenhuma migração, política RLS, função ou permissão.
- Regras de validade, saldo, bloqueio, vencido e auditoria. Consumo de vencido continua recusado pelo banco; o formulário de saída é o mesmo.
- Etiqueta PDF e página do QR (além do selo e da data dd/mm/aaaa na ficha).

## Testes

Novos:

- `src/shared/format/dates.test.ts`: dd/mm/aaaa sem deslocar o dia, HH:mm no fuso (inclusive virada de dia), valor inválido não é escondido, nome do fuso.
- `expiryStatus.test.ts`: `daysUntil` e texto do selo, inclusive horário de verão.
- `ContainerCards.test.tsx`: selo de cada status, datas, saldo, lote, derivado, ausência de UUID e de data ISO na lista; ficha aberta pelo colaborador num derivado sem chamar a função de escrita; lista oculta enquanto a ficha está aberta; voltar devolve o foco.
- `MovementPanel.test.tsx`: nome de quem registrou, data no fuso, identificadores recolhidos.
- `LabelView.test.tsx`: selo e data dd/mm/aaaa no topo da ficha.
- `tests/e2e/expiry-cards.spec.mjs`: colaborador em 390 × 844, selo, datas, ordem, sem UUID, primeiro cartão na primeira tela, sem rolagem lateral, ficha só leitura e volta ao cartão.

Ajustados (só o formato do texto ou o passo afetado; **nenhuma asserção removida ou relaxada**):

- `ExpiryDashboard.test.tsx`: textos do selo e dos contadores; ordem lida do nome do produto; o teste "busca pelo ID" agora espera o cartão certo e confere que o UUID **não** aparece (antes a expressão `/recipiente 30000000/` também casava com outro recipiente). O teste de releitura com falha agora abre a ficha e dispara a releitura de fora (a lista fica oculta com a ficha aberta); continua exigindo que a ficha desapareça e o alerta apareça, e passou a exigir que `ensure` não seja chamado.
- `ReceivingBlocks.test.tsx`: além do que já conferia, exige o aviso no alto, o atalho e o painel depois da lista.
- `HandlingScreens.test.tsx`: validade dd/mm/aaaa na ficha.
- E2E `catalog`, `expired`, `handling`, `locations`, `navigation`, `occurrences`, `production`: "Abrir etiqueta" → "Ver ficha"; "saldo" → "Saldo"; "validade 2030-01-01" → "Validade 01/01/2030"; "local:" → "Local"; passo "← Voltar para a lista" antes de usar a lista com a ficha aberta. Em `catalog`, a busca pelo ID agora confirma o recipiente abrindo a ficha do único resultado. Duas verificações ficaram mais estritas: em `occurrences`, a faixa BLOQUEADO é conferida no cartão inteiro, não só no texto do lote; em `locations`, "sem local" é conferido pela ausência do campo Local.

Bateria (resultado real, nesta branch): ver tabela abaixo.

| Verificação                                          | Resultado                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run format:check`, `lint`, `typecheck`, `build` | verdes                                                                              |
| `npx vitest run`                                     | 47 arquivos, 361 testes, verdes                                                     |
| `npx supabase test db` (pgTAP)                       | 27 arquivos, 1433 testes, **verdes** na execução de 16/11/2026 02:50 UTC (ver nota) |
| `npm run test:integration`                           | 49 testes, verdes                                                                   |
| Playwright (E2E)                                     | 30 testes (29 anteriores + 1 novo), verdes                                          |

Notas sobre o pgTAP (a V3 não muda nada em `supabase/`; `git diff` da base para esta branch em `supabase/` está vazio):

- **Instabilidade encontrada, anterior à V3:** repetido às 03:03 UTC (00:03 em São Paulo), `container_handling.test.sql` falhou no teste 69 ("origem vencida na data da manipulação recusada"): o banco devolveu primeiro a recusa "A validade após abertura não pode passar da validade do recipiente de origem". O teste monta a origem com validade "ontem" e registro `now() - 1 day` em São Paulo, e a ordem das recusas depende do horário logo depois da meia-noite local. É o mesmo tipo de problema corrigido no PR #28 para outros dois testes. **Não alterei o teste nem a regra**; proponho uma correção própria, com aprovação de luis, no mesmo estilo do PR #28 (datas determinísticas).
- Duas outras execuções falharam por eu ter rodado o pgTAP em paralelo com outra execução no mesmo banco (deadlock no teste 106 de `handling_void` e TRUNCATE no teste 21). Sozinho, às 02:50 UTC, passou inteiro.

Nota: numa execução intermediária, o pgTAP falhou em `handling_void.test.sql` (teste 106, deadlock) porque uma execução anterior que interrompi ainda rodava no mesmo banco. Repetido sozinho, passou inteiro. A V3 não toca o banco.

## Revisão visual

Capturas em `docs/capturas/revisao-visual-v3/`: `d-*` desktop 1366 × 900 e `m-*` iPhone 13 emulado; `dono` e `colab`. Dados sintéticos (empresa "Restaurante Exemplo V3", e-mails `@exemplo.test`), com um recipiente vencido, um que vence hoje, um amanhã, um bloqueado por recebimento sem medição, um com local e um consumo registrado por "Ana".

| Arquivo                       | O que mostra                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `*-01-validade-primeira-tela` | Primeira tela ao abrir a unidade                                                                       |
| `*-02-validade-inteira`       | Área Validade inteira (no celular, a barra inferior aparece no meio por ser captura de página inteira) |
| `*-dono-03-cartao-vencido`    | Cartão vencido com faixa e ações                                                                       |
| `*-dono-04-movimentacoes`     | Histórico com nome e data brasileira, identificadores recolhidos                                       |
| `*-05-ficha`                  | Ficha aberta pela lista, com selo e "Voltar para a lista"                                              |
| `*-06-apos-voltar`            | Lista de volta, no mesmo ponto                                                                         |

Observado: sem rolagem lateral em 390 px; selos legíveis com e sem cor; cartão do celular com 2 linhas de ações (4 botões).

## Limitações

- Os contadores não filtram a lista. Filtrar exige consulta por status no servidor (a lista é paginada), fora desta fatia.
- No celular, as ações ficam visíveis (até 4 botões, em duas linhas); não há "mais ações" recolhido.
- O cabeçalho da V1 (título, faixa de sessão, unidade) ainda ocupa cerca de metade da primeira tela do celular; em telas de 664 px de altura útil, só o topo do primeiro cartão aparece.
- "Ver ficha" não muda o endereço: o botão Voltar do navegador sai da área, não da ficha. O endereço próprio do recipiente (`/recipiente/:id`, usado pelo QR) continua igual.
- Nome legível do fuso depende do navegador ("Horário Padrão de Brasília" no Chromium de teste).
- Checkbox "Mostrar esgotados" alinhado só nesta barra; o desalinhamento geral de rádios e caixas (M2) é da V4.
- Sem teste em aparelho físico nem leitor de tela real.
- Não garante conformidade sanitária (Q10 pendente).

## Pontos que exigem aceite de luis

1. Painel completo de **Bloqueios e ocorrências depois da lista**, com aviso curto e atalho no alto da área Validade (texto preservado; faixa continua no cartão).
2. Explicação da ordem e da **data de referência logo abaixo da lista** (texto preservado).
3. "**Ver ficha**" no lugar de "Abrir etiqueta", para todos os perfis e derivados, abrindo a ficha no lugar da lista, sem chamar `ensure_container`.
4. Textos do selo: "Vencido há N dias", "Vence hoje", "Vence amanhã", "Vence em N dias", "Esgotado"; "Posteriores" mantido só no contador.
5. Histórico com "por Nome" e identificadores recolhidos em "Identificadores (suporte)".
6. Contadores sem filtro nesta fatia (filtro fica para avaliação futura).
