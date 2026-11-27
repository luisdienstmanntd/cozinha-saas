# Tarefa: Equipe da empresa pelo site (fatia B da auditoria, D-077)

- **ID:** equipe-empresa
- **Responsável / sessão:** Claude Code (thread "Criar gestão de equipe no site")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** o proprietário lista a equipe, vincula conta já criada, troca papel, revoga e restaura acesso pelo site, com regras e auditoria no banco. Aceite: bateria inteira verde (lint, formato, tipos, vitest, scripts de CI, build, pgTAP, advisors, integração, E2E), testes novos, capturas antes/depois e aceite de luis. Desenho: seção 5, fatia B, de `docs/AUDITORIA_FUNCIONALIDADES_SEM_TELA.md` (PR #79) e resumo aprovado na thread.
- **Branch / worktree / base:** `claude/gestao-equipe`, base `main` `a504672`.
- **Arquivos:** `supabase/migrations/20261126000000_team_management.sql` (novo), `supabase/tests/team_management.test.sql` (novo), `tests/integration/team-management.test.mjs` (novo), `src/features/team/` (novo: domínio, gateway, painel, testes), `navigation/domain/areas.ts`, `navigation/domain/workspaceAreas.ts` (+ teste), `navigation/components/OperationsNav.tsx`, `app/App.tsx`, `app/configureApp.ts`, `app/styles.css`, `tests/e2e/team.spec.mjs` (novo), `tests/e2e/areas.mjs`, `docs/DECISOES.md`, `docs/IA_ESTADO.md`, `docs/FASE_EQUIPE.md` (novo).
- **Dependências e riscos:** migração nova; o hospedado só recebe com autorização específica de luis (ver `docs/FASE_EQUIPE.md`, "Aplicação no hospedado"). Merge publica o site: sem a migração aplicada antes, a área Equipe mostraria erro de carregamento.
- **Próximo passo:** luis revisar capturas e prévia; autorizar (1) a migração no hospedado e (2) o merge, nessa ordem.

## Checkpoints

### 26/11/2026, 01:30 UTC — Claude Code

- **Feito:** migração com funções `list/add/set_role/revoke/restore_team_member` (privadas SECURITY DEFINER + fachada SECURITY INVOKER), cadeado por empresa, gatilhos de auditoria; área Equipe na interface.
- **Ambiente:** Supabase local nesta máquina de nuvem (Docker iniciado manualmente). E2E local com o Chromium pré-instalado por configuração local não versionada. Nada alterado no hospedado nem no Cloudflare.
- **Testes:** ver o checkpoint seguinte e o PR.

### 26/11/2026, 01:35 UTC — Claude Code

- **Testes (locais, banco recriado com `npm run db:reset`):** `npm run lint` OK, `npm run format:check` OK, `npm run typecheck` OK, `npm test` 63 arquivos / 678 testes OK, `npm run test:ci-scripts` 29 OK, `npm run build` OK, `npm run test:db` 29 arquivos / 1575 OK, `supabase db advisors --type security --level warn --fail-on warn` sem alerta, `npm run test:integration` 68 OK (2 novos), `npm run test:e2e` 45 OK (2 novos).
- **Observação:** o E2E imprime avisos de React "two children with the same key" já nos testes de catálogo e vírgula decimal, que não usam a área nova; não bloqueiam e ficam para outra tarefa.
- **Capturas:** antes (menu Configurações sem Equipe, desktop e celular) e depois (lista, recusa genérica, confirmação de revogação, revogados, celular) em `capturas-equipe-d077/` na pasta do projeto.
- **Próximo passo:** aceite de luis; depois, autorização para a migração no hospedado e, separada, para o merge (ver `FASE_EQUIPE.md` §6).

### 26/11/2026, 22:5x UTC — Claude Code

- **Atualização sobre a `main` `05bbde0`** (PRs de interface 01 a 14 mesclados): 4 conflitos resolvidos (`App.tsx`, `OperationsNav.tsx`, `styles.css`, `IA_ESTADO.md`). O ícone de Equipe foi para `areaIcons.ts` (que passou a abrigar os ícones) e o CSS da Equipe foi mantido ao fim do arquivo.
- **Efeito esperado nos testes de navegação:** "Equipe" entra na folha "Mais" do proprietário; as listas esperadas em `OperationsNav.test.tsx`, `workspaceAreas.test.ts` e `bottom-nav.spec.mjs` ganharam esse item (nenhum teste enfraquecido).
- **Bateria local após a atualização:** lint, typecheck, format, Vitest 776, build, ci-scripts 29, pgTAP 1575, integração 68, advisors sem problemas, E2E 53.
- **Migração `20261126000000_team_management.sql`:** continua NÃO aplicada no hospedado. Merge e aplicação só com autorização específica de luis.
- **Pendência (26/11, luis):** migração ainda NÃO aplicada no hospedado (a sessão em nuvem não alcança o projeto); o #81 fica sem merge até lá. Ver `FASE_EQUIPE.md` §6.

### 27/11/2026 — Codex: retomada autorizada

- luis aceitou os PRs #79 e #81 e autorizou merge e deploy. A main avançou a `e460a77`; reconciliar em worktree separado com testes antes de integrar. Base da branch #81: `2f28e95`. Não aplicar migração até concluir testes e verificar histórico no projeto correto.
- Supabase CLI não possui token; conector não iniciou. Sessão GitHub no navegador não tem acesso ao projeto `wtscafnacsmyfmqcaffy`. Não tentar outra base por suposição. Próximo passo: reconciliar conflitos e obter acesso ao projeto correto para verificação e migração antes do merge.
- Conflitos com `main` resolvidos em decisões, gateways, CSS, áreas e helper E2E, preservando Equipe e Senha e acesso. Teste de navegação falhou inicialmente por esperar Equipe como penúltima área; atualizado para incluir a área de conta e preservar a ordem. Testes focados: 42/42 passaram em 4 arquivos. Iniciar gates completos; banco hospedado ainda inacessível na conta disponível.
- Ambiente local: lint e typecheck passaram; `npm test` 822/822 em 73 arquivos; build passou com avisos de tamanho/configuração. O usuário indicou a conta ChatGPT correta: painel confirmou organização Cozinha SaaS e projeto `cozinha-saas-testes`, histórico até `20261118000000`; a migração de equipe ainda não aparece. Conector e CLI seguem sem autenticação funcional para execução versionada; não aplicar manualmente nem alterar o histórico sem verificar o procedimento. Próximo: CI do PR reconciliado e acesso autenticado para `db push --dry-run`.
- `npm run format:check` no Windows reportou 201 arquivos por checkout CRLF; repetido integralmente em checkout LF no Ubuntu com Node 24, passou. CI do #79: quality e prévia Cloudflare verdes, banco/API/E2E em execução; CI do #81: em execução no head `093354b`.
- Conta ChatGPT indicada por luis permitiu acesso ao painel correto e conferência visual do histórico; para aplicar a migração com `db push` versionado, CLI ainda exige login. Foi solicitado ao usuário fazer login no terminal sem compartilhar tokens. Não usar SQL manual como substituto do histórico de migrações.
- PR #79 reconciliado e integrado por autorização do usuário em `12fb3f8`; seus checks anteriores ao merge passaram. A publicação da main está sendo verificada. Integrar esse commit documental na branch de equipe sem descartar alterações, antes da CI final. PR #81 no head `093354b` ainda aguarda término do gate banco/API/E2E.
- CI final do PR #81 no head `6c2ab01`: quality, banco/API/E2E e Cloudflare passaram; `mergeable=MERGEABLE`, permanece rascunho até migração. A `main` após PR #79 (`12fb3f8`) também concluiu CI; check Cloudflare desse commit teve sucesso, mas painel antigo apresentou erro de autenticação, então não foi confirmada visualmente a implantação em produção.
- Bloqueio atual: `supabase projects list` informa ausência de token CLI. O usuário foi orientado a executar `npx supabase login` no worktree e autenticar com a conta ChatGPT que possui o projeto. Após login, vincular projeto confirmado, executar `db push --remote --dry-run`, prosseguir apenas se listar exclusivamente a migração de equipe, validar histórico/advisors, então liberar e mesclar #81 no head testado e confirmar deploy. Não expor credenciais nem aplicar SQL manual sem histórico.

### 27/11/2026 — autenticação concluída

- luis confirmou login CLI; consulta inicial falhou por certificado HTTPS. Com `NODE_EXTRA_CA_CERTS` apontando ao certificado público Avast já confiado no Windows, consulta de projetos passou e confirmou `wtscafnacsmyfmqcaffy` sem expor credenciais. Próximo: vincular projeto e executar dry-run; aplicar somente a migração de equipe se todas as condições do procedimento se confirmarem.
- `supabase link --project-ref wtscafnacsmyfmqcaffy` confirmou vínculo; `supabase db push --remote --dry-run` identificou `cozinha-saas-testes` e listou exclusivamente `20261126000000_team_management.sql`, sem seeds nem roles. Arquivo de migração confere com o head testado do PR #81. Próximo: aplicar migração autorizada, conferir histórico, segurança e só então mesclar o head testado.
- Migração `20261126000000_team_management.sql` aplicada com sucesso em `cozinha-saas-testes` via `supabase db push --remote --yes`; `supabase migration list --linked` mostrou todas as 31 migrações iguais entre local e remoto. Site ainda não recebeu o PR #81.
- Gate remoto `supabase db advisors --remote --type security --level warn --fail-on warn` retornou saída 1: único aviso `auth_leaked_password_protection` desativado. A pendência de senhas vazadas já estava documentada em `docs/FASE_07_ENCERRAMENTO.md`; a documentação oficial informa que a funcionalidade exige plano Pro ou superior, enquanto a organização está no Free. Não mascarar o resultado nem mesclar enquanto o gate obrigatório falhar. Requer decisão do usuário sobre resolver o aviso (incluindo custo) ou mudar explicitamente o critério de aceite.
- `notify pgrst, 'reload schema'`, verificação de RLS e merge/deploy #81 não foram executados após o gate falho. A migração já existe no remoto: não reaplicar; retomar pela verificação do advisor, histórico, reload do PostgREST e validações, e só então merge do head testado `6c2ab01` após conferir Git e CI novamente. PR #79 já integrado `12fb3f8`.
