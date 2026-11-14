# Fase 7, fatia 7.3 — tela de produção da cozinha

> Autorizada por luis em 14/11/2026 (16:10 UTC), junto com o aceite da 7.2: "Autorizo o início da Fase 7.3, incluindo a interface de anulação, conforme o planejamento aprovado." Segue o [desenho da Fase 7](FASE_07_DESENHO.md) (seções 4.6, 4.7, 5.1 e 5.3), a D-049, a D-050 e a D-051. Decisão proposta: **D-052** (abaixo), **aguardando aceite de luis**. **Nada aqui afirma conformidade sanitária**; a conferência pela nutricionista RT (Q10) continua pendente. Dados de teste sintéticos. Sem migração.

## O que mudou

### Catálogo

- Nova seção **"Preparações próprias"**, separada de produtos e fornecedores. O cadastro abre pelo botão "Nova preparação" e pede nome, unidade e conservação (definida uma vez, como no produto). O item é gravado em `products` com `kind = 'preparation'`, escolhido só na criação.
- O recebimento continua mostrando só produtos.

### Produção da cozinha (novo painel, `src/features/production`)

- **Registrar produção** em passos (D-043): formulário, revisão, confirmação e resultado. Só o proprietário vê o botão (D-019).
- Formulário: preparação, quantidade, produzida em (padrão = instante do registro, no fuso da unidade; "fim do preparo ou início do resfriamento"), validade (campo **vazio**, sem sugestão, D-004), produzida por (pessoas com nome de exibição; quem não tem nome pode ganhar um na própria tela) e observação opcional.
- A tela recusa antes de enviar: validade anterior à data da produção, horário no futuro, falta de justificativa quando o registro passa de 2 horas, preparação sem conservação. O banco continua decidindo tudo (inclusive validade anterior a hoje).
- **Revisão** escreve a validade por extenso, com dia da semana e contagem de dias ("16/11/2026 (segunda-feira), 2 dias depois da produção"), só para a pessoa conferir o que digitou. Validade no mesmo dia da produção exige marcar "A validade é no mesmo dia da produção. Confirmo que é isso mesmo."
- Registro com mais de 2 horas avisa que o lote fica bloqueado até a decisão do proprietário.
- **Produções recentes**: as 50 mais recentes, com recipiente (C-000123), quantidade, produzida em/por, validade, aviso de registro tardio e a faixa **ANULADA** com data e motivo.
- **Anular produção** (D-051): botão em cada produção não anulada. Explica que é definitiva, que só vale antes de qualquer movimento (mesmo desfeito) e que depois disso o caminho é o descarte com motivo. Motivo obrigatório (até 300 caracteres); a recusa do banco aparece como veio.
- Registrar ou anular relê a lista de recipientes (saldo).

### Recuperação de tentativa (desenho 4.7, D-045)

- Registrar e anular produção passam pelo `trackGateways`: resultado incerto fica em "Registros não confirmados", com "Registro confirmado" (via `find_operation`) ou "Enviar novamente" com o mesmo identificador. Nunca reenvia sozinho. Tipos novos: "Produção da cozinha" e "Anulação de produção".
- Recusa conhecida troca o identificador; conflito de identificador pede "Já conferi; iniciar nova tentativa".

### Página do recipiente (QR)

- Lote produzido mostra "Preparação própria", "Um recipiente integral corresponde a esta produção" e "Produzida em … por …" (com aviso de registro tardio).
- Produção anulada mostra **ANULADO** com data e motivo, e não oferece "Gerar etiqueta PDF". Sem os dados da produção legíveis, o recipiente fica indisponível (não aparece como recebimento).

## Testes

Todos executados neste ambiente, com o banco local recém-recriado (`npm run db:reset`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | ok |
| `npm run test` (Vitest) | 264 passaram (34 arquivos; 21 novos: 17 em `production.test.tsx`, 1 no catálogo, 2 no gateway da etiqueta, 1 na página do recipiente) |
| `npm run test:db` (pgTAP) | 1202 passaram (sem migração nova) |
| `npx supabase db advisors --type security --level warn --fail-on warn` | sem problemas |
| `npm run test:integration` | 34 passaram |
| Playwright (config local com o Chromium do ambiente) | 16 passaram (`production.spec.mjs` novo: cadastrar, registrar, revisar, anular e ver ANULADO) |

Teste existente alterado, sem enfraquecer: em `CatalogPanel.test.tsx`, o aviso de limite de 1.000 itens aparece uma vez por seção; a contagem exata passou de 2 para 3 com a seção de preparações.

## Limites conhecidos

1. **Sem etiqueta própria:** o PDF de lote produzido continua recusado até a 7.4.
2. **"Abrir / porcionar"** na lista de recipientes ainda oferece "Abrir embalagem" para preparação; o banco recusa. A tela de porcionar preparação é a 7.5.
3. A lista de recipientes não mostra a faixa ANULADO: o lote anulado sai da lista (saldo zero) e aparece só com "Mostrar esgotados". A faixa aparece na lista de produções e na página do recipiente.
4. "Anular produção" fica na lista de produções, não na página do QR.
5. "Produzida por" usa o nome de exibição atual, de até 40 caracteres; o nome completo (até 80) é da 7.6.
6. As configurações por unidade decididas por luis (quem registra, janela por preparação, aviso sem etiqueta) são das fatias 7.6 a 7.9; hoje vale só o proprietário e a janela de 2 horas.

## Pontos para luis decidir

1. **Formulários que abrem por botão:** "Nova preparação" e "Registrar produção" ficam fechados até a pessoa escolher, para a tela não repetir os campos do recebimento. Proposta: manter.
2. **Lista de produções com as 50 mais recentes**, sem busca. Proposta: manter no piloto; busca e filtro entram se a cozinha pedir.
3. **Lote anulado fora da lista de recipientes** (aparece com "Mostrar esgotados"), com a faixa ANULADA na lista de produções e no QR. Proposta: manter.

## Decisão proposta para `DECISOES.md`

> **D-052 — Tela de produção da cozinha (14/11/2026).** Status: proposta, aguardando aceite de luis; implementada na fatia 7.3 ([registro](FASE_07_3.md)). Decisão: preparação própria tem seção própria no catálogo; a produção é registrada em passos (formulário, revisão por extenso com dia da semana e contagem de dias só para conferência, confirmação extra para validade no mesmo dia, resultado), com validade vazia e sem sugestão; "Anular produção" fica na lista das 50 produções mais recentes; registro e anulação entram na recuperação de tentativa; a página do recipiente mostra "Preparação própria", quem produziu e a faixa ANULADO, sem etiqueta para lote anulado. Motivo: D-049, D-050, D-051, D-043, D-045, D-004, D-019. Consequência: a 7.4 desenha o PDF a partir dos mesmos dados (`production` na etiqueta). Revisar quando: a 7.4 e a 7.5 chegarem ou a observação na cozinha pedir outro fluxo.

## Próximo passo

Aceite de luis (3 pontos e D-052). A 7.4 (etiqueta "Preparação própria") exige aprovação própria. Sem merge sem pedido de luis.
