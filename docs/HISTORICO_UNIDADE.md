# Histórico da unidade com exportação CSV (D-079)

> **Estado (27/11/2026):** implementado em rascunho na branch `claude/historico-unidade`, base `main` `12fb3f8`. Fatia F da auditoria de funcionalidades sem tela ([AUDITORIA_FUNCIONALIDADES_SEM_TELA.md](AUDITORIA_FUNCIONALIDADES_SEM_TELA.md)), aprovada por luis em 27/11/2026. **Só interface e testes: nenhuma migração, nenhuma mudança de RLS e nada alterado no Supabase hospedado.** Merge publica o site: só com autorização de luis.

## O que a tela faz

Nova área **Histórico**, logo abaixo de Indicadores, só para o proprietário (o colaborador não vê a área e o endereço `?area=historico` volta para a Visão geral). Mostra, do mais recente ao mais antigo, os registros que o banco já guarda, no período escolhido (últimos 7, 30 ou 90 dias até agora):

| Tipo na tela      | Fonte                                                    | Eventos                                                                                                       |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Recebimentos      | `batch_receipts` (origem `received`)                     | Recebimento, com produto, quantidade, fornecedor e validade                                                   |
| Produções         | `batch_productions`, `production_voids`                  | Produção registrada (com aviso de registro fora da janela), produção anulada                                  |
| Saídas            | `stock_movements` (`consumption`, `discard`, `reversal`) | Consumo, descarte, saída anulada, com recipiente e motivo                                                     |
| Manipulações      | `container_handlings`, `handling_voids`                  | Produto aberto, porcionamento, manipulação anulada                                                            |
| Locais            | `location_moves` (só `move`)                             | Mudança de local (de quem para onde)                                                                          |
| Ocorrências       | `occurrences`, `occurrence_decisions`                    | Ocorrência e decisão (liberado ou recusado)                                                                   |
| Cadastro e acesso | `entity_changes`                                         | Nome da organização e da unidade, fuso, nome de exibição, conservação do produto, janelas e regras da unidade |

Filtros por tipo e busca por texto (produto, recipiente, pessoa, motivo). **Exportar CSV** baixa exatamente a lista que está na tela (período, tipos e busca aplicados).

## Formato do CSV

UTF-8 com marca de ordem de bytes (abre com acentos no Excel), separador **ponto e vírgula**, quebra de linha CRLF, quantidade com vírgula decimal e unidade. Colunas: `Data e hora` (no fuso da unidade), `Instante (UTC)` (ISO, sem ambiguidade), `Tipo`, `Evento`, `Produto`, `Recipiente`, `Quantidade`, `Detalhe`, `Motivo ou observação`, `Responsável`. Nome do arquivo `historico-<unidade>-<aaaa-mm-dd>.csv`, só ASCII. **Texto que começaria com `=`, `+`, `-`, `@`, tabulação ou retorno ganha um apóstrofo na frente** (injeção de fórmula em planilha): um motivo digitado como `=SOMA(1;1)` sai como `'=SOMA(1;1)` e nunca é executado.

## Limites conhecidos

- Cada tipo traz no máximo **500 registros** por consulta (os mais recentes). Se algum tipo chega ao limite, a tela avisa que o histórico e o CSV mostram os mais recentes de cada tipo e que um período menor mostra o restante.
- Períodos fixos de 7, 30 e 90 dias. Período personalizado fica como melhoria.
- Não inclui: histórico por recipiente (já existe em Movimentações), temperaturas medidas na produção, downloads de etiqueta e movimentos internos (`transfer`, `handling_void`) gerados pelas manipulações. As anulações aparecem como evento próprio.
- Recebimento e produção são mostrados pelo instante do registro (`created_at`); a data de produção informada pelo responsável não é usada para ordenar.
- Quem registrou: nome de exibição do vínculo; sem nome, "Sem nome cadastrado". Registros sem sessão aparecem como "Administração do sistema".
- O CSV contém **nomes de exibição de pessoas**. Retenção, quem pode exportar e prazo de guarda dependem da orientação jurídica e do profissional da Q10 (ver `PRE_PILOTO.md`, seção 3). Nada aqui afirma conformidade sanitária ou legal.

## Decisão

> **D-079 — Histórico da unidade com exportação CSV (27/11/2026).** Status: implementada em rascunho, aguardando aceite de luis. Decisão: área **Histórico** só para o proprietário, só leitura, que junta em uma linha do tempo os registros já guardados (tabela acima) e exporta em CSV a lista mostrada. Motivo: fatia F da auditoria (PR #79): o dado existe e é imutável, mas o proprietário não tinha como vê-lo por período nem extraí-lo. Consequência: sem migração e sem mudança de permissão; a leitura continua filtrada pela RLS (o registro de alterações já era só do proprietário); esconder a área é apresentação, não barreira. Revisar quando: o piloto pedir período personalizado, mais de 500 registros por tipo, histórico do colaborador ou retenção definida.

## Verificação (local)

- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run test` (Vitest) e `npm run build`: ver o resultado no PR.
- Gateway real contra o Supabase local (30 migrações): recebimento, consumo, anulação, duas mudanças de local, renomeação da unidade, conservação do produto e nome de exibição apareceram com nomes legíveis; outra empresa não lê nada.
- Integração `tests/integration/history.test.mjs`: as mesmas tabelas e colunas que a tela lê, com usuários reais. Proprietário lê todas as fontes; colaborador, outra empresa e anônimo não leem o registro de alterações nem as fontes de outra empresa; nenhuma fonte aceita atualização direta.
- E2E `tests/e2e/history.spec.mjs` (desktop, celular 390 px, colaborador) e as navegações `navigation`, `bottom-nav` e `tablet-menu`, que ganharam o item Histórico.
