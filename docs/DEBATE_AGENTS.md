# Debate de produto — COMANDO 00

Data: 04/11/2026. Debate concluído e Fase 0 aprovada pelo usuário no chat em 04/11/2026, com autorização explícita para executar prompts/01_FUNDACAO_TESTES.md. O conteúdo abaixo preserva o registro do debate e suas pendências originais. A autorização da Fase 1 não resolve automaticamente perguntas técnicas/comerciais nem autoriza Fase 2 ou deploy.

## Execução e critérios

O agente principal leu AGENTS.md, PRODUCT_BRIEF, SUFLEX_EVIDENCIAS, DEBATE_PRELIMINAR, DECISOES, TESTES_QUALIDADE, RISCOS e prompts/00_DEBATE.md. Foram executados três subagentes reais com os tipos customizados exigidos: suflex_analyst (/root/suflex), business_strategist (/root/business) e architect_qa (/root/architecture). Nenhum deles editou arquivos.

Rodada 1: relatórios independentes, cada um com fatos, hipóteses, cinco recomendações, cinco riscos e referências. O principal recebeu os três relatórios antes de iniciar a rodada 2. Rodada 2: cada agente recebeu resumos das recomendações dos outros dois, identificadas por S1–S5, B1–B5 e A1–A5, e apresentou críticas concretas. As três respostas foram recebidas antes desta síntese. As respostas são condensadas abaixo, sem alegar transcrição integral ou concordância sobre evidências inexistentes.

Critérios comuns: utilidade operacional de ponta a ponta, capital incremental mínimo, margem após atendimento, isolamento entre empresas, integridade de quantidades, responsabilidade sobre validade, possibilidade de manutenção por um fundador e testes verificáveis. Oferta pública não comprova implementação interna nem resultados comerciais.

## Rodada 1 — participantes, argumentos e referências

### suflex_analyst

Fatos públicos: páginas oficiais anunciam recebimento rastreável, seleção de produto/lote/validade para etiqueta e consulta de vencimentos. Produção aparece nos planos avançados; contagem e itens controlados nos mais completos. Há treinamento/suporte, aluguel opcional ou uso de Zebra ZD220 própria e taxa por ponto de impressão; não se obteve tabela pública de mensalidades. A jornada anunciada conecta recebimento, identificação, leitura e consulta. A força observável é a continuidade da oferta com implantação, sem prova independente de velocidade, satisfação ou economia. Fontes: [S1], [S2], [S3].

Suposições: PDF basta para piloto; o recorte gera pagamento; suporte cabe na margem; transparência e histórico serão diferenciais percebidos. Lacunas: arquitetura, RLS, idempotência, permissões, regras internas de validade, SLA, API, offline, integrações e preços negociados. Não mencionar algo não prova ausência.

Recomendações prioritárias:
1. S1: fluxo recebimento → recipiente → etiqueta → consulta → baixa auditada.
2. S2: ensaio de etiqueta, material e dispositivo antes de prometer produtividade.
3. S3: medir implantação e treinamento antes de decidir cobrança.
4. S4: validar recorte e simplicidade; QR/validades já são categorias concorrentes.
5. S5: excluir produção automática e inventário amplo.

Cinco riscos: comoditização; promessas sanitárias/econômicas excessivas; gargalo físico de impressão; suporte sem margem; confundir emissão com entrada de estoque. Mitigações: dor observada, promessa restrita, teste físico, tempo de atendimento registrado e separação entre identidade/impressão/movimento.

### business_strategist

Fatos internos: pouco capital, nicho e preço não validados; documentos não registram entrevistas, compromisso de piloto ou custo de atendimento medido. Fatos públicos: Supabase Free US$0 com pausa por inatividade; Pro desde US$25/mês com backup diário retido por sete dias, conforme consulta do agente. Vercel Hobby tem restrição não comercial. Esses fatos não fecham orçamento total. Fontes: [S2], [B1], [B2].

Suposições: comprador aceita mudar rotina, equipe registra diariamente, conexão e equipamento bastam, fundador consegue atender com margem.

Recomendações prioritárias:
1. B1: uma unidade de restaurante independente acessível ao fundador, gestor presente e responsável técnico acessível; hotel boutique fica como alternativa posterior.
2. B2: meta proposta de cinco gestores, cinco operadores e duas rotinas observadas; investigar episódios concretos e comprador.
3. B3: piloto proposto de duas a quatro semanas, uma unidade, dois operadores e um gestor, somente após gates técnicos; medir linha de base, tempo, rejeições, omissões e suporte.
4. B4: manter fluxo estreito, fornecedor mínimo e um tamanho de etiqueta, sem editor livre.
5. B5: separar custo de assinatura e serviços; preparo mínimo obrigatório, cobrança a decidir, atendimento delimitado.

Cinco riscos: demanda insuficiente; suporte consumir margem; impressão inviável; expectativa sanitária/econômica indevida; receita incapaz de sustentar continuidade. Mitigações: compromisso observado, tempo registrado, ensaio físico, promessa delimitada e orçamento de operação.

### architect_qa

Fatos: D-001–D-008 e política de qualidade já exigem monólito, RLS, separação impressão/estoque, validade responsável e testes. São requisitos, não prova de segurança implementada. PostgreSQL e Supabase oferecem mecanismos de RLS, constraints, tipos de datas e testes; usá-los não certifica segurança. Fontes: [A1]–[A4]. O agente consultou a skill Supabase apenas para revisão, sem operar conta ou banco.

Suposições: conexão aceitável, responsável habilitado disponível, PDF utilizável e ambiente local de integração executável.

Recomendações prioritárias:
1. A1: associação ativa e papel autorizados pelo banco; RLS com USING/WITH CHECK, grants mínimos, bloqueio de autoelevação e FKs coerentes por organização.
2. A2: lotes, recipientes, movimentos e impressões separados; transação, idempotência, auditoria e correção compensatória.
3. A3: contrato de data civil versus instante antes dos campos/regras definitivos; origem, responsável, motivo e timezone IANA; não inventar horário para data de rótulo.
4. A4: monólito modular por features, funções puras no domínio, integridade no PostgreSQL e PDF em um tamanho aprovado.
5. A5: gates progressivos reais; RLS/cliente, integração, E2E, concorrência, impressão física e restauração antes da operação correspondente.

Cinco riscos: vazamento por RLS/views/RPC/FK; validade errada por data/fuso; saldo corrompido por duplicidade/concorrência; falha física ou falso sucesso de impressão; indisponibilidade/perda de dados e confiança indevida em mocks.

## Rodada 2 — divergências, críticas e respostas

### Críticas de suflex_analyst

- A B1: categoria restaurante não garante rotina representativa. Selecionar também por volume/frequência, equipamento, acesso e responsável pela validade. Business acolheu estreitamento e preservou o nicho como hipótese.
- A B3: duas a quatro semanas e poucos usuários não garantem cobertura de eventos. Exigir roteiro completo, troca de operador e erro recuperável; cenários fictícios devem ser identificados como ensaio. Architect fez a mesma ressalva.
- A B5: preparo obrigatório pode virar serviço ilimitado. Definir entregáveis, sessões e tempo; cobrar zero não elimina custo. Business acolheu preparo obrigatório com cobrança variável.
- A A4: tamanho único escolhido antes de observar impressora pode inviabilizar piloto. Escolhê-lo depois do ensaio físico, sem criar editor.
- A A3: não exigir definição sanitária de todos os alimentos para descoberta. Aprovar significado dos campos e confirmação primeiro; operação real depende de validação dos procedimentos aplicáveis.
- Revisão própria de S1/S3: fluxo completo não exige fornecedor rico ou inventário; aceita redução e preparo mínimo obrigatório delimitado.

### Críticas de business_strategist

- A S1: recebimento detalhado pode provocar abandono. Manter origem/lote mínimos e medir tempo por recipiente, sem compras ou conferência fiscal.
- A S2: teste físico não deve induzir compra precoce. Primeiro entrevista/demonstração, depois equipamento do cliente ou emprestado; compra só com demanda e orçamento.
- A A3: bloquear esboços de papel por contrato definitivo encarece descoberta. Permitir exploração sem regra sanitária; contrato aprovado antes de implementar comportamento definitivo.
- A A5: testes/restauração não garantem ausência absoluta de falhas nem justificam contratar infraestrutura antes de intenção de uso. Separar descoberta, demonstração fictícia e piloto operacional; se não houver caixa, permanecer no estágio anterior.
- Revisão própria de B1/B5: foco em uma unidade acessível e retirada da expressão isolada “implantação opcional”. Serviços extras podem ser opcionais; preparação para operar não.

### Críticas de architect_qa

- A S1: “recebimento até recipiente” pode esconder fracionamento/transformação. Exigir contrato conservativo de quantidade; bloquear transformação/transferência não implementada e testada. Demonstração inicial usa entrada simples.
- A B3: ausência de incidente em poucas semanas não demonstra segurança. Roteiro deve cobrir duplicidade, membro removido, erro de rede e etiqueta física antes da operação.
- A B4: reduzir fornecedor não permite eliminar origem. Preservar referência mínima de fornecedor/recebimento e lote, sem módulo comercial.
- A S3/B5: treinamento de software não pode assumir validação sanitária. Separar responsabilidades e limitar atendimento.
- Resposta ao alerta de Suflex sobre A2: separar movimentos não exige inventário completo. Conservar somente entrada/consumo/descarte do recipiente, com unidade única e sem conversões. Remover quantidade exigiria revisão explícita da promessa.
- Resposta ao custo: reduzir superfícies, não os gates críticos. Se DB, restauração ou etiqueta física não puderem ser comprovados, declarar demonstração fictícia, sem apresentar piloto pronto.

As críticas a datas convergem por estágio: entrevistas/esboços podem começar sem catálogo sanitário completo; implementar regras exige contrato de campos; uso real exige procedimento validado. Não houve nova rodada de ratificação depois dessas respostas; a classificação de consenso abaixo é a síntese do principal sobre convergências explícitas.

## Decisões e comparação da proposta

Consensos: fluxo estreito completo; monólito modular; RLS e integridade no banco; reimpressão sem entrada; eventos auditados/idempotentes; validade informada e responsável, sem prazo padrão; QR autenticado; teste físico antes de dependência operacional; preparo mínimo delimitado; custo de atendimento medido; nenhuma promessa de conformidade, perda zero ou economia garantida.

Decisões provisórias para aprovação: restaurante independente de uma unidade; um tamanho validado; PDF inicial; origem mínima sem gestão ampla de fornecedores; unidade de medida única por produto/recipiente, sem conversão; entrada simples sem fracionamento/transformação; piloto de duas a quatro semanas subordinado a eventos; metas de entrevistas propostas, não amostra estatística validada.

Impasses externos: disposição a pagar e diferenciação percebida; adequação de PDF sem impressão direta/offline; contrato definitivo de datas e papéis; limites quantitativos e operação real; material/tamanho; metas de aceitação e orçamento total. Se impressão direta ou offline for essencial, o piloto deste MVP fica bloqueado até revisão de escopo aprovada, sem implementação antecipada.

Comparação com o brief 0.1 e debate preliminar (estes são a “proposta antiga” disponível; não foi encontrado produto anterior validado):

- Antes: restaurantes independentes e hotéis boutique. Revisada: primeiro uma unidade acessível de restaurante; acesso e rotina contam mais que rótulo de nicho.
- Antes: implantação/treinamento opcionais. Revisada: preparo mínimo obrigatório; cobrança e serviços adicionais a decidir.
- Antes: layout configurável por tamanhos aprovados. Revisada: um tamanho escolhido após teste, sem editor.
- Antes: produtos e fornecedores mínimos. Revisada: preservar origem com referência mínima; sem gestão ampla de fornecedores.
- Antes: baixa e recipiente sem contrato quantitativo suficientemente detalhado. Revisada: entrada simples, consumo/descarte conservativos, unidade única, sem transformação ou conversão automática.
- Antes: PDF para piloto limitado. Revisada: distinguir demonstração fictícia de operação dependente; teste físico e recuperação são gates desta última.
- Antes: preço/nicho pendentes. Revisada: continuam pendentes, com roteiro de descoberta e medição de suporte.
- Inalterados: RLS, auditoria, validade responsável, testes reais, ausência de IA/ERP e aceite humano por fase.

O brief e as ADRs existentes não foram reescritos: esta é uma proposta para aceite, não decisão humana já tomada. Após aprovação, reconciliar os documentos antes de implementar comportamento divergente.

## MVP final proposto — dentro e fora

Dentro: login; organização/unidade com fuso e membros com permissões mínimas; produto com unidade de medida; origem/fornecedor mínimo; lote e recipiente com identidade imutável; validade original e/ou definida pelo responsável com origem, autoria e histórico; entrada simples quantitativa; PDF em um tamanho validado; QR para registro autenticado; busca por produto/lote/recipiente; hoje/amanhã/vencidos; consumo/descarte sem saldo negativo; correções auditadas; erros visíveis; isolamento testado entre duas organizações fictícias.

Fora: produção/ficha técnica, transformações e fracionamento/transferências não modelados, inventário completo/contagem cíclica, compras, CMV, financeiro/fiscal, pagamentos automáticos, editor de etiquetas, integração térmica direta/Bluetooth, offline/sincronização, app nativo, IA/OCR, PDV/ERP e múltiplos idiomas. Não comprar impressora nem criar serviços nesta fase.

### Roteiro demonstrável de ponta a ponta — ainda não executado

1. Criar organizações fictícias A e B e usuários separados; configurar fuso e papéis mínimos.
2. Em A, registrar produto, origem e lote fictício; responsável informa validade e sua origem, sem sugestão de prazo sanitário.
3. Criar entrada simples de um recipiente, por exemplo 1 kg fictício, com ID imutável e evento único. O exemplo é quantidade de teste, não prazo nem procedimento sanitário.
4. Gerar PDF/QR, registrar tentativa/resultado distinguível; PDF gerado não prova impressão física. Reimprimir mesmo ID e comprovar que saldo/evento de entrada não mudam.
5. Ler QR: sem autenticação não exibir dados internos; usuário de A consulta; B recebe negação também por ID direto/PDF/consulta.
6. Consultar status pelo contrato de data/fuso aprovado. Registrar consumo fictício de 0,4 kg e descarte de 0,6 kg; saldo final zero, com autores/motivos/histórico.
7. Repetir envio e testar duas baixas concorrentes: sem duplicidade ou saldo negativo; corrigir por evento compensatório autorizado.
8. Simular erro de rede, remoção de membro e falha de PDF: erro visível, sem sucesso ou movimentação fictícia. Ensaiar etiqueta física e recuperação antes de uso operacional.

## Dez riscos maiores ordenados

Ordem qualitativa do principal por impacto e capacidade de bloquear o piloto; não é probabilidade medida.

1. Vazamento entre empresas: RLS/FKs/grants/views/RPC, testes negativos e positivos com usuários reais de teste, inclusive membro removido.
2. Validade inadequada ou horário inventado: contrato de datas, origem, confirmação profissional, motivo e histórico; pendência bloqueia regra definitiva.
3. Corrupção de quantidade: transação, idempotência, concorrência, unidade única e separação impressão/movimento.
4. Etiqueta ilegível, que descola ou fluxo lento: ensaio físico com material/dispositivo do cliente; bloquear piloto se falhar.
5. Indisponibilidade/perda de dados: continuidade compatível, backup restaurado em ensaio, erros claros e procedimento combinado de contingência, sem alegar offline.
6. Segurança falsamente aprovada por mocks: migração reproduzível, pgTAP, cliente real e E2E; SKIP não conta como PASS.
7. Ausência de demanda/diferenciação: observação, comprador e compromisso de piloto/proposta paga; QR por si não distingue.
8. Atendimento destruir margem: sessões/entregáveis limitados, tempo medido e custo completo antes de fixar preço.
9. Receita/caixa insuficientes e dependência de gratuito: orçamento de continuidade e termos comerciais de provedores; permanecer em demonstração se inviável.
10. Escopo ou promessa exceder capacidade: restringir módulos e linguagem comercial; privacidade/termos/responsabilidades revisados antes de venda; aceite por fase.

## Perguntas para cliente e responsável técnico

- Quem pode informar, confirmar e corrigir validade? O que exige aprovação e qual evidência/motivo guardar?
- Como interpretar data original que só informa dia? Quais regras locais/procedimentos se aplicam à relação original/manipulada? Como tratar exceções sem inventar hora ou prazo?
- Quais campos, legibilidade e material a etiqueta precisam ter na operação? Qual dispositivo/impressora já existe?
- A rotina exige fracionamento, transformação, transferência, conversão, impressão direta ou offline? Se sim, o recorte atual ainda entrega valor sozinho?
- Qual origem mínima permite localizar fornecedor/lote/recebimento? Qual unidade e precisão quantitativa serão usadas?
- Quem compra, usa e confere registros? Qual episódio recente comprova a dor e qual linha de base mediremos?
- Quais eventos e metas encerram o piloto com sucesso ou reprovação? Qual compromisso e preço o comprador aceita discutir?
- Quem paga consumíveis, deslocamento, suporte e infraestrutura? Quais horários de atendimento e tolerância a indisponibilidade são aceitáveis?
- Qual contingência manual, retenção de histórico, recuperação e responsabilidade serão combinadas? Quem valida privacidade e termos antes da venda?

## Custo mínimo e pagamentos

Descoberta e demonstração local podem ter caixa incremental de R$0 SOMENTE se computador, assinaturas/ferramentas, internet e acesso a entrevistados já estiverem disponíveis. Não significa custo econômico zero: exclui tempo, energia, assinaturas existentes, deslocamento e consumíveis. Não há orçamento comprovado de produção a R$0.

Piloto físico requer material e equipamento compatíveis. Preferir impressora do cliente ou emprestada; definir por escrito quem paga consumíveis, ensaios e atendimento. Compra de impressora permanece condicionada a demanda/compatibilidade/orçamento.

Referência pública verificada pelo business_strategist em 04/11/2026: Supabase Pro desde US$25/mês, backup diário com sete dias de retenção [B1]. Free informa US$0 e pausa por inatividade; não é base suficiente para prometer continuidade. Converter para reais, tributos e limites somente na contratação; pagar plano não prova recuperação. Vercel Hobby não serve como orçamento comercial gratuito [B2]. Escolha final de hospedagem permanece aberta.

Custos a cotar antes de dependência operacional: hospedagem com uso comercial permitido, banco e excedentes, backup/recuperação, e-mail quando necessário, consumíveis/equipamento, atendimento e eventuais revisões profissionais. Domínio é opcional nesta descoberta. Tributos/taxas e cobrança entram no orçamento de venda. Nenhuma assinatura ou conta foi criada/alterada.

Custo por cliente = infraestrutura compartilhada / clientes ativos + horas de suporte × custo-hora + consumíveis subsidiados + taxas/tributos + reserva operacional. Exemplo apenas hipotético: a R$40/h, 30 minutos custam R$20; duas horas custam R$80. Não são salários observados nem sugestão de preço. R$79/R$149/R$249 não estão aprovados nem representam preço comprovado de mercado.

## Checklist que bloqueia implementação e avanço

Todos os itens permanecem pendentes de aceite; conclusão deste debate não os marca automaticamente.

Antes da Fase 1:
- [ ] Humano aprova expressamente esta síntese e o início da Fase 1, sem autorizar fases posteriores ou deploy.
- [ ] Aprovar recorte, dentro/fora, público inicial e preparo obrigatório com cobrança a decidir.
- [ ] Registrar quais decisões continuam provisórias e responsáveis por resolver datas, papéis, quantidades e impressão antes das respectivas implementações.
- [ ] Aprovar descoberta/roteiro e orçamento incremental; reconciliar brief/ADRs quando houver decisão humana.
- [ ] Ler prompt da Fase 1 e manter testes de comportamento antes/junto do código e aceite ao final.

Antes das respectivas features e do piloto operacional:
- [ ] Contratos de datas, validade, autorização e quantidade aprovados; sem pendências ocultas em padrões automáticos.
- [ ] Gates da fase executados com resultado real: lint, typecheck, testes e build; integração/DB/E2E conforme mudança.
- [ ] RLS, falsificação de organização/papel, relações cruzadas, anônimo e membro removido comprovados em DB/cliente reais.
- [ ] Idempotência, concorrência, reimpressão, erros e trilha auditável comprovados.
- [ ] Etiqueta física/material/dispositivo e fluxo validados; restauração e contingência ensaiadas.
- [ ] Cliente/RT, critérios de saída, limites de suporte e custos definidos; continuidade, privacidade e termos revisados antes de cobrar.

## Referências e limites

Fontes públicas consultadas pelos subagentes em 04/11/2026; preços e condições devem ser reverificados antes de contratar.

- [S1] https://suflex.com.br/funcionalidades/ — oferta anunciada, não auditoria técnica.
- [S2] https://suflex.com.br/planos/ — módulos, implantação e impressão; não comprova resultados ou preço negociado.
- [S3] https://materiais.suflex.com.br/gestao-de-cozinha-profissional — jornada anunciada de QR/contagem.
- [B1] https://supabase.com/pricing — referência de planos, não custo total.
- [B2] https://vercel.com/docs/plans/hobby — restrição do plano Hobby.
- [A1] https://supabase.com/docs/guides/database/postgres/row-level-security
- [A2] https://supabase.com/docs/guides/database/testing
- [A3] https://www.postgresql.org/docs/current/ddl-constraints.html
- [A4] https://www.postgresql.org/docs/current/datatype-datetime.html
- Fontes internas: os sete arquivos exigidos e prompts/00_DEBATE.md. DEBATE_PRELIMINAR é hipótese preparatória, não execução anterior de agentes.

## Evidência desta entrega

Único arquivo criado: docs/DEBATE_AGENTS.md. Nenhuma alteração em AGENTS.md, configurações, código, npm, conta ou serviço. Comandos de leitura Get-Content concluídos com exit code 0. Inventário rg listou docs/prompts, mas retornou 2 pela pasta .agents inexistente. git status --short falhou porque o diretório não é repositório Git; não é possível apresentar diff Git desta pasta.

Testes de produto, lint, typecheck, build, DB e E2E NÃO EXECUTADOS: entrega exclusivamente documental, sem inicialização de projeto autorizada. Não são declarados aprovados. Nenhum arquivo de configuração foi alterado; seu teste de sintaxe não se aplica a esta mudança. A verificação documental de conteúdo será registrada após gravação.

PARADA: aguardar aprovação humana antes da Fase 1.

Verificação documental: leitura UTF-8 e conferência automatizada de nove marcadores de conteúdo e onze itens pendentes concluídas com exit code 0. Esta conferência verifica estrutura, não substitui aprovação ou testes de produto.
