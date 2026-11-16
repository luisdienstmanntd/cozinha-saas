# V2 — Sessão persistente com inatividade de 30 minutos (D-025, D-059)

Fatia V2 da [revisão visual](REVISAO_VISUAL_FASE_07.md), problema B2: a sessão caía a cada recarga e o QR sempre pedia login. Definições de luis em 16/11/2026. **Status: ACEITA por luis em 16/11/2026 (D-059), condicionada à CI verde do PR #32, que foi confirmada. Sem merge nem deploy.**

## O que muda para quem usa

1. A sessão fica guardada no navegador. Recarregar a página ou abrir o endereço do QR no mesmo navegador não pede e-mail e senha enquanto a sessão valer.
2. Sem tocar na tela por 30 minutos, a sessão acaba. A tela volta ao login com o aviso "Sessão encerrada por inatividade (30 minutos)".
3. No topo, sempre visível, ficam quem está conectado, o aviso do prazo e o botão **Sair**. Sair encerra a sessão no servidor e apaga o que o navegador guardava.
4. Aparelho compartilhado: cada pessoa entra com a própria conta. Depois de Sair, outra pessoa entra e não vê nada da anterior (a tela é limpa antes de entrar).

## Como funciona

**Banco (quem decide).** Migração `20261116000000_session_inactivity.sql`:

- `private.session_activity` guarda a última atividade de cada sessão do Supabase Auth (`session_id` do JWT). A tabela não é acessível a `anon`, `authenticated` nem `service_role`.
- `private.session_state()` devolve `ok`, `idle` ou `revoked`. A sessão precisa existir em `auth.sessions` e pertencer ao usuário do token (Sair apaga a linha, então um token copiado antes do Sair deixa de valer na hora), e a última atividade (ou a criação, se nunca houve) precisa ter menos de 30 minutos.
- `session_guard.check_request()` roda antes de **toda** requisição da API (`pgrst.db_pre_request`). Sessão de usuário que não esteja `ok` recebe **401 com código `SESSION_EXPIRED`**, tanto em leitura quanto em escrita e chamadas de função.
- Defesa em profundidade: `private.member_organizations` (base das políticas RLS) e `private.has_membership` (funções de escrita) também exigem sessão ativa. Mesmo que o guarda da API fosse contornado, a RLS devolve zero linhas e as escritas são recusadas.
- `public.touch_session()` registra atividade (a pessoa tocou na tela). Sessão já parada **não** se reativa: recusa com `28000`. Só a própria sessão é atualizada.
- O guarda mora no schema `session_guard`, não em `public`/`private`, porque o PostgREST o executa com o papel de quem chamou (inclusive `anon`) e o guarda de segurança proíbe função de `public`/`private` executável por `anon`. O schema só contém essa função e não é exposto pela API. Nada foi relaxado em `security_guard.test.sql`.

**Aplicativo.**

- `persistSession: true` com chave própria (`cozinha-saas.auth`) no `localStorage`.
- Ao abrir, `IdentityHome` confere a sessão guardada: sem registro de atividade no navegador, ou com mais de 30 minutos, encerra; senão chama `touch_session` e só então carrega os dados. Enquanto confere, mostra "Conferindo a sessão…" e nunca o login nem dados.
- `useSessionGuard`: atividade (toque, tecla, rolagem) renova o prazo local e avisa o servidor no máximo uma vez por minuto; a cada 15 s, ao voltar o foco e ao voltar a aba, confere o relógio. Toque depois do prazo não reativa.
- `createSessionFetch`: qualquer 401 `SESSION_EXPIRED` da API faz o aplicativo sair da conta e limpar a tela, mesmo sem relógio local (aba dormindo, relógio alterado).
- Sair: tela limpa antes, `signOut({ scope: 'local' })` no servidor; se o servidor não responder, o navegador esquece a sessão do mesmo jeito e a tela avisa que o servidor não confirmou.

## Testes

| Camada | Arquivo | O que prova |
| --- | --- | --- |
| pgTAP | `supabase/tests/session_inactivity.test.sql` | estados ok/idle/revoked, `session_id` de outro usuário, malformado e inexistente, RLS e `has_membership` com sessão parada, `touch_session`, privilégios, guarda em schema próprio e configurado no PostgREST |
| Integração (API real) | `tests/integration/session-inactivity.test.mjs` | 30 min parados: leitura, escrita e RPC recusadas com 401; 29 min valem e renovam; sessão sem atividade expira 30 min após o login; Sair invalida o token copiado; duas contas isoladas; não forja atividade de outra sessão; anônimo não lê |
| Componente | `IdentitySession.test.tsx` | recarregar com sessão válida, expirada, sem registro, recusada pelo servidor; expiração por tempo; atividade renova; toque tardio; Sair; troca de usuário; falha ao sair |
| Unitário | `session.test.ts`, `sessionFetch.test.ts` | limite exato de 30 min, relógio adiantado, parsing; 401 `SESSION_EXPIRED` |
| E2E (navegador) | `tests/e2e/session.spec.mjs` | recarregar e QR sem login, Sair, troca de usuário sem vazar dados, sessão parada recusada com a tela aberta, relógio local vencido |

Testes existentes alterados (nenhum enfraquecido): `catalog`, `locations` e `pending` (E2E) assumiam que recarregar derrubava a sessão. Agora afirmam que a sessão continua (catalog), ou usam Sair antes de trocar de pessoa (locations), ou reabrem o catálogo sem novo login (pending). As asserções de conteúdo permanecem as mesmas.

## Revisão de segurança

Verificado:

- **Autorização no servidor.** Sessão parada ou encerrada falha na API (401), na RLS (zero linhas) e nas funções de escrita (`has_membership`). Provado por pgTAP e pela API real.
- **Isolamento entre empresas e permissões.** Sem alteração nas políticas além de exigir sessão ativa; `identity`, `rls_set_based`, `security_guard` e todos os pgTAP anteriores continuam verdes (1433 testes).
- **Sair é real.** A linha de `auth.sessions` é apagada; o token de acesso copiado antes é recusado na hora, sem esperar o JWT vencer (1 h).
- **Atividade não é forjável por terceiros.** A tabela é privada; a função só atualiza a sessão do próprio usuário. Requisições automáticas de fundo não contam como atividade: só toque, tecla ou rolagem.
- **Segredo.** Nenhuma chave nova. A chave publicável continua pública; o `service_role` nunca vai ao navegador.
- **Advisors de segurança** do Supabase: sem achados.

## Riscos conhecidos (registrados por luis em 16/11/2026)

1. Token armazenado no `localStorage`, com exposição potencial a XSS.
2. Ausência de PIN em dispositivo compartilhado.
3. Renovação do token de autenticação não equivale a autorização de acesso a dados: o endpoint de autenticação pode renovar o token de uma sessão parada, mas a API e a RLS continuam recusando.
4. Falta de validação no Supabase hospedado e em dispositivos físicos.

## Checklist pré-deploy (V2)

- [ ] Revisão de XSS e CSP (cabeçalho `Content-Security-Policy`, ausência de HTML injetado, scripts de terceiros) antes de qualquer publicação.
- [ ] Verificar no Supabase hospedado a configuração `pgrst.db_pre_request = session_guard.check_request` no papel `authenticator` (e que a requisição de usuário parado recebe 401 `SESSION_EXPIRED`).
- [ ] Aplicar a migração `20261116000000_session_inactivity.sql` e repetir pgTAP e testes de integração de sessão no ambiente hospedado.
- [ ] Testar em aparelho físico (iOS e Android), com leitura real do QR.

## Limitações e riscos que ficam

1. **Token no `localStorage`.** Quem executar script na página (XSS) pode ler o token. Mitigação: sem HTML injetado nos textos, sem scripts de terceiros além do que já existe, e o servidor encerra a sessão em 30 min sem uso ou no Sair. Não há cookie `HttpOnly` neste desenho.
2. **Aparelho compartilhado sem trava entre pessoas.** Quem pega o aparelho dentro dos 30 minutos usa a sessão aberta. Não há PIN, bloqueio de tela nem troca rápida de usuário; é decisão de luis usar uma conta por pessoa e Sair. Se isso incomodar no piloto, a próxima etapa é PIN curto ou troca rápida, com decisão própria.
3. **Sessão parada continua no navegador até alguém abrir a página.** O servidor já a recusa; ao abrir, o aplicativo a apaga.
4. **Renovação do JWT.** O endpoint de autenticação do Supabase ainda renova o token de uma sessão parada; isso não dá acesso a dados, porque a API e a RLS recusam. Para encerrar também a linha em `auth.sessions`, o aplicativo chama `signOut` ao detectar a expiração. Uma limpeza periódica de sessões antigas no servidor não foi feita.
5. **Token sem `session_id`.** Só pode ser emitido com a chave secreta do projeto (fora do Supabase Auth). Segue as regras de antes e não é afetado. A chave secreta continua fora do navegador.
6. **Atividade ignora outras abas no servidor.** O relógio local é compartilhado entre abas (`localStorage`); o servidor registra a sessão inteira, não a aba.
7. **Relógio do aparelho.** Só afeta a tela (sair antes ou depois do prazo local); o limite real é o do servidor.
8. **Autenticação hospedada.** No projeto hospedado é preciso aplicar a migração (inclui `alter role authenticator ... pgrst.db_pre_request`) e conferir que a plataforma aceita essa configuração; o limite de inatividade nativo do Supabase Auth (`auth.sessions.inactivity_timeout`) depende do plano e **não** é usado. Sem MFA nesta fatia. Não testado fora do Supabase local.
9. **Não verificado.** Aparelho físico (iOS/Android), leitura real do QR pela câmera, modo privado do navegador (sem `localStorage` a sessão vale só na aba e o login volta a cada recarga, sem erro), e uso por pessoas na cozinha.
10. **Dados pessoais.** O e-mail aparece na faixa de sessão da própria pessoa; nada novo é enviado a terceiros.

## Reversão

`supabase/rollback/session_inactivity.sql` remove guarda, tabela e funções e devolve `has_membership` e `member_organizations` ao texto anterior. O front-end da V2 chama `touch_session`; reverter os dois juntos.

## Verificação executada em 16/11/2026

`format:check`, `lint`, `typecheck`, `test` (42 arquivos, 338 testes), `build`, `supabase test db` (27 arquivos, 1433 testes), advisors de segurança (sem achados), `test:integration` (49) e `test:e2e` (24), no Supabase local descartável.
