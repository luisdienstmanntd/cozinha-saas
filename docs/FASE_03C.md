# Fase 03C — recipiente e etiqueta

Aceite da 03B recebido em 07/11/2026. Objetivo: um recipiente integral por recebimento, com identidade imutável e etiqueta PDF gerada a partir do registro autorizado; reimpressão apenas lê os mesmos dados. Sem fracionamento, evento de estoque, editor ou integração de impressora.

## Plano e aceite

- Criar tabela `containers`, um por lote (`UNIQUE`), com organização e estabelecimento coerentes por FK composta ao recebimento. Autor e data vêm do servidor. Leitura por vínculo ativo; criação/replay somente por owner ativo, atômicos e sem alteração de quantidade. Negar alteração e deleção pelo cliente.
- QR contém apenas URL local e UUID opaco do recipiente. Abrir rota preserva destino durante login e resolve registro mediante sessão e RLS; anônimo, revogado e outra empresa não recuperam dados, sem diferenciar desconhecido de não autorizado.
- Um modelo PDF de demonstração com nome, lote, quantidade/unidade, validade/origem e identificação do recipiente. QR não contém dados pessoais nem operacionais. Nomes longos não podem ser confundidos nem cortados silenciosamente. Arquivo gerado não prova impressão física.
- Unidade é integral, não permitir vários recipientes com quantidade integral. PDF e reimpressão não criam registros ou entradas. Erros de geração devem ser exibidos sem afetar dados.
- Exigir testes unitários/componentes, pgTAP e API real entre duas empresas, criações simultâneas e revogação; E2E geração/regeração, login e resolução do QR; validação visual e de conteúdo do PDF/QR; rollback/reaplicação e gates de regressão.
- Dimensão e material são protótipos digitais, sujeitos a ensaio físico antes de uso em cozinha. `127.0.0.1` em um telefone aponta ao telefone, portanto não comprova leitura física fora do computador. Não publicar nem configurar LAN automaticamente.

## Estado

Implementada e validada localmente em 07/11/2026, aguardando aceite humano. A tabela mantém um recipiente por recebimento; criação concorrente e repetida retorna a mesma identidade. O download de PDF consulta novamente os dados autorizados e não altera lote nem quantidade. O destino do QR só é consultado após login e é removido durante atualização de acesso ou quando o vínculo não está ativo.

## Evidências locais

- `supabase db push --skip-vault`: exit 0. Rollback da 03C executado com `psql -v ON_ERROR_STOP=1`: exit 0, recipiente removido e recebimentos preservados. `supabase db reset --no-seed`: exit 0, quatro migrações reaplicadas.
- `supabase test db`: exit 0, 88 verificações pgTAP; testes de identidade, catálogo, lote e recipiente. `node --test tests/integration/*.test.mjs`: exit 0, 12 testes incluindo unicidade concorrente, leitura por colaborador, bloqueio de criação por colaborador, anônimo, outra empresa e revogação.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`: exit 0; 46 testes em 12 arquivos. Build apresentou aviso informativo de bundle principal de 972,69 kB (296,02 kB gzip).
- `npm run test:e2e`: exit 0; dois testes Chromium verificam geração de arquivo, nome/conteúdo, nome longo acentuado, reimpressão sem novos recipientes/lotes ou alteração de quantidade, acesso cruzado negado e remoção da visualização ao atualizar vínculo revogado.
- PDFs fictícios normal e de nome longo acentuado renderizados com `pdftoppm -r 300 -png` e inspecionados visualmente; `pypdf` extraiu nome, lote, quantidade, validade e ID; `cv2.QRCodeDetector` decodificou ambos os QRs e confirmou URL local e ID impresso. O Poppler avisou ausência da fonte de visualização Symbol, mas as páginas foram renderizadas. Isso não substitui teste físico.
- `supabase db advisors --type security --level warn --fail-on warn`: exit 0, sem ocorrências.
- Cobertura Vitest anterior aos quatro últimos testes de PDF/interface: 42 testes, linhas totais 60,37%; por arquivo: LabelView 35,71%, pdf 0%, App 33,33%, configureApp 66,66%, BatchPanel 59,52%, CatalogPanel 100%, IdentityHome 94,73%, adapters Supabase 0%. O relatório não inclui E2E ou testes via API e não demonstra segurança sozinho.

A revisão independente de arquitetura identificou dados do QR persistindo na tela após atualização de acesso revogado; a visualização agora desmonta durante essa atualização e o E2E verifica a negação. O primeiro lint da correção falhou por leitura de ref durante renderização; a correção foi substituída por estado de acesso e os gates passaram. Falha de geração de PDF mantém os dados e permite nova tentativa, enquanto falha de autorização os remove; testes de componente cobrem ambos. Negócio e mercado recomendaram um recipiente integral por recebimento e modelo provisório, com ensaio físico antes do piloto. Essas opiniões passaram por crítica cruzada sem edição de arquivos pelos agentes.

O modelo de 100 × 100 mm é apenas demonstração. Caracteres fora da faixa suportada pela fonte PDF ou conteúdo excessivo geram erro visível em vez de etiqueta truncada; não há garantia de cobertura universal de caracteres. O PDF usa URL local: um telefone acessando `127.0.0.1` não alcançará automaticamente o computador. Nenhum deploy, configuração de rede ou teste de impressão física foi realizado. Para uso operacional, validar tamanho, fonte, aderência, legibilidade e leitura do QR com equipamento real.

Arquivos alterados: migração, rollback e pgTAP de recipiente; integração e fixture locais; feature labels (domínio, acesso, PDF, interface e testes); composição e seleção de lote; E2E; dependências/lockfile; README, decisões e este relatório. Aguardando aceite antes da 03D.
