# Interface operacional da unidade

- **Responsável / estado:** Codex. Implementação local verificada, com E2E autenticado bloqueado.
- **Base:** `origin/main` em `7d664d5`. Branch `codex/interface-operacional`.
- **Objetivo:** melhorar orientação, leitura e ações no desktop e celular a partir dos fluxos observados nas 19 imagens de referência.
- **Aceite:** menu com área atual e alvos de toque, indicadores reais legíveis, cadastro de produção em destaque conforme o perfil e filtro sobre as produções recentes no fuso da unidade.
- **Riscos:** a produção consulta até 50 registros, portanto o filtro deve indicar seu escopo. A validade é paginada no servidor. Preservar o fluxo de rascunhos, QR/PDF e as ações condicionadas às permissões.
- **Arquivos previstos:** menu, estilos compartilhados, painel de produção e testes de componente.

## 18/11/2026 — avaliação e início

O subagente revisou a referência e recomendou priorizar navegação móvel, um painel legível e entradas diretas para ações da operação. A referência mostra recebimento, produção, validade e etiquetas. O incremento reutiliza as áreas e os fluxos existentes, com identidade visual do Cozinha SaaS. A lista de produção ganhará a seleção de período dentro da lista recente; a tela de validade manterá as contagens da unidade. Próximo passo: escrever a regressão do filtro e implementar os componentes.

- Regressão preparada com duas produções no mesmo dia UTC, em dias diferentes na unidade. Implementação em seguida.

- Implementação intermediária: ícones com rótulos no menu, novos estilos para os indicadores, ação principal e filtro na produção, formulário de recebimento em duas colunas no desktop e uma no celular. Alterações no formulário limitadas à apresentação. A CLI Supabase falhou tentando criar `/home/agent/.supabase`, que é somente leitura neste ambiente. Verificação de navegador isolada com dados fictícios em preparação.

## 18/11/2026 — verificação visual e encerramento local

- Chromium com componentes reais e dados fictícios, nas larguras 1440 e 390 px para proprietário e 320 px para colaborador. Verificados a área ativa, alvos de navegação de pelo menos 44 px, ausência de rolagem horizontal, seleção de produto refrigerado, filtro Hoje e foco do formulário de produção.
- `npm run test:e2e -- tests/e2e/navigation.spec.mjs tests/e2e/production.spec.mjs tests/e2e/expiry-cards.spec.mjs` interrompido na inicialização por falta do Supabase local. A CLI recebeu EROFS ao criar o diretório de configuração e a pasta alternativa via XDG não resolveu. Os testes do navegador com dados fictícios não substituem o E2E autenticado.
- Lint, tipos, build, Prettier nos arquivos alterados e `git diff --check` aprovados. A bateria unitária final passou com 590 testes em 52 arquivos.

- A branch local fica disponível para revisão. A próxima validação é executar o E2E num ambiente descartável com Supabase local operacional.
