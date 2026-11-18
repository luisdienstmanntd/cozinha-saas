# Fase 8, fatia 8.4a — Modo hospedado e ambiente de testes (D-067)

> **Estado (18/11/2026, 02:46 UTC):** **aceita definitivamente por luis** (com a D-067) e integrada na `main` pelo PR #44 (`d05a6e7`, CI verde). Nada foi aplicado no Supabase hospedado nem implantado no Cloudflare; ambos exigem autorização específica de luis.

Antecipa parcialmente a fatia 8.4 (hospedagem) do `PLANO_INTEGRACAO.md` para que luis use o sistema definitivo com **dados fictícios** e o refine aos poucos. **Nada aqui foi aplicado no Supabase hospedado nem implantado no Cloudflare Pages**; tudo foi validado só no Supabase local descartável. Nada afirma conformidade sanitária (Q10 segue pendente). Sem merge, deploy, contratação ou alteração no banco hospedado sem autorização específica de luis.

## 1. Estado da integração e base

Em 18/11/2026 a cadeia de integração terminou: a `main` está em `1e3cd0e` (inclui #22 a #34, #36 a #41 e #43; o #35 foi fechado sem merge), com a CI da `main` verde. Esta branch nasceu da `main` em `98cfa5d` (sem a cadeia) para ficar independente dela; **a `main` foi incorporada por merge (`b3a9e44`), sem reescrever histórico**.

Conflitos resolvidos (seis arquivos): `docs/DECISOES.md` e `docs/IA_ESTADO.md` (mantidas as duas entradas; a **D-066** da `main` é a estabilização da CI e esta decisão continua **D-067**), `src/app/styles.css` (as duas folhas), `src/app/configureApp.ts` (versão da `main`, com a sessão persistente da V2, mais `hostname`, `assertModeAllowedOnHost` e o modo `hosted` no mesmo `createClient`), `src/app/App.tsx` (faixa do ambiente e o parâmetro `unit` da V1) e `IdentityHome.tsx` (o texto do ambiente da V1 passou a aceitar o texto `hosted`). A lista do reset ganhou `production_label_downloads` e `production_temperatures` (fatias 7.8 e 7.9); `private.session_activity` (V2) não está no schema `public` e o reset não a toca (teste incluído).

**A migração desta fatia (`20261118000000`) é a mais recente**: pode ser aplicada no hospedado junto com as demais, em ordem, sem `--include-all`.

## 2. O que foi feito, por etapa

| # | Pedido | Entrega |
|---|---|---|
| 2 | Modo hosted preservando local e demo | `VITE_APP_MODE=hosted` em `src/shared/config/environment.ts` (esquema Zod estrito: https, domínio `<20 caracteres>.supabase.co`, sem caminho/porta/usuário/barra final; chave `sb_publishable_`; `VITE_APP_ENV` = `testes` ou `producao`). `configureApp` usa os mesmos gateways nos três modos, `demo` e `local` ficam como eram (os 330 testes unitários e os E2E existentes passam sem alteração). Sessão: igual ao local desta base (V2 vem com a cadeia). |
| 3 | Hospedagem mal configurada não cai na demo | Três camadas. **Build:** `vite.config.ts` chama `assertBuildEnvironment`; no Cloudflare Pages (`CF_PAGES=1`) ou com `VITE_APP_MODE=hosted`, faltar ou errar qualquer variável **interrompe o build** (mensagem só com nomes, nunca valores); `VITE_*` com cara de segredo (`SECRET`, `SERVICE_ROLE`, `sb_secret_`…) também interrompe, em qualquer build. **Execução:** em nome de máquina que não é local, `demo` e `local` são recusados (`assertModeAllowedOnHost`) e aparece a tela "Não foi possível iniciar o aplicativo", sem mostrar valores; a demo pública só existe com `VITE_ALLOW_PUBLIC_DEMO=true` de propósito. **Aviso:** em `hosted` + `testes`, faixa fixa "Ambiente de testes. Use somente dados fictícios…". |
| 4 | Variáveis de ambiente | `.env.example` com os três modos comentados e a regra "só VITE_* públicas"; tabela na seção 4 abaixo. Nenhum segredo no repositório. |
| 5 | CSP e cabeçalhos | `src/shared/security/headers.ts` + plugin no build gera `dist/_headers` com o endereço exato do Supabase: `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'self' <projeto>`, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`, `upgrade-insecure-requests`, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (câmera, microfone, localização etc. negados), COOP/CORP e cache imutável só para `/assets/*`. Sem `unsafe-inline`/`unsafe-eval` (o aplicativo não usa estilo em linha). **Conferido em navegador real** servindo o `dist` com esses cabeçalhos: tela de acesso e faixa renderizam e o console fica sem violações. Limite: o download de etiqueta (PDF por `blob:`) não foi exercitado sob a CSP em navegador; downloads não são restringidos pela CSP, mas confirme com uma etiqueta no primeiro uso. |
| 6 | Migrações do banco hospedado | Preparadas e validadas **só no Supabase local** (`db reset` aplica as 30 migrações; pgTAP e advisors verdes). Procedimento na seção 5. Nada foi aplicado. |
| 7 | Primeiro proprietário, empresa e unidade | Migração `20261118000000_hosted_provisioning.sql`: `private.bootstrap_owner_organization` e `private.add_member_to_organization`. A conta é criada por você no painel (Authentication > Users > Add user, com Auto Confirm); depois um comando no SQL Editor cria empresa, unidade e vínculo em uma transação. **Nenhuma chave de serviço sai do Supabase.** Seção 6. |
| 8 | Cadastro público restrito | O Supabase local já roda com `enable_signup = false` e a API recusa `signUp` e login anônimo (teste de integração). Para o hospedado a configuração é do painel (seção 8). `scripts/hosted/verify-hosted.mjs` confere o projeto hospedado **só com leitura**, usando apenas endereço e chave publicável: cadastro desligado, login anônimo, confirmação de e-mail, API anônima sem acesso às tabelas. Defesa em profundidade: uma conta sem vínculo não enxerga nem cria empresa, unidade ou vínculo (teste de integração). |
| 9 | Validar RLS, permissões, sessões e isolamento | Seção 7. |
| 10 | Zerar o banco de testes | `private.reset_test_environment`, com marcador de ambiente e quatro travas. Seção 9. |

## 3. Decisão D-067

- **Decisão:** a 8.4a entrega o necessário para um ambiente hospedado **de testes**, com dados fictícios, em projeto Supabase próprio. A produção terá projeto e domínio separados (decisão 6 da revisão técnica) e continua exigindo MFA obrigatório, revisão de segurança independente, backup com teste de restauração e a conferência da nutricionista RT.
- **Motivo:** pedido de luis de 18/11/2026 de usar o sistema definitivo com dados fictícios enquanto o refina.
- **Consequência:** o ambiente de testes pode ser zerado a qualquer momento (e o aplicativo diz isso numa faixa). O marcador `producao` é irreversível.
- **Revisar quando:** a 8.4 completa (produção) for autorizada.

## 4. Variáveis de ambiente

| Variável | Onde | Valor | Observação |
|---|---|---|---|
| `NODE_VERSION` | Cloudflare (build) | `24` | já configurada |
| `VITE_APP_MODE` | Cloudflare | `hosted` | sem ela (ou com `demo`/`local`) o build falha na hospedagem |
| `VITE_SUPABASE_URL` | Cloudflare | `https://<ref>.supabase.co` | sem barra final, sem caminho |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cloudflare | `sb_publishable_…` | **publicável**; nunca a secreta nem a `service_role` |
| `VITE_APP_ENV` | Cloudflare | `testes` | `producao` só no futuro projeto de produção |
| `VITE_ALLOW_PUBLIC_DEMO` | — | não definir | só para uma demonstração pública intencional |

Configure as quatro `VITE_*` em **Production e em Preview** (ou desligue os deploys de Preview): sem elas, o build de Preview falha de propósito. Chaves secretas e a senha do banco **não** vão ao Cloudflare nem ao GitHub.

## 5. Migrações no banco hospedado (preparado, não aplicado)

Validação local feita: `supabase db reset` aplica tudo do zero; `supabase test db` (pgTAP) e `supabase db advisors --type security --level warn --fail-on warn` passam. Rollback desta fatia: `supabase/rollback/hosted_provisioning.sql`.

Procedimento para quando você autorizar (na sua máquina, com a cadeia já na `main`):

1. `npx supabase login` e `npx supabase link --project-ref <ref>` (pede a senha do banco, que você guarda em gerenciador de senhas).
2. `npx supabase db push --dry-run` — confira que a lista de migrações é exatamente a esperada (30 no total: as 29 da `main` atual e `20261118000000`, a última).
3. `npx supabase db push`.
4. `npx supabase migration list` — local e remoto iguais.
5. Pontos a observar no primeiro `push`: (a) a migração da V2 (`20261116000000`) executa `alter role authenticator set pgrst.db_pre_request`; isso é prática documentada do Supabase, mas **não pôde ser testado no hospedado** — se falhar, o `push` para sem aplicar o resto e me avise; (b) as migrações rodam como `postgres`, dono das tabelas, que é o que as funções administrativas desta fatia precisam.

## 6. Primeiro proprietário, empresa e unidade

1. **Authentication > Users > Add user > Create new user:** e-mail do proprietário, senha forte gerada por gerenciador (mín. 12), marcar **Auto Confirm User**. Guarde a senha por canal seguro; ela deve ser trocada no primeiro acesso.
2. **SQL Editor** (roda como `postgres`), uma vez:
   ```sql
   select private.declare_environment('testes');
   select * from private.bootstrap_owner_organization(
     'email-do-proprietario@exemplo.com', 'Nome curto', 'Nome da empresa fictícia', 'Nome da unidade', 'America/Sao_Paulo');
   ```
3. Colaboradores (conta criada do mesmo jeito):
   ```sql
   select private.add_member_to_organization('<organization_id devolvido acima>', 'colaborador@exemplo.com', 'Nome curto', 'member');
   ```
Regras do banco: recusa e-mail sem conta ou não confirmado; nome da empresa repetido; conta que já tem vínculo ativo (uma conta por pessoa); fuso inválido (o fuso fica imutável depois do primeiro recebimento, 6.0c); nomes fora de 1 a 80 caracteres (exibição: 1 a 40, curto e sem sobrenome completo — dado pessoal, R6). Tudo ou nada. As funções **só funcionam em sessão de administração do banco**: a API (anon, authenticated, service_role) não as executa, o schema `private` não é exposto e a própria função confere `session_user`.

## 7. Validação de RLS, permissões, autenticação, sessões e isolamento (local)

Executada contra o Supabase local, que usa as mesmas migrações e a mesma versão de Auth/PostgREST da CLI:

- **RLS e isolamento entre empresas:** a bateria existente (pgTAP e integração) cobre negação cruzada, inserção falsa e junções; esta fatia acrescentou, em `hosted_provisioning.test.sql`, duas empresas criadas pelas funções novas com cada proprietário enxergando só a sua; `security_guard.test.sql` (RLS em toda tabela, `anon` sem privilégio algum) segue verde com o schema novo.
- **Cadastro e autenticação:** `signUp` e login anônimo recusados; nenhuma conta criada; conta sem vínculo não lê nem cria empresa/unidade/vínculo e não lê recebimentos, recipientes ou movimentos.
- **Sessões:** vínculo revogado tira o acesso na hora, com a mesma sessão; token adulterado recebe 401/403; `signOut` global invalida o refresh token. A inatividade de 30 minutos (V2/D-025) vem na cadeia e **não faz parte desta base**.
- **Não validável aqui:** comportamento do Auth **hospedado** (limites de e-mail do plano Free, expiração real de JWT, rate limits). O `verify-hosted.mjs` cobre a parte de configuração; o resto é observado no primeiro uso.

## 8. Cadastro público restrito (configuração do painel)

Ver o guia da seção 10, passo 3. Depois de configurar, rode (somente leitura):

```
VERIFY_SUPABASE_URL=https://<ref>.supabase.co VERIFY_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... node scripts/hosted/verify-hosted.mjs
```
Esperado: nenhuma linha `FALHA`. Avisos ("AVISO") pedem conferência manual no painel. O script nunca tenta se cadastrar e não imprime a chave.

## 9. Zerar o banco de testes

`select * from private.reset_test_environment('operational', 'ZERAR AMBIENTE DE TESTES');` no SQL Editor.

Travas, todas obrigatórias: (1) sessão de administração do banco (não funciona pela API) e **cadeado administrativo**: só uma operação administrativa por vez (a segunda recebe erro `55P03` na hora); (2) o marcador `private.environment_marker` precisa existir e ser `testes` — **sem marcador, ou com `producao`, recusa** (e `producao` é irreversível: não volta a `testes`, não é apagado nem truncado; declarar `producao` exige uma frase de confirmação); (3) escopo e frase exatos — **escopo nulo, vazio ou desconhecido é recusado**; (4) **lista explícita de tabelas** (abaixo); (5) transação única, sem `CASCADE`, espera de no máximo 15 s por tabela em uso (desiste sem apagar) e verificação final `assert_history_protected()`.

- **Listas explícitas** (dentro da função): *operacionais* — `batch_receipts`, `container_balances`, `container_handlings`, `containers`, `entity_changes`, `handling_voids`, `location_moves`, `occurrence_decisions`, `occurrences`, `batch_productions`, `production_label_downloads`, `production_temperatures`, `production_voids`, `stock_movements`; *configuração* — `establishment_settings`, `establishments`, `memberships`, `organizations`, `products`, `storage_locations`, `suppliers`. **Fail-closed:** se existir no schema `public` uma tabela que não está em nenhuma lista (ou uma lista citar tabela inexistente), o reset **recusa** e diz qual; um teste pgTAP falha junto, avisando quem criar tabela nova para classificá-la. `private.session_activity` (V2) fica de fora de propósito: não está no schema `public` e o reset não a toca.
- `operational`: apaga as tabelas operacionais e **mantém** as de configuração. `everything`: apaga as duas listas.
- **Registros auxiliares de sessão:** o reset **não toca** em `auth.users`, `auth.sessions`, `private.session_activity` (V2) nem no marcador. Motivo: contas e sessões não têm dado de negócio; apagar `session_activity` só reiniciaria o relógio de inatividade, e apagar `auth.sessions` derrubaria quem está usando o site sem necessidade. Quem perde vínculo no `everything` passa a não enxergar nada (RLS). Para recomeçar também as contas, apague-as em Authentication > Users. Teste: uma linha de `auth.sessions` sobrevive ao reset completo.
- Os gatilhos append-only são suspensos **só dentro da função** e restaurados exatamente como estavam (`ENABLE ALWAYS` incluído); o teste confirma que o histórico volta a recusar `DELETE`.
- Devolve a contagem de linhas removidas por tabela.
- Alternativa mais drástica, sem SQL: apagar e recriar o projeto no Supabase (muda URL e chaves; exige atualizar o Cloudflare).

## 10. Guia: o que você precisa fazer pessoalmente (em ordem)

**0. Antes de tudo — Cloudflare Pages:** desligue os deploys de **Preview** (Settings > Builds & deployments > Branch control) ou garanta as quatro `VITE_*` também em Preview. Enquanto a conexão com o GitHub estiver ativa, **qualquer push na `main` (merge) dispara um deploy de produção**; é o "deploy" que você ainda quer controlar. Se quiser impedi-lo até estar pronto, pause o projeto ou deixe "Automatic production branch deployments" desligado.

**1. GitHub:** mergear a cadeia na ordem do plano (você); depois me peça o rebase deste PR sobre a `main`. Considere aplicar a proteção da `main` de `docs/PROTECAO_MAIN_PROPOSTA.md` e ligar *Secret scanning* e *Push protection* (Settings > Code security; o repositório é público). Nunca coloque chave do Supabase em Secrets do GitHub sem necessidade.

**2. Supabase — chaves (Settings > API Keys):** use só a **publishable** no Cloudflare. A **secret** e a senha do banco ficam só com você (gerenciador de senhas). Depois de tudo funcionando, considere desativar as chaves legadas JWT (anon/service_role).

**3. Supabase — Authentication (antes de criar contas):**
   - *Sign In / Providers:* **desligar "Allow new users to sign up"**; desligar **Anonymous sign-ins**; deixar só o provedor Email (sem provedores sociais, sem telefone).
   - *Email:* ligar **Confirm email**; ligar troca segura de senha (*Secure password change*).
   - *Password:* mínimo **12** caracteres com minúsculas, maiúsculas, dígitos e símbolos. Proteção contra senhas vazadas: só em planos pagos, se existir no seu plano.
   - *Multi-Factor:* ligar TOTP (inscrição e verificação). **Importante:** isso só permite cadastrar o fator; torná-lo **obrigatório** para proprietários ainda exige código no aplicativo (decisão 2 da revisão técnica; não implementado nesta fatia).
   - *URL Configuration:* **Site URL** = endereço final do site no Cloudflare (`https://….pages.dev` ou domínio); remova URLs de localhost; sem curingas.
   - *Rate limits:* conferir os valores de `supabase/production/auth.example.toml` (mais baixos que os locais).
   - *Data API:* expor só o schema `public`; novas tabelas **não** devem ser expostas automaticamente.
   - Rode o `verify-hosted.mjs` (seção 8) e corrija o que sair como `FALHA`.

**4. Supabase — banco:** só depois da cadeia na `main`, com sua autorização: seção 5 (login, link, dry-run, push). Em seguida seção 6 (conta, marcador `testes`, empresa/unidade).

**5. Cloudflare Pages:** conferir as variáveis da seção 4 (Production e Preview) e `NODE_VERSION=24`; fazer o primeiro deploy; abrir o site e entrar com o proprietário; imprimir uma etiqueta de teste (PDF) para confirmar o download sob a CSP; no console do navegador não deve haver erros de CSP. Domínio próprio, se quiser: Custom domains (depois de decidir o nome). Opcional e recomendado: proteger o site de testes com **Cloudflare Access** (grátis até 50 usuários), para que só você e quem convidar o abram.

**6. Limites do plano Free a conhecer:** o projeto Supabase **pausa após cerca de uma semana sem atividade** (retome pelo painel); **não há backup diário automático** no Free (aceitável para dados fictícios; para produção é requisito — decisão 7 da revisão técnica); o envio de e-mail nativo é muito limitado (por isso as contas são criadas por você, com Auto Confirm).

## 11. Testes (resultados reais, Node 24, Supabase local, código combinado `main` 1e3cd0e + 8.4a)

| Comando | Resultado |
|---|---|
| `format:check`, `lint`, `typecheck`, `build` | ok |
| `build` com `CF_PAGES=1` e sem variáveis | **falha de propósito** com mensagem explícita; com as quatro variáveis, passa e gera `dist/_headers` |
| Vitest | 552 passaram |
| `test:ci-scripts` | 10 passaram |
| pgTAP | 1496 passaram (28 arquivos; 64 em `hosted_provisioning.test.sql`) |
| Advisors de segurança (`--fail-on warn`) | sem problemas |
| Integração | 57 passaram |
| E2E (Playwright, Chromium) | 35 passaram, sem alteração nos existentes |
| **Mesma bateria (pgTAP, advisors, integração, E2E) sem os privilégios padrão de tabelas novas** (exposição automática desligada) | tudo verde: 1496 / sem problemas / 57 / 35 |
| CSP em navegador real (dist servido com o `_headers`; verificado antes do merge) | tela de acesso e faixa renderizam; console sem violações |

Nenhum teste existente foi alterado, removido ou enfraquecido (o único ajuste foi um teste **novo** desta fatia, que passou a esperar a restauração assíncrona da sessão da V2). Não executado: nada no Supabase hospedado nem no Cloudflare (por ordem de luis).

## 12. Limites e decisões para luis

1. **Aceite final da 8.4a e da D-067**, depois dos seis pontos da seção 13.
2. **Quando integrar:** a cadeia já está na `main` e foi incorporada a esta branch por merge (seção 1), com a bateria completa no código combinado (seção 11). Falta só o seu aceite para o PR sair do rascunho; o merge é seu.
3. **Deploy automático do Cloudflare:** veja o passo 0 do guia; só você controla quando o primeiro deploy acontece. Nenhuma migração foi nem será aplicada no Supabase hospedado sem sua autorização específica.
4. **MFA obrigatório:** ver ponto 5 da seção 13.
5. **Proprietário único no piloto** (decisão de 12/11/2026) continua valendo; as funções de provisionamento aceitam o papel `owner` para colaboradores só se você pedir explicitamente.
6. **Pendências do piloto inalteradas:** nutricionista RT (Q10), teste físico de impressão, MFA, backup/restauração.

## 13. Condições do aceite de luis (18/11/2026, 00:39 UTC) e como foram tratadas

1. **Numeração duplicada D-066.** A D-066 é da fatia 8.1 (plano de integração). Esta decisão virou **D-067** em `DECISOES.md`, `IA_ESTADO.md`, na migração, nos testes e neste relatório. Conferi no GitHub: nenhuma branch usa D-067.
2. **Lista explícita de tabelas no reset.** Feito (seção 9), com recusa quando o schema e as listas divergem e teste que acusa a divergência.
3. **Operações administrativas simultâneas e escopos nulos/inválidos.** Cadeado `pg_try_advisory_xact_lock` comum a bootstrap, vínculo de colaborador, declaração do ambiente e reset (erro `55P03` para a segunda); `lock_timeout` de 15 s no reset. Escopo nulo, vazio ou desconhecido, confirmação nula, tipo de ambiente nulo, papel nulo, empresa nula e fuso nulo são recusados com erro claro (antes, um escopo nulo **passava** pela conferência, o que foi corrigido). Testes: pgTAP (nulos e inválidos) e integração com duas sessões `psql` reais (`admin-concurrency.test.mjs`).
4. **Registros auxiliares de sessão no reset.** Decisão e justificativa na seção 9 (não são tocados). Na integração com a V2, `private.session_activity` fica fora das duas listas de propósito; o teste de catálogo só cobre o schema `public`.
5. **MFA obrigatório antes do lançamento comercial.** Preservado como condição de lançamento: continua pendente (I-16, decisão 2 da revisão técnica) e **ausente apenas nos testes privados com dados fictícios**. Para que isso não seja esquecido: (a) `private.declare_environment('producao', …)` exige a frase `PRODUCAO COM MFA OBRIGATORIO`, que é um reconhecimento humano, **não uma verificação técnica**; (b) a faixa "Ambiente de testes" deixa claro que é teste; (c) a D-067 e este relatório listam MFA entre os requisitos de produção. A implementação do MFA obrigatório (cadastro do fator na interface e exigência de nível de autenticação nas políticas) segue como fatia própria, a pedir por você.
6. **Compatibilidade com a exposição automática de tabelas desativada.** O `config.toml` já traz `auto_expose_new_tables = false`, mas o Supabase local **não aplica** essa chave aos privilégios padrão (conferi: o `postgres` ainda concede privilégios a `anon`/`authenticated`/`service_role` em tabelas novas); por isso o teste local comum **não** prova a compatibilidade. Fiz a prova direta: uma migração temporária (não versionada) removeu esses privilégios padrão antes das demais e a bateria inteira rodou assim. Resultado na seção 11. As migrações já concedem tudo explicitamente (`revoke all` + `grant` por tabela/coluna/função), e as novas funções administrativas são só do schema `private`, sem tabela nova no `public`.
