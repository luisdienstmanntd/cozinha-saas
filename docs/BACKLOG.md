# Backlog por fases (a aprovar após debate)

| ID | Fase | Entrega | Testes e critério de aceite |
|---|---|---|---|
| F0 | 0 | Revisão com 3 agentes e decisões consolidadas | evidências verificáveis, dissensos registrados, sem código criado |
| F1 | 1 | React/TS/Vite + validação + CI + primeira tela | lint, typecheck, unitário, componente e build executados |
| F2 | 2 | Organização, unidade, login, papéis e RLS | pgTAP e integração: A não acessa B; anônimo negado |
| F3 | 3 | Produtos, fornecedores e lotes | constraint de datas/quantidades, isolamento multiempresa, formulários |
| F4 | 4 | Identidade do recipiente, QR, PDF de etiqueta | QR único, impressão/reimpressão sem duplicar estoque, PDF válido |
| F5 | 5 | Validade e histórico | timezone, filtros, auditoria, consumo/descarte atômicos |
| F6 | 6 | Fluxo E2E e piloto privado | e2e completo, revisão de segurança, auditoria e teste de impressão real |
| F7 | futuro | Contagem, ficha técnica, CMV, pagamentos, ERP, IA | escopo só após entrevistas e viabilidade |

## Filtro para toda história
Como [papel] quero [ação] para [benefício]. Aceite em casos positivos, negativos e limites. Dependências identificadas. Teste automatizado criado/atualizado. Evidência de execução. Risco regulatório reconhecido. Parar para aceite humano.
