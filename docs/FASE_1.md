# Fase 1 — fundação e testes

## Plano e aceite

Fase 0 aprovada pelo usuário em 04/11/2026, com autorização para executar o prompt 01. Implementar somente fundação React/Vite/TypeScript strict e demonstração local, sem persistência, autenticação, cálculo sanitário ou serviços externos.

Comportamento: tela em português identifica demonstração, apresenta etapas futuras e permite reconhecer explicitamente que não há salvamento. Sem confirmação, informa erro acessível; após confirmação, informa sucesso. Configuração pública aceita apenas modo demo e recusa valores inesperados.

Riscos: aparência de funcionalidade ainda inexistente; configuração inválida ignorada; testes DOM sem limpeza; dependências não reproduzíveis. Mitigar com limites explícitos na tela, erro visível de configuração, cleanup por teste, versões exatas e lockfile.

Aceite: regra pura e componente exercitados de verdade; lint, typecheck, test e build com exit code 0; instruções Windows e workflow local de CI usando npm ci. Não iniciar Fase 2.

## Estrutura

- `src/app`: composição e tratamento da configuração inicial.
- `src/features/demo/components`: interface acessível.
- `src/features/demo/application`: estado e caso de uso da confirmação.
- `src/features/demo/domain`: regra pura, independente de React.
- `src/shared/config`: validação da fronteira de ambiente.
- `src/test`: preparação e limpeza DOM.

Persistência será uma camada `data` dentro da feature que realmente precisar dela. Esta fase não cria repositórios vazios nem simula banco. Testes de autorização real e RLS pertencem à Fase 2, antes de qualquer dado multiempresa.

## Implementação e arquivos

Criados:

- `package.json`, `package-lock.json`: scripts, versões diretas exatas e instalação reproduzível.
- `.gitignore`, `.env.example`, `.prettierrc.json`, `.prettierignore`: exclusões, configuração pública sem segredos e formatação.
- `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `vitest.config.ts`, `index.html`: compilação strict, lint, bundler e testes DOM.
- `.github/workflows/quality.yml`: pipeline preparado localmente, sem remoto.
- `src/main.tsx`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/styles.css`: inicialização, erro visível de configuração, composição, estilos responsivos e testes.
- `src/features/demo/components/DemoHome.tsx` e `DemoHome.test.tsx`: tela, confirmação acessível e retirada da confirmação.
- `src/features/demo/application/useDemoAcknowledgement.ts`: estado transitório/caso de uso.
- `src/features/demo/domain/demoAcknowledgement.ts` e `demoAcknowledgement.test.ts`: confirmação pura testada nos dois caminhos.
- `src/shared/config/environment.ts` e `environment.test.ts`: configuração válida, padrão e valores rejeitados.
- `src/test/setup.ts`: matchers e limpeza por teste.
- `docs/FASE_1.md`: plano, evidências e limitações.

Atualizados: `README.md` (Windows, testes, arquitetura e limites), `docs/PRODUCT_BRIEF.md` (reconciliação do debate aprovado), `docs/DECISOES.md` (D-008 alinhada ao aceite e novas D-009/D-010), `docs/DEBATE_AGENTS.md` (cabeçalho registra aprovação humana recebida; histórico preservado). AGENTS.md, prompts e configurações dos agentes preservados. `node_modules`, `.npm-cache`, `coverage` e `dist` são artefatos locais ignorados.

## Problemas encontrados e correções

1. Acesso npm inicial no ambiente restrito: `EACCES` ao registro/cache. Consultas/instalações interrompidas retornaram exit code 1; repetidas com autorização ampliada e cache local ignorado `.npm-cache`. Não alterado npm global nem conta.
2. Primeiro `npm run test` restrito: exit code 1, bundler impedido de ler diretórios ancestrais. Reexecução autorizada iniciou Vitest e revelou três suítes falhando por imports de módulos ainda ausentes — testes escritos antes da implementação. Esta falha inicial não é um teste comportamental aprovado.
3. Seleção inicial das ferramentas: auditoria identificou 13 vulnerabilidades (11 moderadas e duas críticas). Atualizar ferramentas eliminou as críticas; aplicar override explícito de minimatch 11.0.1 eliminou os dez alertas moderados transitivos restantes. Não utilizado `audit fix --force` nem ignorados peers.
4. Atualização indiscriminada para TypeScript mais recente: `ERESOLVE`, pois o parser exige TypeScript menor que 6.1. Mantido TypeScript 5.9.3. jsdom 30 exigia Node posterior ao instalado; escolhido jsdom 29.1.1 compatível, sem atualizar Node global.
5. Revisão apontou botão que sugeria navegação inexistente. Teste atualizado primeiro; comando focado falhou com exit code 1 por não encontrar botão com nome acessível novo. Corrigido texto para “Confirmar escopo da demonstração”; teste também verifica remover confirmação ao desmarcar, sem mensagem de sucesso obsoleta.

## Revisão independente e críticas cruzadas

Reutilizados os três agentes customizados, somente leitura, em duas rodadas breves. Suflex e negócio revisaram promessa/escopo; arquitetura revisou código/configurações/CI. Nenhum reportou bloqueio no escopo sem persistência. Todos apontaram ambiguidade do botão, corrigida acima. Nas críticas cruzadas ratificaram a correção literal, o teste observável de retirada da confirmação e a necessidade de distinguir evidência local de CI remoto e de validação comercial. Separar globais de teste do tsconfig foi considerado melhoria futura, sem bloqueio atual. Nenhum reexecutou testes por conta própria. Suflex não comparou layout visual; sua revisão se limitou ao conteúdo.

## Resultados e limites

Ambiente: Windows/PowerShell, Node 24.12.0, npm 11.6.2. Instalação inicial e correções realizadas com `npm install --save-exact`/`--save-dev --save-exact`; versões efetivas no lockfile. `npm ci --cache .npm-cache --prefer-offline`: exit code 0, 242 pacotes instalados e zero vulnerabilidades reportadas. Sem remoto Git nesta pasta; não há diff/commit ou execução de GitHub Actions a apresentar.

Primeiro ciclo após implementação: lint/typecheck/test/build retornaram 0; quatro arquivos de teste e dez casos passaram. A cobertura inicial apresentou 100% nos cinco arquivos instrumentados. Após revisão e correção do botão/configuração, os comandos finais e a cobertura são registrados abaixo.

Não executados: RLS/pgTAP/integração DB, pois não há banco ou persistência nesta fase; E2E/Playwright e inspeção visual em navegador real, não instalados/executados nesta entrega; CI remoto, pois só se criou o YAML localmente. Os testes RTL usam DOM real de jsdom e eventos, mas não comprovam layout CSS, responsividade visual ou operação em navegador físico. CSS inclui breakpoint de 800px; isso não equivale a homologação visual. Cobertura exclui bootstrap `main.tsx`, testes e setup; não mede CSS, falhas de montagem de navegador, segurança multi-tenant, impressão ou backend. Nenhuma autorização de produção é alegada.

Esta fundação não comprova demanda, disposição a pagar, produtividade ou prontidão do piloto. Não foram criados banco, serviços, contas, remoto Git, deploy ou cobranças. O próximo passo depende de aceite humano da Fase 1 e autorização explícita da Fase 2.

### Verificação final executada em 04/11/2026

- `npm run test -- src/features/demo/components/DemoHome.test.tsx`: exit code 0, um teste passou após a correção.
- `npm run lint`: exit code 0, sem avisos.
- `npm run typecheck`: exit code 0.
- `npm run test`: exit code 0, quatro arquivos e dez testes passaram, nenhum skip.
- `npm run build`: exit code 0; Vite 8.3.5 gerou HTML/CSS/JS em `dist`. JS 286,72 kB (88,60 kB gzip).
- `npm run test:coverage`: exit code 0, dez testes passaram. Cobertura V8: 23/23 statements, 19/19 branches, 10/10 functions e 23/23 lines.
- Por arquivo, linhas/branches/funções em 100%: `src/app/App.tsx`, `src/features/demo/application/useDemoAcknowledgement.ts`, `src/features/demo/components/DemoHome.tsx`, `src/features/demo/domain/demoAcknowledgement.ts` e `src/shared/config/environment.ts`. Os limites dessa medição estão descritos acima; não é meta artificial nem cobertura do futuro MVP.
- `npm audit --cache .npm-cache`: exit code 0, zero vulnerabilidades reportadas no momento da consulta.
- `npm run format:check`: exit code 0. Formatação reaplicada ao relatório após registrar os resultados.

Fase 1 concluída tecnicamente e parada para aceite humano. Fase 2 não iniciada.
