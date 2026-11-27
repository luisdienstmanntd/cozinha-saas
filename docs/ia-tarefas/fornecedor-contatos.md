# Fornecedor com e-mail e contato

- **Responsável:** Codex /root
- **Estado:** em_andamento
- **Branch/base:** codex/fornecedor-contatos, worktree /workspace/work/cozzigo-fornecedor, main 6a2c9ed.
- **Pedido/aceite:** registrar nome obrigatório, e-mail e contato (telefone/WhatsApp) opcionais; persistir e consultar na lista; fornecedores antigos seguem válidos; recebimento continua mostrando somente nome.
- **Escopo:** domínio, gateway, formulário de fornecedores, migração aditiva e testes. Sem edição, novas permissões, alteração do roadmap ou aplicação no hospedado.
- **Coordenação:** PRs abertos #79 (auditoria) e #81 (equipe) não alteram fornecedores. Roadmap visual até PR-15 já integrado. Worktree anterior preservado.
- **Riscos:** SELECT atual permite membros da organização ler contatos; INSERT continua só proprietário. Conceder INSERT somente nas novas colunas, sem UPDATE. Publicação depende da migração hospedada, que não está autorizada nesta tarefa.
- **Revisões:** UX/negócio/QA independentes e crítica cruzada: opcionais visíveis no drawer, campos vazios como null, telefone livre80 e e-mail254; contatos só onde preenchidos, sem poluir seletor de recebimentos.
- **Próximo passo:** implementar e executar testes; PR em rascunho para validação em banco descartável.

## Implementação
- Três campos no drawer; opcionais vazios viram null. E-mail validado e limitado a254 caracteres; contato livre até80, preservando formatação/ramal. Detalhes só na lista de fornecedores.
- Migração 20261127012833 criada pela CLI; novas colunas nullable e constraints estruturais, grant INSERT somente email/contact. Nenhuma aplicação hospedada. Reversão exige preservar contatos já gravados antes de remover colunas.
- CLI precisou de SUPABASE_HOME em /tmp por diretório pessoal somente leitura. Nenhuma credencial/serviço hospedado usado.
- Bateria inicial focada:32 testes passaram e1 expectativa antiga de nome-only precisou incluir nulls; teste atualizado. Validação completa em andamento.
- Banco local não iniciado (1,1GB livre); pgTAP, API e E2E autenticado serão executados na CI descartável.
- Implantação futura: aplicar migração aditiva antes de publicar cliente. Prévia deste PR depende das colunas e não deve ser usada como homologação hospedada antes da migração. Esquema antigo não oferece persistência dos novos campos.

## Verificação focada
- 34 testes de catálogo passaram após corrigir a montagem do teste novo (jsdom não implementa showModal; o mesmo formulário é exercitado sem drawer no componente, enquanto o drawer real é coberto no E2E).
- Primeira bateria completa:784 aprovados e1 falha no teste novo pelo showModal, já corrigida. Nova execução completa pendente.
- Nenhum fornecedor real criado ou alterado; somente dados fictícios nos testes.

## Revisão independente
- QA identificou que validação de leitura mais estrita que a constraint SQL poderia bloquear a lista toda. Corrigida leitura para string limitada e adicionada regressão do gateway; validação de entrada continua estrita. Restante dos grants/RLS revisado sem bloqueador.
- Gate completo e CI pendentes; PR será rascunho, sem aplicação no hospedado.
