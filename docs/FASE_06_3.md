# Fase 6, fatia 6.3 — manipulação no banco

Implementada por Claude Code em 13/11/2026, conforme as seções 3, 4.1, 4.2, 4.3, 4.5, 5, 5.1, 6, 8 e 10 de `FASE_06_DESENHO.md` (PR #3) e os achados B-2, I-2, I-3, I-4, I-10b e I-12 de `REVISAO_CRUZADA_FASE_06.md` (PR #4). luis aprovou o início em 13/11/2026. Registro da tarefa: `ia-tarefas/fase-06-3-manipulacao.md`.

**Base:** branch do PR #9 (`claude/fase-06-2-painel-saldo`, `0d8ad00`). **Ordem de integração: PR #2, #5, #6, #7, #8, #9, depois este.**

**Sem tela nova.** Abrir e porcionar existem só no banco; as telas são da 6.6 e a etiqueta de produto aberto da 6.7. Permissão sem mudança: só o proprietário registra (D-019). Q1–Q10 preservadas. Nenhum deploy. Nada aqui afirma conformidade sanitária; a conferência normativa por nutricionista RT continua pendência pré-piloto (Q10).

## O que mudou

### Banco (`20261113070000_container_handling.sql`, rollback `container_handling.sql`)

1. **`public.container_handlings`** (nova, append-only, RLS por vínculo, só `SELECT` para `authenticated` e `service_role`): origem, validade da origem copiada e conferida por FK, tipo (`opening`/`portioning`), número de porções, total, validade após abertura, conservação (`ambient`/`refrigerated`/`frozen`), `handled_at`, `late`, tratamento e quantidade da sobra, `handled_by` com cópia do nome, observação, `intent_id`, fuso, `created_by` e `created_at`.
   - Restrições reais do banco: **`expiry_date <= source_expiry_date`** (I-2c, também com congelamento); `handled_at <= created_at`; abertura com 1 porção, porcionamento com 2 a 20; coerência da sobra; `late = false` nesta fatia (a 6.5a troca pela ocorrência); FK de `handled_by` para um vínculo da mesma empresa.
2. **Recipientes derivados** (`containers` ganhou `handling_id`, `position`, `handled_at` e `storage`). O derivado é obrigado a ter manipulação, posição de 1 a 21, horário e conservação; FKs garantem que o pai é a origem da manipulação (I-2a) e que validade, conservação e horário são os dela; posição única por manipulação. Nos integrais as colunas ficam nulas (a conservação do integral chega na 6.5a).
3. **Movimento `transfer`** (I-3): a saída da origem para os derivados, com o mesmo `intent_id` da manipulação. `stock_movements.handling_id` liga transferência e descarte de sobra à manipulação; FK obriga que saiam da origem; uma transferência e no máximo um descarte de sobra por manipulação (I-2b); consumo e anulação não podem ter manipulação.
4. **Saldo e conservação com `transfer`** nos três lugares exigidos pela D-038: `container_balance`, `apply_movement_to_balance` e `stock_conservation_problems`. A conservação ganhou duas verificações por manipulação: derivado sem transferência, e manipulação cujos derivados, transferência, contagem de porções ou sobra não batem com o registro.
5. **`public.handle_container(...)`** (núcleo `SECURITY DEFINER` em `private`, wrapper `SECURITY INVOKER`). Ordem da seção 5 (I-4): autorização → forma → origem no escopo → bloqueio `FOR UPDATE` do recebimento → replay → regras de estado. Tudo numa transação: manipulação, transferência, descarte de sobra (se houver) e derivados com código curto.
   - **Horário:** não futuro; não anterior ao recebimento (origem integral) nem ao `handled_at` da manipulação que criou a origem (origem derivada); até **2 horas** antes do registro, por `private.handling_late_window()`. Acima disso, recusado com "ainda não é aceita. Siga o procedimento da cozinha." `p_late_reason` já existe na assinatura para a 6.5a, mas precisa vir nulo.
   - **Validade:** origem vencida na data da manipulação (fuso da unidade) é recusada; a nova vai de `max(data da manipulação, data do registro)` até a da origem, inclusive.
   - **Sobra** (`saldo − porções`): zero exige `none`; maior que zero exige `sealed` (só origem integral, é a confirmação de que o restante continua fechado), `discard` (descarte na origem com motivo) ou `portion` (vira mais uma porção, só no porcionamento, ocupando a posição seguinte, até a 21).
   - **Quem manipulou:** vínculo ativo na mesma empresa (qualquer papel) e nome de exibição definido; o nome é copiado. **Quem registrou:** o proprietário da sessão.
   - **Replay** compara origem, tipo, quantidades na ordem, validade, conservação, horário, quem manipulou, sobra, motivo, observação e autor; não compara o nome copiado. Reenvio depois de a origem zerar, depois da janela e da meia-noite, depois de trocar o nome ou de revogar quem manipulou devolve o mesmo ID. O `intent_id` de uma baixa não vira manipulação e vice-versa (`23505`).
6. **Nome de exibição (Q7, 4.5):** `memberships.display_name` (até 40 caracteres visíveis) e `public.set_member_display_name(org, usuário, nome)`, só do proprietário ativo e só para vínculo ativo. Toda mudança, por qualquer caminho, vai para `entity_changes` (`membership`/`display_name`), visível só ao proprietário. Membro continua vendo só o próprio vínculo (I-10b).
7. **`reverse_movement`** passou a recusar transferência e descarte de sobra: os dois só serão desfeitos pela anulação da manipulação (6.4, D-032). Mensagens e códigos anteriores sem mudança.
8. **`assert_history_protected()`** inclui `container_handlings`. Sem backfill: não havia derivados reais. A migração termina verificando proteção, conservação e saldo guardado, e se desfaz se algo falhar.

### Interface (sem tela nova)

- O histórico de movimentações aceita `transfer` como saída ("Transferência para recipientes derivados") e o descarte de sobra ("Descarte de sobra da manipulação"); nenhum dos dois oferece "Anular registro" (I-14).

## Testes

- **Novo `supabase/tests/container_handling.test.sql` (147):** catálogo e privilégios; **teste 3** (membro, revogado, proprietário de outra empresa, proprietário de duas empresas misturando escopos, outra unidade da mesma empresa e inexistente com a mesma mensagem); **teste 4** por inserção direta (pai diferente da origem, validade, conservação e horário diferentes da manipulação, outro recebimento, posição repetida ou acima de 21, derivado sem manipulação, movimento de manipulação fora da origem, segunda transferência, transferência sem manipulação, consumo com manipulação, validade posterior à origem, validade da origem falsa, `handled_by` de outra empresa, `late`, horário depois do registro, sobra descartada sem identificador, 21 porções; UPDATE, DELETE e TRUNCATE recusados); **teste 5** (abertura, 20 porções e a 21ª só como sobra, soma acima do saldo, fracionária em `un`, validade igual aceita e posterior recusada também congelado, anterior ao registro, origem vencida, origem sem saldo, quem manipulou sem vínculo, revogado, de outra empresa ou sem nome, nome copiado preservado após trocar e após revogar, textos só com espaços invisíveis); **teste 6** (futuro, anterior ao recebimento e à manipulação de origem, exatamente 2 h aceito, 2 h 1 min recusado, justificativa recusada); **teste 7** (sobra fechada em derivado recusada, sobra sem tratamento recusada, descarte de sobra com exatamente um `discard` e o `remainder_intent_id`); **teste 8** (replay idêntico, depois de zerar, depois da janela e da meia-noite, depois de mudar o nome; cada campo diferente dá `23505`; `record_movement` e `record_container_movement` com o identificador da manipulação dão `23505`); **teste 10** (sequência fixa: abertura com sobra fechada, porcionamento com descarte, consumo e anulação, consumo no derivado, nova abertura de porção; somas da 4.3 e saldo guardado conferidos); nome de exibição e auditoria; leitura por RLS.
- **Novo `tests/integration/container-handling.test.mjs` (1, pela API com usuários reais):** **teste 17** (duas manipulações concorrentes acima do saldo: só uma), **teste 18** (manipulação × baixa na mesma origem, duas rodadas: saldo nunca negativo), **teste 19** (cinco reenvios concorrentes idênticos: um registro, três derivados, uma transferência), **teste 20** (revogação durante a sessão: a próxima escrita é negada com o token anterior), membro e outra empresa negados, nada gravado direto pela API.
- **Vitest (+2, 89 no total):** gateway lê `transfer` e a manipulação de origem; painel conta a transferência como saída e não oferece anulá-la.

### Ajustes em testes existentes

Nenhum teste foi removido, pulado ou enfraquecido.

| Teste | Mudança | Motivo |
|---|---|---|
| `container_balance.test.sql`, tipos de movimento | lista fixa ganhou `transfer` | o próprio teste pede atualização a cada tipo novo |
| `container_balance.test.sql` e `list_containers.test.sql`, derivados de teste | a inserção direta passou a criar antes uma manipulação de teste e informar `handling_id`, `position`, `handled_at` e `storage` | a 6.3 exige que todo derivado pertença a uma manipulação. Sem isso, "derivado com origem de outro recebimento" seria recusado pela restrição de forma (`23514`) em vez da FK (`23503`) que ele verifica; com a manipulação, as recusas voltam a acontecer pelo motivo testado |
| `rls_set_based.test.sql`, lista de políticas | `container_handlings_read` | tabela nova |
| `security_guard.test.sql` | `container_handlings` nas listas fixas de histórico; `handle_container` e `set_member_display_name` na matriz de papéis (+7) | tabela e funções novas entram na guarda |

## Evidências (container em nuvem, 13/11/2026)

Supabase local (Postgres 17) com Docker; Node 24.22.3; Playwright com o Chromium do container por config local não versionada.

| Comando | Resultado |
|---|---|
| Base (6.2, antes de qualquer mudança): `test:db` e integração | 447 PASS; 17 de 17 |
| Falha primeiro, sem a migração: `npm run test:db` | **FAIL** em `container_handling.test.sql` (tabela inexistente), `container_balance` (tipo `transfer`), `rls_set_based` (política nova), `security_guard` e `list_containers` (funções, tabela e colunas novas usadas nas verificações e fixtures) |
| Falha primeiro, sem a migração: `container-handling.test.mjs` | **FAIL** ("sem nome de exibição, recusado": função inexistente) |
| Falha primeiro, sem a mudança do front-end: Vitest dos movimentos | **FAIL** 2 de 18 (os dois testes novos) |
| `npm run db:reset` + `npm run test:db` | PASS, 11 arquivos, **601** verificações (447 anteriores + 7 na guarda + 147 novas) |
| `npm run test:integration` | **18 de 18**; `container-handling.test.mjs` sozinho, 3 vezes seguidas: 1 de 1 em todas |
| Rollback com manipulações no banco | **recusado** (`Rollback recusado: existem manipulações registradas.`), nada alterado |
| Rollback em banco com dados sem manipulação (20 recipientes, movimentos e anulações da integração) | hash de recebimentos, recipientes, movimentos e saldos idêntico antes e depois; 0 problema de conservação e de saldo; bateria da 6.2 (worktree em `0d8ad00`) contra o banco revertido: `test:db` 447 PASS e integração 17 de 17 |
| Reaplicar depois do rollback | `test:db` 601 PASS e integração 18 de 18 |
| `playwright test` | 3 de 3 |
| `npx supabase db advisors --type security --level warn --fail-on warn` e `--type performance --level warn` | sem ocorrências |
| `npm run lint`, `typecheck`, `format:check`, `build` | sucesso (build mantém o aviso antigo de chunk grande) |
| `npm run test` (Vitest) | 89 de 89 |

**Instabilidade já existente, não causada por esta fatia:** logo depois de `npm run db:reset`, a primeira execução da integração pode falhar em 1 ou 2 testes com `PGRST001` (a API ainda reconectando ao banco). Reproduzido também na base da 6.2 (worktree em `0d8ad00`); esperar alguns segundos depois do reset resolve. As execuções da tabela acima são as feitas depois disso.

Não executados: CI do GitHub no momento deste texto; teste 26 (propriedade com semente), que o desenho põe junto da anulação (6.4).

## Riscos e limites

- **Relógio:** "não futuro" é comparado com o relógio do banco. Uma tela que mande a hora do dispositivo adiantada alguns segundos será recusada; a 6.6 deve enviar a hora com precisão de minuto ou limitada à hora do servidor.
- **Manipulação tardia é recusada** até a 6.5a. Na cozinha, quem registrar mais de 2 horas depois não consegue registrar; a orientação é seguir o procedimento da cozinha. A janela continua provisória (D-031, R13).
- **Sem bloqueio por ocorrência** ainda (6.5a): recipientes de recebimento sem medição de temperatura podem ser manipulados nesta fatia, porque essas ocorrências ainda não existem.
- **Conservação do integral** (`storage`) continua nula até a 6.5a; o derivado já guarda a informada.
- **Anulação de manipulação** só na 6.4. Até lá, uma manipulação registrada por engano não tem correção; como não há tela, isso não afeta a operação.
- **`list_containers`** já mostra derivados (6.2); a rota do QR ainda não mostra origem e derivados (6.6).
- **Nome de exibição é dado pessoal mínimo** (R6, P8): só o proprietário define, membro não vê o de colegas, e a cópia na manipulação entra no procedimento de dados pessoais da 6.10.

## Pontos para luis decidir ou confirmar

1. **Sobra como porção** (`p_remainder = 'portion'`): o desenho diz que a pessoa "inclui a sobra como mais uma porção (posição 21 quando já houver 20)". Implementei como um quarto tratamento explícito, em que o servidor calcula a sobra e cria a porção seguinte. Assim a 21ª posição só existe como sobra, como pede o teste 5.
2. **Horário em origem derivada:** o desenho diz "não anterior à criação da origem (e ao `handled_at` dela, se derivada)". Para derivado comparei só com o `handled_at`: o `created_at` do derivado é a hora do registro, e exigir os dois impediria registrar, por exemplo, uma porção aberta às 10h30 vinda de um porcionamento feito às 10h e registrado às 11h. Para integral continua a hora do recebimento.
3. **Descarte de sobra não é anulado por "Anular registro":** fica para a anulação da manipulação (6.4), junto com a transferência. Anular só o descarte devolveria a sobra a uma origem já aberta, contra a regra da sobra.

## Decisão proposta para `DECISOES.md`

Entra como **D-039** quando os PRs anteriores forem integrados (D-038 é da 6.2):

- **Decisão:** abrir e porcionar são uma manipulação única e auditada (`container_handlings` + derivados + `transfer` + descarte de sobra na mesma transação), escrita só por `handle_container`, com validade após abertura nunca posterior à da origem como restrição do banco, janela de 2 horas para `handled_at` (fora dela recusado até a 6.5a), sobra com tratamento obrigatório (`none`, `sealed` só em integral, `discard`, `portion`), `handled_by` com vínculo ativo e nome de exibição copiado, e os três pontos acima.
- **Motivo:** seções 4.1–4.5 e 5.1 do desenho; B-2, I-2, I-3, I-4, I-10b e I-12 da revisão cruzada; Q2, Q5, Q6 e Q7.
- **Consequência:** nenhum estoque é criado; a conservação continua fechando por recebimento. Movimentos de manipulação não são anulados individualmente. A 6.5a precisa trocar a restrição `late = false` pela ocorrência tardia e passar a aceitar `p_late_reason`.
- **Revisar quando:** a 6.4 (anulação) e a 6.5a (ocorrências) chegarem, ou se a observação no piloto mostrar que a janela de 2 horas ou o limite de 20 porções não servem.
- **Situação:** aceita por luis em 13/11/2026, com os três pontos acima.

## Próximo passo

**Aceita por luis em 13/11/2026 13:20 UTC** ("aprovado"), junto com a D-039 e os três pontos de interpretação (sobra como porção até a posição 21; origem derivada conferida pela hora real da manipulação anterior; descarte de sobra só desfeito pela anulação da manipulação). CI do GitHub verde no PR #10 (`quality` e `banco-api-e2e`). O aceite não autoriza merge: integrar depois dos PRs #2, #5, #6, #7, #8 e #9, nessa ordem, só com luis. A 6.4 (anulação de manipulação no banco) exige aprovação própria.
