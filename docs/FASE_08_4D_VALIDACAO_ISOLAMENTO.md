# Fatia 8.4d — Validação de isolamento e sessões no ambiente hospedado de testes

Status: script e testes prontos em PR em rascunho. **Ainda não executado no hospedado**: luis revisa o PR antes. Autorizada por luis em 18/11/2026, só no ambiente de testes, só com contas e empresas fictícias, sem deploy.

## 1. O que o script faz (`scripts/hosted/validate-isolation.mjs`)
Entra com três contas fictícias (proprietário A, proprietário B e colaborador de A) e confere, nos dois sentidos (A→B, B→A) e com o colaborador contra B:

| Verificação | Resultado esperado |
|---|---|
| Cada conta vê só a empresa fictícia esperada | exatamente 1 empresa, com o nome `CozziGo Teste A` ou `B` |
| Leitura das 21 tabelas filtrando pela outra empresa | 0 linhas |
| Leitura sem filtro | só linhas da própria empresa |
| Leitura com junção (empresa → unidades, vínculos) | não alcança a outra empresa |
| Inserir, alterar e excluir direto em 8 tabelas da outra empresa | recusado (sem permissão ou 0 linhas) |
| Funções de escrita (`receive_batch`, `record_movement`, `create_storage_location`, `set_establishment_settings`, `set_member_display_name`) com dados da outra empresa | erro 42501 (acesso negado) |
| Colaborador: as mesmas funções na própria empresa e inserção direta | recusadas (piloto: só o proprietário escreve) |
| Colaborador lê a própria empresa | 1 linha |
| Sem login | nenhuma das tabelas é lida |
| Token adulterado (assinatura, usuário trocado, `alg: none`) | 401/403 |
| Token verdadeiro (controle) | funciona |
| Sair (sessão nova de A) | o token copiado antes dá 401 `SESSION_EXPIRED`; o refresh token não renova |
| Contagens antes e depois, para as três contas | idênticas: **nada foi gravado** |
| `--wait-inactivity` (opcional, ~31 min) | sessão parada recusada com 401 `SESSION_EXPIRED` |

## 2. Salvaguardas
- **Só no ambiente de testes:** o endereço é fixo no arquivo (`wtscafnacsmyfmqcaffy`); não há variável, argumento nem pergunta que o troque. Só o teste automático contra o Supabase **local** descartável tem outro destino, por parâmetro interno que a linha de comando não alcança.
- **Só chave publicável** (`sb_publishable_`). Chave secreta, `service_role` e JWT são recusados.
- **Trava de empresa fictícia:** se qualquer conta não enxergar exatamente a empresa esperada, o script aborta **antes de qualquer tentativa**.
- **Nenhuma escrita de negócio:** só leituras e tentativas que devem ser recusadas; antes e depois conta as linhas visíveis a cada conta e exige igualdade. As escritas "recusadas" usam colunas válidas, para que só permissão e RLS as barrem.
- **Credenciais:** e-mails e senhas só na memória; senha digitada sem eco; nada em arquivo; toda saída passa por `scrub` (senha, e-mail, JWT e chaves viram `[oculto]`). Teste automático confere.
- Uma sessão de A é encerrada com `scope: local` para não derrubar a sessão principal do teste; ao final, as três sessões são encerradas.

## 3. Limites honestos
- Tabelas operacionais (recebimentos, recipientes, movimentos) estão **vazias** no hospedado; nelas a prova é "0 linhas" + RLS ligada + sem privilégio de escrita direta. A prova com dados nessas tabelas é a bateria local (pgTAP, integração, E2E) sobre as mesmas migrações. Dados fictícios de configuração (produtos e fornecedores) são criados no passo 2 do procedimento, para que a leitura cruzada tenha o que vazar.
- Não prova o comportamento do Auth hospedado além das respostas observadas (limites de e-mail, rate limits). O rate limit de login foi reduzido para 10; o script faz 5 logins. Não rode várias vezes seguidas.
- Expiração por inatividade só com `--wait-inactivity`; sem ele a linha aparece como `PULOU`.

## 4. Como rodar (na máquina de luis, depois de revisar o PR)
```powershell
cd cozinha-saas-migracao
git pull origin main
node scripts/hosted/validate-isolation.mjs
# opcional, leva ~31 minutos:  node scripts/hosted/validate-isolation.mjs --wait-inactivity
```
O script pede a chave publicável e, para cada conta, e-mail e senha (sem eco). Saída: uma linha `OK`/`FALHA` por verificação e, ao final, "nenhuma falha. Nenhum dado foi gravado." Código de saída 0 só sem falhas.

## 5. Preparação no hospedado (SQL Editor, como `postgres`; ensaiada localmente em transação com rollback)
```sql
select private.declare_environment('testes');
select * from private.bootstrap_owner_organization('<email A>', 'Prop A', 'CozziGo Teste A', 'Unidade Teste A', 'America/Sao_Paulo');
select * from private.bootstrap_owner_organization('<email B>', 'Prop B', 'CozziGo Teste B', 'Unidade Teste B', 'America/Sao_Paulo');
select private.add_member_to_organization(o.id, '<email colaborador>', 'Colab A', 'member')
  from public.organizations o where o.name = 'CozziGo Teste A';
insert into public.products (organization_id, establishment_id, name, unit)
  select e.organization_id, e.id, 'ZZ Produto ' || right(o.name, 1), 'kg'
  from public.establishments e join public.organizations o on o.id = e.organization_id
  where o.name in ('CozziGo Teste A', 'CozziGo Teste B');
insert into public.suppliers (organization_id, establishment_id, name)
  select e.organization_id, e.id, 'ZZ Fornecedor ' || right(o.name, 1)
  from public.establishments e join public.organizations o on o.id = e.organization_id
  where o.name in ('CozziGo Teste A', 'CozziGo Teste B');
```
Nunca declarar `producao` neste projeto. Para recomeçar depois: `private.reset_test_environment('everything', 'ZERAR AMBIENTE DE TESTES')` (ver `FASE_08_4A.md` §9).

## 6. Testes
- `tests/ci/validate-isolation.test.mjs` (9): destino fixo, só chave publicável, linha de comando sem como trocar o endereço, tokens adulterados, saída sem segredos, trava de empresa fictícia, critério de "recusado", comparação de fotografias, lista de tabelas igual à das migrações.
- `tests/integration/validate-isolation.test.mjs` (2): o script inteiro contra o Supabase local com os mesmos dados fictícios (todas as verificações `OK`, nenhuma `FALHA`) e um caso de conta errada (o script aborta antes de qualquer tentativa).
