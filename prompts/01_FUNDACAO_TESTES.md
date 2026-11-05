# COMANDO 01 — FUNDAÇÃO DO REPOSITÓRIO E TESTES (executar somente após Fase 0 aprovada)

Leia `AGENTS.md`, `docs/DEBATE_AGENTS.md`, `docs/DECISOES.md` e `docs/TESTES_QUALIDADE.md`. Respeite o escopo que o usuário aprovou. Se existir código, inspecione antes de agir; não sobrescreva arquivos importantes. Sem deploy e sem gastos.

OBJETIVO: criar um monólito modular React + Vite + TypeScript estrito, organizado para manutenção e capaz de provar qualidade via testes executáveis.

Entregas:
1. Estrutura por feature, separando componentes, aplicação, regras de domínio e persistência, sem abstrações desnecessárias.
2. ESLint, Prettier, TypeScript strict, configuração de variáveis de ambiente com exemplo sem segredos, `.gitignore` e lockfile npm.
3. Vitest + React Testing Library, configuração confiável para DOM, pelo menos um teste unitário de regra pura e um teste de interface acessível com comportamento real.
4. Tela inicial responsiva em português, sem marca final, com estado 'ambiente de demonstração'.
5. Scripts npm: `lint`, `typecheck`, `test` (não watch), `test:watch`, `build`. Opcional `test:coverage`.
6. Fluxo básico GitHub Actions que usa `npm ci` e executa lint/typecheck/test/build, desde que autorizado e tecnicamente disponível; não obrigar a conectar GitHub remoto.
7. Documentação de como rodar em Windows e de como executar os testes; atualizar `docs/DECISOES.md` somente para decisões novas.

PROCESSO: criar teste relevante primeiro, ver falhar quando aplicável, implementar, executar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`. Não apresentar testes que não foram executados como aprovados. Se dependências não instalarem, documentar a razão e instruções precisas.

Critérios: scripts existem, aplicação compila, teste de componente observa comportamento real, unitário testa regra e todos os gates executáveis passam. Entregar arquivos alterados, comandos/resultados, limitações e próximo passo. **Parar.**
