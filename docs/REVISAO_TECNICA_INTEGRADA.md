# Revisão técnica integrada do sistema (17/11/2026)

**Estado: relatório de análise, aguardando decisão de luis.** Pedida por luis em 17/11/2026, 13:17 UTC, ao encerrar a etapa de melhorias de interface V1 a V5B. **Nenhuma correção, funcionalidade, migração, merge ou deploy foi feito por esta revisão.** Cada proposta abaixo exige aprovação própria de luis antes de virar trabalho.

**Limites do que este documento afirma.** Nada aqui declara conformidade sanitária ou legal; a conferência normativa por nutricionista responsável técnico (Q10) segue pendente e sem profissional escolhido. A revisão leu o código e a documentação do repositório (público: não contém dados do estabelecimento piloto) e rodou a bateria existente; não houve teste em aparelho físico, impressora, ambiente hospedado nem com pessoas da cozinha.

## 1. Resumo executivo

O núcleo do sistema está sólido e bem testado: isolamento entre empresas no banco (RLS, funções com `search_path` vazio, histórico append-only, guarda de catálogo em pgTAP), rastreabilidade por registros imutáveis com autoria e identificadores de tentativa, e sessão com inatividade de 30 minutos decidida no servidor. A bateria local passou inteira. **Não encontrei falha de isolamento entre empresas nem vulnerabilidade de dependência.**

O que impede o piloto operacional não é defeito de código, e sim falta de **ambiente e decisão**:

1. **Nada foi hospedado nem testado fora do Supabase local.** O aplicativo recusa, por código, qualquer URL que não seja `127.0.0.1:54321` (`src/shared/config/environment.ts:7`), e um build sem variáveis vira "demonstração" em silêncio (`environment.ts:18`). Faltam homologação, cabeçalhos de segurança (CSP), provisionamento hospedado e teste da guarda de sessão na plataforma.
2. **Backup, retenção e restauração não existem** (nem política nem teste), e há **7 migrações sem script de reversão**.
3. **MFA do proprietário não foi implementado** (decisão de luis pendente) e a conferência da nutricionista (Q10), o teste físico de impressão e o limite de 40 caracteres do nome continuam abertos.
4. **A `main` está 15 PRs atrás** (parou na 7.1; a cadeia #22 a #39 soma 237 arquivos e cerca de 19 mil linhas). Integrar em etapas, com CI na `main` a cada passo, é o maior risco de execução.

Totais: 0 críticos, 4 altos, 15 médios, 11 baixos e 4 informativos (tabela da seção 12). Ordem sugerida: decidir a estratégia de integração (seção 9), montar a homologação (seção 10) e só então fechar a lista de bloqueios do piloto (seção 11).

## 2. O que foi verificado e como

Branch `claude/revisao-v5b-exibicao-virgula` (ponta da cadeia, PR #39), sobre a qual esta revisão foi escrita. Banco e testes rodados em contêiner descartável na nuvem (Node 22 no contêiner; o projeto pede Node 24, o que não alterou os resultados observados).

| Verificação | Resultado hoje |
|---|---|
| `npm run lint` | passou, 0 avisos |
| `npm run typecheck` | passou |
| `npm run format:check` | passou |
| `npm run test` (Vitest) | 51 arquivos, **519 testes passaram** |
| `npm run build` | passou; aviso de bloco acima de 500 kB (ver D-1) |
| `supabase test db` (pgTAP) | 27 arquivos, **1433 testes passaram** |
| `supabase db advisors --type security --level warn` | **nenhum problema** |
| `npm run test:integration` | **51 passaram**, 0 falhas |
| `npm audit` (com e sem dev) | **0 vulnerabilidades** |
| Playwright (E2E) | **não rodei** neste contêiner; a CI do PR #39 está verde e a última rodada registrada na V5B foi de 35 testes |
| Aparelho físico, impressão, QR por câmera, ambiente hospedado | **não verificados** |

As únicas mudanças feitas nesta tarefa, a pedido de luis, foram a correção de redação da V5B (commit `4cae398` na branch do PR #39: `toFixed(3)` arredonda e não trunca; comportamento do código inalterado) e o registro do aceite da D-064.

## 3. Segurança

**Pontos fortes verificados** (evidência em `supabase/tests/security_guard.test.sql` e nas migrações): toda tabela de `public` tem RLS; `anon` não tem privilégio de tabela nem executa função de `public`/`private`; `authenticated` não tem DELETE/TRUNCATE; histórico e vínculos só mudam por funções autorizadas; nenhuma função `SECURITY DEFINER` em `public`; todas as de `private` fixam `search_path` vazio; `service_role` só lê o histórico; gatilhos recusam UPDATE, DELETE e TRUNCATE nas tabelas de histórico até para `service_role`. Escrita de produção, anulação, configuração e decisão exige proprietário ativo (`private.has_membership(..., true)`), e o banco ignora qualquer organização enviada pelo navegador que não seja do usuário. Não há segredo versionado (a busca por chaves só acha o código que lê as chaves do Supabase local, em `scripts/local-supabase.mjs`).

| ID | Severidade | Achado | Evidência | Solução proposta |
|---|---|---|---|---|
| S-1 | **Alta** | **MFA do proprietário não existe.** O TOTP está desligado no arquivo local e, no exemplo de produção, só liga a inscrição; tornar obrigatório exige código novo (tela de cadastro do fator e exigência de nível `aal2` nas funções do proprietário). O recurso depende do plano pago do Supabase. | `supabase/config.toml:301-308`; `docs/PRE_PILOTO.md` seção 2 (I-16) | Decisão de luis: (a) implementar MFA obrigatório para proprietário antes do piloto (fatia própria: cadastro do fator + `aal2` em `has_membership(...,true)` + testes de negação); ou (b) adiar com risco aceito por escrito, mitigado por senha de 12+ caracteres, limites de tentativa baixos e e-mail confirmado. Recomendo (a) se o proprietário usar o sistema fora da cozinha. |
| S-2 | **Alta** (antes de hospedar) | **Sem CSP nem cabeçalhos de segurança, com token em `localStorage`.** Um script injetado leria o token. Hoje não há `dangerouslySetInnerHTML`, `innerHTML` nem `eval` no `src` (verificado por busca), o que reduz o risco, mas a defesa em profundidade não existe. A V2 já lista a revisão de XSS/CSP como item pré-deploy. | `docs/V2_SESSAO.md` (checklist e limitação 1); nenhum arquivo de cabeçalhos no repositório; `index.html` | Definir no host: CSP restritiva (`default-src 'self'`; `connect-src` só o domínio do projeto Supabase; sem `unsafe-inline` de script), `frame-ancestors 'none'`, HSTS, `Referrer-Policy`, `X-Content-Type-Options`. Testar PDF/QR e as telas com a CSP ligada em homologação. |
| S-3 | Média | **O build não distingue produção de demonstração.** A URL aceita é um literal local; sem variáveis, o modo vira `demo` sem erro, e o título da página é "Demonstração". Um deploy mal configurado mostraria uma tela de demonstração com dados fictícios como se fosse o sistema. | `src/shared/config/environment.ts:7,18`; `index.html:7` | Criar um modo `hosted` (fatia própria): URL `https` validada contra o domínio da homologação/produção, build de produção que **falha** se o modo for `demo`, título neutro. Manter `local` para desenvolvimento. |
| S-4 | Média | **Provisionamento hospedado não existe.** `scripts/provision.mjs` só roda no Supabase local e usa a chave de serviço. No hospedado, quem cria empresa, unidades, proprietário e membros? | `docs/PRE_PILOTO.md` seção 1 | Definir procedimento executado fora do navegador, por pessoa autorizada: convite pelo painel do Auth + script SQL revisado para empresa/unidade/vínculo, com a chave secreta apenas na máquina do administrador e senha temporária trocada no primeiro acesso. Documentar e testar em homologação. |
| S-5 | Média | **A guarda de sessão depende de `alter role authenticator set pgrst.db_pre_request`.** Não foi testado fora do local. Se a plataforma hospedada não aceitar, a recusa de requisições de sessão parada cai para as funções `has_membership` e `member_organizations` (que continuam protegendo RLS e escritas), mas deixa de valer "antes de toda requisição". | `supabase/migrations/20261116000000_session_inactivity.sql:143`; `docs/V2_SESSAO.md` limitação 8 | Validar em homologação: aplicar a migração, repetir pgTAP e os testes de sessão, confirmar 401 `SESSION_EXPIRED` com sessão parada. Se a plataforma recusar, registrar a decisão e manter o desenho das funções como barreira. |
| S-6 | Média | **Política de senha e confirmação de e-mail só valem se aplicadas à mão no projeto hospedado.** Local: mínimo de 6 caracteres, sem confirmação. O exemplo de produção (12 caracteres, símbolos, confirmação) é protegido por teste, mas a proteção contra senhas vazadas é só manual. | `supabase/config.toml:183,228,230`; `supabase/production/auth.example.toml:10-15`; `src/compliance/productionAuth.test.ts` | Checklist de homologação com conferência item a item e captura (sem dado pessoal) das configurações aplicadas; repetir antes do piloto. |
| S-7 | Baixa | **Limitações de sessão já documentadas e aceitas:** token sem `session_id` só vem da chave secreta; o Auth ainda renova o JWT de sessão parada (a API recusa); aparelho compartilhado sem PIN; sem limpeza periódica de `auth.sessions`. | `docs/V2_SESSAO.md` limitações 1 a 9 | Manter. Reavaliar PIN/troca rápida só se o piloto mostrar necessidade. Limpeza periódica em B-5. |
| S-8 | Baixa | **Cadeia de suprimentos e CI:** ações do GitHub fixadas por tag (`@v4`), sem Dependabot, sem varredura de segredos, sem `npm audit` na CI; o próprio GitHub avisa que Node 20 das ações está obsoleto. Hoje há 0 vulnerabilidades. | `.github/workflows/quality.yml`; `.github` não tem `dependabot.yml` | Fixar ações por SHA, ligar Dependabot e a varredura de segredos do GitHub, acrescentar `npm audit --omit=dev` como etapa informativa. |
| S-9 | Baixa | **Resíduo no controle de acesso por convenção:** a garantia de que toda função de escrita chama `has_membership` é conferida por testes de matriz de papéis (`security_guard`, parte 2), mas não por um teste de catálogo que falhe quando uma função futura `SECURITY DEFINER` concedida a `authenticated` não a chame. | `supabase/tests/security_guard.test.sql` (partes 1 e 2) | Teste de catálogo que leia o corpo das funções `private` concedidas a `authenticated` e exija `has_membership`/`member_organizations` (lista de exceções explícita, como `touch_session`). |

## 4. Permissões e isolamento entre empresas (RLS)

Verificado: o isolamento é decidido no banco (`private.member_organizations()` e `private.has_membership()`), agora também condicionado à sessão ativa (V2). As políticas usam o conjunto de empresas do usuário (`organization_id in (select private.member_organizations())`, RLS "por conjunto", D-035) e existe benchmark em `supabase/benchmarks/rls_set_based.sql`. Os testes cobrem leitura cruzada, inserção falsa, mistura de empresa e vínculo revogado (`security_guard`, `establishments`, `rls_set_based` e outros). No piloto só o proprietário escreve (decisão de luis em 12/11/2026); o colaborador lê.

| ID | Severidade | Achado | Evidência | Solução proposta |
|---|---|---|---|---|
| I-1 | Info | **Nenhuma falha de isolamento encontrada** na revisão de código, no catálogo e nos 1433 testes pgTAP + 51 de integração. | seção 2 | Manter os testes como gate. Rodar uma revisão cruzada independente das fatias 7.2 a V2 antes do piloto (a última foi na Fase 6). |
| I-2 | Média | **Isolamento nunca exercitado em ambiente hospedado.** Os papéis, os privilégios padrão do Supabase e a chave publicável do projeto real podem diferir do local. | todo o histórico de testes é local | Em homologação, repetir `security_guard`, `rls_set_based` e a integração com duas empresas de teste e o `advisors` contra o projeto hospedado. |
| I-3 | Baixa | Ver S-9: garantia de `has_membership` em funções futuras por convenção. | — | Ver S-9. |

## 5. Integridade do banco

Verificado: 29 migrações reproduzíveis do zero (o `supabase db start` aplicou todas e o pgTAP passou); restrições de quantidade (até 3 casas, máximo de 1 bilhão), datas, unidade inteira, unicidade de identificador de tentativa (replay compara todos os campos), índices únicos que impedem duplo desfazimento, saldo por recipiente mantido por gatilhos e verificado por teste de propriedade com 250 passos aleatórios e semente fixa.

| ID | Severidade | Achado | Evidência | Solução proposta |
|---|---|---|---|---|
| B-1 | **Alta** | **Sete migrações não têm script de reversão** em `supabase/rollback/`: `kitchen_production`, `production_void`, `production_portioning`, `establishment_settings`, `preparation_window`, `production_label`, `production_temperature` (as 22 anteriores e a de sessão têm). O AGENTS pede migrações reversíveis quando aplicável. Como o histórico é append-only, a reversão com dados é limitada. | comparação de `supabase/migrations/` com `supabase/rollback/` | Escrever os 7 scripts e testá-los (padrão da 03B: reverter, reaplicar, rodar pgTAP) **ou** declarar por escrito que, depois de dados reais, a recuperação é restauração de backup, e testar essa restauração (B-2). Decisão de luis. |
| B-2 | **Alta** | **Retenção, backup e restauração indefinidos.** Não há prazo, local, responsável nem teste de restauração; o histórico imutável impede apagar. Depende de orientação jurídica/sanitária (Q10). | `docs/PRE_PILOTO.md` seção 3; `docs/RISCOS.md` | Antes do piloto: definir RPO/RTO aceitáveis; contratar plano com backup diário e, se possível, recuperação em ponto no tempo; fazer **um teste de restauração documentado** em homologação; registrar prazo de retenção só após orientação jurídica. |
| B-3 | Média | **Saldo (`container_balances`) é dado derivado mantido por gatilhos.** Está coberto por teste de propriedade, mas não há rotina de conferência em produção para detectar divergência entre saldo guardado e histórico. | `supabase/migrations/20261113060000_list_containers.sql`; `handling_void.test.sql` (teste 26) | Função somente leitura (`check_balances`) que recalcule o saldo a partir do histórico por unidade, rodada sob demanda e semanalmente no piloto, com alerta se houver diferença. |
| B-4 | Média | **Nome de exibição copiado em registros imutáveis (dado pessoal) e limite de 40 caracteres.** A decisão "nome completo" não ampliou o limite; nomes reais podem não caber. Pedido de exclusão não é automatizável sem tocar no histórico. | `docs/PRE_PILOTO.md` seção 3; `docs/FASE_07_ENCERRAMENTO.md:45`; `supabase/migrations/20261113070000_container_handling.sql:40` | luis decide: ampliar (por exemplo, 80) com migração e teste, **ou** manter nome curto; e, com apoio jurídico, escolher entre manter o nome como parte do registro (informando a pessoa) ou um procedimento controlado de reescrita. |
| B-5 | Baixa | **Limpeza de sessões:** `private.session_activity` só é podada ao tocar, por usuário; `auth.sessions` não é podada. Cresce devagar, sem impacto no piloto. | `20261116000000_session_inactivity.sql` (`touch_session`); `docs/V2_SESSAO.md` limitação 4 | Rotina periódica (por exemplo `pg_cron`, se disponível no plano) para apagar sessões e atividades antigas. |
| B-6 | Info | `entity_changes` audita mudanças de nome, fuso, local e configurações; o histórico operacional é auditado pelas próprias tabelas append-only (sem duplicidade). | migrações `timezone_immutable_audit`, `establishment_settings`, `preparation_window` | Nenhuma ação. |

## 6. Desempenho

Sem teste de carga e sem medição em aparelho real. Para um piloto de um restaurante, nada observado é bloqueante.

| ID | Severidade | Achado | Evidência | Solução proposta |
|---|---|---|---|---|
| D-1 | Média | **O pacote principal tem cerca de 712 kB** (mais um bloco de PDF de 428 kB e outro de 199 kB). Em celular na rede da cozinha, a primeira carga pode ser lenta. O build já avisa. | saída de `npm run build`; `dist/assets/` | Dividir por área (carregamento sob demanda das telas de produção, etiqueta e movimentações) e medir em 4G simulado. Só com aprovação. |
| D-2 | Média | **Busca em `list_containers` não aplica o limite antes das junções** (com busca, o filtro precisa do nome do produto; o limite só vem no fim) e compara texto do ID do recipiente com `like`. Funciona nas escalas de teste; com milhares de recipientes por unidade, tende a degradar. | `supabase/migrations/20261113060000_list_containers.sql:183-213` | Medir com volume simulado (dezenas de milhares de recipientes). Se necessário: índice de trigramas nos campos pesquisados e busca do ID só por valor completo. |
| D-3 | Baixa | **A guarda de sessão consulta `auth.sessions` e `session_activity` a cada requisição e de novo em cada função de vínculo.** São buscas por chave primária; o custo é pequeno, mas não foi medido. O benchmark existente não cobre a sessão. | `session_inactivity.sql`; `supabase/benchmarks/rls_set_based.sql` | Acrescentar a sessão ao benchmark; se medir relevante, guardar o resultado por transação. |
| D-4 | Baixa | **A suíte de testes leva cerca de 37 s** (51 criações do ambiente jsdom). | saída do Vitest | Opcional: reduzir o custo do ambiente. Sem urgência. |
| D-5 | Média | **Sem monitoramento nem medição de tempo de resposta em uso real.** | não há observabilidade no repositório | Definir, na homologação, verificação de disponibilidade e registro de erros **sem dados pessoais** (ver seção 10). |

## 7. Arquitetura e qualidade do código

Monólito modular React + TypeScript estrito + Supabase, separação por feature (`ui / application / domain / data`), validação com Zod nas fronteiras, e regra única de formatação de quantidade e temperatura (V5/V5B). Lint, tipos e formatação sem avisos; 519 testes de unidade/componente.

| ID | Severidade | Achado | Evidência | Solução proposta |
|---|---|---|---|---|
| A-1 | Média | **Componentes grandes** contra a regra de evitar arquivos enormes: `BatchPanel.tsx` (1236 linhas), `HandlingForm.tsx` (880), `ProductionPanel.tsx` (833), `MovementPanel.tsx` (596), `IdentityHome.tsx` (584). Aumentam o custo de manutenção e de teste. | contagem de linhas em `src/features` | Dividir por responsabilidade (formulário, revisão, resultado, tentativa pendente) **depois** do piloto ou em fatia própria, sem mudar comportamento e com os mesmos testes. |
| A-2 | Baixa | **Mesmo padrão de "identificador de tentativa" repetido** em `MovementPanel`, `ProductionPanel` e `HandlingForm` (leitura/escrita em `sessionStorage` com `crypto.randomUUID()`). | `MovementPanel.tsx:109-300`, `ProductionPanel.tsx:209-217`, `HandlingForm.tsx:216` | Extrair um gancho compartilhado quando uma dessas telas for tocada de novo. |
| A-3 | Baixa | **Sem medição de cobertura** (`test:coverage` existe, mas não há meta nem gate). | `package.json` | Medir uma vez para conhecer o ponto de partida; decidir meta só se luis quiser. |
| A-4 | Baixa | **Documentação de estado em várias fotografias.** `docs/IA_ESTADO.md` mantém "situações verificadas" de 10 e 13/11 que já não descrevem a `main`. | `docs/IA_ESTADO.md` | Após a integração, reescrever o topo do índice com uma única situação atual. |
| A-5 | Info | Zero dependências vulneráveis; versões fixadas por lockfile; sem micro-serviços nem filas, como pede o AGENTS. | `npm audit` | Nenhuma ação. |

## 8. Rastreabilidade e auditoria

Verificado: recebimento, movimentação, manipulação, produção, ocorrência, decisão, mudança de local e anulação são registros append-only com autoria (`created_by`), horário do servidor e fuso da unidade; validade informada por pessoa, com origem (`original` ou `responsible`); reimprimir etiqueta não gera movimento; anulações são novos registros e não apagam o original; o QR leva só URL e ID do recipiente.

| ID | Severidade | Achado | Evidência | Solução proposta |
|---|---|---|---|---|
| R-1 | Média | **Registro de download/impressão de etiqueta é parcial.** Só o download pela tela de Produção é gravado; o da página do QR e o das etiquetas de recebimento e produto aberto não. O aviso "sem download de etiqueta registrado" só aparece na Produção. | `docs/BACKLOG.md` (melhorias futuras, 7.8) | Já é pedido de luis para avaliar no piloto: registrar em todas as telas autorizadas, sem enfraquecer o acesso. Fatia própria. |
| R-2 | Média | **Recusas não são gravadas** (prazo recusado, tentativa de "congelar para prorrogar", etiqueta feita à mão). A observação do piloto depende de contagem manual em papel. | `docs/PRE_PILOTO.md` seção 4 | Manter a contagem manual no início; se o piloto mostrar que importa, gravar recusas em fatia própria. |
| R-3 | Média | **Medição de temperatura registrada errada não pode ser invalidada** (fica no histórico e se registra outra). | `docs/BACKLOG.md` (7.9) | Já listado como melhoria futura (registro append-only de invalidação com motivo). Decidir se entra antes do piloto. |
| R-4 | Baixa | **Sem registro de leitura** (quem consultou o quê) e sem log de aplicação. Não é exigência do piloto, mas dificulta investigar acesso indevido. | — | Usar os logs da plataforma (API/Auth) em homologação e produção; definir quem os acessa e por quanto tempo. |
| R-5 | Info | Idempotência: replay com o mesmo identificador devolve o mesmo resultado; com dados diferentes, recusa (`23505`). | `register_production` e demais funções | Nenhuma ação. |

## 9. Funcionalidades implementadas e ordem de integração dos PRs

### 9.1 Funcionalidades (na ponta da cadeia, todas aceitas por luis fatia a fatia)

Empresas, unidades e papéis; catálogo por unidade; recebimento com validade informada, conservação, temperatura e ocorrências; recipientes e etiqueta PDF com QR; saldo por recipiente; abrir, porcionar e anular; consumo, descarte e desfazer; locais e mudança de local; recuperação de tentativa; vencido recusado; métricas do piloto; preparação própria (produção, anulação, porcionamento, etiqueta, janela, temperatura opcional, aviso de etiqueta); V1 navegação por áreas; V2 sessão persistente de 30 min; V3 lista de validade em cartões; V4 acabamento; V5 e V5B vírgula decimal. Restrições registradas: regra "igual ou menor" de porção oculta até a RT; limites e faixas não são aprovação sanitária.

### 9.2 Estado real dos PRs (consultado no GitHub em 17/11/2026)

A `main` está em `2d54b51` (merge do PR #21, 14/11). Todos os demais PRs abertos são rascunhos:

| Grupo | PRs (base → ponta) | CI | Observação |
|---|---|---|---|
| Independentes da cadeia | #28 (testes pgTAP instáveis) e #35 (teste 69 perto da meia-noite), ambos sobre `main` | #28: uma rodada falhou e a irmã passou; #35 verde | As duas correções **já estão dentro da cadeia** (verifiquei `LF-78`, `prop_movs` e `p_handled_at=>now()` na ponta). |
| Cadeia empilhada | #22 (7.2, base `main`) → #23 → #24 → #25 → #26 → #27 → #29 → #30 → #31 → #32 (V2) → #33 (V1) → #34 (V3) → #36 (V4 proposta) → #37 (V4) → #38 (V5) → #39 (V5B) | #30 e #37 mostram uma rodada falhando e a irmã passando | `mergeable_state` de #22 limpo; #28 "unstable" pela rodada falha. |

As rodadas que falharam (`banco-api-e2e` em #28, #30 e #37) duraram cerca de 30 s, contra 3 a 4 min das que passaram para o mesmo commit; o fim do log mostra só limpeza e o aviso de Node 20 das ações, então **a causa não foi confirmada**. Aqui, no contêiner, a subida do banco falhou várias vezes com 403 ao baixar imagens e funcionou ao repetir, o que é compatível com falha de infraestrutura. A CI roda duas vezes por commit (`on: push` e `on: pull_request`), o que dobra o custo e produz esses pares.

Mudanças que a cadeia traz em relação à `main`: 237 arquivos, +19.037/−977 linhas; 7 migrações novas (`production_void`, `production_portioning`, `establishment_settings`, `preparation_window`, `production_label`, `production_temperature`, `session_inactivity`); cerca de 86 arquivos em `src`.

### 9.3 Ordem recomendada

Conflitos esperados (não executei os merges): somente nos documentos compartilhados (`docs/IA_ESTADO.md`, `docs/TESTES_QUALIDADE.md`, `docs/DECISOES.md`), que cada PR altera; as duas correções de teste já estão na cadeia, então #28 e #35 devem entrar primeiro para não gerar divergência.

**Opção A (recomendada): integrar em etapas, de baixo para cima, com CI na `main` a cada etapa.**

1. Reexecutar a CI das rodadas que falharam (#28, #30, #37) e confirmar verde.
2. **#28** e **#35** (pequenos; só testes e documentação). Conciliar `TESTES_QUALIDADE.md` mantendo as duas seções.
3. **#22** (7.2, base `main`), depois **#23, #24, #25, #26, #27, #29, #30**, um por vez; após cada merge, a base do próximo muda para `main` e a CI roda de novo.
4. **#31** (relatório visual) e **#32** (V2, migração de sessão). Parar aqui e rodar a homologação (seção 10) antes de seguir: V2 é a migração de maior risco hospedado (S-5).
5. **#33** (V1), **#34** (V3), **#36** (proposta V4 — só documento), **#37** (V4), **#38** (V5), **#39** (V5B).
6. Ao final, na `main`: bateria inteira (lint, tipos, Vitest, build, pgTAP, advisors, integração, E2E), `supabase db reset` do zero e reescrita do topo de `IA_ESTADO.md` (A-4).

**Opção B: integrar a ponta de uma vez** (merge da branch do PR #39 na `main`, fechando os intermediários). Menos etapas e menos conflitos de documento, mas perde a revisão e o ponto de retorno por fatia, e uma falha só aparece no conjunto. Não recomendo para um produto com dados de alimentos.

Em qualquer opção: nenhum merge sem autorização escrita de luis na thread.

## 10. Hospedagem e ambiente de homologação

Nada disso foi feito; esta seção é o plano proposto, para decisão. Nenhum deploy, projeto, domínio ou chave foi criado.

| Item | Proposta | Observação |
|---|---|---|
| Projetos | Dois projetos Supabase separados: **homologação** e **produção**; nunca compartilhar chaves nem dados. Homologação só com dados sintéticos. | Região de menor latência para o Brasil e coerente com a orientação jurídica de LGPD. |
| Banco | Aplicar as migrações pela CLI (`supabase db push`) primeiro na homologação, rodar pgTAP e advisors, e só então na produção. | Fluxo manual com aprovação de luis; sem aplicar do computador de ninguém sem registro. |
| Autenticação | Aplicar `supabase/production/auth.example.toml`; confirmar item a item a lista da seção 2 de `PRE_PILOTO.md`. | Ver S-1, S-5, S-6. |
| Front-end | Hospedagem estática com HTTPS, cabeçalhos e CSP (S-2), build de produção que recusa modo `demo` (S-3), variáveis só com URL e chave **publicável**. A chave secreta nunca vai ao navegador nem ao repositório. | Escolha do provedor é decisão de luis; qualquer um serve se aplicar os cabeçalhos. |
| Provisionamento | Procedimento da S-4, testado primeiro na homologação. | — |
| Observabilidade | Verificação de disponibilidade e registro de erros do navegador **sem dado pessoal**; logs da plataforma com acesso restrito. | R-4, D-5. |
| Backup | B-2 antes de qualquer dado real. | — |
| Testes em homologação | pgTAP e integração contra o projeto hospedado; E2E contra a URL de homologação; teste em dois celulares reais (iOS e Android) com leitura de QR; teste de impressão física. | Os testes automáticos atuais assumem o Supabase local descartável; adaptá-los é trabalho a aprovar. |
| Custos e plano | Conferir limites do plano (MFA e recuperação em ponto no tempo costumam exigir plano pago; projetos gratuitos podem ser pausados por inatividade). | Verificar no site do provedor antes de decidir; não afirmei valores. |

## 11. Checklist antes do piloto operacional

Marcas: ☐ pendente · ☑ feito e verificado. Itens "decisão" dependem só de luis. Nada abaixo está marcado como concluído por esta revisão, exceto o que a seção 2 verificou.

**Decisão e conformidade**
- ☐ Escolher o nutricionista responsável técnico e fazer a **conferência normativa (Q10)**, incluindo as perguntas da seção 10 do desenho da Fase 7. Até lá, nenhum texto do sistema afirma conformidade.
- ☐ Decidir a regra "igual ou menor" de porção (oculta por `PORTION_RULE_SELECTABLE=false`) com a RT.
- ☐ Decidir o limite do **nome de exibição** (40 hoje) e o tratamento de dado pessoal em registros imutáveis (B-4).
- ☐ Aprovação escrita de luis para cada item abaixo que vire fatia nova.

**Físico**
- ☐ **Teste de impressão física** das três etiquetas (100 × 100 mm) na impressora e no papel da cozinha, com leitura do QR por celular.
- ☐ Teste em celular iOS e Android com sessão persistente e QR (V2 §9).

**Segurança**
- ☐ MFA do proprietário (S-1): decidir e implementar ou aceitar o risco por escrito.
- ☐ CSP e cabeçalhos (S-2); modo `hosted` e build sem `demo` (S-3); provisionamento hospedado (S-4); guarda de sessão validada na plataforma (S-5); configuração de senha e e-mail conferida (S-6).
- ☐ Revisão cruzada independente das fatias 7.2 a V2 (I-1).

**Dados**
- ☐ Backup, retenção e **teste de restauração** documentado (B-2).
- ☐ Reversões das 7 migrações ou decisão "só restaurar backup" (B-1).
- ☐ Rotina de conferência de saldo (B-3).

**Integração e ambiente**
- ☐ Integração dos PRs conforme a seção 9, com CI verde na `main`.
- ☐ Homologação montada e a bateria repetida nela (I-2, seção 10).

**Operação**
- ☐ Contagem manual de etiquetas fora do sistema (PRE_PILOTO 4.1) combinada com quem fará.
- ☐ Treinamento curto, canal de suporte e responsável por revisar as métricas semanais.
- ☐ Critério de parada do piloto e plano de volta ao papel.

## 12. Quadro-resumo dos achados

| Severidade | Quantidade | IDs |
|---|---|---|
| Crítica | 0 | — |
| Alta | 4 | S-1, S-2, B-1, B-2 |
| Média | 15 | S-3, S-4, S-5, S-6, I-2, B-3, B-4, D-1, D-2, D-5, A-1, R-1, R-2, R-3, C-1 (integração em cadeia, seção 9) |
| Baixa | 11 | S-7, S-8, S-9, I-3, B-5, D-3, D-4, A-2, A-3, A-4, R-4 |
| Informativa | 4 | I-1, B-6, A-5, R-5 |

(C-1: a integração de 15 PRs empilhados é o principal risco de execução; solução na seção 9.3.)

## 13. O que não foi feito

Não implementei correção nem funcionalidade; não fiz merge, deploy, nem criei projeto, domínio ou chave; não rodei os testes E2E aqui; não testei em aparelho, impressora ou ambiente hospedado; não executei os merges para medir conflitos (a previsão da seção 9.3 vem da leitura dos arquivos alterados); não medi carga. Valores de planos e limites de provedores precisam ser conferidos no site do provedor.

## 14. Próximos passos que dependem de luis

1. Escolher a estratégia de integração (A ou B) e autorizar por escrito o primeiro merge.
2. Decidir MFA (S-1), limite do nome (B-4) e política de reversão de migrações (B-1).
3. Autorizar a montagem da homologação (seção 10), incluindo escolha de provedor e região.
4. Escolher e contatar a RT (Q10) e agendar o teste físico de impressão.
5. Dizer quais achados de severidade alta ou média viram fatia, uma a uma.
