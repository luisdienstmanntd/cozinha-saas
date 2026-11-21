# Redesign estrutural CozziGo

- Base: main em `467b5e8`. Branch: `codex/redesign-estrutural-propostas`.
- Aceite desta etapa: três propostas navegáveis de shell, Visão geral e Produtos. Evidência em desktop, tablet e celular e revisão independente. O frontend definitivo aguarda escolha expressa.
- Estado: propostas renderizadas e revisadas, aguardando escolha. Sem uso do ambiente hospedado para simulação, sem migração e sem publicação.
- Revisão inicial: UX/UI, produto SaaS, arquitetura React, operações de cozinha e qualidade. A referência Suflex foi relida nas 19 imagens para entender fluxos.

## Entrega para escolha

- **Mesa operacional:** contagens e tabela de alertas, navegação lateral hierárquica, Produtos em tabela e criação por painel lateral.
- **Turno de cozinha:** fila de risco antes dos totais, ações do turno em coluna, Produtos em cartões e criação em página dedicada.
- **Gestão da unidade:** distribuição de prazos, navegação por módulo e Produtos com relação lista/detalhe. Criação em diálogo.
- Evidência: 18 capturas de propostas e três capturas da interface da main com dados de exemplo. Chromium em 1440, 768, 390 e 320 px. Exercitados navegação, busca, paginação visual, abertura do cadastro, retenção de rascunho e isolamento entre unidades de exemplo. Ajustados após revisão independente o menu no celular, os alvos de toque, o foco, a legibilidade de dados de lote e o destaque de seleção. A Visão geral é nova; a referência de antes do comparativo é Cadastros.
- Os protótipos e as capturas estão no workspace da conversa, fora do código publicado. O app não foi modificado. Nenhum push, merge, deploy ou migração nesta etapa.

## A implementar após aprovação

Controlador de unidade e página com compatibilidade para as URLs da navegação V1, âncoras do PR #53 e QR. Rascunhos em memória por usuário, organização, unidade e operação. Os quatro indicadores reais devem vir de `containers.summary` no fuso da unidade; a fila do dashboard usa uma amostra explicitada da listagem com cursor. Etiquetas partem de recipientes existentes e consultas de leitura. Preservar gateways, papéis, RLS e a recuperação de operações pendentes.

## 19/11/2026 — Mesa operacional escolhida

- Autorizada a implementação da Mesa com alertas antes dos indicadores no celular. Branch `codex/mesa-operacional`.
- Critérios: shell autenticado responsivo, páginas de cadastro independentes, formulário sob demanda, indicadores reais e compatibilidade com links legados. Etapas verificáveis de navegação, leitura operacional e apresentação. Sem banco, merge ou deploy.

- Implementados: shell e seletor, Visão geral, página de Etiquetas, páginas independentes de cadastro/configuração, gaveta de criação e consulta de Locais com criação sob demanda. Recebimentos continua como página dedicada ao registro, e o histórico dos recipientes em Validades.
- Verificação: lint, tipos, build, 595 testes na bateria completa e 90 testes focados na revisão seguinte. Chromium com app real e gateways simulados verificou 1440, 768, 390 e 320 px, alertas primeiro no móvel, busca, fechamento pelo teclado, rascunho isolado entre duas unidades e link de Etiquetas. Capturas de antes/depois em desktop, tablet e celular revisadas por QA.
- Bloqueio: Playwright autenticado não inicializou porque o Supabase local está indisponível. Não foram executadas migrações. Não houve push, merge nem deploy.
