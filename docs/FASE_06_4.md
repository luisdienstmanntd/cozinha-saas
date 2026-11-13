# Fase 6, fatia 6.4 — anulação de manipulação no banco

Implementada por Claude Code em 13/11/2026, conforme as seções 4.3, 4.10, 5, 5.4, 6, 8 e 10 de `FASE_06_DESENHO.md` (PR #3) e o achado I-9 de `REVISAO_CRUZADA_FASE_06.md` (PR #4), que pediu modelar e implementar a anulação antes das telas. luis aprovou o início em 13/11/2026 ("sim"). Registro da tarefa: `ia-tarefas/fase-06-4-anulacao.md`.

**Base:** branch do PR #10 (`claude/fase-06-3-manipulacao`, `e528b1c`). **Ordem de integração: PR #2, #5, #6, #7, #8, #9, #10, depois este.**

**Sem tela nova de anulação.** A anulação existe só no banco; o botão "Anular manipulação" é da 6.6. Permissão sem mudança: só o proprietário anula (D-019). Q1–Q10 preservadas. Nenhum deploy. Nada aqui afirma conformidade sanitária; a conferência normativa por nutricionista RT continua pendência pré-piloto (Q10).

## O que mudou

### Banco (`20261113080000_handling_void.sql`, rollback `handling_void.sql`)

1. **`public.handling_voids`** (nova, append-only, RLS por vínculo, só `SELECT` para `authenticated` e `service_role`): manipulação anulada, motivo obrigatório (até 500 caracteres visíveis), `intent_id`, fuso, `created_by` e `created_at`. **Uma anulação por manipulação é restrição do banco** (único em `handling_id`); FK obriga mesma empresa, unidade e recebimento da manipulação.
2. **Dois tipos novos de movimento** (I-9), sem exceção na fórmula de saldo:
   - `transfer_reversal` na origem, com `reverses_id` da transferência e o mesmo `intent_id` da anulação (como a transferência usa o da manipulação): devolve a quantidade;
   - `handling_void` em cada derivado, com a quantidade inicial dele: zera o saldo.
   - Se a sobra foi descartada, a anulação desse descarte é um `reversal` comum ligado à manipulação e à anulação (cumpre o ponto 3 aceito na 6.3).
   - `stock_movements` ganhou `handling_void_id` (anulação que gerou o evento) e `derived_handling_id` (só em `handling_void`). FKs e únicos: devolução e anulação do descarte pertencem à anulação da mesma manipulação; o movimento desfeito é da mesma manipulação; uma devolução por manipulação; uma saída de anulação por derivado. Que o recipiente da saída é derivado da manipulação anulada é conferido por gatilho na inserção, não por FK (ver "Achado durante os testes").
3. **Saldo e conservação** nos três lugares da D-038 (`container_balance`, `apply_movement_to_balance`, `stock_conservation_problems`). A soma por recebimento não muda (devolução e saídas dos derivados se cancelam). Nova verificação por manipulação anulada: derivados somam zero, devolução igual à transferência, cada derivado com exatamente uma saída de anulação igual à quantidade inicial e, se houve descarte de sobra, a anulação dele.
4. **`public.void_handling(org, unidade, manipulação, motivo, intent)`** (núcleo `SECURITY DEFINER` em `private`, wrapper `SECURITY INVOKER`). Ordem da seção 5 (I-4): autorização → forma → manipulação no escopo (mesma mensagem para inexistente, outra unidade e outra empresa) → bloqueio `FOR UPDATE` do recebimento → replay → regras de estado. Tudo numa transação.
   - **Replay** compara manipulação, motivo (sem os espaços das pontas) e autor; reenvio depois de anulada devolve o mesmo ID. O `intent_id` de baixa, anulação comum ou manipulação não vira anulação de manipulação, e o da anulação não vira baixa, anulação comum nem manipulação (`23505`).
   - **Estado:** segunda anulação recusada (`23505`, "Manipulação já anulada."); recusada (`22023`) se qualquer derivado já teve qualquer movimento.
   - **Origem vencida** no meio do caminho recebe a devolução, com a validade dela (o painel mostra vencida).
5. **`reverse_movement`** recusa também a devolução, a saída de anulação e a anulação do descarte de sobra, e não aceita como identificador o de uma manipulação ou anulação de manipulação. Mensagens e códigos anteriores sem mudança.
6. **`assert_history_protected()`** inclui `handling_voids`. Sem backfill. A migração termina verificando proteção, conservação e saldo guardado, e se desfaz se algo falhar.

### Interface (sem tela nova)

- O histórico de movimentações lê os tipos novos: "Devolução da transferência (manipulação anulada)" conta como entrada, a transferência aparece como "anulado" e a anulação do descarte de sobra aparece como tal. Nenhum desses eventos oferece "Anular registro".
- **Etiqueta de recipiente anulado recusada** (teste 9): a tela do recipiente diz "Manipulação anulada: este recipiente não vale mais e a etiqueta não pode ser gerada." e não mostra o botão; o gerador de PDF também recusa. A etiqueta própria de derivado continua sendo da 6.7; a página do QR com "Anulado" e links é da 6.6.

## Testes

- **Novo `supabase/tests/handling_void.test.sql` (114):** catálogo e privilégios; matriz de papéis (membro, proprietário revogado, proprietário de outra empresa, proprietário de duas empresas misturando escopos, outra unidade e inexistente com a mesma mensagem; motivo nulo, só com espaços invisíveis ou longo; nada gravado); **teste 9** (abertura com sobra fechada, porcionamento com sobra descartada que volta junto, porção de sobra; eventos, motivo, autor e fuso; derivado com consumo e com descarte já anulado recusados; manipulação cujo derivado foi manipulado recusada; segunda anulação; derivado anulado sem baixa nem manipulação; eventos da anulação sem "Anular registro"; origem vencida recebe a devolução e continua vencida; derivado anulado sai do painel); **teste 19 no banco** (replay depois de anulada, sem duplicar eventos; cada campo diferente e cada cruzamento de identificador dá `23505`; replay reautorizado); RLS; **teste 10 com anulação** (sequência fixa com abertura, porcionamento com descarte, baixa e anulação, nova abertura de porção e anulação dela; somas conferidas); restrições por inserção direta (segunda anulação, recebimento trocado, motivo com espaços, saída em recipiente que não é derivado, sem manipulação, repetida ou sem anulação, devolução sem anulação, de outra manipulação ou sem o movimento devolvido, consumo ligado a anulação; UPDATE, DELETE e TRUNCATE recusados); **teste 26** (propriedade com semente `0.4242`: 250 passos aleatórios de baixa, descarte, anulação comum, manipulação e anulação de manipulação; depois de cada passo, conservação e saldo guardado conferidos. Nesta semente: 49 consumos, 44 descartes, 43 anulações comuns, 40 manipulações e 12 anulações de manipulação aceitas; 12 manipulações, 3 anulações e 47 anulações de manipulação recusadas).
- **Novo `tests/integration/handling-void.test.mjs` (1, pela API com usuários reais):** **teste 19** (cinco reenvios concorrentes idênticos: uma anulação, uma devolução e duas saídas), anulações concorrentes diferentes da mesma manipulação (só uma passa), **teste 24** (anulação × baixa num derivado, quatro rodadas: sempre só uma passa, saldo nunca negativo), membro e outra empresa negados, nada gravado direto pela API, revogação durante a sessão (nova anulação e replay negados).
- **Vitest (+6, 95 no total):** gateway lê `transfer_reversal`; histórico conta a devolução como entrada e não oferece anular os eventos da anulação; gateway da etiqueta detecta a anulação; tela e gerador de PDF recusam etiqueta de anulado.

### Ajustes em testes existentes

Nenhum teste foi removido, pulado ou enfraquecido.

| Teste | Mudança | Motivo |
|---|---|---|
| `container_balance.test.sql`, tipos de movimento | lista fixa ganhou `transfer_reversal` e `handling_void` | o próprio teste pede atualização a cada tipo novo |
| `rls_set_based.test.sql`, lista de políticas | `handling_voids_read` | tabela nova |
| `security_guard.test.sql` | `handling_voids` nas listas fixas de histórico; `void_handling` na matriz de papéis (+4) | tabela e função novas entram na guarda |

### Achado durante os testes

A primeira versão ligava a saída de anulação ao derivado por uma segunda FK de `stock_movements` para `containers`. A integração existente da 6.1 falhou com `PGRST201`: a API passou a ver duas relações entre as tabelas, e a junção `containers!inner(kind)`, usada também pelo histórico de movimentações da interface, ficou ambígua. Troquei essa FK por um gatilho de inserção (recipientes são append-only, então conferir na inserção basta) e a bateria voltou a passar. Fica a regra para as próximas fatias: **não criar outra FK de `stock_movements` para `containers`**.

## Evidências (container em nuvem, 13/11/2026)

Supabase local (Postgres 17) com Docker; Node 24.11.0; Playwright com o Chromium do container por config local não versionada.

| Comando | Resultado |
|---|---|
| Base (6.3, antes de qualquer mudança): `test:db` e integração | 601 PASS; 18 de 18 |
| Falha primeiro, sem a migração: `npm run test:db` | **FAIL** em `handling_void.test.sql` (tabela inexistente) |
| Falha primeiro, sem a migração (banco revertido): `handling-void.test.mjs` | **FAIL** (`PGRST202`, função inexistente) |
| Falha primeiro, sem a mudança do front-end: Vitest | **FAIL** 3 (histórico, gateway e tela da etiqueta) |
| `npm run db:reset` + `npm run test:db` | PASS, 12 arquivos, **719** verificações (601 anteriores + 4 na guarda + 114 novas) |
| `npm run test:integration` | **19 de 19**; `handling-void.test.mjs` sozinho, 3 vezes seguidas: 1 de 1 em todas |
| Rollback com anulações no banco | **recusado** (`Rollback recusado: existem anulações de manipulação registradas.`), nada alterado |
| Rollback em banco sem anulação (27 recipientes, 18 movimentos e 2 manipulações da integração) | hash de recebimentos, recipientes, movimentos, saldos e manipulações idêntico antes e depois; 0 problema de conservação e de saldo; bateria da 6.3 (worktree em `e528b1c`) contra o banco revertido: `test:db` 601 PASS e integração 18 de 18 |
| Reaplicar depois do rollback | `test:db` 719 PASS e integração 19 de 19 |
| `playwright test` | 3 de 3 |
| `npx supabase db advisors --type security --level warn --fail-on warn` e `--type performance --level warn` | sem ocorrências |
| `npm run lint`, `typecheck`, `format:check`, `build` | sucesso (build mantém o aviso antigo de chunk grande) |
| `npm run test` (Vitest) | 95 de 95 |

Não executado: CI do GitHub no momento deste texto.

## Riscos e limites

- **Regra estrita de "derivado com movimento":** qualquer movimento num derivado impede a anulação, inclusive uma baixa já anulada, e também uma manipulação seguinte já anulada (ver ponto 1 abaixo).
- **A origem volta como estava.** Se a sobra ficou fechada no integral, a quantidade devolvida volta para o integral com a validade original. Isso corrige um registro errado; não descreve uma devolução física de alimento aberto à embalagem. A tela da 6.6 precisa deixar isso claro.
- **Sem bloqueio por ocorrência** ainda (6.5a). O desenho diz que ocorrência tardia aberta não impede anular; a 6.5a precisa manter isso.
- **Etiqueta:** a tela do recipiente continua mostrando os dados do recebimento também para derivados (comportamento da 6.2); a etiqueta própria de derivado é da 6.7. A recusa de PDF de anulado é no navegador, porque o PDF é gerado lá; o banco garante só o saldo zero e o registro da anulação.
- **`find_operation`** (6.8) ainda não existe; a tentativa pendente de anulação na tela entra com ela.

## Pontos para luis decidir ou confirmar

1. **O que conta como "derivado teve movimento".** O desenho diz "nenhum derivado teve consumo, descarte, manipulação ou transferência de local". Implementei ao pé da letra: **qualquer** movimento já registrado num derivado impede, mesmo que tenha sido anulado depois (por exemplo, uma baixa por engano seguida de "Anular registro", ou uma porção aberta e depois a abertura anulada). Alternativa: ignorar movimentos que já foram anulados. Recomendo manter a regra estrita no piloto, porque é mais simples de explicar e de auditar; a correção nesses casos continua possível por baixa ou descarte com motivo.
2. **Motivo obrigatório** na anulação (até 500 caracteres), como na anulação comum da Fase 5. O desenho já pedia "justificativa obrigatória".
3. **Quantidade devolvida igual à transferida, inteira.** Não existe anulação parcial (devolver só algumas porções); para isso, a pessoa anula e registra de novo.

## Decisão proposta para `DECISOES.md`

Entra como **D-040** quando os PRs anteriores forem integrados (D-039 é da 6.3):

- **Decisão:** anular uma manipulação é um registro novo e único (`handling_voids`), escrito só por `void_handling` e só pelo proprietário, com motivo obrigatório. Na mesma transação e com o recebimento bloqueado: `transfer_reversal` na origem (devolve a transferência), `handling_void` em cada derivado (zera o saldo) e a anulação do descarte de sobra, se houve. Só é permitida se nenhum derivado teve qualquer movimento; a origem volta com a validade dela, mesmo vencida. Nenhum desses eventos é desfeito por "Anular registro".
- **Motivo:** seção 4.10 e 5.4 do desenho; I-9 da revisão cruzada; histórico append-only (6.0a); D-038; ponto 3 aceito na 6.3.
- **Consequência:** a fórmula de saldo continua sem exceção; a conservação ganha uma verificação por manipulação anulada. Tipo de movimento novo continua exigindo atualizar os três lugares da D-038. Não criar outra FK de `stock_movements` para `containers` (quebra a junção da API).
- **Revisar quando:** a 6.6 (tela de anulação) e a 6.9 (transferência de local, que entra na condição) chegarem, ou se a observação no piloto mostrar que a regra estrita do ponto 1 atrapalha.
- **Situação:** proposta, aguardando luis.

## Próximo passo

Aguardar o aceite de luis (fatia, D-040 e os três pontos acima). O aceite não autoriza merge: integrar depois dos PRs #2, #5, #6, #7, #8, #9 e #10, nessa ordem, só com luis. A 6.5a (conservação, temperatura e ocorrências no banco) exige aprovação própria.
