# Backlog por fases (a aprovar após debate)

| ID | Fase | Entrega | Testes e critério de aceite |
|---|---|---|---|
| F0 | 0 | Revisão com 3 agentes e decisões consolidadas | evidências verificáveis, dissensos registrados, sem código criado |
| F1 | 1 | React/TS/Vite + validação + CI + primeira tela | lint, typecheck, unitário, componente e build executados |
| F2 | 2 | Organização, unidade, login, papéis e RLS | pgTAP e integração: A não acessa B; anônimo negado |
| F3 | 3 | Produtos, fornecedores e lotes | constraint de datas/quantidades, isolamento multiempresa, formulários |
| F4 | 4 | Identidade do recipiente, QR, PDF de etiqueta | QR único, impressão/reimpressão sem duplicar estoque, PDF válido |
| F5 | 5 | Validade e histórico | timezone, filtros, auditoria, consumo/descarte atômicos |
| F6 | 6 | Manipulação de recipientes (abrir/porcionar), saldo por recipiente no servidor, painel só com saldo, QR com saldo, recuperação de tentativa, endurecimento P3/P5/P6 e trilha pré-piloto. Conservação, temperatura e ocorrência no recebimento; locais e transferências. **Aprovada para planejamento em 12/11/2026, implementação por fatia com aceite**, ver [desenho](FASE_06_DESENHO.md) | pgTAP de papéis, escopo, append-only e conservação; integração concorrente e de propriedade; E2E de jornada e de negação; aceite por fatia (6.0a, 6.0b, 6.0c, 6.1 a 6.4, 6.5a, 6.5b, 6.6 a 6.10), preservando os testes existentes |
| F7 | 7 | Preparação própria da cozinha (7.1 a 7.9; PRs #21 a #30, integração pendente). Revisão de interface V1 a V5B encerrada em 17/11/2026 | aceite por fatia (D-049 a D-064) |
| **F8** | **8** | **Preparação para produção e piloto operacional** (D-065): 8.0 integração dos PRs; 8.1 estabilização da CI e do E2E; 8.2 reversões, backup e restauração; 8.3 nome até 80 caracteres; 8.4 configuração hospedada e homologação; 8.5 MFA obrigatório; 8.6 desempenho; 8.7 revisão independente de segurança; 8.8 porta de entrada do piloto. Absorve os critérios do antigo F7: e2e completo, revisão de segurança, auditoria e teste de impressão real | [PLANO_INTEGRACAO.md](PLANO_INTEGRACAO.md); aceite por fatia |
| F9 | futuro | Contagem, ficha técnica, CMV, pagamentos, ERP, IA (antes numerado F8) | escopo só após entrevistas e viabilidade |

## Melhorias futuras registradas

- **Pesquisa histórica de produções** por data, preparação e lote (pedido de luis em 14/11/2026, no aceite da 7.3). Hoje a tela mostra as 50 produções mais recentes; todos os registros anteriores continuam preservados no banco (append-only). Exige aprovação própria.
- **Acompanhar downloads de etiqueta por diferentes telas e usuários autorizados** (pedido de luis em 14/11/2026, no aceite da 7.8), sem enfraquecer os controles de acesso. Hoje só o download feito na tela de Produção é registrado; o da página do QR não é, e o aviso aparece só na tela de Produção. Avaliar no piloto. Exige aprovação própria.
- **Invalidar uma medição de temperatura da produção, com motivo obrigatório**, sem excluir nem alterar o registro original (pedido de luis em 14/11/2026, no aceite da 7.9). Hoje a medição errada fica no histórico e se registra outra. A invalidação seria um novo registro append-only ligado à medição, e as telas passariam a mostrar a medição como invalidada. Exige aprovação própria.
- **Avisar sobre formulários não salvos antes de ações voluntárias que descartem dados** (trocar de unidade, atualizar acesso, recarregar) (pedido de luis em 16/11/2026, no aceite da V1/D-060). Hoje esses caminhos perdem rascunhos sem aviso. O aviso nunca pode impedir logout nem expiração de sessão, que sempre limpam os dados.
- **[Em implementação na V6, D-072]** **Filtros de validade por categoria acionados pelos contadores** (Vencidos, Vence hoje, Vence amanhã, Posteriores), pedido de luis em 16/11/2026 no aceite da V3 (D-061). O filtro deve ser feito no servidor, respeitando a paginação da lista (100 por página, cursor por validade e recipiente) e a autorização do banco (RLS), com a mesma data de referência no fuso da unidade usada pelas contagens. Não filtrar só a página já carregada no navegador. Exige aprovação própria.

## Filtro para toda história
Como [papel] quero [ação] para [benefício]. Aceite em casos positivos, negativos e limites. Dependências identificadas. Teste automatizado criado/atualizado. Evidência de execução. Risco regulatório reconhecido. Parar para aceite humano.
