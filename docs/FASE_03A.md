# Fase 03A — catálogo por estabelecimento

O usuário autorizou a continuidade após a validação da Fase 2. Este incremento entrega cadastro e consulta de produtos e fornecedores em um estabelecimento selecionado. Não inclui vínculo fixo entre produto e fornecedor, lotes, estoque, datas, etiquetas ou deploy.

Plano SQL: `products` e `suppliers` têm ID imutável, organização, estabelecimento, nome e data de criação. Produto exige unidade de medida explícita (`kg`, `g`, `l`, `ml`, `un`), sem conversão. FK composta referencia `establishments(organization_id,id)` para impedir pares misturados. Nomes são únicos por estabelecimento sem distinguir maiúsculas; não há edição ou deleção pelo cliente. O índice de unicidade começa pelo par de escopo. Rollback separado somente para banco descartável.

Autorização: vínculo ativo à organização permite leitura; proprietário ativo pode cadastrar nas unidades da própria empresa. Anônimos, revogados e usuários de outra empresa não acessam. A escolha de unidade delimita os registros exibidos; não cria um papel restrito à unidade. O banco autoriza mesmo se o navegador enviar identificadores adulterados.

Estados: sem unidade selecionada, carregando, vazio, catálogo disponível, cadastro em andamento, sucesso e erro com tentativa de recarregar. Ao trocar unidade ou sair, desmontar o catálogo anterior; respostas tardias não devem reexibir seus dados.

Aceite: nome/unidade válidos e persistência após nova sessão; separação entre unidades na interface e entre empresas no banco; FK rejeita par forjado; negação explícita de cadastro por colaborador, mutações fora do recorte e acesso anônimo/revogado. Exige Vitest, pgTAP, integração via API local, E2E Chromium, lint/typecheck/build e revisão. Parar para aceite antes de 03B.

## Evidências locais — 06/11/2026

- Migração `20261106132705_catalog_by_establishment.sql` aplicada localmente. Rollback da 03A executado com `psql -v ON_ERROR_STOP=1`: exit 0, tabelas removidas e organizações preservadas. `supabase db reset --no-seed`: exit 0, ambas migrações reaplicadas.
- `supabase test db`: exit 0, 72 verificações pgTAP nas Fases 2 e 03A, antes e após o reset. `npm run test:integration`: exit 0, 10 testes, incluindo pares falsos, isolamento A/B e revogação.
- `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build`: exit 0; 29 testes em 7 arquivos. Build gerou aviso informativo de JS acima de 500 kB (531,04 kB; 151,67 kB gzip).
- `npm run test:e2e`: exit 0, um teste Chromium verificou cadastro, duplicação, troca de unidade, persistência após nova sessão, logout e ausência de clientes Auth duplicados. O download inicial do navegador falhou por certificado; repetido com `NODE_OPTIONS=--use-system-ca`, sem desabilitar TLS, e passou.
- `supabase db advisors --type security --level warn --fail-on warn`: exit 0, nenhuma ocorrência.
- Cobertura V8 anterior ao último teste do limite: 28 testes, linhas totais 79,48%; por arquivo: App 66,66%, configureApp 66,66%, CatalogPanel 100%, IdentityHome 94,73%, adapters Supabase 0% em Vitest. A cobertura não inclui execução via API real ou navegador e não prova segurança por si só.

Revisões independentes de arquitetura, mercado e negócio, sem edição, e críticas cruzadas: escopo por estabelecimento não cria permissão por unidade; owner-only deve ser avaliado no piloto; fornecedor não é fixado no produto. Arquitetura identificou divergência de espaços de borda entre JavaScript e SQL; corrigida e testada em pgTAP e API. Ao alcançar 1.000 itens, a interface avisa que pode haver itens não exibidos. Não há edição nem arquivamento; definir correção de cadastro antes do piloto.

Arquivos alterados: migração, rollback e pgTAP de catálogo; integração e fixtures locais; teste E2E e configuração Playwright; feature catalog; composição de App e identidade; dependências/lockfile; README, decisões, .gitignore e este relatório. Validação exclusivamente local, sem deploy. Aceite humano recebido em 06/11/2026, autorizando a 03B.
