# Revisão visual e de uso da interface — após a Fase 7

> Pedido por luis em 14/11/2026 (22:54 UTC): revisão visual completa da interface, cobrindo navegação, organização das telas, facilidade de uso e adaptação para celular. **Esta etapa não altera código.** Cada correção proposta aqui vira uma fatia que exige aprovação própria de luis. Dados de teste sintéticos ("Restaurante Exemplo", pessoas "Ana" e "Bruno"); **nenhum nome, foto ou texto de documento do hotel piloto está neste repositório**. Nada aqui afirma conformidade sanitária ou legal; a conferência pela nutricionista RT (Q10) segue pendente.

## 1. Como a revisão foi feita

- **Código revisado:** ponta da cadeia de PRs, branch do PR #30 (`claude/fase-07-9-temperatura-opcional`, commit `b3092c2`), que contém as fatias 6.x e 7.1 a 7.9.
- **Ambiente:** Supabase local (`npm run db:start`, todas as migrações aplicadas), `npm run dev` em modo local, empresa criada com `scripts/provision.mjs` (uma empresa, duas unidades, um proprietário e um colaborador com nome de exibição).
- **Navegador:** Chromium (Playwright), sem extensões. Desktop 1366 × 900; celular emulado como iPhone 13 (390 × 844, toque). Não foi testado em aparelho físico, tablet, Safari real nem Android.
- **Percurso como proprietário:** login, início, abrir unidade vazia, cadastrar 3 produtos, fornecedor, preparação própria, 2 locais; 6 recebimentos (um já vencido, um que vence hoje, um amanhã, um sem medição de temperatura que gera bloqueio); decisão de ocorrência (aberta, não confirmada); registrar produção (formulário, revisão, resultado); abrir embalagem (formulário, revisão, resultado); saída por consumo; mudar de local; alterar configurações (aberto, não salvo); gerenciar unidades; abrir etiqueta pela lista; abrir o endereço do QR depois de recarregar.
- **Percurso como colaborador:** login, abrir unidade, lista de validade, movimentações, endereço do QR, recarregar a página.
- **Medições automáticas** na tela da unidade aberta, com os dados acima:

| Perfil       | Tela    | Altura da página     | Botões visíveis | Onde começa a lista de validade |
| ------------ | ------- | -------------------- | --------------- | ------------------------------- |
| Proprietário | desktop | 4.439 px (≈ 5 telas) | 48              | 2.696 px (3ª tela)              |
| Proprietário | celular | 7.526 px (≈ 9 telas) | 48              | 3.890 px (5ª tela)              |
| Colaborador  | desktop | 2.956 px             | 13              | 2.075 px                        |
| Colaborador  | celular | 4.668 px             | 13              | 2.994 px                        |

Em todos os casos: nenhum botão com menos de 44 px de altura, nenhum campo com fonte menor que 16 px (o iPhone não dá zoom ao tocar no campo) e nenhuma rolagem horizontal em 390 px. Não há elemento `<nav>` no aplicativo logado.

Capturas em [`docs/capturas/revisao-visual-07/`](capturas/revisao-visual-07/), reduzidas para o repositório. As originais em resolução completa ficaram na pasta do projeto.

## 2. O que já está bom

- **Alvos de toque e fonte** adequados para celular (ver medições acima); sem rolagem lateral.
- **Revisão antes de gravar** em produção, manipulação, saída e configurações, com texto claro do que será registrado.
- **Linguagem de responsabilidade consistente:** a validade é sempre "informada pelo responsável", o sistema "não calcula nem sugere prazos", nenhuma tela fala em aprovado ou conforme.
- **Permissões explicadas na tela:** o colaborador vê "Somente o proprietário registra…" em vez de botões que falham.
- **Vencido em destaque:** a faixa "VENCIDO — somente descarte" (6.11) é o único status com cor e funciona bem.
- **Resultado da produção e da manipulação** oferece a etiqueta logo em seguida, no momento em que ela é necessária.

## 3. Achados priorizados

Prioridades: **Bloqueia piloto** (atrapalha o uso diário na cozinha a ponto de comprometer a observação do piloto), **Melhora** (atrito real, mas contornável com orientação) e **Detalhe** (acabamento).

### Bloqueia piloto

**B1. Tudo fica numa única página longa, sem navegação.** Ao abrir a unidade, o proprietário recebe, em sequência: catálogo de produtos, fornecedores, preparações, configurações, produção, recebimento, bloqueios, painel de validade, lista de recipientes, formulário de recebimento, locais e nome da organização. No celular são cerca de 9 telas de rolagem e 48 botões. A informação que a cozinha mais consulta (o que vence hoje) começa na 5ª tela do celular. Formulários abertos aparecem no meio da lista, e o usuário perde o lugar.
_Capturas:_ 02, 03, 18.
_Proposta:_ dividir a unidade em seções com navegação fixa (abas no desktop, barra inferior no celular): **Validade** (tela inicial ao abrir a unidade), **Receber**, **Produção**, **Locais** e **Cadastros e configurações** (só proprietário). Gestão de unidades e nome da organização vão para Cadastros. É mudança de estrutura, não de regra; os E2E usam nomes de região e botão, que devem ser preservados ou atualizados no mesmo commit.

**B2. A sessão cai a cada recarga, e o QR exige login toda vez.** Recarregar a página ou abrir o endereço do QR pela câmera do celular volta à tela de login (`persistSession: false` em `src/app/configureApp.ts`). Na cozinha, cada leitura de etiqueta exigiria digitar e-mail e senha. A decisão D-025 (sessão persistente com expiração por inatividade) está como **proposta** desde a Fase 6 e não foi implementada. Depois do login, o QR abre o recipiente corretamente.
_Capturas:_ 16, 17.
_Proposta:_ implementar a D-025. Exige decisão de luis sobre o tempo de inatividade e sobre aparelho compartilhado, porque mexe em segurança (o risco de outra pessoa usar o aparelho aumenta).

**B3. A linha de cada recipiente é um parágrafo difícil de ler.** Cada item junta 8 a 10 informações separadas por travessão: produto, código, lote, saldo, validade em formato ISO (`2026-11-16`), origem, status, UUID completo de 36 caracteres e local, seguidos de até 4 botões que quebram em posições diferentes. No celular, um recipiente ocupa quase uma tela inteira, e o UUID aparece partido no meio.
_Capturas:_ 05, 02.
_Proposta:_ transformar cada recipiente em um cartão: nome do produto e código C-xxxxxx em destaque; selo de status; saldo; validade em dd/mm/aaaa com "em N dias"; local. UUID só na ficha do recipiente. Ações sempre na mesma posição (no celular, botão principal e um "mais ações").

**B4. Status de validade sem destaque, exceto vencido.** "Vence hoje", "Vence amanhã" e "Posterior" aparecem como texto comum no meio da linha. Os contadores ("Vencidos: 1 · Vence hoje: 1 · Vence amanhã: 1 · Posteriores: 5") são uma linha simples. A página do QR mostra a validade (`2027-05-13`) sem dizer se vence hoje ou em quantos dias.
_Capturas:_ 06, 05, 16.
_Proposta:_ selos com cor e texto (vencido, vence hoje, vence amanhã, em N dias), sempre com o texto além da cor; contadores como botões de filtro; o mesmo selo no topo da página do QR. "Posterior" vira "em N dias". Nenhuma regra de cálculo muda: o status já vem pronto do domínio.

### Melhora

**M1. Todos os botões têm o mesmo estilo.** Confirmar, Cancelar, Sair, Anular produção, Anular registro e Desativar local usam o mesmo verde escuro. Ações que não podem ser desfeitas não se distinguem das demais.
_Capturas:_ 08, 10, 12, 14.
_Proposta:_ três estilos: principal (verde cheio), secundário (contorno) e de risco (contorno vermelho, para anular, descartar e desativar).

**M2. Botões de opção e caixas de marcar ficam desalinhados do texto.** O marcador fica no alto e o texto desce uma linha. Causa: a regra `.workspace input { min-height: 44px; padding }` em `src/app/styles.css` também vale para `radio` e `checkbox`. Aparece em recebimento (temperatura), manipulação, decisão de ocorrência, configurações e "Mostrar esgotados".
_Capturas:_ 07, 08, 09, 13, 14.
_Proposta:_ limitar a regra a campos de texto e listas; dar ao rótulo inteiro a área de toque de 44 px.

**M3. Datas e horas em formatos misturados.** Convivem `2026-11-16` (lista), `16/11/2026` (formulários e produção), `2026-11-14T23:00:31.357489+00:00` (movimentações) e `2026-11-14T22:59:39.833Z` ("Última consulta"). O fuso aparece como `America/Sao_Paulo`.
_Capturas:_ 06, 10, 05.
_Proposta:_ sempre dd/mm/aaaa e HH:mm no fuso da unidade; nome do fuso legível ("horário de Brasília"), mostrado uma vez.

**M4. O histórico de movimentações mostra identificadores internos.** Cada saída mostra "autor" como UUID e o "ID" do registro. Manipulação e produção já mostram o nome de exibição.
_Captura:_ 10.
_Proposta:_ mostrar o nome de exibição de quem registrou; manter os identificadores numa linha recolhida para suporte.

**M5. Quantidades só aceitam ponto decimal.** A tela pede "Use ponto para decimais, por exemplo 0.5". No Brasil, a cozinha digita vírgula (`2,5`). As quantidades de recebimento, saída e manipulação recusam a vírgula; só a temperatura da produção a converte.
_Captura:_ 10.
_Proposta:_ aceitar vírgula e ponto em todas as quantidades, convertendo antes da validação, como já é feito na temperatura. Precisa de testes de domínio.

**M6. "Abrir etiqueta" abre a ficha longe do item clicado.** Na lista, o botão insere a ficha do recipiente no alto da seção de recebimentos, entre o título e os bloqueios, e empurra o resto da página. No celular, o usuário perde o lugar na lista.
_Captura:_ 15.
_Proposta:_ abrir a ficha como tela própria (o endereço `/recipiente/:id` já existe), com "Voltar para a lista".

**M7. A tela do colaborador mostra o que ele não usa e esconde o que ele usaria.** O colaborador rola por produtos, fornecedores, preparações e configurações, só para leitura, antes de chegar à validade. Na lista ele não tem "Abrir etiqueta" (só chega à ficha lendo o QR), e o recipiente derivado não tem nenhum botão.
_Capturas:_ 18, 16.
_Proposta:_ com a navegação do B1, o colaborador abre direto em Validade e vê só as seções que usa. A ficha do recipiente fica acessível pela lista. Não muda permissão: hoje só o proprietário escreve (decisão de 12/11/2026).

**M8. O cabeçalho ocupa espaço e não diz onde a pessoa está.** O título "Cozinha SaaS — unidades, recebimentos e validade" e o aviso de ambiente local ocupam metade da primeira tela do celular. Ao rolar, a unidade aberta e o papel deixam de aparecer. A unidade é aberta por um botão chamado "Catálogo de X", embora abra a unidade inteira.
_Capturas:_ 04, 01.
_Proposta:_ cabeçalho compacto e fixo com nome da unidade, papel e Sair; botão "Abrir Cozinha principal". O aviso de ambiente de demonstração continua, mas em uma faixa curta.

**M9. O formulário de recebimento não tem título e fica depois da lista.** O formulário aparece sem título, abaixo de todos os recipientes. A ordem dos campos (produto, temperatura, fornecedor, lote, quantidade, validade) não segue a nota ou a embalagem, e os campos têm larguras diferentes.
_Captura:_ 07.
_Proposta:_ seção própria "Receber" (B1), com título e campos na ordem fornecedor, produto, lote, quantidade, validade, temperatura, todos com a mesma largura no celular.

**M10. Depois de "Mudar de local", o formulário continua aberto.** A mensagem "Local registrado" aparece com o formulário ainda aberto em "Escolha…", e parece que nada foi gravado.
_Captura:_ 19.
_Proposta:_ fechar o formulário depois do sucesso e mostrar o novo local na própria linha, como já é feito na produção.

**M11. Muitos textos explicativos permanentes.** Cada seção tem de 1 a 4 parágrafos fixos ("O saldo registrado não comprova a quantidade física", "Confira a operação antes de confirmar…", referência de fuso e relógio). São avisos importantes, mas repetidos em toda visita.
_Proposta:_ manter o conteúdo e os avisos de responsabilidade. Os textos fixos de orientação ficam numa linha curta com "Saiba mais" recolhível. **Nenhum aviso sobre validade ou responsabilidade é removido.**

### Detalhe

- **D1. Primeiro acesso sem orientação.** A unidade vazia mostra só "Nenhum recipiente com saldo". _Proposta:_ um passo a passo curto (cadastrar produto, fornecedor e local, depois receber).
- **D2. Títulos pouco diferentes do texto.** As seções em `h3` e `h4` têm quase o tamanho do corpo do texto, e as seções não são separadas visualmente. _Proposta:_ cartões ou separadores por seção e escala de títulos.
- **D3. Rótulo longo em botão.** "Janela de registro de Molho de tomate da casa" repete o nome. _Proposta:_ "Janela de registro", com o nome no rótulo acessível.
- **D4. Unidades listadas duas vezes** (lista e gestão) e com o fuso cru ao lado do nome. Pendência já registrada em `REVISAO_INTERFACE_UNIDADES.md`.
- **D5. Sem "pular para o conteúdo"** no aplicativo logado (existe só na demonstração pública).
- **Limite desta revisão:** o Chromium de teste mostrou o campo de data como `mm/dd/yyyy`. O formato desse campo depende do idioma do navegador, então num celular em português deve aparecer dd/mm/aaaa. Isso precisa ser conferido em aparelho real.

## 4. Fatias de correção propostas (cada uma exige aprovação própria)

| Fatia                               | Resolve                          | Escopo                                                                                                                               | Risco para os testes                                                                                                    |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **V1 — Navegação e estrutura**      | B1, M7, M8, M9 (posição), D2, D5 | Seções com navegação fixa; Validade como tela inicial; cabeçalho compacto; vista do colaborador; Cadastros e configurações agrupados | Alto: muda a ordem e a visibilidade das regiões usadas pelos E2E; atualizar E2E no mesmo commit, sem enfraquecer nenhum |
| **V2 — Sessão persistente (D-025)** | B2                               | Sessão persistente com expiração por inatividade e Sair visível                                                                      | Médio; **mexe em segurança**: precisa de decisão de luis sobre tempo e aparelho compartilhado                           |
| **V3 — Lista de validade legível**  | B3, B4, M3, M4, M6               | Cartão de recipiente, selos de status, datas dd/mm, nome no histórico, ficha como tela própria                                       | Médio: textos verificados nos testes de componente mudam de formato                                                     |
| **V4 — Acabamento visual**          | M1, M2, M10, M11, D1, D3         | Hierarquia de botões, alinhamento de rádios, fechar mudança de local, textos recolhíveis, estado vazio                               | Baixo                                                                                                                   |
| **V5 — Vírgula decimal**            | M5                               | Aceitar vírgula nas quantidades                                                                                                      | Baixo; precisa de testes de domínio novos                                                                               |

Ordem sugerida: **V2 e V1 primeiro** (são as que mais pesam no uso diário pelo celular), depois V3, V4 e V5. V4 e V5 são pequenas e podem andar em paralelo. Nenhuma fatia muda regra de validade, permissão ou banco, exceto a V2, que muda o comportamento da sessão.

## 5. Capturas

| Arquivo                                 | O que mostra                                                     |
| --------------------------------------- | ---------------------------------------------------------------- |
| 01-inicio-proprietario-desktop          | Início depois do login (proprietário)                            |
| 02-unidade-proprietario-desktop-inteira | Unidade aberta, página inteira, com dados                        |
| 03-unidade-proprietario-celular-inteira | A mesma página no celular (reduzida, para mostrar o comprimento) |
| 04-inicio-proprietario-celular          | Primeira tela no celular                                         |
| 05-lista-recipientes-celular            | Linhas de recipiente no celular                                  |
| 06-painel-validade-desktop              | Painel de validade e contadores                                  |
| 07-recebimento-desktop                  | Formulário de recebimento de produto refrigerado                 |
| 08-manipulacao-desktop                  | Abrir embalagem                                                  |
| 09-manipulacao-celular                  | Abrir embalagem no celular                                       |
| 10-movimentacoes-desktop                | Histórico de saída com UUID e data ISO                           |
| 11-producao-form-desktop                | Registrar produção                                               |
| 12-producao-resultado-desktop           | Produção registrada                                              |
| 13-decisao-ocorrencia-desktop           | Decisão de ocorrência                                            |
| 14-configuracoes-desktop                | Alterar configurações da unidade                                 |
| 15-etiqueta-dentro-da-lista-desktop     | Ficha do recipiente aberta pela lista                            |
| 16-qr-colaborador-celular               | Endereço do QR depois do login (colaborador)                     |
| 17-recarregar-pede-login-desktop        | Recarregar a página volta ao login                               |
| 18-unidade-colaborador-desktop-inteira  | Unidade aberta pelo colaborador                                  |
| 19-mudar-local-desktop                  | Mudar de local depois do sucesso                                 |

## 6. O que não foi verificado

Aparelho físico (iPhone, Android, tablet), leitura real do QR pela câmera, impressão das etiquetas, uso por pessoas na cozinha, leitores de tela e modo escuro. A revisão também não substitui o teste com a equipe no piloto: as propostas acima são hipóteses de melhoria, a confirmar com o uso.
