# CozziGo — proposta de identidade

- **Estado:** fundações implementadas e verificadas localmente. E2E autenticado bloqueado pela falta de espaço do Docker. Derivação fiel dos arquivos da logomarca depende da matriz original.
- **Base:** `2455034` (`codex/interface-operacional`). Branch `codex/cozzigo-proposta-visual`.
- **Escopo e aceite:** revisão por UX/UI, frontend e qualidade, reavaliação das 19 referências, comparação das seis telas e atualização do roadmap antes da consolidação.
- **Riscos:** contraste variável dos laranjas, marca disponível como imagem na mensagem sem arquivo-fonte acessível, e distinção entre a seleção de unidades atual e uma futura Visão geral operacional.
- **18/11/2026:** código e remoto conferidos. A branch remota de identidade troca textos; não contém a logomarca. O incremento atual consiste em protótipo isolado e documentação.

## 18/11/2026 — proposta apresentada

- UX/UI, arquitetura frontend e qualidade revisaram as propostas e cruzaram recomendações. A revisão convergiu em menu grafite, contraste medido para o laranja, informação visível por texto, preservação das rotas e padrões de toque e teclado.
- As 19 referências da Suflex foram revisadas por função. O comparativo apresenta Login, Visão geral, Validades, Recebimentos, Produção e Navegação mobile. A captura anterior de Visão geral corresponde à seleção de unidades, pois o painel operacional é novo.
- Verificação isolada no Chromium em 1024, 736, 390 e 320 px. As seis comparações renderizaram sem rolagem horizontal ou exceção de script. Troca de telas, busca, filtro Hoje, justificativa de temperatura e fechar Mais por Escape funcionaram no protótipo. A verificação não representa teste de integração nem certificação WCAG da aplicação.
- Arquivos versionados nesta etapa: roadmap, índice e registro. Nenhuma alteração em código da aplicação, banco ou infraestrutura.
- Próximo passo: aceite de direção visual e obtenção do PNG ou SVG oficial em arquivo antes de editar a arte e integrar as fundações.

## 18/11/2026 — início das fundações

- Aceite de continuidade recebido. Branch `codex/cozzigo-fundacoes`, base `d6b7c0c`.
- Aplicar tokens, fonte local, tema, login e navegação preservando sessão, rotas e permissões. As áreas operacionais herdam superfícies, controles e cores semânticas compartilhadas. O escopo desta fatia não inclui rota de Visão geral.
- Aceite técnico: login rotulado e com autocomplete, destaque e foco no menu, contraste dos pares centrais, reflow até 320 px, verificações do repositório. Arte e favicon pendentes da matriz oficial, ainda ausente nos anexos disponíveis.

- Checkpoint: fonte Inter local e paleta em `src/app/tokens.css`. Os estilos compartilhados migraram para tokens. Login ganhou formulário rotulado, menu ganhou a identificação temporária em texto, e o cabeçalho e as áreas operacionais herdaram as superfícies e ações definidas no roadmap. A execução de E2E local foi iniciada com `SUPABASE_HOME` em pasta gravável e encontrou limitação de downloads do registro de imagens.

- Verificação: Prettier nos arquivos alterados, `git diff --check`, lint, TypeScript, 591 testes Vitest e build aprovados. O Chromium carregou a Inter local e verificou contraste, foco, menu e ausência de rolagem horizontal em 320, 390 e 1440 px com dados fictícios. O E2E de navegação e validades ficou bloqueado antes dos casos, pois o Docker falhou ao descompactar a imagem PostgreSQL local em duas tentativas, por falta de espaço. O projeto permanece local, sem alteração de banco ou publicação.
