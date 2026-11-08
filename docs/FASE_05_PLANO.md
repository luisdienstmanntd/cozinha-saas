# Fase 5 — plano de consumo, descarte e histórico

Escopo inicial: registrar consumo ou descarte parcial de um recebimento, na unidade original; manter quantidade de entrada imutável e histórico de eventos com autor, instante e fuso do estabelecimento. O saldo registrado é a entrada menos as saídas; não comprova conferência física. A etiqueta e sua reimpressão não movimentam quantidade. A interface deve mostrar o contexto e saldo antes da confirmação e não presumir descarte ou decisão sanitária pela validade.

Critérios: apenas owner autorizado registra; membros autorizados consultam; anônimo, organização diferente, vínculo revogado, IDs de unidade falsificados e escritas diretas não acessam indevidamente. Quantidades positivas de até três casas decimais, inteiras para unidade `un`; sem saldo negativo mesmo em concorrência. Identificador de intenção garante reenvio sem duplicação, rejeitando reutilização com conteúdo ou autoria diferentes. Falhas devem ser visíveis e não apresentar sucesso fictício. Auditoria não permite edição ou remoção pelo cliente.

Testes primeiro: pgTAP positivo e negativo, integração via API com concorrência e reenvio, domínio e componente, E2E pertinente e gates gerais. Migração versionada, rollback testado e verificação de segurança. Sem deploy. A fase deve parar para aceite humano depois dos gates.

Riscos: correção de uma baixa incorreta exige evento compensatório auditado, antes de uso em piloto; perda da intenção após fechamento da aba exige estratégia de recuperação segura. Sem conversões, transferências, fracionamento, prazo sanitário automático ou estoque físico reconciliado. Revisões independentes de arquitetura, negócio e fluxo de cozinha apontaram esses requisitos; agentes não alteram arquivos.

## Base de banco — andamento

A migração adiciona eventos protegidos por RLS e função transacional para baixas. O teste inicial falhou por ausência da funcionalidade e passou após implementação. Os gates locais passaram: `npm run lint`, `npm run typecheck`, `npm run test` (62), `npm run build`, `npm run test:e2e` (3); `supabase test db` (107 verificações), `node --test tests/integration/*.test.mjs` (13) e `supabase db advisors --type security --level warn --fail-on warn` (sem ocorrências). O build mantém aviso de bundle 976,89 kB. A reversão em banco local sem movimentos e `supabase migration up` passaram; a reversão recusa remover histórico não vazio.

O teste concorrente real confirma que duas baixas que excederiam o saldo geram apenas uma saída, e que reenvios concorrentes idênticos geram um único evento. O banco não é, sozinho, uma entrega operacional: faltam interface, integração E2E da nova jornada, correção auditável e recuperação segura após fechamento de aba. Nenhum desses itens foi declarado concluído.
