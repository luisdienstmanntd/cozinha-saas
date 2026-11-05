# Fase 2 — identidade e isolamento

## Plano e critério de aceite

Autorizada pelo usuário em 05/11/2026 após Fase 1. Implementar somente login/logout de teste, consulta de organizações/unidades/vínculos e edição de nome da organização pelo proprietário. Demonstração sem banco permanece disponível. Sem alimentos, convites, cadastro público ou deploy.

Riscos: autorização por informação do navegador, recursão de RLS, promoção de papel, associação revogada ainda autorizada, escrita silenciosamente ignorada e dados de sessão anterior visíveis. Mitigar com autorização por vínculo atual no PostgreSQL, helper privado mínimo, privilégios por coluna, testes positivos/negativos e limpeza de dados na troca de sessão/erro.

Aceite: migração reproduzível, pgTAP e integração real via cliente local aprovados (A/B, anônimo, colaborador, revogação com token antigo, falsificação, promoção e joins), testes de interface e gates lint/typecheck/test/build aprovados, revisão arquitetural e commit/push. Testes bloqueados impedem conclusão e avanço.

## Plano SQL anterior à criação de tabelas

- `organizations`: UUID, nome e criação. Sem criação/deleção pelo cliente. Proprietário altera somente nome.
- `establishments`: UUID, organization_id FK, nome, timezone IANA validado pelo banco, criação. Proprietário insere e altera nome/timezone. IDs e organização imutáveis por privilégios de coluna. Sem deleção física.
- `memberships`: UUID, organização FK, usuário auth.users FK, papel owner/member, criação e revoked_at. Único por organização/usuário. Provisionamento e revogação somente administrador local; histórico preservado.
- RLS nas três tabelas. Helper `private.has_membership(uuid, boolean)` SECURITY DEFINER com search_path vazio consulta apenas vínculo atual de auth.uid(); evita recursão, sem JWT de papel/empresa. Schema não exposto e EXECUTE apenas authenticated.
- Grants explícitos e restritos. Chave administrativa somente no processo de integração local, obtida em memória; nunca frontend ou arquivo versionado.
- Índices de FKs e vínculo ativo para autorização. Rollback SQL separado para ambiente descartável; reaplicação por reset antes do aceite.

## Matriz de permissões

| Ação                                              | Anônimo/revogado | member ativo   | owner ativo        |
| ------------------------------------------------- | ---------------- | -------------- | ------------------ |
| Ler organização/unidades da própria empresa       | Não              | Sim            | Sim                |
| Ler vínculos ativos                               | Não              | Apenas próprio | Da própria empresa |
| Ler outra empresa/joins                           | Não              | Não            | Não                |
| Alterar nome organização                          | Não              | Não            | Própria empresa    |
| Inserir unidade/editar nome e fuso                | Não              | Não            | Própria empresa    |
| Mudar IDs/empresa de unidade                      | Não              | Não            | Não                |
| Criar empresa, promover, revogar, inserir vínculo | Não              | Não            | Não                |
| Deletar registros fisicamente                     | Não              | Não            | Não                |

Provisionamento é ferramenta de teste local, não fluxo comercial. Nenhuma prontidão de piloto é inferida desta fase.

## Ambiente e evidências em andamento

Docker confirmado fora do sandbox pelo caminho local do usuário: cliente/servidor 29.6.2, contexto desktop-linux. PATH não contém docker; sandbox inicialmente ocultou o executável. Instalação npm inicial usou Node 22 por resolução do npm.ps1 e emitiu EBADENGINE; gates serão executados com Node 24 explícito.

CLI fixada em 3.0.0 e supabase-js em 2.119.0. Changelog oficial consultado: v3 usa ambiente local por padrão e remove flags antigas; comandos consultados via --help. Nenhum projeto remoto Supabase vinculado.

## Bloqueio durante implementação — 05/11/2026

Supabase start iniciou download de imagens, mas retornou 1 após o motor Docker ficar indisponível (Docker Desktop is unable to start). Get-PSDrive C mostrou 0 bytes livres. Implementação funcional interrompida; não houve reset nem execução de migrações no banco. Sem limpeza de imagens/arquivos pessoais e sem reinício forçado de serviços de outros projetos.

Fase incompleta e não aprovada. Migração, pgTAP e integração estão preparados, mas NÃO validados. UI implementada parcialmente, sujeita à revisão final. Não iniciar Fase 3. Próximo passo: liberar espaço, recuperar Docker, reaplicar migrações, executar pgTAP/integração, corrigir problemas comprovados, revisar com architect_qa e repetir gates após qualquer alteração. Commit de trabalho preserva progresso e não representa aceite técnico.

Evidência parcial: Node 24.22.1 explícito, vitest run src/features/identity/components/IdentityHome.test.tsx src/shared/config/environment.test.ts: exit 0, 2 arquivos e 12 testes. Lint inicial encontrou process sem import no script Node; corrigido por import explícito. Instalação inicial reportou zero vulnerabilidades. Durante gravação sem espaço, package.json foi truncado; restaurado a partir de HEAD e dependências do lockfile, preservando scripts novos. Não há validação de segurança de autorização ainda.

## Verificação parcial final e revisão

- npm run lint: exit 0 após import explícito de process.
- npm run typecheck: exit 0.
- npm run test: exit 0; 5 arquivos, 17 testes aprovados, nenhum skip.
- npm run build: exit 0; Vite gerou os artefatos. Aviso: JS 526,65 kB, gzip 150,37 kB, acima do limite informativo de 500 kB.
- node --check nos dois arquivos mjs: exit 0.
- git diff --check: exit 0 antes do staging.
- npx supabase test db, integração via cliente, reset/rollback/reaplicação e advisors: NÃO executados, bloqueados por Docker indisponível e disco sem espaço. Não existe comprovação de RLS nesta entrega.

Revisão independente e críticas cruzadas realizadas por suflex_analyst, business_strategist e architect_qa sem edição de arquivos. Concordaram com escopo local e ausência de onboarding. Arquitectura identificou três CTEs DML aninhadas nos testes SQL; corrigidas para WITH no nível superior. Nenhum outro bloqueador demonstrado por inspeção; isso não substitui execução. Limpeza visual por revogação exige nova consulta/operação; não ocorre espontaneamente. Remoção opcional de dist foi rejeitada; nenhum arquivo removido.

Arquivos alterados: package.json/lock, App, configuração de ambiente/testes, feature identity (domínio, contrato, adapter, UI/testes), vitest.config.ts, scripts/local-supabase.mjs, tests/integration/identity.test.mjs, supabase/config.toml/.gitignore/migração/rollback/pgTAP, README, DECISOES e este relatório. CI remota não foi validada nesta execução. Trabalho a sincronizar como WIP explicitamente bloqueado, sem avançar de fase.
