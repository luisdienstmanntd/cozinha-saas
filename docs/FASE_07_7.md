# Fase 7, fatia 7.7 — janela de registro por preparação

> Autorizada por luis em 14/11/2026 (20:30 UTC), junto com o aceite da 7.6: "Autorizo o início da Fase 7.7, conforme o desenho existente. Não antecipar as fatias 7.8 e 7.9." Segue o [desenho da Fase 7](FASE_07_DESENHO.md), seção 16 (resposta 5 de luis: "janela de 2 h adequada, com possibilidade de alterar para alguns alimentos"), e as D-036, D-055. Decisão proposta: **D-056** (abaixo), **aguardando aceite de luis**. **Nada aqui afirma conformidade sanitária**: os limites de 15 minutos a 24 horas só recusam valor absurdo, e os valores operacionais dependem da nutricionista RT (Q10, pendente). O teste físico de impressão também segue pendente. Dados de teste sintéticos.

## O que mudou

### Banco (migração `20261114080000_preparation_window.sql`)

- **`products.production_window_minutes`:** janela de registro da produção própria da preparação, de 15 minutos a 24 horas. Nulo significa "vale a da unidade" (7.6). Só preparação pode ter valor (regra do banco, vale para qualquer caminho de escrita). O cadastro não grava a coluna, e ninguém, nem o `service_role`, a altera direto.
- **`set_preparation_window`:** só o proprietário ativo da empresa define ou volta à janela da unidade, com a preparação bloqueada durante a troca. Repetir o mesmo valor não muda nada. O sistema não sugere valor.
- **Auditoria (D-036):** cada troca vai para `entity_changes` (entidade "product", campo `production_window_minutes`), com o valor anterior (vazio = a da unidade), o novo, quem mudou e quando, por qualquer caminho de escrita.
- **`register_production`:** a janela em vigor é a da preparação, se houver, senão a da unidade. Ela decide se a produção é tardia, entra na mensagem de recusa (por exemplo, "mais de 4 horas") e é guardada no registro (`batch_productions.late_window_minutes`, da 7.6).
- **Mudar a janela nunca reescreve produção antiga:** a marcação de tardia e a janela usada ficam como estavam. Repetir uma tentativa antiga devolve o mesmo lote, sem reavaliar a janela.

### Tela

- **Catálogo, seção "Preparações próprias":** cada preparação mostra "janela de registro: a da unidade" ou a própria (por exemplo, "4 horas"). Só o proprietário vê "Janela de registro de {preparação}", que abre o campo em minutos, mostra a duração por extenso, confirma os limites e oferece "Usar a janela da unidade em {preparação}" quando há janela própria.
- **Produção da cozinha:** ao escolher a preparação, o aviso de atraso, a justificativa e a lista passam a usar a janela dela.
- A janela da unidade continua sendo definida em "Configurações da unidade" (7.6).

## Testes

Todos executados neste ambiente, com o banco local recém-recriado (`npm run db:reset`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | ok |
| `npm run test` (Vitest) | 299 passaram (8 novos: catálogo, gateway e produção com a janela da preparação) |
| `npm run test:db` (pgTAP) | 1327 passaram (24 arquivos; `production_window.test.sql` com 43 novos) |
| `npx supabase db advisors --type security --level warn --fail-on warn` | sem problemas |
| `npm run test:integration` | 37 passaram (`preparation-window.test.mjs` novo) |
| Playwright (config local com o Chromium do ambiente) | 19 passaram (1 novo) |

O pgTAP novo cobre: papéis (proprietário, colaborador, outra empresa e vínculo revogado), produto recebido sem janela própria, limites, auditoria da definição, da troca e da volta, repetição sem auditoria, janela da preparação contra a da unidade no registro e na mensagem, produção tardia com ocorrência, produção antiga intacta depois da troca, idempotência e leitura. Nenhum teste existente foi alterado nem enfraquecido nesta fatia, e nenhuma lista fixa de segurança precisou mudar.

O arquivo de teste novo se chama `production_window.test.sql` de propósito, para rodar depois de `handling_void.test.sql` (ver a observação sobre a ordem dos testes na 7.6).

## Limites conhecidos

1. **Tempo máximo sem etiqueta** continua só guardado; o aviso é a 7.8.
2. **Só a janela é por preparação.** O tempo sem etiqueta e as demais configurações continuam por unidade.
3. **Sem tela de histórico das mudanças:** o registro fica em `entity_changes`, legível pelo proprietário.
4. A preparação **sem valor próprio acompanha a janela da unidade**: se a unidade mudar a dela depois, a preparação sem janela própria passa a usar a nova, para os registros novos.

## Pontos para luis decidir

1. **Sem janela própria, a preparação acompanha a unidade.** Proposta: manter. A alternativa seria copiar o valor da unidade para a preparação no cadastro, o que deixaria de acompanhar mudanças da unidade.
2. **Só o proprietário define a janela de cada preparação.** O colaborador, mesmo no modo da 7.6, lê mas não muda. Proposta: manter.
3. **Os limites de 15 minutos a 24 horas** valem também para a janela da preparação, nas mesmas condições da 7.6: só recusam o absurdo e não são aprovação sanitária. Proposta: manter.

## Decisão proposta para `DECISOES.md`

> **D-056 — Janela de registro por preparação (14/11/2026).** Status: proposta, aguardando aceite de luis; implementada na fatia 7.7 ([registro](FASE_07_7.md)). Decisão: cada preparação própria pode ter uma janela de registro da produção, definida só pelo proprietário e auditada em `entity_changes`; ela substitui a janela da unidade (D-055) só para aquela preparação e, sem ela, vale a da unidade. Limites de 15 minutos a 24 horas, só para recusar o absurdo e sem aprovação sanitária. O registro de produção guarda a janela usada; mudar a janela nunca reescreve registro antigo. Motivo: resposta 5 de luis ao questionário (14/11/2026), D-036, D-055. Consequência: o aviso de produção sem etiqueta (7.8) e a temperatura opcional (7.9) seguem como fatias próprias. Revisar quando: a nutricionista RT avaliar os valores operacionais.

## Próximo passo

Aceite de luis (3 pontos e D-056). As fatias 7.8 e 7.9 exigem aprovação própria. Pergunta ainda aberta a luis: corrigir os dois testes instáveis (`handling_void` teste 26 e `list_containers` teste 38), que seguem sem alteração. Sem merge, deploy ou mudança fora do escopo sem autorização específica de luis.
