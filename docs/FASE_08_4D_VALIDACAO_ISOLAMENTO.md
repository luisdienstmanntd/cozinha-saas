# Fatia 8.4d — Validação de isolamento e sessões no ambiente hospedado de testes

Status: script revisado após os nove pontos de luis (22:32Z) e testes prontos em PR em rascunho. **Ainda não executado no hospedado**: luis revisa o PR antes. Autorizada por luis em 18/11/2026, só no ambiente de testes, só com contas e empresas fictícias, sem deploy.

## 1. O que o script faz (`scripts/hosted/validate-isolation.mjs`)
Entra com três contas fictícias (proprietário A, proprietário B e colaborador de A) e confere, nos dois sentidos (A→B, B→A) e com o colaborador contra B. A ordem importa: **verificação inicial → fotografia → leituras → escritas (param no primeiro acesso indevido) → sessões → fotografia final**.

| Verificação | Resultado esperado |
|---|---|
| Papéis, vínculos e unidades (antes de qualquer tentativa) | A e B: proprietário ativo de `CozziGo Teste A`/`B`; colaborador: `member` ativo em A; cada conta vê só 1 empresa, só 1 unidade (`Unidade Teste A`/`B`) e só vínculos da própria empresa; os três usuários e as duas empresas são distintos |
| Todas as 21 tabelas legíveis e dentro do limite de 1000 linhas | senão, aborta antes de qualquer escrita |
| Leitura das 21 tabelas filtrando pela outra empresa | 0 linhas |
| Leitura sem filtro | só linhas da própria empresa |
| Leitura com junção (empresa → unidades, vínculos) | não alcança a outra empresa |
| Inserir, alterar e excluir direto em 8 tabelas da outra empresa | inserir: somente erro 42501; alterar/excluir: 42501 ou **0 linhas afetadas confirmadas pelo servidor** |
| Funções de escrita (`receive_batch`, `record_movement`, `create_storage_location`, `set_establishment_settings`, `set_member_display_name`) com dados da outra empresa | somente erro 42501 (acesso negado) |
| Colaborador: as mesmas funções e escritas diretas na própria empresa (com referências reais do próprio local) | recusadas (piloto: só o proprietário escreve) |
| Colaborador lê a própria empresa | 1 linha |
| Sem login, **nas 21 tabelas** | nenhuma é lida |
| Token adulterado (assinatura com bytes realmente alterados, usuário trocado, `alg: none`) | 401/403 |
| Token verdadeiro (controle) | funciona |
| Sair (sessão nova de A) | o token copiado antes dá 401 `SESSION_EXPIRED`; o refresh token não renova |
| Fotografia de **conteúdo** antes e depois, para as três contas | idêntica: **nada foi gravado** |
| `--wait-inactivity` (opcional, ~31 min) | sessão parada recusada com 401 `SESSION_EXPIRED` |

## 2. Salvaguardas
- **Só no ambiente de testes:** o endereço é fixo no arquivo (`wtscafnacsmyfmqcaffy`); não há variável, argumento nem pergunta que o troque. Só o teste automático contra o Supabase **local** descartável tem outro destino, por parâmetro interno que a linha de comando não alcança (o gancho de teste `betweenSnapshots` também só funciona nesse destino).
- **Só chave publicável** (`sb_publishable_`). Chave secreta, `service_role` e JWT são recusados.
- **Verificação inicial:** papéis, vínculos e unidades divergentes, conta que não entra ou tabela ilegível = o script aborta **antes de qualquer tentativa**, com o relatório do que falhou.
- **Comparação de conteúdo, não só de contagem:** cada conta lê todas as linhas das 21 tabelas; cada linha vira um resumo SHA-256 (ordem de colunas e de linhas não importa) e o conjunto vira um resumo da tabela. Antes e depois precisam ser iguais em contagem **e** conteúdo; o relatório diz qual tabela mudou e se foi contagem ou conteúdo. O resumo nunca é impresso com dados, só o nome da tabela.
- **Parada imediata:** leitura indevida bem-sucedida impede qualquer escrita. Nas escritas, só "acesso negado" (42501) vale como recusa (alterar/excluir também aceitam "0 linhas afetadas" pela contagem do servidor). Inserção aceita, linha afetada ou **qualquer outro erro** (formato, coluna, referência inexistente) é falha, interrompe as tentativas seguintes e pula os testes de sessão; a fotografia final ainda roda e mostra o que mudou.
- **Dados válidos nas tentativas:** as linhas e chamadas usam todas as colunas obrigatórias, valores aceitos pelas restrições e referências reais da própria empresa de quem tenta (produto, fornecedor, lote, quando existem). Em `establishments`, `products` e `suppliers` o banco concede INSERT só por coluna; o teste confere que toda coluna usada na tentativa está concedida, para que a recusa venha da RLS e não de "permissão negada na coluna". Um teste de integração executa essas mesmas linhas e chamadas, com a autoridade correta, em transação desfeita, e falha se alguma for inválida. (Foi assim que se achou, e corrigiu, `receive_batch` com combinação de temperatura inválida e `set_establishment_settings` com regra de porção inexistente: a primeira versão só era "recusada" por permissão antes da validação, o que seria falsa aprovação.)
- **Credenciais:** e-mails e senhas só na memória; nada vem de variável de ambiente; senha digitada sem eco; toda saída, inclusive de erro, passa por `scrub` (senha, e-mail, JWT, chaves e os tokens emitidos viram `[oculto]`). Em erro inesperado, a exceção original (que poderia conter segredo) **não** é propagada nem anexada como causa: sai só a mensagem limpa. Há tratamento de `uncaughtException` e `unhandledRejection` com a mesma limpeza.
- **Sessões encerradas sempre:** todo cliente aberto pelo script (as três contas, a sessão de Sair, a de renovação, a anônima e a de inatividade) recebe `signOut({ scope: 'local' })` em `finally`, mesmo após exceção. Só a sessão local de cada cliente é encerrada, para não derrubar sessões reais das mesmas contas. Teste de integração confere que o token fica inválido após uma exceção.

## 3. Limites honestos
- **Tabelas operacionais vazias** (recebimentos, lotes, recipientes, movimentos, produções, ocorrências, etc.) estão **vazias** no hospedado. Nelas: a leitura cruzada devolver 0 linhas **não prova isolamento por dados** (não havia o que vazar); alterar/excluir "recusados com 0 linhas" são vazios por falta de linhas, não prova da RLS. O script imprime `AVISO` com a lista dessas tabelas e das recusas vazias. A prova nelas é: inserir recusado com 42501 (permissão, não formato), RLS ligada e sem privilégio de escrita, e a bateria local (pgTAP, integração, E2E) com dados reais sobre as mesmas migrações. Se quisermos prova por dados no hospedado, é preciso semear lotes fictícios em A e B (por `receive_batch` como proprietário, com autorização própria de luis) e rodar de novo. Produtos e fornecedores fictícios (passo 2) já dão dados nas tabelas de cadastro.
- Tabelas com mais de 1000 linhas visíveis a uma conta abortam a comparação de conteúdo (erro explícito); o ambiente de testes é bem menor.
- A fotografia compara o que cada conta **enxerga**. Mudança em dado invisível às três contas (por exemplo, de uma terceira empresa) não seria vista; o script exige que não existam outras empresas visíveis, e o SQL do passo 2 cria só A e B.
- Não prova o comportamento do Auth hospedado além das respostas observadas (limites de e-mail, rate limits). O rate limit de login foi reduzido para 10; o script faz 5 logins (6 com `--wait-inactivity`). Não rode várias vezes seguidas.
- Expiração por inatividade só com `--wait-inactivity`; sem ele a linha aparece como `PULOU`.
- Uma escrita indevida que **funcionasse** deixaria dado fictício nas tabelas (o script para na primeira, mas ela já ocorreu); o relatório mostra qual. É a razão de o ambiente ter só dados fictícios e de existir `reset_test_environment`.

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
- `tests/ci/validate-isolation.test.mjs` (16): destino fixo, só chave publicável, linha de comando sem como trocar o endereço, tokens adulterados com bytes realmente diferentes (assinaturas de 32 e 64 bytes, 200 amostras cada) e demonstração do defeito antigo (trocar só o último caractere não muda bytes), saída sem segredos, trava de empresa fictícia, papéis/vínculos/unidades divergentes, critério de recusa de leitura e de escrita (42501, 0 linhas afetadas, erros de formato inconclusivos), resumo de conteúdo (alteração com **mesma contagem**, linha trocada, ordem de linhas e colunas), parada na primeira escrita aceita (com cliente simulado), payloads completos com referências reais, `finally` com logout local sem logout global e sem `process.env`, lista de tabelas igual à das migrações.
- `tests/integration/validate-isolation.test.mjs` (9), contra o Supabase local descartável: caminho completo (nenhuma `FALHA`, `AVISO` de tabelas vazias, 21 tabelas sem login); três configurações erradas (colaborador na empresa errada, colaborador proprietário, B como colaborador) abortam sem nenhuma tentativa; **alteração de conteúdo entre as fotografias sem mudar contagem é acusada**; exceção no meio não vaza senha, e-mail, token nem chave e deixa o token inválido (sessão encerrada); gancho de teste recusado fora do local; **escrita indevida bem-sucedida** (política aberta criada de propósito no banco local) interrompe as tentativas e pula os testes de sessão; linhas e chamadas de tentativa são válidas (executadas com a autoridade certa e desfeitas).
