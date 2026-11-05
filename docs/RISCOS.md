# Matriz inicial de riscos

| Risco | Gravidade | Mitigação inicial |
|---|---|---|
| Vazamento entre estabelecimentos | Crítica | RLS por associação, FKs coerentes, pgTAP e integração real com usuários diferentes |
| Validade inadequada | Crítica | Sem prazos automáticos; validação de responsável técnico, campos de origem e histórico |
| Etiquetas ilegíveis/que descolam | Alta | PDF para teste e avaliação com impressora/material real antes da cozinha operar |
| Confusão entre impressão e movimentação | Alta | Separar emissão/reimpressão de eventos de estoque, teste de idempotência |
| Perda de conexão/disponibilidade | Alta | Estados claros de erro, backup/recuperação, não anunciar offline sem implementar |
| Custo do suporte e implantação | Alta | Piloto limitado, treinamento curto, medição de minutos de suporte por cliente |
| Dependência de provedor gratuito | Alta | Uso em desenvolvimento; revisar contrato e plano pago antes de atividade crítica |
| Conformidade/LGPD/privacidade | Alta | Minimização de dados, controle de acesso, termos e revisão jurídica/técnica antes da venda |
| Crescimento do escopo | Média | Backlog por fase e aceite humano; nada de IA/ERP no MVP |
| Testes falsamente verdes por mocks | Alta | Integração real, E2E e pgTAP com comando e ambiente declarados |

Fazer entrevistas com usuários e validação com responsável técnico; código não substitui avaliação sanitária ou jurídica.
