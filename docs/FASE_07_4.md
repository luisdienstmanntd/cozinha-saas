# Fase 7, fatia 7.4 — etiqueta PDF "Preparação própria"

> Autorizada por luis em 14/11/2026 (16:30 UTC), junto com o aceite da 7.3: "Autorizo o início da Fase 7.4 — Etiqueta PDF de preparação própria, seguindo o desenho aprovado, com testes automatizados e preservação dos controles de segurança e rastreabilidade." Segue o [desenho da Fase 7](FASE_07_DESENHO.md) (seção 5.2, critério 12), a D-044, a D-049 e as D-050 a D-052. Decisão proposta: **D-053** (abaixo), **aguardando aceite de luis**. **Nada aqui afirma conformidade sanitária**; a conferência pela nutricionista RT (Q10) continua pendente. Dados de teste sintéticos. Sem migração.

## O que mudou

### Modelo "Preparação própria" (`labels/application/pdf.ts`)

Terceiro modelo de 100 × 100 mm, ao lado de "Recebimento" e "Produto aberto / fracionado". Legível sem o QR, datas em dd/mm/aaaa, na ordem da seção 5.2:

1. Cabeçalho "PREPARAÇÃO PRÓPRIA" e o **nome da preparação, maior texto da etiqueta** (16 pt, até 3 linhas).
2. **VALIDADE dd/mm/aaaa** em negrito, logo abaixo (15 pt).
3. "Validade informada pelo responsável".
4. "Produzido em: dd/mm/aaaa hh:mm (fuso)".
5. "Produzido por: nome".
6. Conservação.
7. Quantidade: no integral, "Quantidade produzida"; na porção, "Quantidade da porção" e "Porção X de N".
8. Código curto (C-000123), identificação e QR.

- A **porção** de uma preparação usa este mesmo modelo, com a validade da porção, e não o de "produto fracionado" (não há validade do fabricante a mostrar).
- Não aparecem lote do fabricante, fornecedor nem "RECEBIMENTO".
- Gerar ou reimprimir não grava nada (D-003); cada recipiente é relido e reautorizado no momento de gerar.

### Recusas do arquivo inteiro (como na 6.7)

- **Produção anulada** (D-051).
- **Produção tardia sem liberação**: com a ocorrência `late_production` aberta, pendente ou rejeitada, a etiqueta não sai, como na manipulação tardia (D-044). Liberada pelo proprietário, sai normalmente.
- **Dados da produção indisponíveis** (lote produzido sem a produção legível ou sem conservação): falha fechada.
- Num PDF com várias etiquetas, uma recusa interrompe o arquivo todo.

### Onde baixar

- No resultado do registro de produção: "Baixar etiqueta".
- Na lista de produções recentes: "Baixar etiqueta (C-000123)" em cada produção não anulada.
- Na página do recipiente (QR): "Gerar etiqueta PDF", que some e explica a recusa quando a produção está anulada ou tardia sem liberação.
- No resultado do porcionamento de uma preparação: "Baixar esta" e "Baixar PDF de todas", já existentes, agora com o modelo próprio.

## Testes

Todos executados neste ambiente, com o banco local recém-recriado (`npm run db:reset`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | ok |
| `npm run test` (Vitest) | 273 passaram (9 novos: modelo, ordem dos campos, nome como maior texto, porção, recusas, faixa; retenção pela ocorrência; página do recipiente; botões de etiqueta) |
| `npm run test:db` (pgTAP) | 1202 passaram (sem migração nova) |
| `npx supabase db advisors --type security --level warn --fail-on warn` | sem problemas |
| `npm run test:integration` | 34 passaram |
| Playwright (config local com o Chromium do ambiente) | 17 passaram (`production.spec.mjs`: baixa a etiqueta do integral e confere o texto; novo teste porciona a preparação, baixa as duas porções e confirma que a anulação passa a ser recusada) |

Testes existentes alterados, sem enfraquecer:

- `pdf.test.ts`: o teste da 7.1 recusava todo lote produzido ("ainda não disponível"). Com o modelo próprio, ele passou a recusar lote produzido **sem os dados da produção** ("Dados da produção indisponíveis"), que é a falha fechada da seção 5.2.
- `forbiddenTexts.test.ts` (teste 16): a varredura do texto desenhado ganhou os modelos de preparação (integral e porção); nada foi retirado.

## Limites conhecidos

1. **Impressão física não validada**, como nos outros modelos (PDF de demonstração).
2. Nome de preparação que não cabe em 3 linhas é recusado ("Conteúdo não cabe neste modelo de etiqueta"); caracteres fora do conjunto do PDF também (regra existente).
3. Na porção, "Produzido em" é o horário da produção; o horário do porcionamento fica na página do recipiente.
4. "Abrir / porcionar" ainda oferece "Abrir embalagem" para preparação (o banco recusa); ajuste na 7.5.
5. "Produzido por" usa o nome de exibição de até 40 caracteres; o nome completo (até 80) é da 7.6.

## Pontos para luis decidir

1. **Tamanhos:** o nome da preparação é o maior texto (16 pt) e a validade vem logo abaixo em negrito (15 pt). Proposta: manter, conforme a ordem do desenho.
2. **Porção mostra o horário da produção**, não o do porcionamento. Proposta: manter; o porcionamento aparece no QR.
3. **Produção tardia sem liberação não gera etiqueta**, mesmo com faixa, até a decisão do proprietário. Proposta: manter, igual à manipulação tardia (D-044).

## Decisão proposta para `DECISOES.md`

> **D-053 — Etiqueta "Preparação própria" (14/11/2026).** Status: proposta, aguardando aceite de luis; implementada na fatia 7.4 ([registro](FASE_07_4.md)). Decisão: lote produzido e suas porções usam o terceiro modelo de 100 × 100 mm, com os campos da seção 5.2 na ordem do desenho (nome como maior texto, validade em negrito logo abaixo, "Validade informada pelo responsável", produzido em/por, conservação, quantidade e porção X de N, código e QR), sem lote nem fornecedor; o arquivo inteiro é recusado para produção anulada, produção tardia sem liberação ou dados da produção indisponíveis; gerar não grava nada. Motivo: D-003, D-044, D-049, D-050, D-051, D-052. Consequência: a 7.5 ajusta a tela de porcionar preparação sem mudar o modelo. Revisar quando: a impressão física for testada ou a nutricionista RT responder a seção 10 do desenho.

## Próximo passo

Aceite de luis (3 pontos e D-053). A 7.5 (porcionar preparação na tela e métrica do piloto) exige aprovação própria. Sem merge, deploy ou mudança fora do escopo sem autorização específica de luis.
