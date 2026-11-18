# V4 — Acabamento visual

Proposta em `V4_PROPOSTA.md` (PR #36). **Aprovada por luis em 16/11/2026, 13:10 UTC**, com a decisão D-062 e dez definições: itens M1, M2, M10, M11, D1 e D3, mais os opcionais 7 (Mais ações no celular) e 8 (cabeçalho compacto no celular). Só interface: nenhuma migração, política RLS, função do banco, regra de validade, estoque, permissão ou auditoria mudou. **D-062 aceita por luis em 16/11/2026, 21:10 UTC**, com CI verde; V4 tecnicamente encerrada. Sem merge nem deploy.

## O que mudou

### 1. Três níveis de botão (M1)

| Nível                                     | Aparência                         | Uso (definição 4 de luis)                                                                                                                                                                                                        |
| ----------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Principal**                             | verde cheio (estilo padrão)       | registrar ou confirmar uma operação positiva; também o botão que abre o formulário de registro principal da tela (Nova preparação, Registrar decisão, Registrar temperatura, Alterar configurações, Abrir / porcionar no cartão) |
| **Secundário** (`secondary`)              | contorno verde, fundo branco      | consultar, navegar, fechar, cancelar, voltar, atualizar, tentar de novo, Sair, Abrir unidade, Ver ficha, Ver movimentações, Mudar de local, Dividir igualmente                                                                   |
| **Risco** (`risk`)                        | contorno vermelho, texto vermelho | abrir ou preparar operação destrutiva: **Anular registro, Revisar anulação, Anular manipulação, Anular produção, Desativar (local), Descartar tentativa**                                                                        |
| **Confirmação de risco** (`risk-confirm`) | vermelho cheio                    | **Confirmar anulação** (registro, manipulação, produção), **Confirmar saída** quando é descarte, **Repetir tentativa** de anulação ou descarte, **Confirmar decisão** quando a decisão marcada é **Rejeitar**                    |

- As sete ações de risco da definição 3 estão cobertas: anular registro, anular manipulação, anular produção, descartar alimento (a confirmação da saída de descarte), rejeitar ocorrência (a confirmação com "Rejeitar" marcado), desativar local e descartar tentativa pendente.
- O texto de nenhum botão mudou por causa do nível; a cor só reforça. Contraste: vermelho `#9b261a` sobre branco ≈ 7:1; branco sobre `#9b261a` ≈ 7:1; verde `#214f40` sobre branco ≈ 10:1.
- "Reativar" local continua principal (não retira nada de circulação). Consumo continua principal.
- Botão desativado fica com 60% de opacidade e cursor de bloqueio (antes não havia diferença visual).

### 2. Rádios e caixas alinhados (M2)

A altura mínima de 44 px saiu de `input[type=radio|checkbox]` e passou ao **rótulo inteiro**, que fica em linha com o controle centralizado. Vale para recebimento (temperatura), decisão de ocorrência, produção ("mesmo dia"), configurações, "Mostrar esgotados" e "Mostrar todas as ocorrências". Tocar no texto marca a opção (rótulo nativo). Verificado no E2E: rótulo ≥ 44 px, rádio com menos de 30 px e centros alinhados (diferença ≤ 3 px).

### 3. "Mudar de local" fecha após o sucesso (M10)

Depois de registrar o local, o formulário fecha, o cartão mostra **"Local registrado."** (com `role="status"`, recebe o foco para teclado e leitor de tela) e o campo **Local** do cartão já traz o novo local. O botão "Fechar" da confirmação deixou de existir na lista (o componente ainda o mantém se for usado fora do cartão). A regra de divergência ("Registrar mesmo assim") não mudou.

### 4. Textos recolhíveis (M11)

Regra da definição 5 aplicada com critério conservador. Componente `MoreInfo` (`<details>` nativo, resumo de 44 px).

| Texto                                                                                                                      | Onde                         | Decisão                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| "Confira a operação antes de confirmar. Se fechar a aba após uma falha, confira o histórico antes de registrar novamente." | Movimentações                | **Recolhido** em "Saiba mais" (orientação geral, repetida em todo cartão aberto) |
| "Recipientes com saldo, do vencimento mais próximo para o mais distante. Recipientes esgotados não entram nas contagens."  | Validade, abaixo da lista    | **Recolhido** em "Saiba mais sobre a ordem da lista"                             |
| Data de referência, fuso, relógio do dispositivo e última consulta                                                         | Validade                     | **Visível**: define como os selos de validade são calculados                     |
| VENCIDO, BLOQUEADO, avisos de manipulação indisponível                                                                     | cartão, ficha, movimentações | **Visível** (alerta de validade e bloqueio)                                      |
| "A anulação corrige somente o registro…", "Saldo após a operação…", registro original                                      | revisão da anulação/saída    | **Visível** (informação para confirmar operação crítica)                         |
| "A validade deve ser informada ou confirmada pelo profissional responsável." e textos de validade da produção/manipulação  | formulários                  | **Visível** (responsabilidade)                                                   |
| "Somente o proprietário…", "Você registra só a própria produção…"                                                          | ocorrências, produção        | **Visível** (permissão)                                                          |
| "Mudar de local só registra onde o recipiente está…", "Locais ajudam a achar…"                                             | locais                       | **Visível** (limitação do saldo físico)                                          |
| "Modelo PDF de demonstração… impressão e leitura física ainda não validadas", "O QR usa endereço local…"                   | ficha                        | **Visível** (limitação conhecida)                                                |
| Orientação da decisão de ocorrência                                                                                        | decisão                      | **Visível** (informação para operação crítica)                                   |

**Nenhum texto foi apagado.** Os textos recolhidos estão no documento (leitor de tela e busca do navegador os alcançam ao abrir o "Saiba mais").

### 5. Primeiros passos da unidade vazia (D1)

Quando a lista de Validade fica vazia sem busca, abaixo do texto existente ("Nenhum recipiente com saldo." / "Nenhum recebimento registrado.") aparece **Primeiros passos**:

- **Proprietário**: 1. Cadastrar produtos e fornecedores (mostra "feito", "falta produto", "falta fornecedor"); 2. Criar locais de armazenamento (opcional; só se a unidade tem a área Locais); 3. Registrar o primeiro recebimento. Cada passo é um link para a área (mesmo endereço `?unidade=&area=` da V1; clique troca de área sem recarregar, Ctrl/Cmd+clique abre nova aba).
- **Colaborador**: só a explicação, sem ações de cadastro.
- Busca sem resultado não mostra os passos.

### 6. Rótulos curtos (D3)

Rótulo visível curto, **nome acessível completo** (`aria-label`, que começa com o texto visível):

| Antes (visível)                          | Agora (visível)          | Nome acessível (igual ao antigo)         |
| ---------------------------------------- | ------------------------ | ---------------------------------------- |
| Janela de registro de {preparação}       | Janela de registro       | Janela de registro de {preparação}       |
| Salvar janela de {preparação}            | Salvar janela            | Salvar janela de {preparação}            |
| Usar a janela da unidade em {preparação} | Usar a janela da unidade | Usar a janela da unidade em {preparação} |
| Desativar / Reativar {local}             | Desativar / Reativar     | Desativar / Reativar {local}             |
| Renomear {unidade}                       | Renomear                 | Renomear {unidade}                       |
| Abrir {unidade}                          | Abrir                    | Abrir {unidade}                          |

Os testes que procuram esses botões pelo nome acessível continuam iguais.

### 7. "Mais ações" nos cartões do celular (opcional 7)

Até 899 px (mesma largura em que o menu vira barra inferior):

- À vista: **Ver ficha** e a ação principal (**Abrir / porcionar** ou **Porcionar**).
- Em **Mais ações** (`<details>` nativo; resumo de 44 px com o código do recipiente no nome acessível, ex.: "Mais ações do recipiente C-000123"): Ver movimentações e Mudar de local.
- Sem ação principal (vencido, bloqueado, esgotado): **Ver movimentações fica à vista**, porque é o caminho do descarte; só "Mudar de local" vai para "Mais ações".
- Colaborador: Ver ficha e Ver movimentações à vista, sem "Mais ações".
- **Alertas nunca entram no grupo** (VENCIDO, BLOQUEADO, manipulação indisponível ficam acima das ações). Teclado: Tab chega ao resumo, Enter abre, Tab segue para os botões (testado no E2E). No desktop nada muda.

### 8. Cabeçalho compacto no celular (opcional 8)

Com a unidade aberta no celular, o título geral "Cozinha SaaS — unidades, recebimentos e validade" sai da tela, mas **continua no documento como título de nível 1** para leitor de tela (nenhum texto apagado). A faixa de sessão (unidade, usuário e **Sair**) continua visível e fixa no alto; o nome da unidade, a empresa e o papel continuam no cabeçalho da unidade, um pouco menores. No desktop nada muda.

## Arquivos

- `src/app/styles.css` (níveis de botão, rádios, "Saiba mais", primeiros passos, "Mais ações", cabeçalho compacto)
- `src/shared/ui/MoreInfo.tsx`, `src/shared/ui/useCompactLayout.ts` (novos)
- `src/features/batches/components/BatchPanel.tsx`, `FirstSteps.tsx` (novo), `src/app/App.tsx` (links das áreas)
- Classes de nível e rótulos: `CatalogPanel`, `IdentityHome`, `EstablishmentTools`, `LocationsPanel`, `MoveContainer`, `MovementPanel`, `PendingAttempts`, `OccurrencePanel`, `SettingsPanel`, `VoidProduction`, `RecordTemperature`, `ProductionPanel`, `VoidHandling`, `HandlingForm`, `LabelView`

## Testes

Bateria completa, 16/11/2026, ambiente de nuvem (Node 24, Supabase local), depois dos ajustes da revisão visual:

| Comando                     | Resultado                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`      | ok                                                                                                                          |
| `npm run lint`              | ok, 0 avisos                                                                                                                |
| `npm run typecheck`         | ok                                                                                                                          |
| `npm run test`              | 49 arquivos, **375 testes** passaram (361 antes da V4 + 14 novos)                                                           |
| `npm run build`             | ok                                                                                                                          |
| `npm run test:db` (pgTAP)   | 27 arquivos, **1433 testes** passaram (sem mudança: nenhuma migração)                                                       |
| `npm run test:integration`  | **49** passaram                                                                                                             |
| `npx playwright test` (E2E) | **31** passaram (29 da V3 + `finishing.spec.mjs` novo, com 1 teste, e o de locais; o novo rodou 3 vezes seguidas sem falha) |

Testes novos e reforçados:

- `BatchPanelV4.test.tsx` (9): ações do cartão no desktop e no celular, vencido com "Ver movimentações" à vista e aviso fora do grupo, colaborador sem "Mais ações", "Mudar de local" fecha com foco na confirmação, primeiros passos por perfil e com links, busca sem passos, "Saiba mais" da lista.
- `buttonLevels.test.tsx` (5): anular produção, anular manipulação, desativar/reativar local (com D3), descarte com confirmação de risco e consumo principal, "Saiba mais" nativo.
- Asserções acrescentadas (nenhuma removida): `MovementPanel.test.tsx` (anular registro, revisar, confirmar, aviso da anulação fora do "Saiba mais"), `ReceivingBlocks.test.tsx` (confirmação de risco só com "Rejeitar"), `pending.test.tsx` (descartar tentativa), `PreparationWindow.test.tsx` (rótulos curtos).
- E2E `finishing.spec.mjs`: primeiros passos e links, rádio alinhado com rótulo ≥ 44 px, cores de principal e risco, cabeçalho compacto, "Mais ações" por teclado, "Mudar de local" que fecha, colaborador no celular.
- E2E `locations.spec.mjs`: os dois cliques em "Fechar" depois de mudar de local (botão que deixou de existir pelo M10) viraram verificações de que o formulário fechou, de que a confirmação aparece no cartão e de que recebe o foco. O restante do teste (divergência, saldo, validade, local desativado) não mudou.

Nenhum teste foi removido, pulado ou enfraquecido.

## Revisão visual

Capturas em `/mnt/project-files/capturas-v4-acabamento/` (fora do repositório), com dados sintéticos ("Restaurante Exemplo V4"): **antes** (ponta da V3, `c6a6684`) e **depois**, desktop (1280 × 900) e celular emulado (390 × 844), proprietário (`dono`) e colaborador (`colab`). Nomes: `<antes|depois>-<d|m>-<perfil>-<número>-<tela>.png`.

| Nº      | Tela                                             | Perfis       |
| ------- | ------------------------------------------------ | ------------ |
| 01      | Validade, primeira tela                          | ambos        |
| 02 / 03 | cartão; "Mais ações" aberto (só depois, celular) | ambos / dono |
| 04      | cartão vencido                                   | ambos        |
| 05 / 06 | movimentações; revisão da anulação               | ambos / dono |
| 07      | decisão de ocorrência com "Rejeitar"             | dono         |
| 08      | cartão depois de mudar de local                  | dono         |
| 09      | recebimento com rádios de temperatura            | dono         |
| 10      | locais                                           | dono         |
| 11      | unidade vazia                                    | ambos        |

Sem rolagem horizontal em nenhuma das oito combinações. Ajustes feitos durante a revisão: o rótulo com caixa deixou de empurrar "Atualizar recebimentos" para outra linha no celular; opções de rádio lado a lado ganharam espaço entre si; "Saiba mais" voltou a mostrar a seta; "Mais ações" ganhou seta de aberto/fechado.

Ganho na primeira tela do celular: o título geral sai da tela e o botão Sair fica em contorno, o que sobe o primeiro cartão de 554 px para 500 px do alto da tela (medido no celular emulado, proprietário); o primeiro cartão continua aparecendo na primeira tela, e com "Mais ações" o cartão de ação fica com duas ações à vista.

## Limitações e pendências

- "Mais ações" depende da largura da tela no momento (muda ao girar o aparelho); não foi testado em aparelho físico, só em celular emulado (390 × 844).
- Os botões que iniciam a operação central da tela ("Nova preparação", "Registrar decisão", "Abrir / porcionar") ficam principais, como luis confirmou no aceite.
- Rejeitar ocorrência só fica vermelho na confirmação, depois de marcar "Rejeitar"; o botão "Registrar decisão" abre a escolha entre liberar e rejeitar e continua principal.
- Os primeiros passos não verificam se já existem locais (o passo é opcional e não mostra "feito").
- Fora da V4, como na proposta: vírgula decimal (V5), filtros por categoria, aviso de formulário não salvo.

## Aceite

Aceite final de luis em 16/11/2026, 21:10 UTC: os oito itens e a D-062 aprovados, CI verde, V4 tecnicamente encerrada. Diretriz visual definida por luis no aceite: **uma só ação principal por contexto, sempre que possível**. Ficam como principais os botões que iniciam a operação central da tela (como "Nova preparação", "Registrar decisão" e "Abrir / porcionar"); as ações destrutivas continuam diferenciadas pelo estilo de risco. Sem merge nem deploy sem autorização específica. A V5 (vírgula decimal) foi autorizada por luis em outra thread.
