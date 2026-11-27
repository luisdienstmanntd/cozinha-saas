# Fornecedores — editar e excluir

- **Responsável:** Codex /root
- **Estado:** em_andamento
- **Branch:** codex/fornecedor-contatos, extensão do PR #98; main c693c56 incorporada preservando os registros e estilos das duas branches. Sem alterar PR #101 do Claude.
- **Pedido:** ícones minimalistas editar/excluir ao lado de cada fornecedor. Edição em drawer; exclusão confirmada citando nome e protegida no servidor.
- **Aceite:** foco e rótulos acessíveis, alvos44px; erros preservam campos; lista muda somente após sucesso; fornecedor com recebimentos não pode ser excluído.
- **Histórico:** para não alterar etiquetas reimpressas, nome só pode mudar antes do primeiro recebimento. E-mail/contato continuam editáveis. Mutação auditada em entity_changes; acesso proprietário e escopo completo; sem UPDATE/DELETE diretos. FK existente protege corrida entre excluir e receber.
- **Revisões:** UX/negócio/QA concluídas; identificado join vivo do nome na etiqueta, razão para preservar nome após uso. Confirmar implementação e testes em seguida.
- **Hospedado:** PR #98 anterior ainda depende de acesso ao projeto Supabase correto. Preparar migração e testes sem aplicar DDL hospedada nesta extensão. Publicação dos indicadores #100 concluída separadamente em c693c56.
- **Próximo passo:** RPCs de mutação restritas, auditoria, componente de ações e testes de regressão.

## Checkpoint de implementação

- Componente reutilizável IconButton, ações por fornecedor, drawer de edição, confirmação de exclusão e retorno de foco. Lista reordenada após editar; título recebe foco se resultado some da busca.
- Migração gerada pela CLI `20261127022940_supplier_actions.sql`: RPCs restritas, auditoria por trigger e FK preservando recebimentos. Contatos exigem antes `20261127012833_supplier_contacts.sql`.
- Revisão independente architect_qa: sem bloqueio SQL identificado; corrigido foco ao filtrar/renomear. Opiniões de negócio e referência funcional já incorporadas.
- Local: lint, typecheck, 811 testes em73 arquivos e build passaram. Testes direcionados de catálogo:38 passaram. Ajuste final de foco/ordenação terá nova verificação na CI. SQL/API/E2E adicionados; execução pela CI pendente, sem banco local nesta máquina.
- Não aplicar ao projeto errado: acesso hospedado a wtscafnacsmyfmqcaffy segue bloqueado. PR98 continua rascunho; não houve migração, merge ou deploy de fornecedores.
