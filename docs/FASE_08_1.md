# Fase 8, fatia 8.1 — Estabilização da CI e do E2E (D-065)

**Estado: entregue para o aceite de luis.** Autorizada em 17/11/2026, 13:59 UTC, antes da integração dos PRs. Duas partes, em dois PRs: **8.1a** (PR #42, base `main`: CI e utilitário de teste) e **8.1b** (PR #43, base na ponta da cadeia: correção do teste E2E, que só existe a partir do PR #37). **Nenhum teste foi removido, enfraquecido, desabilitado ou isolado; nenhuma regra de negócio mudou; nenhuma repetição foi adicionada para esconder falha.** Sem merge, deploy ou contratação. Este arquivo é novo de propósito: a 8.1a entra na `main` antes dos outros PRs e não pode mexer nos documentos compartilhados (`IA_ESTADO.md`, `DECISOES.md`, `TESTES_QUALIDADE.md`), que cada PR da cadeia também altera; o registro nesses documentos entra com o aceite (seção 7).

## 1. Ponto de partida

Nas 100 execuções mais recentes da CI (14 a 16/11/2026), 10 falharam, todas no job `banco-api-e2e` (investigação completa em `PLANO_INTEGRACAO.md`, seção 6). Esta fatia levou a investigação até a causa de **cada uma das seis classes**:

| Classe | Falha | Ocorrências | Causa (agora confirmada ou explicada) | O que resolve |
|---|---|---|---|---|
| **A** | `supabase start`: `failed to bind host port 0.0.0.0:54322/tcp: address already in use` | 2 de 100 + 1 de 10 na rodada de medição | **Causa provável, com evidência:** as portas 54320 a 54329 do Supabase local estão **dentro da faixa de portas efêmeras do Linux (32768-60999)**. Uma conexão de saída (npm, download de imagens) pode ocupar a 54322 por um instante, e o Docker não consegue ligá-la. O diagnóstico da falha mostrou **nenhum processo em escuta** nessa porta (compatível com socket de saída ou em TIME_WAIT, que dura até ~60 s) e a nova tentativa, 3 s depois, falhou igual | **8.1a (PR #42)** |
| **B** | pgTAP `handling_void` teste 26 (escolha aleatória dependente do plano de execução) | 2 | Já explicada em `TESTES_QUALIDADE.md` | PR #28 (já está na cadeia) |
| **C** | pgTAP `container_handling` teste 69 (horário perto da meia-noite) | 2 | Já explicada em `TESTES_QUALIDADE.md` | PR #35, cópia no #34 |
| **D** | Integração `handling-void.test.mjs`: "Operação local falhou (22023)" | 2 | **Causa encontrada no histórico da cadeia:** se as quatro rodadas "anulação × baixa" terminavam com a baixa vencendo, o integral ficava com 4 e o porcionamento final `[2, 2]` com sobra lacrada era recusado com "Não há sobra" (22023). A mensagem não aparecia porque `checked()` a descartava | Commit `ed6670f` (lote com 24, nenhuma asserção retirada), **já dentro do PR #22** (etapa 2). A mensagem agora aparece (8.1a) |
| **E** | Integração `production-label.test.mjs:131`: contagens `[54, 59, 38]` contra `[54, 58, 37]` | 1 | **Causa encontrada:** a contagem de movimentos, recipientes e lotes era global, e os arquivos de integração rodam em paralelo no mesmo banco; outro teste criou um lote entre as duas contagens | Commit `55caab2` (as mesmas três contagens, agora da empresa do teste, nenhuma verificação removida), no PR #29 (etapa 8), junto com o próprio arquivo de teste |
| **F** | E2E `finishing.spec.mjs:138`: altura do título 84,4 px, esperado até 1 px | 1 | **Reproduzida:** depois de `page.reload()` em tela de celular, o título só encolhe quando a unidade volta a abrir (`.workspace.unit-open`); o teste media o título antes disso. Hipótese confirmada: 3 falhas em 40 execuções do teste original, sempre com a mesma mensagem (56,3 px) | **8.1b (PR #43)** |

## 2. O que a 8.1 muda (e o que não muda)

### 8.1a, PR #42 (base `main`, 5 arquivos de código e configuração mais documentos novos)

| Arquivo | Mudança |
|---|---|
| `.github/workflows/quality.yml` | **Gatilho único:** `pull_request` (qualquer base, inclusive PRs empilhados), `push` só na `main` e `workflow_dispatch`. Antes, `push` + `pull_request` rodavam o mesmo commit duas vezes. `concurrency` cancela a execução anterior do mesmo PR (nunca a da `main` nem as manuais). Passo que **reserva as portas 54320-54329 fora da faixa efêmera** (`sysctl net.ipv4.ip_local_reserved_ports`) antes de qualquer acesso à rede. Subida do banco pelo script abaixo. Artefato com `test-results/` do E2E **só se a CI falhar**. Passo `test:ci-scripts` no job `quality`. |
| `scripts/ci/start-database.sh` (novo) | Sobe o Supabase local **sem imprimir credenciais** (saída da CLI vai para um arquivo; se falhar, mostra o final com chaves, senhas e tokens mascarados). **Uma única nova tentativa, só para "address already in use"**, com aviso visível (`::warning`), diagnóstico (faixa efêmera, portas reservadas, sockets 5432x em qualquer estado, contêineres) e espera a liberação dos sockets. Qualquer outra falha (migração, imagem, teste) termina na hora, sem repetir. |
| `scripts/local-supabase.mjs` | `checked()` passa a incluir a mensagem e a dica do banco (até 300 caracteres cada) no erro. Antes só o código aparecia, e falhas como a classe D ficavam sem diagnóstico. |
| `tests/ci/start-database.test.mjs` (novo) e `package.json` (`test:ci-scripts`) | 5 testes do script com `npm`, `npx`, `docker` e `ss` falsos: sucesso sem credencial no log; uma nova tentativa para porta em uso; falha depois de uma nova tentativa; nenhuma nova tentativa para outra falha, com credenciais mascaradas; espera de sockets ocupados. |
| `docs/FASE_08_1.md`, `docs/PROTECAO_MAIN_PROPOSTA.md`, `docs/ia-tarefas/fase-08-1-estabilizacao-ci.md` | Documentos novos (arquivos novos não geram conflito). |

**Não mudou:** nenhum teste de produto, nenhuma migração, nenhum arquivo em `src/`, nenhuma regra de negócio. O `.github` e `scripts/` não são alterados por nenhum dos 17 PRs da cadeia (verificado), então a 8.1a não gera conflito na integração.

### 8.1b, PR #43 (base na ponta da cadeia, 1 arquivo)

`tests/e2e/finishing.spec.mjs`: o teste espera o nome da unidade na barra de sessão e só então mede o título, com `expect.poll`. **O limite de 1 px continua o mesmo** e a mesma asserção continua valendo; só deixou de medir antes do estado em que ela é verdadeira. Entra na integração depois do PR #39 (o arquivo só existe a partir do #37).

## 3. Resultados de estabilidade

Ambiente local descartável (Supabase local, Chromium da nuvem, 4 núcleos), na ponta da cadeia (código que vai ao piloto), com `checked()` novo.

| Teste | Antes | Depois |
|---|---|---|
| Suíte de integração completa (51 testes), 10 execuções | — | **10/10 verdes** |
| Suíte de integração com 8 arquivos em paralelo, 12 execuções | — | **12/12 verdes** |
| `handling-void.test.mjs` (classe D), 20 execuções | — | **20/20 verdes** |
| `production-label.test.mjs` (classe E) com 5 outros arquivos de integração em paralelo, 10 execuções | — | **10/10 verdes** |
| E2E `finishing`, sem carga, 20 execuções | original: **19/20** (1 falha, 56,3 px) | corrigido: **20/20** |
| E2E `finishing`, com carga de CPU (8 processos em 4 núcleos), 20 execuções | original: **18/20** (2 falhas, 56,3 px) | corrigido: **20/20** |
| Testes do script de CI (`test:ci-scripts`) | — | **5/5** |
| `npm run lint`, `typecheck`, `format:check`, `test` (242), `build` na base `main` + 8.1a | — | **verdes** |

CI real do GitHub (`workflow_dispatch` na branch da 8.1a; `quality` e `banco-api-e2e` completos):

| Rodada | Commit | Resultado |
|---|---|---|
| PR #42, primeira execução | `be51df4` | **falhou no `quality`**: erro de lint do meu teste novo (`process` não importado). O `banco-api-e2e` passou. Corrigido no commit seguinte; o teste de CI não tinha sido varrido pelo lint local (rodei só `scripts/`) |
| PR #42 | `af6a8ab` | **verde** (as duas jobs); apenas uma execução, confirmando o gatilho único |
| 10 execuções manuais **antes** da reserva de portas | `af6a8ab` | **9 verdes, 1 falha de classe A**: a porta 54322 em uso; o diagnóstico mostrou nenhum processo em escuta e a segunda tentativa (3 s depois) falhou igual |
| 25 execuções manuais **depois** da reserva de portas e da espera de sockets | último commit da 8.1a | **25/25 verdes, 0 avisos de porta em uso**, 0 ocorrência de credencial nos logs do banco |

**Leitura honesta:** a classe A aparecia em cerca de 2 a 10% das execuções; 25 execuções seguidas sem falha tornam a correção provável, não provada (com 10% de falha, a chance de 25 verdes por acaso é menor que 10%; com 3%, cerca de 47%). O script **continua registrando** qualquer recorrência com aviso visível e diagnóstico, para a causa ser confirmada ou refutada com dados. O critério de saída está na seção 5.

## 4. Segredos e dados pessoais nos logs

- Antes: `npm run db:start` imprimia o JSON da CLI com as chaves locais do Supabase no log público da CI. São as chaves padrão de desenvolvimento local, mas a diretriz é não expor credenciais.
- Agora: a saída da CLI não vai ao log; em caso de falha, só o final dela, com chaves, senhas de conexão e tokens mascarados (testado). Verificado em 25 logs reais: nenhuma ocorrência de `sb_secret_`, `sb_publishable_` ou token JWT.
- O artefato de falha do E2E contém só `test-results/` (texto de contexto e dados sintéticos); sem traço (`--trace off`) e sem credenciais.
- A mensagem do banco que `checked()` agora mostra é o texto das regras (por exemplo "Não há sobra"), com dados de teste sintéticos.

## 5. Critérios de saída da 8.1 e pendências

| Critério | Estado |
|---|---|
| Causa de cada classe explicada | **feito** (seção 1) |
| Nenhum teste enfraquecido, removido ou desabilitado; nenhuma repetição indiscriminada | **feito** (a única nova tentativa é do banco, para um erro, com aviso) |
| Estabilidade medida com execuções repetidas | **feito** (seção 3) |
| Classe A sem recorrência em 25 execuções da CI | **feito**; manter observação (mais 25 execuções na integração real contam como medida) |
| Classe A volta depois da correção | **aberto de propósito:** se acontecer, o log traz o diagnóstico e a fatia é reaberta |
| Proposta de proteção da `main` | **feita**, não aplicada ([PROTECAO_MAIN_PROPOSTA.md](PROTECAO_MAIN_PROPOSTA.md)) |
| SHA das ações do GitHub fixado | **não feito:** a sessão não consegue consultar os SHAs oficiais dos repositórios das ações, e um SHA errado quebraria a CI; fica no backlog (S-8). O aviso de Node 20 das ações continua |

## 6. Riscos

- A 8.1a muda o gatilho da CI: depois dela, **branch sem PR não roda CI** (só `main`, PR e execução manual). Todos os trabalhos do projeto passam por PR, então não afeta o fluxo.
- Os PRs já abertos continuam usando a versão antiga do workflow até receberem a `main` nova (a execução de PR usa o resultado da combinação com a base). Depois do merge da 8.1a e da troca de base de cada PR, eles passam a usar o novo.
- `sysctl` exige `sudo` no executor do GitHub (disponível sem senha nos executores hospedados); se faltar, o passo falha alto, não em silêncio.
- A única nova tentativa automática depende do texto "address already in use". Se a CLI mudar a mensagem, a nova tentativa deixa de existir e a falha aparece normalmente (falha segura).

## 7. Registros pendentes do aceite

Com o aceite de luis: D-066 em `DECISOES.md`, linha da 8.1 em `IA_ESTADO.md` e as seis classes em `TESTES_QUALIDADE.md`, feitos no PR #41 (que entra por último) para não gerar conflito com a integração. Depois do aceite, **o primeiro lote de integração é exclusivamente o PR #28.**

## 8. Recorrência da classe F depois do aceite (18/11/2026)

Na integração, a classe F voltou duas vezes antes de o #43 entrar: no #37 (SHA `66f685c`, 16/11, já antes da 8.1) e no #38 (SHA `a6c530a`, tentativa 1 da rodada 44217166668, 18/11). As duas falharam em `finishing.spec.mjs:138` com 84,4 px, a mesma linha e o mesmo valor da classe F, o que confirma a causa. O #38 passou na tentativa 2 e foi integrado; o #43 (8.1b) entrou na `main` em `3141293` com a CI da `main` verde. O #39 passou na primeira tentativa. A estabilidade do teste corrigido na `main` ainda precisa de observação nas próximas execuções. Qualquer nova falha desse teste reabre a 8.1.
