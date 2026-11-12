# Backlog por fases (a aprovar após debate)

| ID | Fase | Entrega | Testes e critério de aceite |
|---|---|---|---|
| F0 | 0 | Revisão com 3 agentes e decisões consolidadas | evidências verificáveis, dissensos registrados, sem código criado |
| F1 | 1 | React/TS/Vite + validação + CI + primeira tela | lint, typecheck, unitário, componente e build executados |
| F2 | 2 | Organização, unidade, login, papéis e RLS | pgTAP e integração: A não acessa B; anônimo negado |
| F3 | 3 | Produtos, fornecedores e lotes | constraint de datas/quantidades, isolamento multiempresa, formulários |
| F4 | 4 | Identidade do recipiente, QR, PDF de etiqueta | QR único, impressão/reimpressão sem duplicar estoque, PDF válido |
| F5 | 5 | Validade e histórico | timezone, filtros, auditoria, consumo/descarte atômicos |
| F6 | 6 | Manipulação de recipientes (abrir/porcionar), saldo por recipiente no servidor, painel só com saldo, QR com saldo, recuperação de tentativa, endurecimento P3/P5/P6 e trilha pré-piloto. **Proposta**, ver [desenho](FASE_06_DESENHO.md) | pgTAP de papéis, escopo, append-only e conservação; integração concorrente e de propriedade; E2E de jornada e de negação; aceite por fatia (6.0 a 6.8) |
| F7 | 7 | Fluxo E2E e piloto privado | e2e completo, revisão de segurança, auditoria e teste de impressão real |
| F8 | futuro | Contagem, ficha técnica, CMV, pagamentos, ERP, IA | escopo só após entrevistas e viabilidade |

## Filtro para toda história
Como [papel] quero [ação] para [benefício]. Aceite em casos positivos, negativos e limites. Dependências identificadas. Teste automatizado criado/atualizado. Evidência de execução. Risco regulatório reconhecido. Parar para aceite humano.
