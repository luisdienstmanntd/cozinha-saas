# Hipóteses para o debate dos agentes (não são saídas de agentes executados)

Este arquivo prepara a discussão que ocorrerá quando o `prompts/00_DEBATE.md` for executado no Codex.

| Ponto de tensão | Perspectiva A | Perspectiva B | Decisão provisória |
|---|---|---|---|
| Alcance do MVP | Reproduzir todos os módulos vendidos pela Suflex | Entregar apenas um fluxo usável | Priorizar identificação, validade e histórico; demais módulos ficam no backlog |
| Impressora térmica | Necessária para demonstrar valor | Equipamento custa dinheiro e integração exige validação | Começar com PDF, testar impressora real antes do piloto operacional |
| Preço | Cobrar barato para ganhar clientes | Suporte/implantação podem eliminar a margem | Nenhum preço fixado sem entrevista e custo observado |
| Arquitetura | Um schema único com multi-tenant | Dividir banco por cliente desde o começo | Um PostgreSQL com RLS testado; reconsiderar se necessidades mudarem |
| Fluxo de lote | Cadastrar uma etiqueta = criar estoque | Reimpressão não deve mudar estoque | Identidade de recipiente separada de movimentações |
| Validade | Gerar padrão por tipo de comida | Prazos sanitários dependem da operação | Nunca supor prazo; exigir entrada e aprovação por usuário habilitado |
| Testes | Deixar E2E e segurança para depois | Falhas de dados inviabilizam produto | Unit/integration por mudança; RLS antes de qualquer teste multiempresa |

O orquestrador deve pedir contestação cruzada de pelo menos duas rodadas, registrar o que mudou e o que permanece disputado. Não apresentar este documento como debate real já executado.
