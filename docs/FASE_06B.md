# Fase 6, fatia 6.0b — RLS por conjunto (P3)

Implementada por Claude Code em 13/11/2026, conforme a seção 10 de `FASE_06_DESENHO.md` (PR #3), a proposta P3 de `REVISAO_05_SEGURANCA_PRODUTO.md` (PR #2, achado S4) e o achado I-10b de `REVISAO_CRUZADA_FASE_06.md` (PR #4). luis aprovou o início em 13/11/2026. Registro da tarefa: `ia-tarefas/fase-06b-rls-por-conjunto.md`.

**Base:** branch do PR #5 (`claude/fase-06a-protecao-historico`, `f00c7d1`), que parte do PR #2. **Ordem de integração: PR #2, PR #5, depois este.**

**Sem mudança de produto nem de regra de acesso.** Quem via cada linha antes continua vendo exatamente a mesma linha; quem escrevia continua escrevendo. Só muda como o banco avalia a política. Nenhuma tela, função de escrita, mensagem ou teste existente mudou. Nenhum deploy.

## O que mudou

### Banco (`20261113030000_rls_set_based.sql`, rollback `rls_set_based.sql`)

1. **`private.member_organizations(p_owner_only boolean default false)`**: `SECURITY DEFINER`, `stable`, `search_path = ''`, devolve `setof uuid` com as organizações em que `auth.uid()` tem vínculo ativo (só as de proprietário quando `p_owner_only`). Não recebe ID de usuário. `EXECUTE` só para `authenticated` (exigido para a política funcionar); nada para `PUBLIC`, `anon` nem `service_role`.
2. **As 13 políticas de `public` reescritas com `alter policy`** (nome, comando e papel preservados):
   - leitura: `organization_id in (select private.member_organizations())` (em `organizations`, `id in (...)`);
   - escrita (`organizations_update`, `establishments_insert/update`, `products_insert`, `suppliers_insert`): `member_organizations(true)` em `USING` e `WITH CHECK`, mantendo D-019 (só proprietário escreve);
   - **`memberships_read` mantém a regra atual (I-10b):** vínculos revogados escondidos; vínculo de colega só para o proprietário. Reescrita como `revoked_at is null and organization_id in (select member_organizations()) and (user_id = auth.uid() or organization_id in (select member_organizations(true)))`.
3. **`private.has_membership` continua**: as funções de escrita (`receive_batch`, movimentos, anulação) verificam uma única organização, onde a função por linha não custa nada. Nenhuma delas foi tocada.

Por que é mais rápido: a função por linha era chamada para cada linha lida (20 mil chamadas, cada uma consultando `memberships`). Com `in (select ...)`, o Postgres executa a subconsulta uma vez e compara cada linha com um conjunto em memória (`hashed SubPlan`). Como a função é `SECURITY DEFINER`, ela não é expandida dentro da política, então a RLS de `memberships` não entra em recursão.

### Testes

- **Novo `supabase/tests/rls_set_based.test.sql` (46 verificações):**
  - catálogo: a função existe com a assinatura, a segurança, a volatilidade, o retorno e o `search_path` esperados; `anon` e `PUBLIC` não executam, `authenticated` executa; a lista fixa das 13 políticas (tabela, nome, comando, papel) está inalterada; nenhuma política de `public` chama `has_membership`; toda política usa `member_organizations`; toda política de escrita usa a variante de proprietário em `USING` e `WITH CHECK`;
  - comportamento (teste 12 da seção 8): sem sessão, proprietário de duas empresas, membro, membro revogado, proprietário revogado de uma empresa e membro ativo de outra, proprietário só da outra empresa e usuário sem vínculo. Cobre o conjunto devolvido em cada caso, **membro não vê vínculo de colega**, **revogado não aparece** (nem para o proprietário, nem para si mesmo), membro não insere produto, fornecedor nem unidade e não altera organização nem unidade (D-019), proprietário revogado de A não lê nem escreve em A e não vira proprietário em B, e ninguém move unidade para outra empresa.
- Nenhum teste existente foi alterado. `security_guard.test.sql` continua com 40 verificações e cobre a função nova pelas regras gerais (`search_path` vazio, nada executável por `anon`/`PUBLIC`).
- **Benchmark versionado** em `supabase/benchmarks/rls_set_based.sql` (transação desfeita no fim, não altera o banco).

## Evidências (container em nuvem, 13/11/2026)

Supabase local (Postgres 17) com Docker; Node 24.22.3; Playwright com o Chromium do container por uma config local não versionada (só muda o caminho do navegador).

| Comando | Resultado |
|---|---|
| Falha primeiro: rollback aplicado + `supabase test db` | **FAIL**: 10 das 11 verificações de catálogo falharam (a lista fixa de políticas passou, como esperado) e o arquivo abortou na primeira chamada da função inexistente. Os outros 6 arquivos passaram |
| Equivalência: só a parte de comportamento (26 verificações que não chamam a função nova) com as políticas antigas | 26 de 26: a regra de acesso de antes e de depois é a mesma |
| `npm run db:reset` + `npm run test:db` | PASS, 7 arquivos, 244 verificações (batches 17, catalog 39, history_append_only 40, identity 33, movements 29, rls_set_based 46, security_guard 40) |
| `npx supabase db advisors --type security --level warn --fail-on warn` | No issues found |
| `npx supabase db advisors --type performance --level warn` | No issues found |
| `npm run lint`, `typecheck`, `format:check`, `build` | sucesso (build mantém o aviso antigo de chunk grande) |
| `npm run test` | 76 de 76 |
| `npm run test:integration` | 13 de 13, duas vezes no mesmo banco (antes e depois da reaplicação) |
| `playwright test` | 3 de 3, duas vezes no mesmo banco |
| Rollback com 1.011 recebimentos de teste no banco, integração com as políticas antigas, reaplicação da migração e `test:db` | rollback devolveu as 10 políticas com `has_membership` em `USING` (as 3 de INSERT só têm `WITH CHECK`); integração 13/13 com elas; depois da reaplicação, PASS 244, integração 13/13 e Playwright 3/3 |

### Benchmark (20 mil recebimentos, proprietário com sessão, `explain analyze`)

| Consulta | Antes (`has_membership` por linha) | Depois (conjunto) |
|---|---|---|
| `count(*)` de `batch_receipts`, 3 medições após aquecimento | 138, 181 e 173 ms | 5,0, 4,5 e 4,4 ms |
| Recebimentos da unidade ordenados por validade, 50 primeiros | 168 ms | 6,3 ms |

No plano, o filtro passou de `private.has_membership(organization_id, false)` para `ANY (organization_id = (hashed SubPlan 1).col1)`. A medição da revisão 05 era 136 ms → 5,8 ms; os números são do mesmo container e variam entre execuções.

## Riscos e limites

- **Regra de acesso igual, mas reescrita**: a equivalência está demonstrada pelos 26 testes de comportamento rodados nas duas versões e pela bateria inteira sem mudança; não é uma prova formal. Uma política futura que use `has_membership` por linha será recusada pelo teste novo.
- **`member_organizations` sem `p_owner_only` não distingue papel**: toda política de escrita precisa da variante `true`; o teste de catálogo recusa política de INSERT/UPDATE sem ela.
- **Usuário com muitas organizações**: o conjunto é carregado inteiro uma vez por consulta. Para o piloto (uma organização) e para dezenas de organizações isso é irrelevante; `rows 10` só orienta o planejador.
- **Rollback** devolve o desempenho anterior sem mudar a regra de acesso. Não depende da 6.0a e não toca histórico.
- **Conflito com trabalho paralelo**: qualquer política nova criada pelo Codex na `main` com `has_membership` vai falhar no teste novo quando as branches forem integradas; a correção é usar `member_organizations`.
- Não mede outras consultas além de `batch_receipts` (`containers`, `stock_movements` seguem o mesmo padrão de política). As tabelas novas da 6.1 em diante já nascem com o padrão (seção 6 do desenho).

## Decisão proposta para `DECISOES.md`

Como na 6.0a, o `DECISOES.md` desta base termina na D-018; D-019 a D-033 estão no PR #3 e a D-034 está proposta no PR #5. Para não criar conflito de numeração, a decisão fica aqui e entra como **D-035** quando os PRs anteriores forem integrados:

- **Decisão:** políticas RLS de `public` usam `organization_id in (select private.member_organizations([true]))`; `has_membership` fica só para funções de escrita que verificam uma organização.
- **Motivo:** P3 (S4): a função por linha custava ~140–180 ms em 20 mil linhas; o conjunto custa ~5 ms, com a mesma regra de acesso.
- **Consequência:** política nova segue o padrão (o teste `rls_set_based` recusa `has_membership` em política e escrita sem a variante de proprietário); `memberships_read` mantém a regra própria (I-10b).
- **Revisar quando:** surgir papel novo com escrita (D-019 reavaliada), ou se usuários com centenas de organizações aparecerem.

## Próximo passo

Aguardar aceite de luis. O aceite não autoriza merge: integrar depois do PR #2 e do PR #5, quando luis autorizar. A 6.0c (P6, fuso imutável e auditoria) só começa com aprovação própria e depois de reconciliar com o PR #1.
