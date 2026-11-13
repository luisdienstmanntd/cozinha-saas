# Fase 6, fatia 6.5a — conservação, temperatura e ocorrências no banco

Implementada por Claude Code em 13/11/2026, conforme as seções 3, 4.8, 5, 5.1, 5.2, 5.4, 6, 8 e 10 de `FASE_06_DESENHO.md` (PR #3) e os achados B-2, I-3, I-4, I-6 e S-2 de `REVISAO_CRUZADA_FASE_06.md` (PR #4). luis aprovou o início em 13/11/2026 ("sim"). Registro da tarefa: `ia-tarefas/fase-06-5a-conservacao.md`.

**Base:** branch do PR #11 (`claude/fase-06-4-anulacao`, `0cc4b70`). **Ordem de integração: PR #2, #5, #6, #7, #8, #9, #10, #11, depois este.**

**Sem tela nova.** Formulário de recebimento com temperatura, página de decisão e faixa "Bloqueado" são da 6.5b. A única mudança visível é a recusa da etiqueta de derivado de manipulação tardia sem liberação (teste 6). Permissão sem mudança: só o proprietário escreve e decide (D-019). Q1–Q10 preservadas. Nenhum deploy. O sistema **não classifica** temperatura como adequada ou inadequada e **não libera nada sozinho** nem por prazo. Nada aqui afirma conformidade sanitária; a conferência normativa por nutricionista RT continua pendência pré-piloto (Q10).

## O que mudou

### Banco (`20261113090000_conservation_occurrences.sql`, rollback `conservation_occurrences.sql`)

1. **Conservação exigida pelo produto** (`products.storage_condition`: ambiente, refrigerado ou congelado). Nula nos produtos existentes. `set_product_storage_condition` (só proprietário, bloqueia a linha do produto) define **uma única vez**: repetir o mesmo valor é idempotente, outro valor é recusado. Um gatilho impede a troca por qualquer caminho, inclusive UPDATE direto, e outro grava a definição em `entity_changes` (entidade `product`, campo `storage_condition`).
2. **Recebimento com conservação e temperatura** (`batch_receipts.storage_condition`, `temperature_status`, `received_temperature_c numeric(4,1)` de −50 a 80). Restrição do banco: colunas todas nulas (recebimentos anteriores) ou conservação e situação coerentes: ambiente aceita "medida" ou "não exigida"; refrigerado e congelado aceitam "medida" ou "não foi possível medir" (Q8, D-029); temperatura existe se e só se "medida". O integral copia a conservação do recebimento.
3. **`receive_batch` com assinatura nova** (conservação, situação, temperatura, justificativa). Temperatura com mais de uma casa decimal é recusada, não arredondada. "Não foi possível medir" exige justificativa (até 300 caracteres visíveis). Se o produto tem conservação definida, o recebimento precisa ter a mesma (ponto 1 abaixo). Replay compara também conservação, situação, temperatura e justificativa; reenvio concorrente idêntico cria um recebimento e **uma** ocorrência.
4. **Assinatura antiga mantida até a 6.5b** (é a da tela atual): produto sem conservação definida grava as colunas novas nulas, como antes; produto em ambiente grava ambiente/"não exigida"; produto refrigerado ou congelado é **recusado** ("Este produto exige conservação e temperatura no recebimento."). O reenvio de um recebimento já gravado continua devolvendo o mesmo ID mesmo que a conservação do produto tenha sido definida depois; a assinatura antiga não reaproveita um recebimento que tem situação de medição.
5. **`occurrences`** (append-only, RLS por vínculo, só leitura pela API): `temperature_not_measured` (recebimento sem medição) ou `late_handling` (manipulação tardia), justificativa, autoria, fuso e instante, criadas na mesma transação da operação. Únicos parciais: uma por recebimento sem medição e uma por manipulação tardia. Gatilho de inserção recusa ocorrência sem a causa (recebimento medido, manipulação dentro da janela). A recíproca (todo recebimento sem medição e toda manipulação tardia têm a ocorrência) é garantida pelas funções e conferida por `private.occurrence_problems()` no fim da migração e no pgTAP, como a soma por manipulação da 4.3.
6. **`occurrence_decisions`** (append-only): liberação ou rejeição, justificativa obrigatória (até 500), autor, fuso, `intent_id`. **Uma decisão por ocorrência, sem troca**, é restrição do banco.
7. **`decide_occurrence(org, unidade, ocorrência, decisão, justificativa, intent)`**: ordem da seção 5 (autorização → forma → ocorrência no escopo, mesma mensagem para inexistente e de outra empresa → `FOR UPDATE` do recebimento (I-6) → replay → estado). Segunda decisão: `23505` "Ocorrência já decidida.".
8. **Bloqueio** (`public.container_blocks`, `SECURITY INVOKER`, uma única definição usada pelas funções e pela leitura): recipiente bloqueado quando o recebimento tem ocorrência sem decisão ou rejeitada, ou quando a manipulação que o criou tem ocorrência sem decisão ou rejeitada. Recipiente bloqueado **não é consumido nem manipulado**; **descarte continua permitido** (D-029). Anular um descarte devolve saldo a um recipiente que continua bloqueado (S-2). A conferência acontece sob o bloqueio do recebimento, então decisão × consumo e × descarte se serializam (teste 22).
9. **Manipulação tardia** (B-2, D-031): `handle_container` passa a aceitar `handled_at` mais de 2 horas antes do registro **somente com justificativa de atraso** (até 300), gravando `late = true` e a ocorrência; os derivados nascem bloqueados até a decisão. Sem justificativa continua recusada; justificativa dentro da janela é recusada. A restrição `late` passou de "sempre falso" para "tardia só fora da janela" (mesma `handling_late_window()`).
10. **Ocorrência tardia aberta não impede anular a manipulação** (4.10); a ocorrência fica registrada e ainda pode ser decidida.
11. **I-3:** o identificador de uma decisão não vira baixa, anulação, manipulação nem anulação de manipulação, e vice-versa (`23505`). `apply_stock_exit`, `reverse_movement`, `handle_container` e `void_handling` foram reescritas só para isso e para o bloqueio; mensagens e códigos anteriores sem mudança.
12. **`assert_history_protected()`** inclui `occurrences` e `occurrence_decisions`. Sem backfill, nenhum gatilho suspenso. A migração termina verificando proteção, conservação do estoque, saldo guardado e coerência das ocorrências.

Regra da 6.4 respeitada: nenhuma FK nova de `stock_movements` para `containers`. As FKs novas ligam ocorrência a recebimento e manipulação, e decisão a ocorrência; as junções usadas pela interface (`batch_receipts` ↔ `containers`, `stock_movements` ↔ `containers`) não ficaram ambíguas (integração verde).

### Interface (sem tela nova)

- **Etiqueta de derivado de manipulação tardia recusada** até a liberação (teste 6): a tela do recipiente consulta `container_blocks` e mostra "Manipulação registrada fora da janela de horário, sem liberação do proprietário: a etiqueta não pode ser gerada."; o gerador de PDF também recusa. Não se imprime horário que o proprietário ainda não aceitou.
- A etiqueta de recebimento com a faixa "BLOQUEADO — aguardando decisão" é da 6.5b. Enquanto isso, recebimento sem medição só nasce pela API (a tela atual usa a assinatura antiga, que não o cria).

## Testes

- **Novo `supabase/tests/occurrences.test.sql` (176):** catálogo e privilégios; matriz de papéis (membro, proprietário revogado, proprietário de outra empresa); conservação do produto (definição única, idempotente, auditada, recusada por UPDATE direto); **teste 14** (refrigerado e congelado sem situação, "medida" sem temperatura, temperatura fora de −50 a 80 ou com duas casas, "não medida" sem justificativa ou só com espaços invisíveis, combinações proibidas; uma ocorrência também em replay; replay com outro dado recusado; consumo e manipulação recusados com ocorrência aberta ou rejeitada e aceitos depois de liberada; descarte aceito; segunda decisão recusada; decisão por membro, revogado e outra empresa recusada; nenhuma liberação sem decisão; recebimentos antigos legíveis com campos nulos; S-2); assinatura antiga; **teste 6, parte tardia** (sem justificativa, só espaços, longa, exatamente 2 horas com justificativa; 2 horas e 1 minuto aceita com ocorrência; replay; derivados bloqueados, origem não; liberada e rejeitada; anulação com ocorrência aberta); **teste 19 no banco** (replay da decisão; cada campo diferente dá `23505`); I-3 em todos os cruzamentos; RLS (membro lê, outra empresa e revogado não, `container_blocks` não mistura escopos); restrições por inserção direta (combinações proibidas no recebimento, ocorrência sem causa, duplicada, sem manipulação, só com espaços; segunda decisão; decisão com recebimento trocado; UPDATE, DELETE e TRUNCATE recusados); invariantes finais.
- **Novo `tests/integration/occurrences.test.mjs` (1, pela API com usuários reais):** quatro reenvios concorrentes idênticos do recebimento sem medição (um recebimento, uma ocorrência); **teste 19** (cinco decisões concorrentes idênticas: uma decisão) e duas decisões diferentes concorrentes (só uma passa); **teste 22** (decisão × consumo × descarte na mesma origem, quatro rodadas alternando liberação e rejeição: com rejeição o consumo nunca passa; com liberação, consumo aceito só se a decisão já existe; descarte sempre passa; saldo confere); assinatura antiga recusa produto congelado; membro e outra empresa negados; nada gravado direto; revogação durante a sessão (decisão e replay negados). A janela de 2 horas não é exercitada pela API porque o recebimento criado pela API nasce agora; fica no pgTAP.
- **Vitest (+3, 98 no total):** gateway da etiqueta consulta `container_blocks` só para derivado e marca a retenção; tela e gerador de PDF recusam a etiqueta.

### Ajustes em testes existentes

Nenhum teste foi removido, pulado ou enfraquecido.

| Teste | Mudança | Motivo |
|---|---|---|
| `container_handling.test.sql`, 2 h e 1 min sem justificativa | mesma recusa (`22023`), mensagem nova ("exige justificativa do atraso") | a 6.3 dizia "ainda não é aceita" porque a ocorrência só chegava aqui |
| `container_handling.test.sql`, tardia com justificativa | de "recusada" para "aceita, gravada como tardia e com uma ocorrência" (+1 verificação) | comportamento pedido pelo desenho para a 6.5a (5.1 item 2) |
| `container_handling.test.sql`, justificativa dentro da janela | mesma recusa; identificador próprio | o identificador antigo passou a ser usado pela tardia aceita |
| `container_handling.test.sql`, `late = true` por inserção direta | mesma recusa (`23514`), descrição nova | a restrição agora recusa "tardia dentro da janela" |
| `rls_set_based.test.sql`, lista de políticas | `occurrences_read` e `occurrence_decisions_read` | tabelas novas |
| `security_guard.test.sql` | tabelas novas nas listas fixas de histórico; `receive_batch` nova, `set_product_storage_condition` e `decide_occurrence` na matriz de papéis (+10) | tabela e função novas entram na guarda |
| `supabaseLabels.test.ts`, simulação do cliente | `rpc` responde por nome de função | o gateway passou a chamar `container_blocks` além de `list_containers` |

### Achados durante a implementação

- Uma primeira versão garantia "recebimento sem medição tem ocorrência" com gatilho adiado até o commit. O teste de proteção da 6.3 (`TRUNCATE` recusado com `55000`) passou a receber `55006` por causa do evento pendente. Troquei pela verificação `occurrence_problems()` (função + pgTAP + fim da migração), que é o mesmo padrão da soma por manipulação.
- A restrição "tardia se e só se fora da janela" quebrava fixtures de testes antigos, que inserem manipulações com hora passada e `created_at = now()`. Ficou só "tardia implica fora da janela"; a recíproca é da função.
- Logo depois de `db:start` ou de DDL fora do `db reset`, a primeira rodada de integração pode falhar uma vez (cache de esquema da API), como já registrado na 6.3. Aconteceu duas vezes nesta fatia, nas duas antes de qualquer mudança minha ser aplicada; a rodada seguinte passou.

## Evidências (container em nuvem, 13/11/2026)

Supabase local (Postgres 17) com Docker; Node 24.22.3; Playwright com o Chromium do container por config local não versionada.

| Comando | Resultado |
|---|---|
| Base (6.4, antes de qualquer mudança): `test:db` e integração | 719 PASS; 19 de 19 (a primeira rodada logo após `db:start` teve uma falha transitória; as duas seguintes passaram) |
| Falha primeiro, banco revertido pelo rollback: `occurrences.test.sql` | **FAIL** (tabelas inexistentes) |
| Falha primeiro, sem a mudança do front-end: Vitest | **FAIL** 3 (gateway, PDF e tela da etiqueta) |
| `npm run db:reset` + `npm run test:db` | PASS, 13 arquivos, **906** verificações (719 anteriores + 1 em `container_handling` + 10 na guarda + 176 novas) |
| `npm run test:integration` | **20 de 20**; `occurrences.test.mjs` sozinho, 3 vezes seguidas: 1 de 1 em todas |
| Rollback com ocorrências no banco | **recusado** (`Rollback recusado: existem registros de conservação, temperatura ou ocorrências.`), nada alterado |
| Rollback em banco sem dados da 6.5a | aplicado; bateria da 6.4 (worktree em `0cc4b70`) contra o banco revertido: `test:db` 719 PASS e integração 19 de 19 |
| Reaplicar a migração sobre os dados da 6.4 (46 recebimentos, 20 manipulações, 10 anulações) | verificações finais aceitas; `test:db` 906 PASS e integração 20 de 20 |
| `playwright test` | 3 de 3 |
| `npx supabase db advisors --type security --level warn --fail-on warn` e `--type performance --level warn` | sem ocorrências |
| `npm run lint`, `typecheck`, `format:check`, `build` | sucesso |
| `npm run test` (Vitest) | 98 de 98 |

## Riscos e limites

- **Até a 6.5b, a temperatura só é exigida por quem usa a assinatura nova** ou quando o produto já tem conservação refrigerada ou congelada definida. Um produto sem conservação definida continua sendo recebido pela tela atual sem temperatura. Isso é aceitável só porque não há piloto antes da 6.5b; a 6.5b deve retirar a assinatura antiga.
- **Ninguém decide = bloqueio permanente** (R12). O painel com tempo desde a ocorrência é da 6.5b.
- **Liberar não é atestar.** A decisão registra quem decidiu e o fundamento informado, seguindo o procedimento da cozinha, ainda sem conferência por profissional habilitado (Q10). Os textos do banco não dizem "aprovado", "conforme" nem citam norma.
- **Etiqueta:** a de recebimento bloqueado ainda sai sem a faixa (6.5b); a recusa da etiqueta de derivado tardio é no navegador, porque o PDF é gerado lá.
- **Transferência de local** (6.9) ainda não existe; quando chegar, precisa chamar o mesmo bloqueio.
- `find_operation` (6.8) ainda não procura decisões; o desenho já prevê.

## Pontos para luis decidir ou confirmar

1. **Conservação do recebimento igual à do produto.** Quando o produto tem conservação definida, recusei recebimento com outra (por exemplo, produto congelado recebido como refrigerado). É a leitura mais conservadora de "padrão do produto, confirmada pelo proprietário": um congelado que chega descongelado não vira refrigerado no sistema; a saída é não receber (ou receber e descartar). Alternativa: aceitar a divergência e registrar. Recomendo manter a recusa no piloto.
2. **Assinatura antiga até a 6.5b**, com o comportamento do item 4 de "O que mudou" (produto refrigerado ou congelado recusado pela tela atual). Confirmar que a 6.5b retira a assinatura antiga.
3. **Ambiente pode registrar temperatura medida** (opcional); refrigerado e congelado nunca usam "não exigida"; ambiente nunca usa "não foi possível medir".
4. **Manipulação tardia bloqueia só os derivados**, não a origem: a sobra fechada que ficou no integral continua utilizável. Justificativa de atraso até 300 caracteres, recusada dentro da janela.
5. **Rejeição é definitiva:** recipiente rejeitado só sai por descarte; não há reabertura da decisão.

## Decisão proposta para `DECISOES.md`

Entra como **D-041** quando os PRs anteriores forem integrados (D-040 é da 6.4):

- **Decisão:** conservação do produto definida uma vez pelo proprietário, auditada; recebimento com conservação e situação da medição obrigatórias (assinatura nova), temperatura registrada sem classificação. Refrigerado ou congelado sem medição e manipulação registrada mais de 2 horas depois de feita só entram com justificativa e abrem ocorrência na mesma transação. Recipiente com ocorrência aberta ou rejeitada não é consumido nem manipulado; descarte permitido. Só o proprietário decide, uma vez, com justificativa, sob o bloqueio do recebimento; nada é liberado sozinho.
- **Motivo:** Q8/D-029, B-2/D-031, seções 4.8 e 5 do desenho, I-6 e S-2 da revisão cruzada; histórico append-only (6.0a); D-019.
- **Consequência:** escrita nova precisa chamar o bloqueio (`container_blocks`) e cruzar identificadores com `occurrence_decisions`; tabela nova de histórico entra nas listas fixas; a assinatura antiga de `receive_batch` sai na 6.5b.
- **Revisar quando:** a 6.5b (tela) e a 6.9 (locais) chegarem; quando a nutricionista RT conferir o procedimento (Q10); ou se o piloto mostrar bloqueios sem decisão (R12) ou janela inadequada (R13).
- **Situação:** aceita por luis em 13/11/2026, com os cinco pontos acima.

## Próximo passo

**Aceita por luis em 13/11/2026 18:07 UTC**, respondendo aos cinco pontos ("1. manter, 2. ok, 3. ok, 4. ok, 5. ok"): conservação do recebimento igual à do produto mantida; assinatura antiga de `receive_batch` até a 6.5b, que a retira; ambiente com temperatura opcional; tardia bloqueia só derivados; rejeição definitiva. A resposta foi interpretada como aceite da fatia e da D-041. CI do GitHub verde no PR #12 (`quality` e `banco-api-e2e`). O aceite não autoriza merge: integrar depois dos PRs #2, #5, #6, #7, #8, #9, #10 e #11, nessa ordem, só com luis. A 6.5b (recebimento, decisão e bloqueio na interface) exige aprovação própria.
