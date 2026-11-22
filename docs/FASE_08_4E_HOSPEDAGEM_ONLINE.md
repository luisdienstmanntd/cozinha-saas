# Fatia 8.4e — Hospedagem de testes no ar (registro)

Registro do que luis informou em 18/11/2026 (~23:06 UTC). Sem segredos, e-mails ou senhas.

| Item | Estado |
|---|---|
| Nome comercial | CozziGo (identidade visual e título); repositório, pacote e projeto Supabase mantêm `cozinha-saas` |
| Projeto oficial no Cloudflare Pages | **`cozinha-saas`** (não `cozzigo`; o projeto `cozzigo` do plano original não é o oficial) |
| Endereço atual | https://cozinha-saas.pages.dev |
| `VITE_APP_URL` | corrigida por luis para o endereço acima (o QR das etiquetas usa esse endereço; ver `FASE_08_4B.md`) |
| Deploys automáticos e Preview | **ativos**: cada merge na `main` publica o site automaticamente (deploy de produção do Cloudflare) e cada push de branch gera uma prévia pública. Em 18/11/2026 luis chegou a desativá-los depois das prévias geradas pela CI do PR #50, mas eles voltaram a funcionar |
| Deploy | o primeiro foi manual, feito por luis. Hoje **cada merge na `main` é uma publicação** e exige autorização explícita de luis citando a publicação |
| Ambiente | `VITE_APP_ENV=testes` (faixa "Ambiente de testes"); nunca declarar `producao` neste projeto |
| Login | proprietário B (conta fictícia) entrou com sucesso no site hospedado |
| Supabase | projeto `cozinha-saas-testes` (`wtscafnacsmyfmqcaffy`, Free, sa-east-1): 30 migrações aplicadas, `rls_auto_enable` ajustada, ambiente declarado `testes`, empresas fictícias A e B, colaborador de A (`FASE_08_4C_MIGRACAO_HOSPEDADA.md`, `FASE_08_4D_VALIDACAO_ISOLAMENTO.md`) |

## Consequências
- Os exemplos `https://cozzigo.pages.dev` em `FASE_08_4A/4B/4C` e em `.env.example` passaram a `https://cozinha-saas.pages.dev`. Os testes automáticos mantêm `cozzigo.pages.dev` apenas como valor de exemplo.
- Domínio próprio no futuro: trocar só `VITE_APP_URL` no Cloudflare e refazer o build (sem mudar código).
- Falta no ambiente hospedado: validação de isolamento e sessões (`scripts/hosted/validate-isolation.mjs`, incluindo `--wait-inactivity`), ampliação com dados operacionais fictícios (autorização própria de luis), MFA antes do lançamento comercial, backup e teste de restauração (plano Free não tem backup diário), URLs de redirecionamento do Auth, desativar chaves legadas, teste físico de impressão/QR, conferência da nutricionista RT (Q10).

## Onde paramos (18/11/2026, ~23:10 UTC)
- **Integrado na `main`:** #46 (identidade CozziGo), #47 (etiqueta PDF no hospedado, `VITE_APP_URL`), #48 (procedimento de migração), #49 (registro da migração e `rls_auto_enable`), #50 (script de validação de isolamento, `7d664d5`, revisado pelos nove pontos de luis). Falta mesclar o #51 (este registro), com aval de luis.
- **Hospedado de testes:** 30 migrações aplicadas e validadas; `rls_auto_enable` revogada para `public`/`anon`/`authenticated`; ambiente declarado `testes`; contas fictícias (proprietário A, proprietário B, colaborador de A), empresas `CozziGo Teste A`/`B`, uma unidade cada, produtos e fornecedores fictícios. Site no ar em https://cozinha-saas.pages.dev; login do proprietário B funcionou.
- **Próximo passo, na máquina de luis (autorizado, não executado ainda):** `git checkout main`, `git pull origin main`, `node scripts/hosted/validate-isolation.mjs --wait-inactivity` (~35 min; sem usar o site nesse tempo). Enviar a saída inteira. Depois: repetir `verify-hosted.mjs` e a consulta estrutural e registrar o resultado em `FASE_08_4D_VALIDACAO_ISOLAMENTO.md`.
- **Depois disso (autorização própria de luis):** ampliar o isolamento com dados operacionais fictícios nas duas empresas (lotes, movimentos etc. por `receive_batch` como proprietário), porque 16 tabelas operacionais estão vazias e a leitura cruzada nelas não prova isolamento por dados.
- **Pendências sem data:** MFA antes do lançamento comercial; backup diário e teste de restauração (plano Free não tem); URLs de redirecionamento do Auth; desativar chaves legadas; revogar o token de acesso da CLI do Supabase usado na migração; teste físico de impressão e QR; conferência da nutricionista RT (Q10); nunca declarar `producao` neste projeto.
- **Regras vigentes:** nenhum deploy novo, merge, migração ou alteração no Supabase hospedado sem autorização específica de luis; só dados fictícios; nunca registrar senhas, e-mails de contas ou chaves.
- **Nota de trabalho:** luis passa a trabalhar na interface e no visual do sistema. Essas mudanças vêm de outra frente (provavelmente em paralelo na `main`); quem retomar a validação deve fazer `git pull` antes e conferir que o script e `TABLES` continuam batendo com as migrações (o teste `tests/ci/validate-isolation.test.mjs` cobre isso).
