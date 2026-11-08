# Revisão do marco após aceite da fase 03D

O aceite humano da fase 03D foi recebido antes desta revisão. Foram realizadas análises independentes de cozinha, negócio e arquitetura, seguidas de críticas cruzadas. Os agentes não alteraram arquivos.

O usuário aceitou esta revisão após a conclusão das correções e verificações documentadas abaixo. O próximo incremento depende de solicitação explícita, conforme o brief do produto.

## Critérios e correções

- Prioridade alta para o usuário: uma etiqueta aberta não deve permanecer visível quando a atualização dos recebimentos falha; a geração iniciada antes de sair da tela ou trocar o contexto não deve disparar download depois. Os testes de componente reproduziram as duas falhas antes das correções. A visualização é fechada na atualização ou falha; resultados assíncronos de uma instância antiga são descartados, inclusive durante a criação do PDF. Um arquivo já baixado não pode ser revogado por essa medida.
- O painel informa que as contagens representam recebimentos registrados e não saldo disponível. A tela de etiqueta avisa quando o QR usa endereço local, que não leva outro dispositivo a este computador.
- A inspeção não encontrou mudança em políticas RLS; o banco continua responsável pelo isolamento. A revisão não equivale a uma auditoria de segurança completa.

## Limites para piloto

O QR local não atende leitura compartilhada por celular; impressão e leitura física ainda precisam de ensaio. Correção ou estorno auditável e recuperação após fechamento da aba permanecem pendentes. A CI ainda não executa os testes de banco, API e E2E; até sua automatização, são gates manuais obrigatórios em cada alteração pertinente. A demonstração não representa controle de saldo ou baixa de estoque.

## Evidências

Antes da correção, `vitest run` para os testes de etiqueta e painel falhou nos dois casos novos: PDF era gerado após desmontagem e etiqueta permanecia após erro de atualização. Os testes posteriores cobrem também desmontagem durante a geração do PDF.

- `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build`: sucesso; 62 testes unitários. Build avisa que o bundle principal tem 976,89 kB.
- `npm run test:e2e`: sucesso, 3 testes Chromium.
- `supabase test db`: sucesso, 89 verificações pgTAP. `node --test tests/integration/*.test.mjs`: sucesso, 12 testes. `supabase db advisors --type security --level warn --fail-on warn`: sucesso, sem ocorrências.
- `npm run test:coverage`: sucesso, 62 testes e 74,45% de linhas, antes do ajuste final que condiciona o aviso ao endereço local. Cobertura não inclui testes E2E ou de integração.

Arquivos de código e teste alterados: `LabelView.tsx`, `LabelView.test.tsx`, `BatchPanel.tsx` e `ExpiryDashboard.test.tsx`. Não houve alteração de esquema ou migração.
