# COMANDO 02 — IDENTIDADE, ORGANIZAÇÕES E TESTES DE ISOLAMENTO

Somente após comando 01 aprovado. Leia `AGENTS.md`, `docs/TESTES_QUALIDADE.md`, `docs/DECISOES.md` e os resultados de F1.

Objetivo: autenticação de teste, organizações, estabelecimentos e associações de usuários com papéis mínimos; nenhuma funcionalidade de produto/alimento ainda.

Antes de criar tabelas, escreva plano SQL e matriz de permissões. Criar migrações versionadas e RLS habilitada em todas as tabelas necessárias; preferir vínculos no banco como autoridade, não tenant_id enviado pelo browser. Não usar chave `service_role` no front-end.

Criar testes automáticos pgTAP e testes de integração via cliente Supabase para:
- usuário A consulta/edita organização A, mas não B;
- usuário B consulta/edita B, mas não A;
- usuário anônimo não lê dados protegidos;
- remover associação revoga acesso;
- inserir/chutar `organization_id` alheio falha;
- usuário não escala a própria permissão.

Usar Supabase CLI com instância local e ambiente descartável. Se Docker não estiver disponível, reportar BLOQUEIO e não declarar RLS testada. Manter frontend minimalista.

Executar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npx supabase test db` e integração; registrar RESULTADO REAL. Revisar com `architect_qa` sem edição de arquivos, corrigir apenas problemas demonstrados. Parar e aguardar aprovação.
