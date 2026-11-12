# Revisão 05 — segurança, testes, manutenção e produto

Revisão feita por Claude Code em 12/11/2026 sobre a `main` em `4c39e9f` (inclui a anulação auditável da Fase 5, ainda aguardando aceite). O PR #1 (unidades) não foi analisado em profundidade nem alterado. Registro da tarefa: `ia-tarefas/revisao-05-seguranca-produto.md`.

Esta revisão não substitui auditoria de segurança independente, revisão jurídica (LGPD) nem avaliação sanitária por responsável técnico.

## Resumo

O projeto está em bom estado para a fase em que se encontra. O isolamento multiempresa é feito no banco, as escritas passam por funções `SECURITY DEFINER` com `search_path` vazio e reautorização, o histórico é imutável para o cliente e os testes cobrem negação cruzada, concorrência e reenvio. Não encontrei vazamento entre empresas.

Encontrei e corrigi neste PR três problemas reais, com teste reproduzindo antes da correção:

1. **A CI não executava nenhum teste de segurança.** pgTAP, integração via API e E2E rodavam só manualmente. Uma regressão de RLS passaria verde no GitHub.
2. **Cada baixa varria toda a tabela `stock_movements` com o recebimento bloqueado.** Com 200 mil eventos, 19 ms por baixa; após a correção, 0,3 ms (cerca de 60 vezes menos). O custo crescia linearmente com o histórico de todas as empresas.
3. **Nome de organização ou unidade só com espaços invisíveis era aceito pelo banco** (por exemplo, tabulação ou espaço não separável) e quebrava o carregamento de acesso na interface para todos os membros daquela empresa.

Também adicionei um teste de guarda (`security_guard.test.sql`) que protege as próximas migrações contra o erro mais provável em Supabase: criar uma tabela ou função nova e esquecer o `revoke`.

Os pontos de produto mais importantes estão na seção "Produto e MVP". O principal é que **hoje só o proprietário consegue registrar qualquer coisa**: o cozinheiro e o auxiliar, que são os usuários reais da etiqueta, ficam só com leitura.

## Evidências da linha de base (antes de qualquer alteração)

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run build` | sucesso; build mantém aviso de bundle de ~987 kB |
| `npm run test` / `test:coverage` | 76 testes, sucesso; 77,07% de linhas |
| `npm run test:db` | 118 verificações pgTAP, sucesso |
| `npm run test:integration` | 13 testes, sucesso |
| `playwright test` (config local com Chromium do container) | 3 testes, sucesso |
| `supabase db advisors --type security --level warn` | sem ocorrências |

Ambiente: container em nuvem, Node 24.22.3, Supabase CLI 3.0.0, Postgres 17.

## Achados de segurança e confiabilidade

Severidade considera o estágio atual (local, sem clientes) e o impacto quando houver piloto.

| # | Severidade | Achado | Estado |
|---|---|---|---|
| S1 | Alta | CI sem pgTAP, advisors, integração e E2E | **Corrigido neste PR** (job `banco-api-e2e`) |
| S2 | Média | Privilégios padrão do Supabase dão a `anon`/`authenticated` TRUNCATE, TRIGGER e REFERENCES em tabelas novas de `public`; TRUNCATE ignora RLS | Mitigado: tabelas atuais revogam tudo; **guarda adicionada** que falha se uma tabela futura esquecer |
| S3 | Média | `record_movement` somava saldo filtrando só por `batch_id` (sem índice) sob `FOR UPDATE` | **Corrigido neste PR** |
| S4 | Média | RLS chama `private.has_membership(organization_id)` linha a linha; 20 mil recebimentos levam 136 ms | Proposta P3 (medido: 5,8 ms com a alternativa) |
| S5 | Média (pré-piloto) | Configuração de autenticação de desenvolvimento: senha mínima 6 sem requisitos, sem confirmação de e-mail, `secure_password_change = false`, sem MFA | Proposta P4 |
| S6 | Média (pré-piloto) | `service_role` tem DELETE em `batch_receipts`, `containers` e `stock_movements` (necessário para a limpeza dos testes) | Proposta P5 |
| S7 | Baixa | Nome de organização/unidade só com espaços invisíveis era aceito e quebrava a leitura de acesso | **Corrigido neste PR** |
| S8 | Baixa | O banco ainda permite ao proprietário alterar o fuso da unidade (a interface do PR #1 não oferece), o que muda retroativamente a classificação de vencimento; alterações de nome/fuso não têm autoria registrada | Proposta P6 |
| S9 | Baixa | Uma única organização com dado inesperado faz `accessSchema.parse` rejeitar o acesso a todas as organizações do usuário | Proposta P7 |
| S10 | Baixa (LGPD) | `created_by` referencia `auth.users` sem regra de exclusão: excluir um usuário falha. Bom para auditoria, mas falta processo de anonimização para pedidos de exclusão | Proposta P8 |

### Verificado e correto

- Todas as tabelas de `public` têm RLS, `anon` não tem nenhum privilégio, `authenticated` só tem SELECT e INSERT/UPDATE por coluna nos cadastros.
- Funções `SECURITY DEFINER` ficam somente em `private`, com `search_path = ''`, sem EXECUTE para `anon`/PUBLIC; os wrappers em `public` são `SECURITY INVOKER`.
- FKs compostas `(organization_id, establishment_id, id)` impedem misturar produto, fornecedor, lote, recipiente ou movimento de outra empresa ou unidade, mesmo para quem é proprietário das duas.
- A verificação de vínculo acontece antes de qualquer consulta a dados, então os erros não revelam se um ID de outra empresa existe.
- Revogação vale imediatamente com o token anterior; reenvio idempotente é reautorizado; anulação é única por movimento e serializada no recebimento.
- O QR contém só URL e ID opaco; a rota exige sessão e vínculo atual. `.env*` está no `.gitignore` e não há segredos no histórico do Git.
- Cadastro público e login anônimo estão desligados; a API expõe só o schema `public`.

## Correções incluídas no PR

Todas sem mudança de fluxo de produto.

1. **`supabase/tests/security_guard.test.sql`** (37 verificações), com três partes:
   - invariantes de catálogo para qualquer objeto futuro: RLS em toda tabela, nenhuma view sem `security_invoker`, nenhum privilégio de `anon` (tabela ou coluna), nenhum DELETE/TRUNCATE/TRIGGER/REFERENCES para `authenticated`, histórico e vínculos sem INSERT/UPDATE direto, nenhuma `SECURITY DEFINER` em `public`, `search_path` vazio em toda `SECURITY DEFINER` e nenhuma função executável por `anon` ou PUBLIC;
   - matriz de papéis nas quatro funções de escrita, no nível do banco: membro, proprietário revogado e proprietário de duas empresas tentando misturar registros entre empresas e unidades;
   - nomes compostos só por espaços invisíveis. Esses quatro testes falharam antes da migração.
2. **Migração `20261112153000_review_05_hardening.sql`** e rollback correspondente:
   - `CHECK` em `organizations.name` e `establishments.name` com o mesmo conjunto de espaços já usado em produtos, fornecedores e lotes;
   - `private.record_movement` recriada com corpo idêntico, exceto pelo filtro de escopo na soma do saldo. O diff contra a versão anterior é uma linha.
3. **CI:** novo job `banco-api-e2e` que sobe o Supabase local e executa `test:db`, advisors de segurança, `test:integration` e `test:e2e`. O job atual de lint, typecheck, unitários e build continua igual.

### Verificação após as correções

| Comando | Resultado |
|---|---|
| Arquivo novo antes da migração | 33/37; os 4 testes de nomes falharam como esperado |
| `npm run db:reset` + `npm run test:db` | 155 verificações em 5 arquivos, sucesso |
| `npm run test:integration` | 13, sucesso |
| `playwright test` | 3, sucesso |
| `npm run lint`, `typecheck`, `test` (76), `format:check` | sucesso |
| `supabase db advisors --type security --level warn --fail-on warn` | sem ocorrências |
| Rollback aplicado e migração reaplicada em banco local | sucesso; restrições removidas e recriadas, `test:db` verde |
| Benchmark: 200 baixas com 20 mil recebimentos e 200 mil eventos | 19,05 ms → 0,30 ms por baixa |

O job novo da CI ainda não rodou no GitHub. Ele roda no push deste PR, e o resultado deve ser conferido antes do aceite.

## Propostas de segurança e escalabilidade (para decidir)

- **P3 — RLS por conjunto em vez de função por linha.** Trocar `using (private.has_membership(organization_id))` por `using (organization_id in (select private.member_organizations()))`, com uma função `SECURITY DEFINER` que devolve os IDs de organização do usuário. O Postgres avalia o conjunto uma vez por consulta. Medido: 136 ms → 5,8 ms com 20 mil linhas. Exige revisar todas as políticas e repetir a bateria completa, então fica como incremento próprio.
- **P4 — Configuração de autenticação para ambiente hospedado.** Senha mínima de 10 a 12 caracteres com requisitos, confirmação de e-mail, `secure_password_change = true`, proteção contra senhas vazadas, MFA TOTP obrigatório para proprietários e limites de tentativa revisados. Hoje é só local; o risco aparece no primeiro deploy.
- **P5 — Histórico append-only também para o backend.** Gatilhos que recusem UPDATE/DELETE em `batch_receipts`, `containers` e `stock_movements` para qualquer papel, e limpeza de testes por `db reset` (ou por um papel exclusivo de teste) em vez de DELETE com `service_role`. Sem isso, qualquer código de servidor futuro com a chave de serviço consegue apagar auditoria.
- **P6 — Fuso imutável após o primeiro recebimento** (ou alteração por função auditada) e tabela de auditoria para mudanças de nome e fuso de organização e unidade.
- **P7 — Carregamento de acesso tolerante.** Validar cada organização separadamente e mostrar as válidas com um aviso, em vez de rejeitar tudo.
- **P8 — Política de dados pessoais.** Definir anonimização de autoria para pedidos de exclusão (manter UUID e trocar e-mail e nome), retenção e backup antes do piloto.
- **P9 — Saldo calculado no servidor.** Hoje o saldo é calculado no navegador a partir de até 1.000 eventos. Uma visão ou função com saldo por recebimento (com `security_invoker`) remove o teto, permite filtrar o painel por saldo maior que zero (ver produto) e evita divergência entre cliente e banco.

## Organização e manutenção do código

Pontos fortes: separação por feature (`domain`, `application`, `components`, `data`), Zod nas fronteiras, TypeScript strict, mensagens em português, decisões registradas e testes que reproduzem a falha antes da correção.

Melhorias sugeridas, em ordem de retorno:

1. **SQL legível e sem repetição.** As funções de escrita estão em linhas de 300 a 600 caracteres, e o conjunto de espaços Unicode está copiado 5 vezes nas migrações da `main` (7 com este PR). Sugestões: uma função `private.visible_text(text)` (imutável) usada em todos os `CHECK`; funções formatadas com uma condição por linha; e cada `create or replace` mantido também em `supabase/schemas/` (schema declarativo do CLI), para que o diff de uma alteração mostre só a linha mudada, como neste PR.
2. **Tipos gerados do banco.** `supabase gen types typescript --local` daria erro de compilação quando um nome de parâmetro de RPC ou coluna mudar. Hoje esse erro só aparece na integração.
3. **Componentes grandes.** `BatchPanel.tsx` (518 linhas) e `MovementPanel.tsx` (453) misturam formulário, armazenamento da tentativa na aba e renderização. Extrair um hook `usePendingIntent(key)` (sessionStorage e guarda de geração) e separar formulário de listagem facilita testar e reaproveitar a recuperação durável quando ela vier.
4. **`renderCatalog` com cinco argumentos posicionais** (`App.tsx`/`IdentityHome.tsx`): trocar por um objeto `{ organizationId, establishmentId, canCreate, userId, timezone }` para evitar troca silenciosa de dois `string`.
5. **Bundle.** `jspdf` e `qrcode` entram no bundle inicial (~987 kB). Um `import()` dinâmico em `makeLabelPdf` deve tirar a maior parte do peso da carga inicial, o que importa em tablet de cozinha com rede ruim.
6. **Mapeamento de erros duplicado.** Cada gateway converte `error.code` em mensagem do seu jeito. Um utilitário `mapRpcError(error, mensagens)` em `shared/` mantém o comportamento e evita divergência.

## Cobertura de testes com foco em segurança

A bateria é boa e realista (API real, concorrência, revogação, reenvio). Lacunas que continuam abertas depois deste PR:

- **Testes de propriedade do saldo:** gerar sequências aleatórias de baixas e anulações e verificar que o saldo nunca fica negativo nem acima da entrada. Isso já é garantido pelo banco, mas uma sequência aleatória encontra combinações que casos fixos não cobrem.
- **E2E de negação:** um teste de navegador com usuário de outra empresa abrindo `/recipiente/<id>` de A. Hoje isso está coberto na API, não no navegador.
- **Rollback na CI:** aplicar cada rollback e reaplicar a migração automaticamente, em vez de só na verificação manual.
- **Cobertura dos adaptadores `data/`:** aparece como 0% no Vitest porque só é exercitada na integração. Vale documentar isso no relatório de cobertura, ou juntar a cobertura da integração, para que o número não engane.

## Produto e MVP

A estratégia está bem fundamentada: escopo estreito, não sanitário, sem prazo automático, com validação de campo antes de ampliar. Concordo com o recorte e com o que ficou fora. Abaixo estão os ajustes que considero mais importantes para o piloto, em ordem.

1. **Quem opera o sistema (decisão necessária).** O brief diz que o usuário é "auxiliar, cozinheiro, chef, estoquista", mas hoje só `owner` escreve. No piloto, ou o dono faz todo o registro (não escala e vira gargalo no turno), ou todos viram proprietários (anula o controle de permissão). Proposta mínima: o membro passa a registrar consumo e descarte e a gerar etiqueta; recebimento, anulação e cadastros continuam com o proprietário. A mudança é pequena no banco (o parâmetro `owner_required` nas funções), mas muda permissão, então precisa de decisão, pgTAP e integração novos.
   **Decisão do usuário em 12/11/2026: manter escrita somente para o proprietário no piloto.** A proposta fica registrada para reavaliação depois da observação da cozinha; nenhum código foi alterado.
2. **Etiqueta de abertura e porcionamento como próximo incremento do core.** Na cozinha, o uso diário da etiqueta não é o recebimento da caixa fechada (que já traz rótulo do fabricante): é o momento em que alguém abre, porciona ou manipula o produto e precisa registrar nova validade e quem fez. Hoje há um recipiente por recebimento e o fracionamento está fora da v0.1. Sugiro reavaliar isso: um fluxo mínimo "abrir/porcionar em N recipientes", com validade definida pelo responsável e saldo transferido do recebimento para os recipientes, é provavelmente o que define se a equipe usa o produto. Confirmar com o responsável técnico do piloto quais campos a etiqueta precisa ter; não incluir regra automática de prazo.
3. **Painel de vencimentos só com saldo.** As contagens incluem recebimentos já consumidos ou descartados. No dia a dia isso gera alertas de "vencido" para itens que não existem mais, e a equipe aprende a ignorar o painel. Depende de P9.
4. **Campos da etiqueta.** Hoje: produto, lote, quantidade inicial, validade e origem. Candidatos a validar com o responsável técnico: data/hora de abertura ou manipulação, nome do responsável, condição de armazenamento (ambiente, refrigerado ou congelado) e, para porções, a validade nova. A quantidade inicial impressa pode confundir depois de baixas parciais; considerar remover ou rotular como "entrada".
5. **Dispositivo da cozinha.** O QR exige sessão, e `persistSession: false` desloga a cada recarga. Em tablet compartilhado isso é atrito constante. Definir no piloto: aparelho fixo da cozinha com sessão persistente e expiração curta por inatividade, e login individual rápido para registrar autoria. É um ponto de UX e de segurança ao mesmo tempo.
6. **Onboarding mínimo.** Não há convite nem criação de empresa pela interface (provisionamento por fixture). Para um piloto basta um script administrativo documentado e testado (criar empresa, unidade, proprietário e membros), sem tela, mas ele precisa existir antes do primeiro cliente.
7. **Métricas do piloto definidas antes de começar:** percentual de recipientes etiquetados no turno, tempo médio do registro de saída, descarte por motivo por semana, itens vencidos com saldo encontrados na conferência e minutos de suporte por semana. Isso dá base para o preço (D-008) sem prometer "perda zero".

Sugestão de sequência até o piloto: aceite da Fase 5 e deste PR → decisão sobre papéis (item 1) → saldo no servidor e painel com saldo (P9 e item 3) → recuperação de tentativa após fechar a aba (pendência já registrada) → ensaio físico da etiqueta com os campos validados (itens 2 e 4) → script de onboarding e configuração de autenticação de produção (item 6 e P4) → piloto.

## Arquivos alterados neste PR

- `supabase/migrations/20261112153000_review_05_hardening.sql` (novo)
- `supabase/rollback/review_05_hardening.sql` (novo)
- `supabase/tests/security_guard.test.sql` (novo)
- `.github/workflows/quality.yml` (novo job)
- `docs/REVISAO_05_SEGURANCA_PRODUTO.md`, `docs/ia-tarefas/revisao-05-seguranca-produto.md`, `docs/IA_ESTADO.md` (uma linha)
