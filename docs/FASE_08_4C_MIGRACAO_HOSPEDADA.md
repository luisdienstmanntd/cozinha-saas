# Fatia 8.4c — Procedimento de migração do banco hospedado de testes (checklist, NÃO executado)

Status: documento preparado em 18/11/2026. Migração **aplicada** em `cozinha-saas-testes` em 18/11/2026 (ver seção 8); **não houve deploy**. Este procedimento só vale com autorização específica de luis, por escrito, para a migração (e outra, separada, para o primeiro deploy).

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
3. `npx supabase db push --remote --dry-run` — **a flag `--remote` é obrigatória no CLI 3.x**: sem ela o alvo é o banco local (Docker). A primeira linha deve dizer `Target: project cozinha-saas-testes (wtscafnacsmyfmqcaffy)`.
    **conferir**: exatamente 30 migrações, da primeira até `20261118000000`, nenhuma a mais, nenhuma faltando. Qualquer divergência: pare.
4. `npx supabase db push --remote` (pede `Yes/No`; o padrão é No).
5. `npx supabase migration list --remote` — colunas Local e Remote iguais.

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
2. Cloudflare Pages: variáveis `VITE_APP_MODE=hosted`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_ENV=testes`, `VITE_APP_URL=https://cozinha-saas.pages.dev` e `NODE_VERSION=24`. Faltando qualquer uma, o build falha de propósito.
3. Só então "Save and Deploy" (autorização própria). Antes, desligar deploys automáticos de branches e de Preview.
4. Depois do deploy: entrar com o proprietário, ver a faixa "Ambiente de testes", gerar uma etiqueta PDF e conferir que o QR abre `https://cozinha-saas.pages.dev/...`; sem erros de CSP no console; testar sessão (30 min de inatividade) e saída.

## 6. Se algo der errado
- **Push parou no meio:** não repita às cegas. `npx supabase migration list` mostra até onde foi. Reverter com os arquivos de `supabase/rollback/` só na ordem inversa e só com instrução; como o banco está vazio, o caminho mais simples e seguro é **apagar e recriar o projeto** (muda URL e chaves: atualizar Cloudflare, `.env` e rodar de novo desde o §1).
- **Rollback só da 8.4a:** `supabase/rollback/hosted_provisioning.sql` (remove funções e marcador; não toca em dados).
- **Dados fictícios a limpar depois:** `select * from private.reset_test_environment('operational','ZERAR AMBIENTE DE TESTES');` (ver `FASE_08_4A.md` §9).
- Nunca usar `service_role`/chave secreta no navegador nem no Cloudflare.

## 7. Pendências que continuam abertas
MFA obrigatório antes do lançamento comercial; backup diário e teste de restauração (plano pago); pausa por inatividade do plano Free; desativar as chaves legadas quando nada mais depender delas; Redirect URLs sem localhost; revisão independente de segurança pré-piloto; RT (Q10); teste físico de impressão/QR.

## 8. Registro da execução (18/11/2026, autorizada por luis)
- Conferências prévias: projeto `wtscafnacsmyfmqcaffy`, Postgres **17.11**, 0 tabelas/schemas do app, 0 histórico de migrações, 0 contas.
- Cópia limpa do repositório em `b723bfe`, Node 24.12, `npm ci` sem vulnerabilidades, Supabase CLI 3.0.0. `link` sem alterar arquivos (`git status` limpo).
- `db push --remote --dry-run`: **30 migrações**, idênticas às de `supabase/migrations` (comparadas), alvo correto. Um primeiro `dry-run` sem `--remote` mirou o banco local e falhou sem efeito.
- `db push --remote`: aplicado; `migration list --remote` com local e remoto iguais.
- `verify-hosted.mjs` depois: 4 checagens de autenticação OK; as 6 tabelas passaram de 404 para **401** (anônimo negado).
- Consulta de estrutura (SQL Editor): migrações 30, tabelas `public` 21, sem RLS 0, privilégios de `anon` 0, funções administrativas expostas 0, gatilhos append-only `ALWAYS` 25, tabelas `private` 2, marcador de ambiente 0, `pre_request` da V2 = true (o `alter role authenticator` funcionou no hospedado), empresas 0. **Única divergência:** `funcoes_anon = 1`.

### 8.1 Função da plataforma `public.rls_auto_enable()` (divergência e correção)
- Não é nossa (não aparece em migração, doc ou teste). SECURITY DEFINER, dono `postgres`, usada pelo gatilho de evento `ensure_rls` (`ddl_command_end`, ativo) que liga RLS em tabela nova. O local não a tem.
- **Permissões originais:** `proacl = NULL` (padrão: `PUBLIC` executa, logo `anon` e `authenticated` também), o que permitia chamá-la por `/rest/v1/rpc/rls_auto_enable`.
- **Antes:** teste de criar tabela em transação que termina em erro de propósito: `relrowsecurity = t`.
- **Alteração (autorizada por luis, só neste projeto, sem apagar nem alterar a função):**
  `revoke execute on function public.rls_auto_enable() from public, anon, authenticated;`
- **Depois:** `proacl = {postgres=X/postgres}`, `funcoes_anon = 0`, função e gatilho intactos (`ativo = O`), o mesmo teste de tabela continua dando `relrowsecurity = t`, e a chamada anônima pela API responde `permission denied for function rls_auto_enable` (401). `verify-hosted` continua com todas as linhas OK.
- **Reversão (não deixa exatamente `NULL`, mas equivale ao padrão):** `grant execute on function public.rls_auto_enable() to public;`

### 8.2 Para futuras instalações do CozziGo (novo projeto Supabase)
Depois do `db push --remote`, rodar no SQL Editor a consulta de estrutura da seção 3 e, se `funcoes_anon` for maior que 0 por causa de `public.rls_auto_enable()`, aplicar o mesmo `revoke` (só se a função existir):
```sql
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
```
Depois repetir a consulta (`funcoes_anon 0`), o teste de tabela com RLS automático e o `verify-hosted`. Não é migração do repositório de propósito: a função é da plataforma e não existe no Supabase local.

### 8.3 Ainda pendente após a migração
Isolamento entre empresas e proteção de sessões **no hospedado** exigem contas de teste (etapa seguinte); o marcador `testes` ainda não foi declarado; sem deploy. As garantias de RLS/isolamento/sessões já são cobertas pela bateria local (pgTAP, integração e E2E) sobre as mesmas migrações.
