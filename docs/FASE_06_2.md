# Fase 6, fatia 6.2 — painel e QR com saldo

Implementada por Claude Code em 13/11/2026, conforme as seções 4.4, 7.3, 7.4 e 10 de `FASE_06_DESENHO.md` (PR #3). luis aprovou o início em 13/11/2026. Registro da tarefa: `ia-tarefas/fase-06-2-painel-saldo.md`.

**Base:** branch do PR #8 (`claude/fase-06-1-saldo-recipiente`, `ef76dff`). **Ordem de integração: PR #2, PR #5, PR #6, PR #7, PR #8, depois este.**

**Sem mudança de permissão (D-019) nem de Q1–Q10.** Nenhuma escrita nova para o cliente. As proteções das 6.0a–6.1 continuam intactas. Nenhum deploy. Nada aqui afirma conformidade sanitária, e o PDF da etiqueta não mudou.

## O que mudou para quem usa

- **O painel lista recipientes com saldo**, do vencimento mais próximo para o mais distante (vencidos no topo). Recipiente esgotado sai da lista e das contagens; a opção "Mostrar esgotados" (desligada por padrão) traz todos, marcados como "Esgotado".
- **A linha mostra o saldo**, não a quantidade recebida: "saldo 1.5 kg de 2.5 kg", com o código curto (`C-000042`) antes do lote. O ID longo do recipiente continua visível (D-037).
- **Contagens (vencidos, hoje, amanhã, posteriores) só sobre recipientes com saldo.**
- **Busca no servidor** por produto, lote, código curto ou ID do recipiente; a lista vem em páginas de 100, com "Carregar mais recipientes". Os tetos de 10.000 recebimentos e o aviso de limite saíram do painel.
- **Rota do QR (`/recipiente/<id>`) mostra "Saldo atual"** e o código curto; quando zerado, "esgotado, sem saldo neste recipiente".
- Depois de registrar consumo, descarte ou anulação, a linha e as contagens são relidas do servidor. A linha continua na tela até a próxima atualização, mesmo que o saldo zere, para a pessoa não perder o histórico que está olhando.

Capturas antes e depois (desktop e celular), com os mesmos dados de exemplo: pasta compartilhada do projeto, `capturas-fase-06-2/`.

## O que mudou por dentro

### Banco (`20261113060000_list_containers.sql`, rollback `list_containers.sql`)

1. **`public.list_containers(org, unidade, filtro, alvo, busca, cursor de validade, cursor de ID, limite)`**, `SECURITY INVOKER`, `stable`. Filtros `with_balance` (padrão), `all`, `batch` e `container`; ordem e paginação por `(validade efetiva, id)`; limite de 1 a 200. Devolve recipiente, código curto, tipo, origem, recebimento, produto, unidade, lote, validade efetiva e origem dela, origem da validade do recebimento, quantidade inicial, saldo, fuso e criação. A busca escapa `%`, `_` e `\`, então o texto digitado nunca vira curinga.
2. **`public.container_expiry_summary(org, unidade, data de referência)`**, `SECURITY INVOKER`: as quatro contagens, só com saldo. A data de referência vem da tela (relógio do dispositivo no fuso da unidade, como antes), então os testes não envelhecem (S-6).
3. **Plano B da seção 4.4: saldo mantido na escrita.** A primeira versão calculava o saldo agregando os movimentos a cada leitura e **não cumpriu o critério de 50 ms** (cerca de 250 ms): "só com saldo" precisava pular todos os recipientes já esgotados, que são a maior parte do histórico e os mais antigos. A tabela nova **`public.container_balances`** guarda o saldo atual de cada recipiente:
   - criada pelo gatilho `containers_init_balance` (recipiente novo nasce com a quantidade inicial) e ajustada pelo gatilho `stock_movements_apply_balance` na **mesma transação** do movimento; os dois `ENABLE ALWAYS`;
   - `CHECK (balance >= 0)`: segunda barreira no banco contra saldo negativo, por qualquer caminho de escrita;
   - tipo de movimento sem regra de saldo é recusado pelo gatilho (a 6.3 precisa incluir `transfer` aqui, em `private.container_balance` e em `private.stock_conservation_problems`);
   - RLS por vínculo, só `SELECT` para `authenticated` e `service_role`, nada para `anon`; o gatilho `container_balances_guard` recusa `INSERT`, `UPDATE`, `DELETE` e `TRUNCATE` diretos de qualquer papel, inclusive do dono das tabelas;
   - índice parcial `container_balances_live_idx` (`where balance > 0`) para o painel e índice completo para "Mostrar esgotados".
4. **O histórico continua sendo a fonte da verdade.** `private.container_balance` (6.1) recalcula o saldo, e a função nova `private.container_balance_problems()` lista qualquer recipiente sem saldo registrado ou com saldo ou validade diferentes. A migração preenche os recipientes existentes e **se desfaz inteira** se essa verificação ou `assert_history_protected()` acusarem algo. As funções de escrita da 6.1 não mudaram: continuam conferindo o saldo pelo histórico, sob o bloqueio do recebimento.
5. **Rollback** remove funções, gatilhos e a tabela. Nenhum recebimento, recipiente ou movimento é tocado; a tabela é derivada e a reaplicação a reconstrói.

### Interface

- Novo `ContainerGateway` (`supabaseContainers.ts`) com `list`, `get` e `summary`; lista vazia por falta de vínculo continua sendo erro, não "nenhum recipiente".
- `BatchPanel` lê do `ContainerGateway`. Falha em qualquer consulta (lista, contagens ou catálogo) não deixa painel parcial na tela.
- `LabelView` (rota do QR e "Abrir etiqueta") mostra saldo e código curto; o gateway de etiquetas lê o saldo por `list_containers` com o filtro `container`.
- `MovementPanel` ganhou `onRecorded`, para o painel reler o saldo da linha.
- Recipientes derivados (que só existirão na 6.3) já aparecem na lista com a validade "após manipulação", mas sem botões de movimentação e etiqueta, que chegam com as telas da 6.6 e 6.7.

## Testes

- **Novo `supabase/tests/list_containers.test.sql` (76):** catálogo (funções `SECURITY INVOKER`, privilégios, índices, gatilhos `ENABLE ALWAYS`); saldo guardado igual ao histórico; escrita direta do saldo recusada para dono das tabelas, `service_role` e proprietário; movimento direto acima do saldo recusado pela restrição; ordem por validade; filtros; paginação sem repetição nem salto; busca por produto, lote, código e ID, com `%` e `_` literais; validação de parâmetros; contagens só com saldo; **teste 11 do desenho**: membro lê, outra unidade, outra empresa com IDs de A, revogado e anônimo não leem nada.
- **Novo `tests/integration/list-containers.test.mjs` (1):** pela API com usuários reais: saldo e não quantidade recebida, ordem, paginação de um em um, busca, rota do QR com esgotado, contagens, leitura concorrente com baixa, seis baixas concorrentes no mesmo recipiente (só quatro passam, e o saldo guardado bate com o histórico), ninguém escreve saldo pela API, isolamento por empresa e unidade.
- **Vitest (+9, 87 no total):** gateway novo (5), painel (ordem, saldo, esgotados, paginação), rota do QR com saldo, aviso `onRecorded`.
- **Playwright:** a jornada confere "saldo 0.75 kg de 1.25 kg" na linha e "Saldo atual: 0.5 kg" e o código na rota do QR; **E2E 32**: usuário de outra empresa abre `/recipiente/<id>` de A e não vê produto, lote nem saldo.

### Ajustes em testes existentes

Nenhum teste foi removido, pulado ou enfraquecido. O que mudou e por quê:

| Teste | Mudança | Motivo |
|---|---|---|
| `rls_set_based.test.sql`, lista fixa de políticas | acrescenta `container_balances_read` | tabela nova (mesmo padrão da 6.0c com `entity_changes_read`) |
| `ExpiryDashboard.test.tsx` e `BatchPanel.test.tsx` | os dados do painel vêm de um servidor falso de `list_containers` (`src/test/fakeContainers.ts`) em vez de `batches.list` | o painel mudou de fonte; as mesmas verificações continuam (etiqueta some ao perder acesso, fuso inválido, virada do dia, busca, resumo, conflito de reenvio) |
| `ExpiryDashboard.test.tsx`, "informa o limite de volume sem apresentar um painel parcial" | virou "não apresenta painel parcial quando a lista ou as contagens falham", mais um teste de paginação | o teto de 10.000 saiu do painel por desenho (7.3); a garantia que importava, não mostrar painel parcial, ficou mais ampla |
| `expiry-pagination.spec.mjs` | os 1.001 recebimentos agora são percorridos com "Carregar mais"; a inserção concorrente é feita durante a paginação de `list_containers` e não pode duplicar nem deslocar linhas | paginação passou para o servidor; mesma intenção do teste original |
| `catalog.spec.mjs` | nomes novos da busca e da lista; verificações de saldo acrescentadas | rótulos mudaram |
| fixtures de `LabelView.test.tsx`, `pdf.test.ts` e do segundo teste de `catalog.spec.mjs` | ganharam `short_code` e `balance` | campos novos do recipiente |

## Evidências (container em nuvem, 13/11/2026)

Supabase local (Postgres 17) com Docker; Node 24.22.3; Playwright com o Chromium do container por config local não versionada.

| Comando | Resultado |
|---|---|
| Falha primeiro, sem a migração: `npm run test:db` | **FAIL** em `list_containers.test.sql` (funções inexistentes); os outros 9 arquivos verdes |
| Benchmark, saldo por agregação (primeira versão): 200 com saldo em unidade com 20 mil recipientes e 200 mil eventos, 90% esgotados | **~250 ms, critério não cumprido** |
| Mesmo benchmark com o plano B, como `authenticated` com RLS | **6 a 8 ms** (`with_balance`); 6 a 8 ms (`all`); contagens 4 ms; busca por produto entre os com saldo 67 a 89 ms |
| Backfill no banco do benchmark (22 mil recipientes), `supabase migration up` | ~2 s; 0 problema de saldo |
| `npm run db:reset` + `npm run test:db` | PASS, 10 arquivos, 447 verificações (371 anteriores + 76 novas) |
| `npm run test:integration`, duas vezes seguidas no mesmo banco | 17 de 17 nas duas |
| `playwright test` | 3 de 3 |
| `npm run test:db` de novo, no banco já usado pela integração e pelo navegador | PASS, 447 |
| Rollback em banco com dados (1.047 recipientes); bateria da 6.1 (worktree em `ef76dff`) contra o banco revertido | recebimentos, recipientes e movimentos idênticos (hash); `test:db` 371 PASS e integração 16 de 16 |
| Reaplicar depois do rollback | 1.065 recipientes, 1.065 saldos, 0 problema de saldo, 0 problema de conservação; `test:db` 447 PASS e integração 17 de 17 |
| `npx supabase db advisors --type security --level warn --fail-on warn` e `--type performance --level warn` | sem ocorrências |
| `npm run lint`, `typecheck`, `format:check`, `build` | sucesso (build mantém o aviso antigo de chunk grande) |
| `npm run test` (Vitest) | 87 de 87 |

Não executados: CI do GitHub no momento deste texto; teste em tablet ou celular físico.

## Riscos e limites

- **Saldo guardado é uma cópia.** Se um caminho futuro escrever movimento sem passar pelo gatilho, a cópia diverge. Mitigação: gatilho `ENABLE ALWAYS`, escrita direta recusada, `container_balance_problems()` no pgTAP e no fim da migração. Recomendo rodá-la também nos backfills das próximas fatias.
- **Busca com "Mostrar esgotados" percorre o histórico da unidade** (é a única combinação que não fica limitada aos recipientes vivos). Aceitável para uso eventual; se virar hábito, cabe um índice de texto.
- **A linha esgotada continua visível até atualizar**, de propósito. As contagens já refletem o saldo novo.
- **`BatchGateway.list` ficou sem uso na tela** (o painel não lê mais recebimentos). Mantive o código e os testes dele para não remover teste nesta fatia; pode sair numa limpeza com aval de luis.
- **O limite de 1.000 eventos no histórico de movimentações de um recebimento continua** (`supabaseMovements.ts`). É o histórico de um recipiente, não o painel; fica para a 6.6, quando a tela passar a operar por recipiente.
- **O relógio de referência continua sendo o do dispositivo.**

## Sugestões fora do escopo (não implementadas)

Vieram da revisão visual de 13/11/2026. Só entram com aval de luis:

1. **Datas em formato legível** ("13/11/2026" e "13/11/2026 03:41" no fuso da unidade) no lugar de `2026-11-13` e `2026-11-13T02:47Z`.
2. **Autor pelo nome** no histórico de movimentações, no lugar do ID longo. Depende do nome de exibição (`memberships.display_name`), que o desenho prevê para a 6.3.
3. **Esconder o ID longo do recipiente** na linha, deixando o código curto (revisaria a D-037, que luis aceitou com o ID visível).
4. **Destaque visual** para vencidos e "vence hoje" (cor ou faixa), e botões que não quebrem a linha no celular.
5. **Renomear** a seção "Recebimentos de lote" e o botão "Atualizar recebimentos", já que a lista agora é de recipientes.
6. **Código curto no PDF da etiqueta**: previsto no desenho para a 6.7.

## Decisão proposta para `DECISOES.md`

Entra como **D-038** quando os PRs anteriores forem integrados (D-037 é da 6.1):

- **Decisão:** o painel e a rota do QR leem recipientes pelo servidor (`list_containers` e `container_expiry_summary`, `SECURITY INVOKER`), só com saldo por padrão e em ordem de validade efetiva. O saldo atual fica em `container_balances`, mantido por gatilho na transação do movimento (plano B da 4.4), com o histórico como fonte da verdade e `container_balance_problems()` como verificação.
- **Motivo:** P9 e o critério de 50 ms, que a agregação a cada leitura não cumpriu (~250 ms contra 6 a 8 ms).
- **Consequência:** todo tipo de movimento novo precisa de regra de saldo em três lugares (`container_balance`, `stock_conservation_problems` e `apply_movement_to_balance`); backfills terminam também com `container_balance_problems()` vazio.
- **Revisar quando:** a 6.3 criar `transfer`, ou se luis preferir o saldo calculado a cada leitura aceitando o tempo maior.
- **Situação:** proposta; aguarda luis.

## Próximo passo

Aceite de luis para esta fatia e para a D-038. O aceite não autoriza merge: integrar depois dos PRs #2, #5, #6, #7 e #8, nessa ordem, só com luis. A 6.3 (manipulação no banco) exige aprovação própria.
