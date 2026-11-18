# Fatia 8.4c — Procedimento de migração do banco hospedado de testes (checklist, NÃO executado)

Status: documento preparado em 18/11/2026. **Nada foi aplicado** no Supabase hospedado (`cozinha-saas-testes`) e não houve deploy. Este procedimento só vale depois de autorização específica de luis, por escrito, para a migração (e outra, separada, para o primeiro deploy).

Estado conferido antes de escrever: `main` em `f525cc8` (inclui #46 identidade CozziGo e #47 etiquetas/`VITE_APP_URL`), 30 migrações em `supabase/migrations` (a última é `20261118000000_hosted_provisioning.sql`), nenhuma migração nova nesta rodada. `verify-hosted.mjs` em 18/11/2026: cadastro público, login anônimo e provedores desligados, e-mail confirmado exigido; as seis tabelas respondem 404 (ainda não existem, banco vazio).

## 1. Pré-requisitos (marcar antes de começar)
- [ ] Autorização escrita de luis para **aplicar migrações** em `cozinha-saas-testes`.
- [ ] CI da `main` verde no commit que será aplicado (`git log -1` na sua cópia = o commit conferido).
- [ ] Projeto é o certo: `wtscafnacsmyfmqcaffy`, região São Paulo, Postgres **17** (Settings > Infrastructure). O local usa 17.
- [ ] Banco vazio: SQL Editor `select count(*) from information_schema.tables where table_schema in ('public','private');` deve dar 0 (ou só o que o Supabase traz). Se houver tabelas, **pare** e avise.
- [ ] Senha do banco à mão (gerenciador de senhas). Ela **nunca** vai para chat, Git ou Cloudflare.
- [ ] Node 24 e Supabase CLI do projeto (`npx supabase --version`) na máquina de luis.
- [ ] Plano Free: **sem backup diário**. Como o banco está vazio, a "volta atrás" é recriar o projeto (seção 6); depois de dados fictícios inseridos, anote que não há backup.
- [ ] Nenhuma outra operação administrativa em andamento (não rodar nada em paralelo no SQL Editor).

## 2. Aplicar (na máquina de luis)
1. `npx supabase login`
2. `npx supabase link --project-ref wtscafnacsmyfmqcaffy` (pede a senha do banco).
3. `npx supabase db push --dry-run` — **conferir**: exatamente 30 migrações, da primeira até `20261118000000`, nenhuma a mais, nenhuma faltando. Qualquer divergência: pare.
4. `npx supabase db push`.
5. `npx supabase migration list` — colunas Local e Remote iguais.

**Pontos de atenção do primeiro push**
- `20261116000000_session_inactivity.sql` faz `alter role authenticator set pgrst.db_pre_request = 'session_guard.check_request'`. É o caminho documentado do Supabase, mas não foi testado no hospedado. Se o push parar aqui, **não force**: as migrações anteriores já aplicadas ficam registradas; envie a mensagem de erro (sem a senha) e aguarde instrução.
- Exposição automática de novas tabelas está **desligada** no projeto (confirmado por luis): as migrações concedem privilégios explicitamente; a compatibilidade foi provada localmente.
- Depois do push, no SQL Editor: `notify pgrst, 'reload schema';` para a API enxergar o schema novo.

## 3. Conferências logo após a migração (somente leitura)
- [ ] `npx supabase db advisors --linked --type security --level warn` sem avisos novos (ou avisos explicados).
- [ ] SQL Editor: `select count(*) from pg_tables where schemaname='public' and not rowsecurity;` deve ser **0** (RLS em toda tabela).
- [ ] SQL Editor: `select table_name from information_schema.role_table_grants where grantee='anon' and table_schema='public';` deve voltar **vazio**.
- [ ] `verify-hosted.mjs` de novo: as seis tabelas devem passar de 404 para **acesso anônimo negado** (401/403), e as quatro linhas de autenticação seguem OK.
- [ ] Schema `private` não exposto (Settings > API > Exposed schemas: só `public`).

## 4. Primeiro proprietário, empresa e unidade
Seguir `FASE_08_4A.md` §6: criar a conta em Authentication > Users (Auto Confirm), depois no SQL Editor `select private.declare_environment('testes');` e `private.bootstrap_owner_organization(...)`. **Nunca** declarar `producao` neste projeto (irreversível). Dados fictícios apenas.

## 5. Ordem com o deploy (decisões separadas de luis)
1. Migração (esta seção) e conferências da §3.
2. Cloudflare Pages: variáveis `VITE_APP_MODE=hosted`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_ENV=testes`, `VITE_APP_URL=https://cozzigo.pages.dev` e `NODE_VERSION=24`. Faltando qualquer uma, o build falha de propósito.
3. Só então "Save and Deploy" (autorização própria). Antes, desligar deploys automáticos de branches e de Preview.
4. Depois do deploy: entrar com o proprietário, ver a faixa "Ambiente de testes", gerar uma etiqueta PDF e conferir que o QR abre `https://cozzigo.pages.dev/...`; sem erros de CSP no console; testar sessão (30 min de inatividade) e saída.

## 6. Se algo der errado
- **Push parou no meio:** não repita às cegas. `npx supabase migration list` mostra até onde foi. Reverter com os arquivos de `supabase/rollback/` só na ordem inversa e só com instrução; como o banco está vazio, o caminho mais simples e seguro é **apagar e recriar o projeto** (muda URL e chaves: atualizar Cloudflare, `.env` e rodar de novo desde o §1).
- **Rollback só da 8.4a:** `supabase/rollback/hosted_provisioning.sql` (remove funções e marcador; não toca em dados).
- **Dados fictícios a limpar depois:** `select * from private.reset_test_environment('operational','ZERAR AMBIENTE DE TESTES');` (ver `FASE_08_4A.md` §9).
- Nunca usar `service_role`/chave secreta no navegador nem no Cloudflare.

## 7. Pendências que continuam abertas
MFA obrigatório antes do lançamento comercial; backup diário e teste de restauração (plano pago); pausa por inatividade do plano Free; desativar as chaves legadas quando nada mais depender delas; Redirect URLs sem localhost; revisão independente de segurança pré-piloto; RT (Q10); teste físico de impressão/QR.
