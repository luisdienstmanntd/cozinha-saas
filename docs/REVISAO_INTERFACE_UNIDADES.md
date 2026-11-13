# Revisão da interface e tela de unidades — 08/11/2026

Incremento feito pelo Claude Code a pedido do usuário: revisar a interface com os agentes do projeto e criar telas para capacidades que o banco já oferecia sem interface, evitando regressões. Trabalho na branch `claude/revisao-interface-unidades`, com PR em rascunho e **sem merge**. O Codex trabalha em paralelo na `main`; este relatório registra tudo para evitar retrabalho e conflito.

## Estado e limites

- Fases 1, 2, 03A–03D e a revisão 04 estavam aceitas. A Fase 5 (consumo/descarte, `FASE_05_PLANO.md`) aguarda aceite humano e **não foi alterada**.
- Sem migração, sem alteração de RLS/grants, sem deploy. Diff vazio em `supabase/migrations`, `supabase/rollback`, `src/features/movements`, `src/features/batches` e `docs/FASE_05_PLANO.md`.
- Base sincronizada: `0ddf0c5` (origin/main em 08/11/2026, 13h10 UTC). Nenhum commit novo na `main` até a abertura do PR.
- Aguardando aceite humano. Não iniciar o próximo incremento sem pedido explícito.

## Participantes do debate

Foram encontrados três agentes definidos em `.codex/agents/`: `suflex_analyst`, `business_strategist` e `architect_qa`. Não há definição de um quarto agente. O quarto participante foi o papel "pesquisador de produto/módulos", o mesmo do debate em `ESTUDO_COMPETITIVO_E_MODULOS.md`, aqui com foco em UX, acessibilidade e testabilidade. Os quatro rodaram como subagentes reais do Claude Code, com as instruções dos arquivos `.toml`. Nenhum deles editou arquivos.

Rodadas: (1) pareceres independentes; (2) cada agente recebeu o resumo dos outros três e criticou ao menos duas recomendações; (3) `architect_qa` e o pesquisador de UX revisaram o diff implementado. As respostas abaixo são condensadas.

## Rodada 1 — pareceres independentes

- **suflex_analyst (jornada da cozinha):** título "Acesso de teste" passa insegurança; a única navegação é "Catálogo de X", que abre catálogo, recebimento, validade, etiqueta e baixas; layout quebrado porque `.page` (grade de 2 colunas da demo) é usado no app logado; status de validade sem destaque; data da consulta em ISO/UTC. Recomendou criar unidade com fuso escolhido só na criação e renomear unidade. Rejeitou editar fuso e tela de vínculos (só haveria UUIDs).
- **business_strategist (piloto e suporte):** valor real no layout para tablet/celular, papel explícito e rótulos operacionais; renomear unidade é barato e útil; criar unidade tem valor limitado (piloto = uma unidade). Hipótese comercial não validada: equipe aceitar o proprietário como único digitador. Nada de vínculos com UUID, edição de fuso, papéis novos, bibliotecas de UI pesadas ou promessas de conformidade.
- **architect_qa (segurança e testes):** confirmou no SQL que o proprietário pode inserir e editar unidade (`identity_multiempresa.sql:62,71-74`) e que não havia tela. Apontou: `establishments` não tem auditoria (contraria D-004); criação não é idempotente nem pode ser excluída; o painel de validade usa o fuso atual da unidade. Encontrou um bug: `IdentityHome.run()` apagava todo o acesso em qualquer erro, inclusive na validação local (nome só com espaços escondia a tela). Pediu pgTAP positivo e negativo de unidade.
- **pesquisador UX:** mesma falha do grid `.page`; hierarquia de headings da etiqueta invertida; vários `role=alert` possíveis ao mesmo tempo (os E2E usam `getByRole('alert')` estrito); foco perdido após ações. Propôs uma feature nova `establishments` com gateway próprio (estender `IdentityGateway` quebraria os mocks tipados) e listou os seletores de teste que não podem mudar.

## Rodada 2 — divergências e resolução

| Tema | Posições iniciais | Resolução |
| --- | --- | --- |
| Editar fuso de unidade existente | UX: sim, com confirmação. S, B, A: não | **Não.** Sem auditoria (D-004) e reclassifica a validade de recebimentos antigos (D-015). UX retirou a proposta. |
| Lista de vínculos | UX: "Você" + ID curto. A: só contagem. S, B: não | **Só contagem**, sem identificadores, visível ao proprietário. |
| Criar unidade | S, A, UX: sim. B: valor limitado | **Sim, com proteções** (confirmação, bloqueio de clique duplo, conferência após resultado incerto, aviso de que não pode ser excluída). |
| Abas no BatchPanel/App | S: sim. A, B: não | **Não agora.** A Fase 5 está montada nesses arquivos e as abas desmontariam o MovementPanel. S retirou. |
| Lista de fusos | UX: Intl completa. A: curta brasileira | **Curta brasileira** (16 fusos), padrão `America/Sao_Paulo`, com teste de integração confirmando cada fuso no banco. |
| Renomear "Catálogo de X" | B, S: sim | **Não agora.** Quebra seletores de E2E (`catalog.spec.mjs`, `expiry-pagination.spec.mjs`). Só o título "Acesso de teste" foi trocado. |
| Cabeçalho fixo com papel | S, B: sim | **Não.** UX lembrou que o papel é por organização e que `position: fixed` pode cobrir o foco. O papel continua por organização. |

Consenso de prioridade: corrigir o bug de `run()` → gestão de unidades em feature própria → contagem de vínculos → layout de uma coluna com E2E de largura → rótulos e reorganização só após o aceite da Fase 5.

## Rodada 3 — revisão do diff

- **architect_qa:** RLS e grants inalterados; pgTAP e integração cobrem os casos pedidos; hooks antes do retorno do colaborador. Bloqueante: faltavam ADR e relatório (este documento e D-017). Não bloqueantes, todos **corrigidos**: (2) se a lista falhasse ao recarregar após uma criação confirmada, o aviso de sucesso sumia e o usuário tenderia a duplicar; agora a mensagem mantém o resultado ("Unidade X criada. Não foi possível atualizar a lista: …"), com teste. (3) Erro de rede ao renomear aparecia como "Alteração recusada"; agora diz que não foi possível confirmar. (4) O `busy` do acesso e o `saving` da tela eram independentes; agora o estado ocupado do acesso bloqueia as gravações de unidade. Registrados como pendência: (5) nomes de unidade repetidos geram rótulos acessíveis iguais; (6) o recarregamento após gravar desmonta a área de trabalho aberta (comportamento herdado de "Salvar nome").
- **pesquisador UX:** sem bloqueantes; seletores antigos preservados. **Corrigidos:** foco volta ao campo de nome em "Voltar e corrigir"; erro de renomear cita a unidade; região nomeada pelo próprio título (`aria-labelledby`); aviso de fuso uma vez só; a gestão fica antes do catálogo aberto e recolhida por padrão (botão com `aria-expanded`), sem empurrar o fluxo diário. **Pendências:** foco após o recarregamento; possível alerta da organização e da unidade ao mesmo tempo; unidades listadas duas vezes (lista + gestão).

## O que mudou

1. **Bug corrigido:** a validação local do nome da organização não passa mais por `run()`; mostra o alerta sem apagar organização, unidades e área de trabalho e sem chamar o servidor. Erros do servidor continuam limpando o acesso, como antes.
2. **Gestão de unidades** (`src/features/establishments`), só para proprietário ativo:
   - Contagem de vínculos ativos ("1 proprietário e 2 colaboradores"), sem identificadores.
   - Renomear cada unidade. O fuso aparece só para leitura, com nome legível e ID IANA.
   - Criar unidade: nome + fuso da lista curta → etapa "Confirmar nova unidade" com foco, mostrando nome, fuso e o aviso de que a unidade não pode ser excluída nem ter o fuso alterado por esta tela.
   - Gateway próprio: recusa do servidor (SQLSTATE/PGRST) fica no formulário; falha de rede ou resposta sem ID é tratada como **incerta**: a lista é recarregada e o alerta pede para conferir antes de tentar de novo. `22023` vira "Fuso horário inválido.".
   - Clique duplo bloqueado por `ref`, não só por estado.
3. **Integração:** `IdentityHome` ganhou o render prop opcional `renderOrganizationTools`. Ele é chamado por um componente intermediário para que o callback só rode em eventos (regra `react-hooks/refs`). `App.tsx` só passa esse prop; `Workspace` não mudou. `configureApp.ts` registra o novo gateway.
4. **Layout:** `<main>` logado usa a nova classe `.workspace` (uma coluna, `h1` moderado, alvos de 44 px, quebra de textos longos). `.page` continua igual para a demo pública. Título trocado para "Cozinha SaaS — unidades, recebimentos e validade"; o aviso de ambiente de demonstração foi mantido.

## Testes e evidências (executados neste container, 08/11/2026)

Ambiente: Linux, Node 24.22.2 / npm 11, Docker 29.9.2, Supabase CLI do projeto (stack local descartável em `127.0.0.1:54321`). Chromium pré-instalado do container via config local não versionada (`executablePath`), sem `playwright install`.

**Base antes das mudanças:** lint, typecheck, Vitest (70 testes em 17 arquivos), `supabase test db` (107), integração (13) e E2E (3) passaram.

**Falhas reproduzidas antes da correção:**
- `IdentityHome.test.tsx` › "validação local do nome não apaga unidades nem chama o servidor": falhou (unidade sumia da tela).
- `establishments.spec.mjs` › 390 px com o `<main className="page">` antigo: falhou com 38 px de rolagem horizontal.

**Depois:**
- `npm run lint`, `npm run typecheck`: exit 0. `npx prettier --check` nos arquivos alterados: ok. `git diff --check`: ok.
- `npm run test`: 97 testes em 20 arquivos, todos passaram (27 novos).
- `npm run build`: exit 0; bundle principal 991,29 kB (301,70 kB gzip), antes 984,35 kB; mesmo aviso de chunk acima de 500 kB.
- `npm run test:coverage`: 80,93% de linhas no total (o relatório da Fase 5 registrava 76,76%); `EstablishmentTools.tsx` 100% de linhas, `IdentityHome.tsx` 96,55%. Cobertura não inclui integração nem E2E.
- `supabase test db`: 124 verificações em 5 arquivos (17 novas em `supabase/tests/establishments.test.sql`): owner cria e renomeia; fuso inválido recusado na edição; owner A não edita unidade B; cliente não escolhe `id` nem altera `created_at`; sem exclusão física; nome só com espaços recusado; colaborador e owner revogado não criam nem alteram nome ou fuso.
- `npm run test:integration`: 17 testes (4 novos em `tests/integration/establishments.test.mjs`): os 16 fusos da lista são aceitos pelo banco; colaborador não cria nem altera; recusa de fuso chega ao cliente com `22023`.
- `npm run test:e2e`: 6 testes Chromium (3 novos em `tests/e2e/establishments.spec.mjs`): owner cria unidade com confirmação e foco, a unidade aparece uma vez no banco com o fuso escolhido e abre catálogo vazio; renomeia sem mudar o fuso; validação local não apaga a tela; colaborador não vê a gestão; 390 px e 768 px sem rolagem horizontal e botões visíveis com pelo menos 44 px.
- `supabase db advisors --type security --level warn --fail-on warn`: sem ocorrências.
- Não executado: `npm run format:check` global, que já falhava em arquivos antigos (ver FASE_03D); ensaio em tablet físico.

## Arquivos

Novos: `src/features/establishments/**` (domínio, lista de fusos, gateway, adaptador Supabase, componente e testes), `supabase/tests/establishments.test.sql`, `tests/integration/establishments.test.mjs`, `tests/e2e/establishments.spec.mjs`, este relatório.
Alterados: `src/features/identity/components/IdentityHome.tsx` e teste, `src/app/App.tsx` (só o render prop), `src/app/configureApp.ts`, `src/app/styles.css` (só acréscimos), `docs/DECISOES.md` (D-017), `README.md`.

## Pendências e próximos passos sugeridos

- **Fora deste incremento por decisão do debate:** editar fuso (exige migração de auditoria em fase própria), convites/revogação/e-mail de membros, abas ou reordenação de validade/recebimento e troca do rótulo "Catálogo de X" (fazer após o aceite da Fase 5, atualizando os E2E no mesmo commit).
- **UX ainda aberta:** foco após recarregar; dois alertas simultâneos (organização e unidade); unidades listadas duas vezes; data da consulta em ISO/UTC no painel de validade; destaque visual do status de validade; heading do `LabelView` dentro do `BatchPanel`. Os três últimos tocam a Fase 5 e ficam para depois do aceite.
- **Produto:** observar no piloto quem registra recebimento (hoje só o proprietário grava) antes de mudar permissões.
- **Risco de conflito com o Codex:** `IdentityHome.tsx`, `App.tsx`, `configureApp.ts`, `styles.css`, `DECISOES.md` e `README.md` são compartilhados. Se a `main` mudar antes do merge, rebasear e repetir todos os gates.

## Revisão posterior do Codex

- Revisão independente de arquitetura, negócio e fluxo identificou que respostas tardias de criação ou renomeação podiam chamar a atualização após a saída da tela e afetar outra sessão. Dois testes reproduziram a falha; agora o callback só é chamado enquanto o componente permanece montado. A análise confirmou que, no fluxo atual, logout desmonta os controles. A proteção é limitada a esse ciclo de montagem; mudanças de contexto sem desmontagem precisam de guarda explícita se esse componente vier a ser reutilizado dessa forma.
- Riscos remanescentes: criação sem chave idempotente e nomes repetidos dificultam conferir resultado incerto; atualizar o acesso desmonta a área de trabalho e pode descartar formulário ainda não enviado. Permanecem gates de melhoria antes de uso operacional.
- No Windows, worktree separado em D: com Docker local: `npm run lint`, `npm run typecheck`, `npm run test` (99 testes), `npm run build`, `supabase test db` (124 verificações), `node --test tests/integration/*.test.mjs` (17 testes), `npm run test:e2e` (6) e `supabase db advisors --type security --level warn --fail-on warn` passaram. O banco local também continha, para desenvolvimento paralelo, a migração de estorno ainda não integrada; portanto os resultados de banco não substituem a validação após integrar as duas linhas de trabalho. Build manteve aviso de bundle 991,31 kB.
- Após integrar `main` no rascunho, preservando as decisões D-017 e D-018, todos os gates passaram no conjunto: lint, typecheck, 105 testes unitários, build, 6 E2E, 135 verificações pgTAP, 17 testes de integração e advisors de segurança sem ocorrências. Cobertura de linhas: 80,99%; bundle principal 994,28 kB com aviso de tamanho. E2E reproduz uma tentativa de baixa pendente durante renomeação de unidade e confirma que pode ser retomada após a recarga. Formulários ainda não enviados podem ser perdidos; criação de unidade sem idempotência continua pendente para uso operacional.
