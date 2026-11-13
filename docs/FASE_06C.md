# Fase 6, fatia 6.0c — fuso imutável e auditoria (P6)

Implementada por Claude Code em 13/11/2026, conforme a seção 4.6 e a seção 10 de `FASE_06_DESENHO.md` (PR #3), a proposta P6 de `REVISAO_05_SEGURANCA_PRODUTO.md` (PR #2, achado S8) e o achado I-11 de `REVISAO_CRUZADA_FASE_06.md` (PR #4). luis aprovou o início em 13/11/2026. Registro da tarefa: `ia-tarefas/fase-06c-fuso-auditoria.md`.

**Base:** branch do PR #6 (`claude/fase-06b-rls`, `ef7f735`). **Ordem de integração: PR #2, PR #5, PR #6, depois este.** O PR #1 (unidades) não faz parte da cadeia; a compatibilidade com ele foi verificada (abaixo).

**Sem mudança de tela, de permissão (D-019) nem de Q1–Q10.** A interface do PR #1 já não edita o fuso (D-017); agora o banco também recusa. As proteções das 6.0a e 6.0b seguem intactas. Nenhum deploy.

## O que mudou

### Banco (`20261113040000_timezone_immutable_audit.sql`, rollback `timezone_immutable_audit.sql`)

1. **Fuso imutável.** `private.lock_establishment_timezone()` (gatilho `validate_establishment_timezone_locked`, `BEFORE UPDATE OF timezone`) recusa mudar o fuso de uma unidade que já tem recebimento, com `55000`. Vale para qualquer papel, inclusive o dono das tabelas e `service_role`. Reenviar o mesmo fuso não é mudança. Fuso inexistente continua `22023 "Fuso horário inválido."`: o gatilho novo dispara depois do `validate_establishment_timezone` (ordem alfabética), então o código do PR #1 é preservado também em unidade com recebimento.
2. **Corrida fuso × recebimento (I-11).** `private.receive_batch` lê a unidade com `FOR SHARE` antes de criar o recebimento, e o gatilho do fuso trava a mesma linha com `FOR NO KEY UPDATE` antes de olhar os recebimentos. Resultado: se o recebimento está em andamento, a mudança de fuso espera e depois é recusada; se a mudança vem primeiro, o recebimento espera e grava o fuso novo. A função foi recriada com a mesma lógica, as mesmas mensagens e os mesmos códigos; a única diferença é que o fuso agora vem da leitura travada (o `join` com produtos foi separado em duas consultas). Ordem de bloqueios: unidade antes do recebimento, sem inverter a existente, sem ciclo.
3. **`public.entity_changes`** (organização, unidade; `membership` reservado ao nome de exibição da 6.3): entidade, campo (`name`, `timezone`, `display_name`), valor anterior, valor novo, autor (`auth.uid()`, nulo quando não há sessão) e data. Preenchida por gatilho `AFTER UPDATE` (`private.log_entity_changes`, `SECURITY DEFINER`, `search_path` vazio), só quando o valor muda. **Leitura só do proprietário** da organização (`member_organizations(true)`, S-4); membro e outra empresa não veem. Nenhum papel da aplicação escreve (nem `service_role`).
4. **Auditoria também é histórico append-only (6.0a):** gatilho `entity_changes_append_only` (ENABLE ALWAYS, UPDATE, DELETE, TRUNCATE) e `private.assert_history_protected()` recriada com a tabela na lista fixa. O gatilho de nome de exibição será acrescentado na 6.3, junto com a coluna.

### Testes

- **Novo `supabase/tests/timezone_audit.test.sql` (38):** catálogo (RLS, nenhum privilégio de escrita, append-only); fuso mutável e auditado sem recebimento; `22023` preservado; renomeação de organização e unidade auditada; atualização sem mudança não gera linha; fuso recusado após recebimento para proprietário, dono das tabelas e `service_role`; reenviar o mesmo fuso aceito; renomear unidade com recebimento continua permitido; visibilidade (proprietário vê, membro e outra empresa não); auditoria não editável; mudança sem sessão com autor nulo.
- **Novo `tests/integration/timezone-race.test.mjs` (2, teste 21):** duas sessões `psql` no banco local (via `docker exec`), com `pg_sleep` para forçar a sobreposição. (a) recebimento em andamento × mudança de fuso: a mudança espera e é recusada, recebimento e unidade ficam no fuso original; (b) mudança em andamento × recebimento: o recebimento espera e grava o fuso novo. Os dados ficam no banco local (histórico é append-only), com IDs aleatórios.
- **Ajustes em testes existentes, nenhuma asserção removida ou enfraquecida:** `rls_set_based.test.sql` — a lista fixa de políticas ganhou `entity_changes_read` (as 13 anteriores continuam exigidas, e as verificações "nenhuma política usa has_membership" e "toda política usa member_organizations" passam com a nova); `security_guard.test.sql` — `entity_changes` entrou nas três listas de histórico/vínculos (mesmas 40 verificações, cobertura maior); `identity.test.mjs` — a limpeza final não apaga organizações que ganharam auditoria (mesmo critério da 6.0a para histórico); asserções intactas.

## Evidências (container em nuvem, 13/11/2026)

Supabase local (Postgres 17) com Docker; Node 24.22.3; Playwright com o Chromium do container por config local não versionada.

| Comando | Resultado |
|---|---|
| Falha primeiro, sem a migração: `supabase test db` | **FAIL**: `timezone_audit.test.sql` aborta na 1ª verificação (`entity_changes` não existe); os outros 7 arquivos passam |
| Falha primeiro, sem a migração: `timezone-race.test.mjs` | **2 de 2 falham**: o fuso muda durante o recebimento (a); o recebimento grava o fuso antigo (b) |
| `npm run db:reset` + `npm run test:db` | PASS, 8 arquivos, 282 verificações (244 anteriores + 38) |
| `npm run test:integration`, duas vezes seguidas no mesmo banco | 15 de 15 nas duas |
| `playwright test` | 3 de 3 |
| `npx supabase db advisors --type security --level warn --fail-on warn` e `--type performance --level warn` | sem ocorrências |
| `npm run lint`, `typecheck`, `format:check`, `build` | sucesso (build mantém o aviso antigo de chunk grande) |
| `npm run test` (Vitest) | 76 de 76 |
| Rollback aplicado (tabela, gatilhos e funções removidos, `receive_batch` sem `FOR SHARE`); bateria da 6.0b (versão do commit anterior) | `test:db` 244 PASS e integração 13/13 contra o banco revertido |
| Migração reaplicada | `test:db` 282 PASS e integração 15/15 |
| Compatibilidade com o PR #1 (arquivos dele copiados temporariamente, nada commitado) | `establishments.test.sql` 17 de 17 e `establishments.test.mjs` 4 de 4 contra esta migração, inclusive recusa de fuso inválido com `22023` |

Não executados: Vitest e E2E de interface do PR #1 (a interface não mudou nesta fatia); CI do GitHub no momento deste texto.

## Riscos e limites

- **Fuso errado na criação não tem correção pela interface.** Depois do primeiro recebimento, mudar exige novo cadastro de unidade ou uma intervenção administrativa que passe por superusuário do banco (o gatilho recusa até `service_role`). Se o piloto errar o fuso, registrar o procedimento antes. D-017 já proíbe editar fuso na tela.
- **Rollback apaga a auditoria** (`entity_changes`), e o fuso volta a ser editável. Está escrito no cabeçalho do rollback.
- **Autor nulo** em mudanças sem sessão (script administrativo, SQL direto): a linha existe, mas sem `changed_by`.
- **Nome de exibição** (`membership`/`display_name`) ainda não é auditado: a coluna e o gatilho chegam na 6.3.
- **O teste de corrida depende de `docker` e do contêiner `supabase_db_*`** (a CI já os tem em `banco-api-e2e`). Usa `pg_sleep` de 2,5 s; não é probabilístico, mas leva ~6 s.
- **Efeito do `FOR SHARE`:** recebimentos da mesma unidade não se bloqueiam entre si (travas `SHARE` são compatíveis); só a mudança de fuso espera. Inserir produto ou fornecedor na unidade não conflita com o `FOR NO KEY UPDATE` do gatilho.

## Decisão proposta para `DECISOES.md`

O `DECISOES.md` desta base termina na D-018; D-019 a D-033 estão no PR #3, D-034 proposta no PR #5 e D-035 no PR #6. Para evitar conflito de numeração, entra como **D-036** quando os PRs anteriores forem integrados:

- **Decisão:** o fuso da unidade é imutável a partir do primeiro recebimento, garantido no banco; nome e fuso de organização e unidade são auditados em `entity_changes` (append-only, leitura só do proprietário); `receive_batch` lê a unidade com `FOR SHARE`.
- **Motivo:** P6 (S8) e I-11: mudar o fuso reclassificaria vencimentos já registrados, e a corrida entre mudança e recebimento deixaria recebimentos com fuso diferente do da unidade.
- **Consequência:** correção de fuso errado exige procedimento administrativo; toda função futura que leia o fuso para gravar evento deve ler a unidade com `FOR SHARE` quando criar o primeiro registro da unidade (hoje só `receive_batch`; as demais já têm recebimento, logo fuso congelado).
- **Revisar quando:** o piloto mostrar necessidade de corrigir fuso, ou na 6.3 (nome de exibição).

## Próximo passo

**Aceita por luis em 13/11/2026 02:36 UTC.** O aceite não autoriza merge: integrar depois dos PRs #2, #5 e #6. A 6.1 (saldo por recipiente) só começa com aprovação própria.
