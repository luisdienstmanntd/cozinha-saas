# Fatia 8.4e — Hospedagem de testes no ar (registro)

Registro do que luis informou em 18/11/2026 (~23:06 UTC). Sem segredos, e-mails ou senhas.

| Item | Estado |
|---|---|
| Nome comercial | CozziGo (identidade visual e título); repositório, pacote e projeto Supabase mantêm `cozinha-saas` |
| Projeto oficial no Cloudflare Pages | **`cozinha-saas`** (não `cozzigo`; o projeto `cozzigo` do plano original não é o oficial) |
| Endereço atual | https://cozinha-saas.pages.dev |
| `VITE_APP_URL` | corrigida por luis para o endereço acima (o QR das etiquetas usa esse endereço; ver `FASE_08_4B.md`) |
| Deploys automáticos e Preview | **desativados** por luis depois de a CI do PR #50 ter gerado duas pré-visualizações públicas do projeto `cozinha-saas` |
| Deploy | **manual**, feito por luis; "Deploy" novo exige autorização própria dele |
| Ambiente | `VITE_APP_ENV=testes` (faixa "Ambiente de testes"); nunca declarar `producao` neste projeto |
| Login | proprietário B (conta fictícia) entrou com sucesso no site hospedado |
| Supabase | projeto `cozinha-saas-testes` (`wtscafnacsmyfmqcaffy`, Free, sa-east-1): 30 migrações aplicadas, `rls_auto_enable` ajustada, ambiente declarado `testes`, empresas fictícias A e B, colaborador de A (`FASE_08_4C_MIGRACAO_HOSPEDADA.md`, `FASE_08_4D_VALIDACAO_ISOLAMENTO.md`) |

## Consequências
- Os exemplos `https://cozzigo.pages.dev` em `FASE_08_4A/4B/4C` e em `.env.example` passaram a `https://cozinha-saas.pages.dev`. Os testes automáticos mantêm `cozzigo.pages.dev` apenas como valor de exemplo.
- Domínio próprio no futuro: trocar só `VITE_APP_URL` no Cloudflare e refazer o build (sem mudar código).
- Falta no ambiente hospedado: validação de isolamento e sessões (`scripts/hosted/validate-isolation.mjs`, incluindo `--wait-inactivity`), ampliação com dados operacionais fictícios (autorização própria de luis), MFA antes do lançamento comercial, backup e teste de restauração (plano Free não tem backup diário), URLs de redirecionamento do Auth, desativar chaves legadas, teste físico de impressão/QR, conferência da nutricionista RT (Q10).
