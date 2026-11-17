# Plano de integração dos PRs e de preparação para produção (proposta)

**Estado: proposta, aguardando aprovação de luis.** Preparado em 17/11/2026 a partir das decisões de luis sobre a [revisão técnica integrada](REVISAO_TECNICA_INTEGRADA.md) (PR #40, aprovada como diagnóstico, 13:38 UTC). **Este documento não executa nada:** nenhum merge, deploy, contratação de serviço, mudança de configuração do GitHub ou implementação de fatia. Cada etapa e cada fatia abaixo só começa com autorização específica e escrita de luis. Nada aqui afirma conformidade sanitária ou legal (Q10 segue pendente). O repositório é público: nenhum dado do estabelecimento piloto aparece neste texto.

## 1. Decisões de luis que este plano cumpre

| # | Decisão (17/11/2026) | Onde está tratada |
|---|---|---|
| 1 | Estratégia A: PRs integrados individualmente, com CI verde na `main` após cada etapa | seções 3 a 5 |
| 2 | MFA obrigatório para proprietários antes do piloto | fatia 8.5 (seção 7) |
| 3 | Nome com até 80 caracteres, preservando registros históricos e validando o impacto nas etiquetas | fatia 8.3 |
| 4 | Procedimentos de reversão das 7 migrações, sem reversão destrutiva com dados reais; recuperação por backup e restauração | fatia 8.2 |
| 5 | Proposta de hospedagem: Cloudflare Pages + Supabase, banco preferencialmente em São Paulo | seção 8 |
| 6 | Homologação e produção completamente separadas | seção 8 |
| 7 | Backup diário como mínimo, com teste documentado de restauração; retenção com orientação jurídica e sanitária | fatia 8.2 e seção 8 |
| 8 | Registrar e investigar as instabilidades da CI e do E2E | seção 6 |
| — | Priorizar S-1 a S-6, I-2, B-1 a B-4, D-1, D-2, D-5, C-1; revisão independente de segurança antes do piloto; nova fase conciliada com o roadmap; demais achados no backlog | seção 7 |

## 2. Estado de partida (verificado em 17/11/2026)

- `main` em `2d54b51` (PR #21, 7.1). Sem proteção de branch (`protected: false`). O repositório aceita merge commit, squash e rebase; não apaga a branch depois do merge (`delete_branch_on_merge: false`).
- Cadeia empilhada de 15 PRs em rascunho, de #22 a #39, mais #40 (diagnóstico) e este plano. #28 e #35 saem da `main`.
- **Simulação feita em cópia descartável, sem enviar nada ao GitHub:** parti da `main` e fiz o merge (com merge commit) de #28, #22, #23, #24, #25, #26, #27, #29, #30, #31, #32, #33, #34, #36, #37, #38 e #39, nessa ordem. **Nenhum conflito**, e a árvore final ficou **idêntica** à ponta do PR #39 (diferença zero). Isso confirma a ordem da seção 4.
- #28 (`aee9944`) é **ancestral** da ponta do #39: já está dentro da cadeia, então entrar primeiro não gera divergência.
- **#35 não é ancestral:** a correção do teste 69 entrou na cadeia por cópia de commit (SHA diferente). Fazer merge do #35, antes ou depois da cadeia, **conflita em `docs/TESTES_QUALIDADE.md` e `docs/IA_ESTADO.md`** (conflito só de documentação; o arquivo de teste é idêntico). Recomendação: **não fazer merge do #35**; fechá-lo como "já incorporado no #34" depois que o #34 entrar.
- A conclusão "sem conflito" vale para a cadeia como está hoje. Qualquer commit novo na `main` ou em um PR antes da etapa muda a previsão; por isso cada etapa tem a verificação do item 4.2.

## 3. Regras da estratégia A

1. **Um PR por etapa**, na ordem da seção 4. Nenhuma etapa começa sem a anterior concluída e sem a autorização escrita de luis para ela (uma autorização por etapa, ou uma única autorização que nomeie expressamente várias etapas consecutivas).
2. **Merge commit (sem squash e sem rebase).** Os PRs são empilhados: cada ponta contém os commits dos anteriores. Squash ou rebase reescreveriam esses commits e fariam o PR seguinte duplicar mudanças e conflitar. A simulação acima usou merge commit.
3. **Depois do merge**, mudar a base do próximo PR para `main` (o repositório não apaga a branch, então o GitHub não faz isso sozinho). O diff do PR seguinte encolhe para o que é só dele.
4. **Critério de pronto de uma etapa** (todos): (a) execução completa da CI (`quality` e `banco-api-e2e`) verde no **SHA exato da ponta** do PR antes do merge; (b) merge feito com autorização; (c) execução da CI **na `main`** (evento `push`) verde no merge commit; (d) sem conflito novo e sem arquivo fora do previsto; (e) linha da tarefa em `docs/IA_ESTADO.md` e registro em `docs/ia-tarefas/` atualizados no PR.
5. **Por que (c) importa:** na etapa 2 a `main` já terá o #28, que o #22 não tem; a árvore resultante não é exatamente a que a CI do PR testou. Da etapa 7 em diante a ponta já contém o #28 e os testes da ponta valem para o resultado; antes disso, só a CI da `main` prova o conjunto.
6. **Falha de CI:** uma única nova execução dos jobs que falharam; se falhar de novo, parar e investigar a causa (seção 6). Nunca pular, desligar ou enfraquecer teste, nem empurrar commit vazio. Falha que a seção 6 classifica como de infraestrutura não bloqueia se houver execução verde completa no mesmo SHA.
7. **Parada obrigatória** nas etapas 10, 12 e 18 (seção 4): pausa para a bateria completa na `main` e relato a luis antes de seguir.
8. **Reversão de uma etapa:** um commit novo que desfaz o merge (`revert` do merge commit), com autorização. Não há banco hospedado, então nada de dados precisa ser desfeito. Proibido reescrever a história da `main`.
9. Sem deploy em nenhuma etapa. As migrações só chegam a banco hospedado na fase 8.4, com autorização própria.

## 4. Etapas de integração

### 4.1 Tabela de etapas

Tamanhos são o acréscimo do PR sobre o anterior (comparação de árvores). "Mig." = migração SQL nova.

| Etapa | PR | Conteúdo | Tamanho | Mig. | Conflitos esperados | Risco |
|---|---|---|---|---|---|---|
| 0 | — | Pré-condições (4.3): autorização, proteção da `main`, estabilização da CI (fatia 8.1) | — | — | nenhum | baixo |
| 1 | #28 | Torna determinísticos 2 testes pgTAP (`handling_void` 26, `list_containers` 38) | 4 arq., +83/−16 | não | nenhum (já é ancestral da cadeia) | baixo |
| 2 | #22 | 7.2 anular produção no banco (D-051) | 18 arq., +755/−25 | `production_void` | nenhum | médio: toca saldo e `reverse_movement` |
| 3 | #23 | 7.3 tela de produção (D-052) | 26 arq., +2310/−28 | não | nenhum | médio: tela grande |
| 4 | #24 | 7.4 etiqueta PDF "Preparação própria" (D-053) | 17 arq., +680/−22 | não | nenhum | médio: PDF e QR |
| 5 | #25 | 7.5 porcionar preparação e métricas (D-054) | 14 arq., +680/−32 | `production_portioning` | nenhum | médio: saldo e métricas |
| 6 | #26 | 7.6 configurações da unidade (D-055) | 25 arq., +2338/−47 | `establishment_settings` | nenhum | médio: permissões de quem registra |
| 7 | #27 | 7.7 janela de registro por preparação (D-056) | 19 arq., +1130/−18 | `preparation_window` | nenhum (traz o #28 já mesclado) | médio |
| 8 | #29 | 7.8 aviso de produção sem etiqueta (D-057) | 19 arq., +950/−7 | `production_label` | nenhum | baixo |
| 9 | #30 | 7.9 temperatura opcional (D-058) | 18 arq., +1434/−5 | `production_temperature` | nenhum | baixo |
| 10 | #31 | Revisão visual pós-Fase 7 (relatório, capturas) | 22 arq., +169 | não | nenhum | baixo. **Parada 1** |
| 11 | #32 | V2 sessão persistente 30 min (D-059) | 25 arq., +1580/−49 | `session_inactivity` (altera `has_membership`, `member_organizations`, papel `authenticator`) | nenhum | **alto**: afeta toda requisição autenticada |
| 12 | #33 | V1 navegação por áreas (D-060) | 48 arq., +1905/−676 | não | nenhum | médio: reorganiza telas. **Parada 2** |
| 13 | #34 | V3 lista de validade em cartões (D-061) | 50 arq., +1557/−282 | não | nenhum; traz a correção do teste 69 | médio |
| — | #35 | Correção do teste 69 (já está no #34) | — | — | **conflita** em 2 documentos | fechar sem merge depois da etapa 13 |
| 14 | #36 | V4 proposta (somente documento) | 6 arq., +59/−28 | não | nenhum | baixo |
| 15 | #37 | V4 acabamento visual (D-062) | 37 arq., +1624/−99 | não | nenhum | médio; contém o E2E instável (seção 6, F) |
| 16 | #38 | V5 vírgula decimal nas quantidades (D-063) | 18 arq., +1162/−27 | não | nenhum | médio: mudança de regra de entrada |
| 17 | #39 | V5B exibição com vírgula, temperatura (D-064) | 31 arq., +1166/−66 | não | nenhum | médio: 23 pontos de exibição |
| 18 | #40 e este plano | Diagnóstico e plano (somente documentos) | docs | não | nenhum | baixo. **Parada 3** (final) |

Totais: 18 etapas de merge e 1 PR fechado sem merge (#35); este plano, em PR próprio, entra junto com a etapa 18. Cerca de 4 minutos de CI por etapa mais a espera pela autorização.

### 4.2 Verificação antes de cada etapa (todas)

1. `gh pr view`: PR aberto, rascunho, base correta (após o item anterior, `main`), sem commit novo desde a última revisão. Se houver commit novo, parar e reavaliar a previsão.
2. Merge de teste em cópia descartável (como na seção 2), para confirmar zero conflito e a lista de arquivos.
3. CI do SHA da ponta: os dois jobs verdes (ou a regra da seção 3, item 6).
4. Passar o PR de rascunho para pronto **só** no momento do merge autorizado.

### 4.3 Etapa 0: pré-condições

| Item | Descrição | Precisa de autorização própria |
|---|---|---|
| 0.1 | luis autoriza a etapa 1 e as seguintes (por etapa ou lote nomeado) | sim |
| 0.2 | **Proteção da `main`** (proposta): exigir os dois jobs da CI, proibir push direto e force-push, exigir PR. Ela transforma o critério "CI verde" em regra do GitHub. Mudança de configuração do repositório | sim |
| 0.3 | **Fatia 8.1, estabilização da CI** (seção 6), de preferência antes da etapa 1, porque 2 das 10 falhas observadas são de infraestrutura e atrapalhariam o ritmo | sim |
| 0.4 | Congelar a cadeia: nenhum commit novo nos PRs #22 a #39 enquanto a integração corre, salvo correção combinada | combinar |

### 4.4 Detalhe por etapa

Em todas valem os itens 3 e 4 da seção 3 e a verificação 4.2. Abaixo, só o que é específico.

- **Etapa 1, #28.** Dependência: nenhuma. Critério extra: o job `banco-api-e2e` do próprio #28 teve uma execução com falha de infraestrutura (porta 54322 já em uso, seção 6, classe A); aceitar a execução irmã verde no mesmo SHA. Risco residual: nenhum de produto (só testes e documentação).
- **Etapa 2, #22 (migração `production_void`).** Riscos: anulação de produção mexe no saldo e em `reverse_movement`. Critério extra: pgTAP completo (o PR traz 37 testes novos) e advisors de segurança sem problemas. A `main` passa a ter o #28 e a 7.2 sem a 7.3: confirmar na CI da `main`.
- **Etapa 3, #23.** Maior tela nova da Fase 7 (`ProductionPanel`). Critério extra: E2E de produção verde. Dependência: etapa 2.
- **Etapa 4, #24.** Risco de PDF e QR (a impressão física segue pendente e não é critério de merge; é critério de piloto). Critério extra: testes do PDF verdes.
- **Etapa 5, #25 (migração `production_portioning`).** Altera `pilot_metrics`. Critério extra: testes das métricas e do porcionamento.
- **Etapa 6, #26 (migração `establishment_settings`).** Decide quem pode registrar produção; a regra "igual ou menor" fica oculta (`PORTION_RULE_SELECTABLE=false`). Critério extra: `security_guard` e testes de papéis verdes.
- **Etapa 7, #27 (migração `preparation_window`).** Contém o #28 mesclado; conflito não esperado. Critério extra: o teste 26 de `handling_void` estável (rodar pgTAP duas vezes seguidas na CI ou localmente).
- **Etapas 8 e 9, #29 e #30.** Migrações de registro append-only (`production_label_downloads`, `production_temperatures`). Critério extra: a lista fixa de tabelas de histórico em `security_guard` e `assert_history_protected` inclui as novas (já testado).
- **Etapa 10, #31. Parada 1: fim da Fase 7.** Depois do merge, rodar na `main` a bateria completa: lint, tipos, formatação, Vitest, build, pgTAP, advisors, integração e E2E; conferir `FASE_07_ENCERRAMENTO.md` contra o estado real; relatar a luis antes de seguir. Nota: o relatório da Fase 7 diz que a `main` tem até a 7.1; atualizar essa frase no PR da etapa 18.
- **Etapa 11, #32 (V2).** A migração faz `alter role authenticator set pgrst.db_pre_request` e muda `has_membership` e `member_organizations`. Riscos: uma falha aqui bloqueia **todas** as leituras e escritas autenticadas; no Supabase hospedado a configuração do papel não foi testada (achado S-5). Critério extra: pgTAP de sessão (27 arquivos), integração de sessão e E2E `session.spec.mjs` verdes; revisar de novo `supabase/rollback/session_inactivity.sql`. Como a `main` não é implantada, o risco hospedado só aparece na fatia 8.4.
- **Etapa 12, #33 (V1).** Reorganiza a navegação; muitos E2E mudam de rota. Critério extra: E2E inteiro verde. **Parada 2:** conferir com luis antes das telas V3 a V5B.
- **Etapa 13, #34 (V3).** Contém a correção do teste 69. Depois do merge, **fechar o #35** com a nota "incorporado no #34", sem merge. Janela de exposição: entre as etapas 1 e 13, um teste pgTAP de manipulação pode falhar se a CI rodar entre 03:00 e 03:10 UTC (00:00 a 00:10 em São Paulo); evitar essa janela ou aceitar uma nova execução.
- **Etapa 14, #36.** Só documento.
- **Etapa 15, #37 (V4).** Contém o E2E `finishing.spec.mjs:138`, que falhou uma vez (seção 6, F). Critério: execução verde no SHA; a correção do teste é a fatia 8.1 e pode entrar depois, sem bloquear.
- **Etapas 16 e 17, #38 e #39 (V5 e V5B).** Mudança de regra de entrada (vírgula) e de exibição. Critério extra: testes de vírgula (Vitest 519 no total, integração `display-comma`, E2E `decimal-comma` e `display-comma`). Depois do #39 entrar, a bateria completa deve repetir os números de hoje (Vitest 519, pgTAP 1433, integração 51, E2E 35).
- **Etapa 18, #40 e este plano. Parada 3.** Depois do merge, reescrever o topo de `docs/IA_ESTADO.md` com uma única situação atual (achado A-4) e fechar a Fase 7/V1-V5B no registro.

### 4.5 Riscos da integração e mitigação

| Risco | Probabilidade / efeito | Mitigação |
|---|---|---|
| Commit novo em PR ou `main` invalida a previsão de conflitos | média; conflito inesperado | verificação 4.2, congelar a cadeia |
| Squash ou rebase por engano | baixa; conflitos em cascata | regra 3.2; proteção da `main` com "somente merge commit" permitida |
| CI instável trava o ritmo | já ocorreu (10 de 100 execuções recentes) | fatia 8.1; regra 3.6 |
| Migração V2 (`authenticator`) quebra o acesso | baixa na `main` (sem deploy); alta no hospedado | parada 2; teste em homologação na fatia 8.4 antes de qualquer produção |
| Árvore da `main` nas etapas 2 a 6 diferente da testada no PR | baixa (só o #28, que altera testes) | regra 3.5: CI da `main` obrigatória |
| Perda da trilha de revisão por PR | baixa | merge commit preserva commits e PRs; registrar cada etapa em `ia-tarefas` |
| Pessoa ou ferramenta externa empurra para a `main` durante a integração | baixa | proteção da `main` (0.2) |

## 5. Critério de aprovação de cada etapa (resumo para luis)

Para cada etapa luis recebe, antes do merge: PR e SHA, resultado da simulação de merge, link da execução verde da CI, arquivos e migrações da etapa, risco declarado, e o que a etapa deixa pendente. Depois do merge recebe: link da CI da `main` e confirmação de que a base do próximo PR foi mudada. Sem a autorização escrita dele na thread, nada é mesclado.

## 6. Investigação das instabilidades de CI e E2E (decisão 8)

### 6.1 O que foi analisado

As 100 execuções mais recentes da CI (14 a 16/11/2026): 90 verdes e 10 com falha, todas no job `banco-api-e2e` nos 9 logs que li (o job `quality` não aparece como falho nelas). Li o fim do log de cada uma das 10 (exceto a segunda execução do mesmo commit na classe C, que presumo igual por ser o mesmo commit e o mesmo minuto). Também há um fator estrutural: a CI roda duas vezes por commit (`on: push` e `on: pull_request`), então cada falha aparece em par com uma execução irmã que costuma passar.

### 6.2 Classificação

| Classe | O que falhou | Ocorrências | Causa | Situação |
|---|---|---|---|---|
| **A** | `supabase start` falha em ~30 s: `failed to bind host port 0.0.0.0:54322/tcp: address already in use` | 2 (14/11 20:52, PR #28; 21:45, PR #30) | Algo no executor já usa a porta 54322. **Causa exata não confirmada**; é infraestrutura, não código do produto | **Aberta.** Proposta 8.1 |
| **B** | pgTAP `handling_void.test.sql` teste 109 (teste 26 do bloco de propriedade) | 2 (14/11 17:15, push e PR do #26) | Escolha aleatória dependente da ordem física das linhas (UUIDs sorteados), como descrito em `TESTES_QUALIDADE.md` | **Resolvida na cadeia** pelo #28; chega à `main` na etapa 1 |
| **C** | pgTAP `container_handling.test.sql` teste 69 | 2 (16/11 03:04, push e PR do #34; log do PR não lido) | Teste dependente do horário: falha entre 00:00 e 00:10 em São Paulo | **Resolvida na cadeia** (#35, copiada no #34); chega à `main` na etapa 13 |
| **D** | Integração `handling-void.test.mjs`: "Operação local falhou (22023)" | 2 (14/11 16:30 e 16:41, pushes/PRs de #23 e #24) | **Não confirmada.** O auxiliar `checked()` descarta a mensagem do banco (`scripts/local-supabase.mjs:37-43`), então só vemos o código 22023 (regra de validade/forma). Não reapareceu nas execuções seguintes; a bateria de hoje passou (51) | **Aberta.** Proposta 8.1: registrar a mensagem e repetir 20 vezes |
| **E** | Integração com `deepStrictEqual` de contagens: obtido `[54, 59, 38]`, esperado `[54, 58, 37]` | 1 (14/11 21:32, push do #30) | **Não confirmada.** O trecho do log não identifica o arquivo; parece comparação de contagens vindas de dados de outro teste ou do relógio | **Aberta.** Proposta 8.1 |
| **F** | E2E `finishing.spec.mjs:138`: altura do `h1` 84,4 px, esperado ≤ 1 | 1 (16/11 21:14, PR #37) | **Hipótese forte, não reproduzida:** depois do `page.reload()` em tela de celular, o teste mede o título **antes** de a unidade reabrir. O CSS de V4 só esconde o título com `.workspace.unit-open` (`styles.css:933-945`); antes disso o título aparece (84 px é um título de duas linhas a 390 px). `boundingBox()` não espera. As linhas seguintes (`toContainText`) esperam, mas vêm depois da medição | **Aberta.** Correção de teste proposta, sem enfraquecer a regra |

Contagem: A 2 + B 2 + C 2 + D 2 + E 1 + F 1 = 10.

### 6.3 Propostas (fatia 8.1, estabilização da CI; exige aprovação)

1. **Classe A.** Antes de `npm run db:start`: passo de diagnóstico (`ss -ltnp` e `docker ps`), `npx supabase stop --no-backup` para limpar resto de execução anterior e uma nova tentativa automática (até 2) só do passo de subida do banco. Acompanhar se a classe A some. Sem esconder falha real de migração.
2. **Gatilho único.** Trocar `on: push` + `on: pull_request` por `pull_request` mais `push` apenas na `main`, com `concurrency` cancelando execução anterior do mesmo PR. Isso corta o custo pela metade e evita as execuções gêmeas.
3. **Classe D e E.** Fazer `checked()` incluir `error.message` e `error.hint` (dados sintéticos, sem dado pessoal) e rodar `handling-void.test.mjs` e a suíte de integração 20 vezes em laço para tentar reproduzir; identificar o arquivo da classe E.
4. **Classe F.** Em `finishing.spec.mjs`, esperar a unidade reabrir antes de medir (por exemplo, mover a medição para depois dos `expect` do cabeçalho, ou usar `expect.poll`), mantendo o limite de ≤ 1 px. Confirmar com 20 repetições do teste em tela de celular.
5. **Higiene geral.** Ações do GitHub por SHA, aviso de Node 20 resolvido, `--trace off` já usado. Registrar no `TESTES_QUALIDADE.md` as causas e correções (como já foi feito para B e C).
6. **Registro contínuo.** A cada falha de CI nova, anotar classe e causa em `TESTES_QUALIDADE.md`; revisar na etapa 18.

Critério de pronto da 8.1: 20 execuções consecutivas verdes de cada teste das classes D, E e F no mesmo ambiente de CI e nenhuma falha de classe A em 10 execuções seguidas da CI. Se a classe A persistir, a causa será investigada no executor antes de seguir.

## 7. Fase de preparação para produção e nomenclatura do roadmap

### 7.1 Conflito de nomes no roadmap

`docs/BACKLOG.md` define **F7 = "Fluxo E2E e piloto privado"** (critérios: E2E completo, revisão de segurança, auditoria, teste de impressão real) e **F8 = "futuro" (contagem, ficha técnica, CMV, pagamentos, ERP, IA)**. Na prática, a **Fase 7 foi usada para a preparação própria da cozinha** (fatias 7.1 a 7.9), e as melhorias de interface foram nomeadas V1 a V5B, fora da numeração. Os critérios originais de F7 ainda não foram cumpridos.

**Proposta de conciliação (a aprovar):**

| Linha do roadmap | Hoje | Proposta |
|---|---|---|
| F7 | "Fluxo E2E e piloto privado" | Renomear para "Preparação própria da cozinha (7.1 a 7.9), concluída, aguardando integração". Os critérios que sobram (E2E completo, revisão de segurança, auditoria, impressão real) migram para a Fase 8 |
| V1 a V5B | fora da numeração | Registrar como "Revisão de interface pós-Fase 7 (V1 a V5B), encerrada em 17/11/2026" |
| **F8 (nova)** | — | **Fase 8 — Preparação para produção e piloto operacional** (esta proposta) |
| F9 | era F8 "futuro" | Renumerar o futuro (contagem, ficha técnica, CMV, pagamentos, ERP, IA) para Fase 9, só com entrevistas e viabilidade |

Os arquivos seguiriam o padrão `docs/FASE_08_*.md`. A numeração das fatias seria 8.0, 8.1 etc. Nenhum arquivo de roadmap foi alterado por esta proposta.

### 7.2 Fase 8: fatias propostas

Cada fatia exige aprovação própria de luis, aceite próprio e bateria inteira verde, e não cria funcionalidade comercial nova.

| Fatia | Nome | Achados atendidos | Resumo | Depende de |
|---|---|---|---|---|
| **8.0** | Integração dos PRs (estratégia A) | C-1, A-4 | Seções 3 a 5 deste plano | decisão de luis |
| **8.1** | Estabilização da CI e do E2E | decisão 8, S-8 | Seção 6 | pode rodar antes da 8.0 |
| **8.2** | Reversões, backup e restauração | B-1, B-2, B-3 | Scripts de reversão das 7 migrações **apenas para ambientes sem dados reais** (bloqueados com guarda explícita em ambiente com dados: recusam se houver linhas nas tabelas de histórico); procedimento de **recuperação por backup e restauração** como único caminho com dados; função `check_balances` somente leitura; backup diário e **teste de restauração documentado** em homologação; retenção definida com orientação jurídica e sanitária (Q10) | 8.0; projeto de homologação (8.4) para o teste de restauração |
| **8.3** | Nome de exibição de até 80 caracteres | B-4 | Migração que amplia a restrição de 40 para 80, preservando registros históricos (as cópias do nome já gravadas não mudam); verificação do impacto nas etiquetas PDF (quebra de linha e tamanho de letra no nome de quem manipulou/produziu, tela e papel 100 × 100 mm), nos cartões e no histórico; testes de limite (80 aceito, 81 recusado) | 8.0 |
| **8.4** | Configuração hospedada e homologação | S-2, S-3, S-4, S-5, S-6, I-2, D-5 | Modo `hosted` do aplicativo (URL `https` do projeto; build de produção que recusa `demo`); CSP e cabeçalhos no Cloudflare Pages; procedimento de provisionamento hospedado; aplicar migrações na homologação e validar a guarda de sessão (`db_pre_request`); conferir senha/e-mail/limites; repetir `security_guard`, RLS e integração contra a homologação; verificação de disponibilidade e registro de erros sem dado pessoal | 8.0 e contratação autorizada por luis |
| **8.5** | MFA obrigatório para proprietários | S-1 | Cadastro e verificação de fator TOTP, exigência de nível `aal2` nas funções do proprietário e testes de negação; recuperação de acesso definida; depende do plano do provedor | 8.4 (homologação) |
| **8.6** | Desempenho | D-1, D-2 | Divisão do pacote por área; medição e, se preciso, índice para a busca de `list_containers` com volume simulado | 8.0 |
| **8.7** | Revisão independente de segurança | decisão de luis | Revisão por pessoa ou equipe independente de quem escreveu o código, sobre o código, o banco, a configuração hospedada e o fluxo de MFA, antes do piloto; achados tratados e reverificados | 8.2 a 8.5 |
| **8.8** | Porta de entrada do piloto | seção 11 da revisão | Lista final: Q10 (nutricionista RT), teste físico de impressão e QR em celulares, dados sintéticos de homologação, treinamento, plano de volta ao papel; aceite de luis | todas |

Ordem sugerida: **8.1 → 8.0 → 8.3 → 8.4 → 8.2 (teste de restauração na homologação) → 8.5 → 8.6 → 8.7 → 8.8.** A 8.1 antes da 8.0 porque a integração é longa e a CI instável custa tempo.

### 7.3 Achados priorizados e para onde vão

| Achado | Fatia | Achado | Fatia |
|---|---|---|---|
| S-1 MFA | 8.5 | B-1 reversões | 8.2 |
| S-2 CSP | 8.4 | B-2 backup e retenção | 8.2 (+ jurídico) |
| S-3 modo hospedado | 8.4 | B-3 conferência de saldo | 8.2 |
| S-4 provisionamento | 8.4 | B-4 nome 80 caracteres | 8.3 |
| S-5 guarda de sessão | 8.4 | D-1 pacote | 8.6 |
| S-6 senha e e-mail | 8.4 | D-2 busca | 8.6 |
| I-2 isolamento hospedado | 8.4 | D-5 monitoramento | 8.4 |
| C-1 integração em cadeia | 8.0 | | |

**Backlog (sem iniciar):** S-7, S-8 (parte não coberta pela 8.1), S-9, I-1 (revisão cruzada entra na 8.7), I-3, B-5, B-6, D-3, D-4, A-1 a A-5, R-1 a R-5. Nenhuma funcionalidade comercial nova é iniciada.

### 7.4 Notas sobre as fatias que envolvem decisão de produto

- **8.2, reversão sem destruir dados.** Os scripts de reversão são ferramentas de desenvolvimento e homologação; ao rodar, verificam se alguma tabela de histórico tem linhas e recusam. Com dados reais, a saída é restaurar um backup anterior. O histórico continua append-only (nenhum script suspende os gatilhos de proteção).
- **8.3, impacto nas etiquetas.** Hoje o limite de 40 vem de `memberships_display_name_check` (`20261113070000_container_handling.sql:40`). Nomes mais longos podem não caber em uma linha da etiqueta de 100 × 100 mm; o teste de PDF com nome de 80 caracteres define se haverá quebra de linha ou corte (o PDF já recusa texto que não cabe, em vez de imprimir cortado).
- **8.5, MFA.** Depende do plano do provedor; a decisão de contratar não está tomada. Sem MFA aprovado no plano, a alternativa é o risco aceito por escrito, e isso é decisão de luis, não minha.

## 8. Hospedagem: Cloudflare Pages + Supabase (proposta)

Nada foi criado nem contratado. Esta seção só descreve a configuração que, se luis autorizar, as fatias 8.4 e 8.2 aplicam.

| Tema | Proposta |
|---|---|
| Front-end | Cloudflare Pages, build estático do Vite, HTTPS, domínio próprio por ambiente. Cabeçalhos de segurança (CSP restritiva, HSTS, `frame-ancestors 'none'`, `Referrer-Policy`, `X-Content-Type-Options`) definidos no projeto de Pages. Variáveis de build só com URL e chave **publicável**. |
| Banco e autenticação | Supabase, **banco preferencialmente na região de São Paulo** (menor latência e coerência com a orientação jurídica de LGPD). Conferir no painel que a região existe para o plano contratado. |
| Separação | **Dois projetos Supabase e dois projetos Pages**, sem compartilhar chaves, domínios, variáveis, usuários nem dados. Homologação só com dados sintéticos; produção só depois do aceite da 8.8. |
| Migrações | Aplicadas por `supabase db push` primeiro na homologação, com pgTAP e advisors; depois na produção, por pessoa autorizada e com registro. Nenhuma migração aplicada direto na produção sem passar pela homologação. |
| Chaves | A chave secreta (service) nunca vai ao navegador, ao repositório nem ao Pages. Provisionamento de empresa e usuários fora do navegador, por administrador. |
| Backup | Backup diário como **mínimo**; recuperação em ponto no tempo se o plano permitir. Teste de restauração documentado em homologação (restaurar um backup, rodar pgTAP e conferir o saldo com `check_balances`). Retenção só depois da orientação jurídica e sanitária. |
| Observabilidade | Verificação de disponibilidade e registro de erros do navegador **sem dado pessoal**; logs da plataforma com acesso restrito. |
| Custos e plano | Conferir no site de cada provedor os limites do plano e se MFA, backup diário e recuperação em ponto no tempo estão incluídos, antes de contratar. Não afirmei valores. |

Contratar qualquer serviço, criar projeto, registrar domínio ou gerar chave exige autorização específica de luis.

## 9. O que este plano não faz e o que preciso de luis

Não executa merge, deploy, contratação, mudança de configuração do GitHub nem implementação de fatia; não alterou `BACKLOG.md` nem qualquer arquivo de código. Os merges da simulação foram feitos em uma cópia local descartável e não foram enviados.

**Decisões pedidas:**

1. Aprovar este plano (ordem da seção 4, regras da seção 3) ou indicar mudanças.
2. Aprovar a conciliação de nomenclatura da seção 7.1 (Fase 8 nova e renumeração do futuro para Fase 9).
3. Dizer se a fatia **8.1 (estabilização da CI)** pode rodar antes da 8.0 e se a **proteção da `main`** (0.2) pode ser configurada.
4. Autorizar, por escrito, a **etapa 1 (#28)** e os lotes seguintes que queira liberar.
5. Confirmar que o #35 será fechado sem merge depois da etapa 13.
