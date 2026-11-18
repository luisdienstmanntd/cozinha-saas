# V4 — Acabamento visual (proposta, sem implementação)

Pedida por luis em 16/11/2026, 12:43 UTC, no aceite da V3: "preparar a proposta da V4 — Acabamento visual, sem iniciar implementação até minha aprovação". Base: itens M1, M2, M10, M11, D1 e D3 de `REVISAO_VISUAL_FASE_07.md`, com o que as V1 a V3 já resolveram ou deixaram registrado. **Nada aqui foi implementado.** Sem merge nem deploy.

## Escopo proposto

| #   | Item                                                   | O que muda                                                                                                                                                                                                                                                                                                                                                   | Onde                                                                                                                                                  |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Hierarquia de botões (M1)**                          | Três estilos: **principal** (verde cheio: registrar, confirmar, salvar), **secundário** (contorno: ver, abrir, cancelar, fechar, voltar) e **de risco** (contorno vermelho: anular registro, anular manipulação, anular produção, descartar, rejeitar, desativar local, descartar tentativa). Confirmação de risco ("Confirmar anulação") em vermelho cheio. | Uma classe por estilo em `styles.css`; os botões recebem a classe, sem mudar texto nem comportamento.                                                 |
| 2   | **Rádios e caixas alinhados (M2)**                     | A regra `.workspace input { min-height: 44px }` passa a valer só para campos de texto, número, data e listas. Rádio e caixa ficam alinhados ao texto, e o **rótulo inteiro** mantém a área de toque de 44 px.                                                                                                                                                | `styles.css` (a V3 já corrigiu só "Mostrar esgotados"). Afeta recebimento (temperatura), manipulação, decisão de ocorrência, configurações, produção. |
| 3   | **Fechar "Mudar de local" após o sucesso (M10)**       | Depois de "Local registrado", o formulário fecha e o cartão mostra o novo local (a V3 já mostra "Local" no cartão). A mensagem de sucesso fica no cartão.                                                                                                                                                                                                    | `MoveContainer.tsx`, `BatchPanel.tsx`                                                                                                                 |
| 4   | **Textos fixos recolhíveis (M11)**                     | Orientações repetidas ("Confira a operação antes de confirmar…", referência de relógio e fuso, explicação da ordem da lista) viram uma linha curta com "Saiba mais" (`<details>`). **Avisos de validade, responsabilidade, bloqueio, vencido, saldo não comprova quantidade física e somente leitura continuam sempre visíveis.** Nenhum texto é apagado.    | `MovementPanel`, `HandlingForm`, `ProductionPanel`, `BatchPanel`, `LabelView`                                                                         |
| 5   | **Primeiro acesso orientado (D1)**                     | Unidade vazia mostra um passo a passo curto: cadastrar produto e fornecedor, criar local, receber. Cada passo leva à área certa (links da V1). Colaborador vê a versão sem ações de cadastro.                                                                                                                                                                | `BatchPanel` (estado vazio)                                                                                                                           |
| 6   | **Rótulos curtos (D3)**                                | "Janela de registro de Molho de tomate da casa" → "Janela de registro", com o nome da preparação no rótulo acessível (`aria-label`). O mesmo para botões que repetem o nome do item.                                                                                                                                                                         | `CatalogPanel`, `PreparationWindow`                                                                                                                   |
| 7   | **Ações do cartão no celular (limitação da V3)**       | No celular, o cartão mostra "Ver ficha" e o botão principal; as demais ações ficam em "Mais ações". No desktop, nada muda.                                                                                                                                                                                                                                   | `BatchPanel`, `styles.css`                                                                                                                            |
| 8   | **Cabeçalho compacto no celular (limitação da V1/V3)** | O título geral "Cozinha SaaS — unidades, recebimentos e validade" some da unidade aberta no celular (a faixa de sessão e o nome da unidade continuam), para o primeiro cartão aparecer inteiro.                                                                                                                                                              | `IdentityHome`, `styles.css`                                                                                                                          |

Itens 7 e 8 são opcionais: resolvem limitações registradas nas V1 e V3, mas não estavam no escopo original da V4.

## Fora da V4

- Vírgula decimal nas quantidades (V5).
- Filtros por categoria nos contadores (backlog, exige consulta no servidor).
- Aviso de formulário não salvo (backlog da V1).
- Qualquer mudança de banco, RLS, regra de validade, estoque ou auditoria.

## Testes previstos

- Componente: classe de risco nos botões de anular, descartar, rejeitar e desativar; rótulo inteiro clicável em rádio e caixa; "Mudar de local" fecha após o sucesso e o cartão mostra o local; avisos obrigatórios visíveis sem abrir "Saiba mais"; passo a passo da unidade vazia por perfil; nome acessível do botão de janela.
- E2E: os testes existentes usam nome de botão e rótulo. Os itens 1, 2, 4 e 8 não mudam nomes. O item 6 muda o texto visível, mas não o nome acessível. O item 7 exige abrir "Mais ações" no celular. Nenhuma asserção removida ou relaxada.
- Visual: capturas antes e depois, desktop e celular, proprietário e colaborador; teste de alvos de 44 px atualizado para os rótulos.
- Bateria completa (format, lint, tipos, vitest, build, pgTAP, integração, E2E).

## Riscos

- **Baixo** para a lógica: só estilo, posição de texto e um fechamento de formulário.
- **Médio** para a leitura de avisos (item 4): o critério de "aviso obrigatório" precisa ser o de luis. A proposta lista cada texto antes de recolher.
- Contraste do vermelho de risco: conferir 4,5:1 em texto e borda.

## Decisões para luis

1. Aprovar o escopo (itens 1 a 6) e dizer se entram os opcionais 7 e 8.
2. Lista de botões "de risco" (proposta: anular registro, anular manipulação, anular produção, descartar, rejeitar, desativar local, descartar tentativa).
3. Critério do item 4: recolher só orientação de uso; avisos de validade, responsabilidade, bloqueio, vencido, saldo físico e somente leitura sempre visíveis.
4. Decisão a registrar: D-062 (proposta quando a implementação for aprovada).
