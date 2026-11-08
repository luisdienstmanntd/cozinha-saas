# Pesquisa competitiva e opções de módulos

**Consulta:** 07/11/2026. **Participantes:** `suflex_analyst`, `business_strategist`, `architect_qa` e `feature_market_research`, com pesquisa independente e crítica cruzada. **Escopo:** páginas públicas oficiais de Fixee, Yeschef, ValidaChef e Etiquetador, comparadas ao brief e às decisões do Cozinha SaaS.

## Como ler esta pesquisa

As funcionalidades e vantagens abaixo são as que os fornecedores anunciam. Não criamos contas nem testamos os produtos, e não temos evidência independente de segurança, qualidade, desempenho, redução de perdas, conformidade, demanda ou disposição a pagar. Não copiar textos, interfaces, marcas ou implementação dos concorrentes.

O leitor direto recebeu HTTP 403 na página principal e na página de instalação do ValidaChef. As informações do produto vieram do conteúdo indexado pelo mecanismo de busca para o domínio oficial; a página de instalação também apareceu no índice. A limitação está marcada nas referências.

## O que os serviços anunciam

| Serviço                                            | Funcionalidades anunciadas                                                                                                                                                                                                                                                                                                                                                                        | Vantagem operacional sugerida pela oferta                                                        | Limite da evidência                                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Fixee](https://fixee.com.br/)                     | Recebimento, produção, armazenamento e descarte; etiquetas e QR; controle de validade e estoque; inventário, compras, alertas e relatórios; registro de consumo/descarte; múltiplos estoques; integração com balanças e porcionamento.                                                                                                                                                            | Conectar etapas de entrada, identificação e saída, e reduzir digitação na pesagem e etiquetagem. | Páginas comerciais não demonstram regras internas de validade, autorização, correções, recuperação de falhas ou resultados anunciados. A alegação de conformidade permanece uma alegação do fornecedor.           |
| [Yeschef](https://us.yeschef.app.br/)              | Etiquetas/QR, regras de validade cadastradas pelo cliente, lista de vencimentos, responsáveis e locais; recebimento/estoque/perdas; checklists digitais de abertura, fechamento, temperatura e higiene com horário, responsável, evidência e alertas. A oferta separa Etiquetas e Checklists e também anuncia um pacote combinado; há opção de impressora, consumíveis e implantação acompanhada. | Conectar etiqueta/validade a rotinas de equipe e deixar exceções visíveis ao gestor.             | Preço e composição variam entre páginas comerciais e podem mudar. As capacidades, os cálculos e as alegações sobre resultados não foram verificados em uso.                                                       |
| [ValidaChef](https://validachef.com.br/index.html) | Fluxo anunciado de recebimento → produção → identificação → acompanhamento, com lote, fornecedor, validade, QR, histórico, relatórios e perfis/áreas de acesso. Informa compatibilidade de impressão térmica e instalação de um bridge local; diz que pode coexistir com o PDV e que operação básica pode começar sem impressora.                                                                 | Ligar origem, produção e consulta sem exigir troca do sistema de gestão da operação.             | Acesso direto bloqueado nesta consulta; conteúdo foi recuperado do índice oficial. Compatibilidade, perfis e aplicação não foram testados. Composição e preço dos planos não ficaram claros na página consultada. |
| [Etiquetador](https://etiquetador.org/)            | Painel web de gestão separado do app Android de bancada. Anuncia estoque, compras, fornecedores, receitas, vendas, desperdício, relatórios, histórico, permissões e notificações; app com etiquetas/QR, impressão térmica, scanner/baixa, validade PVPS/FEFO, checklists, porcionamento e assistente. Mostra limites por plano; algumas integrações aparecem como beta ou futuras.                | Separar tarefas de bancada e gestão, e controlar acesso por pessoa/módulo.                       | A página identifica parte dos exemplos como ilustrativa; recursos beta/futuros não são capacidades confirmadas. Preços e limites são retratos da página na data da pesquisa.                                      |

### Referências oficiais consultadas

- Fixee: [página principal](https://fixee.com.br/), [etiquetas](https://fixee.com.br/funcionalidades/etiqueta-cozinha-profissional/), [gestão de estoque](https://fixee.com.br/funcionalidades/sistema-de-gestao-de-etoque-para-restaurantes/) e [integração com balança](https://fixee.com.br/funcionalidades/integracao-com-balanca/).
- Yeschef: [página principal](https://us.yeschef.app.br/) e [módulo de etiquetas](https://etiquetas.yeschef.app.br/). O módulo de checklist também é apresentado na página principal.
- ValidaChef: [página principal](https://validachef.com.br/index.html) e [instalação de impressora/bridge](https://validachef.com.br/oasis-printer-instaladores.html). A página principal e a instalação deram 403 ao leitor web; os detalhes foram recuperados pelo índice oficial.
- Etiquetador: [página principal, recursos e planos](https://etiquetador.org/). A própria página distingue exemplos ilustrativos e recursos beta/futuros.

## Estado do Cozinha SaaS usado na comparação

O [brief do produto](PRODUCT_BRIEF.md) propõe um MVP de baixo custo para uma unidade piloto: login e isolamento multiempresa; catálogo e origem; lote/recipiente rastreável; validade registrada por responsável; etiqueta/QR; consulta por produto/lote/recipiente; painel de vencimentos; e depois consumo/descarte com histórico. Ele exclui cálculo automático de validade sem parâmetros aprovados, produção automática, fracionamento não modelado, CMV, compras, impressão térmica, offline, IA e integrações de PDV/ERP.

As fases 03A–03C estão documentadas como catálogo, recebimento idempotente e recipiente/etiqueta demonstrativa. A consulta/painel 03D está implementada localmente nesta cópia de trabalho e os gates locais de lint, typecheck, Vitest e build passaram. **Os testes que dependem do Supabase local e o E2E continuam pendentes** porque este computador de trabalho não tem Docker no PATH; a etiqueta também não passou por ensaio físico. Não tratar o incremento 03D como fase validada/aceita até completar esses gates em ambiente com Supabase local.

O projeto ainda não tem planos, cobrança ou entitlements. O [registro de decisões](DECISOES.md) mantém preço e cobrança em aberto. Portanto, as propostas abaixo são opções para validar, não decisões aprovadas nem autorização para iniciar essas features.

## Debate dos quatro agentes

### Pareceres independentes

- **Suflex / mercado:** os sites apresentam jornadas amplas de entrada, identificação e consulta, e destacam etiquetas, QR, alertas, perdas, checklists ou estoque. Isso sugere tarefas que merecem validação com usuários, não um roteiro de paridade. Recomenda fechar o fluxo essencial e não antecipar impressão física, cálculos ou módulos amplos.
- **Negócio:** considera testar uma oferta-base por unidade e onboarding/treinamento como serviço delimitado. Permissões mais detalhadas, relatórios e impressão assistida são hipóteses comerciais posteriores. Recomenda medir adoção e esforço de suporte e não fixar preço com base nos sites.
- **Arquitetura/segurança:** pede que RLS e autorização no banco, isolamento, histórico básico e controles de quantidade façam parte do core. Plano ou flag de interface não concede acesso. Recomenda monólito modular, eventos compensatórios em vez de edição silenciosa e nenhuma regra automática de validade sem contrato aprovado.
- **Pesquisador de produto/módulos:** confirma a sequência busca/validade → correção/reenvio confiável → consumo/descarte; sugere avaliar separadamente checklists, multiunidade na interface, impressão física, relatórios avançados, e adiar compras/CMV/IA.

### Crítica cruzada e resolução

1. **“Permissões” premium versus segurança básica:** o parecer comercial citou permissões como possível oferta. A crítica de arquitetura esclareceu a fronteira: autorização, isolamento, registro de autoria e acesso necessário à operação são obrigatórios em qualquer plano. Papéis avançados e controles extras podem ser hipótese comercial, mas não substituem nem enfraquecem RLS.
2. **Multiunidade:** a gestão/visão consolidada pode ser uma oferta posterior. Mesmo assim, `organization_id`, `establishment_id`, FKs coerentes e testes de isolamento são fundação desde já; uma UI premium não pode ser o limite de segurança.
3. **Etiquetas/impressão:** etiqueta/QR e PDF básico previstos no brief permanecem no core. Impressora, bridge, consumíveis, suporte físico e teste de equipamento são opcionais somente após observar demanda e fazer ensaio real. O usuário não deve depender de uma função física que ainda não foi validada.
4. **Relatórios:** histórico essencial de recebimento, recipiente, responsável e baixas fica no core para sustentar rastreabilidade. Dashboards analíticos, exportações em lote, perdas por período e CMV são incrementos separados depois de dados consistentes e demanda comprovada.
5. **Onboarding:** pode ser serviço separado e potencialmente cobrável, medindo tempo, entregáveis e custo. A configuração mínima e as instruções necessárias para usar o core com segurança não devem desaparecer atrás de um serviço pago.
6. **Ordem das baixas:** busca e painel são somente leitura e podem avançar. Antes do piloto e de depender de baixa operacional, definir correção/estorno auditável e recuperação da intenção após fechar a aba. Depois implementar consumo/descarte como eventos transacionais e compensáveis, sem alterar entradas retrospectivamente.

Não houve divergência material sobre manter o MVP estreito. A diferença foi de ênfase: negócio discutiu empacotamento e onboarding; arquitetura esclareceu quais controles são requisitos inegociáveis; mercado e produto priorizaram validar a rotina antes de ampliar o catálogo.

## Classificação de melhorias possíveis

| Capacidade                                                  | Classificação sugerida           | Dependência/critério antes de começar                                                                                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Busca, vencimentos e histórico básico                       | Core                             | Fechar a 03D; manter a data civil registrada e usar o fuso do estabelecimento. Busca atual tem teto documentado de 1.000 recebimentos até paginação.                                                                  |
| Correção auditável e recuperação de tentativa               | Core / gate pré-piloto           | Definir compensação, autoria, motivo e replay confiável antes de iniciar baixas operacionais. Não apagar nem editar evento histórico.                                                                                 |
| Consumo e descarte                                          | Core                             | Ledger atômico/idempotente, quantidade decimal e unidade explícita, motivo/autoria, prevenção de baixa duplicada/negativa e teste de concorrência/RLS.                                                                |
| Etiqueta/QR e PDF básico                                    | Core                             | Já previsto; reimpressão mantém identidade e não movimenta quantidade. QR deve continuar autenticado.                                                                                                                 |
| Integração com impressora e material                        | Add-on futuro                    | Ensaio físico de legibilidade, aderência, leitura do QR, compatibilidade, falha e recuperação. Estimar custo de hardware e suporte; não comprar antes de demanda.                                                     |
| Checklists e temperaturas                                   | Módulo opcional candidato        | Entrevistar equipe; definir agenda/fuso, evidência exigida, autoria, retenção, privacidade de fotos, falhas/alertas e autorização. Não anunciar conformidade garantida.                                               |
| Permissões avançadas por função                             | Candidato condicionado           | Primeiro definir papéis reais do piloto. Qualquer permissão deve ser aplicada no banco/API; UI apenas reflete. Não cobrar pelo isolamento ou controles mínimos.                                                       |
| Multiunidade consolidada                                    | Módulo/nível de oferta candidato | Validar demanda de redes; testar RLS por estabelecimento, agregações, exportação e cache entre tenants. Isolamento e modelo de unidade continuam core.                                                                |
| Relatórios avançados e exportação em lote                   | Módulo opcional candidato        | Depende de eventos corretos, histórico e regras de privacidade. Separar totais descritivos de alegações de economia/desperdício reduzido.                                                                             |
| Estoque avançado, compras, inventário, receitas, CMV/vendas | Fora do MVP; pesquisa própria    | Exige modelo de entradas/saídas, custos, conversões/rendimento, reconciliação e possivelmente integração externa. Não é extensão pequena da etiqueta.                                                                 |
| IA, OCR, WhatsApp e offline                                 | Adiar                            | Aumenta custo, dados pessoais, operação e risco de ação incorreta. Qualquer escrita futura precisaria de confirmação humana, autorização e auditoria. Offline/sincronização está explicitamente fora do escopo atual. |

## Como modular sem criar risco ou custo prematuro

- **Agora:** manter monólito modular e a estrutura por feature (`domain`, `application`, `components`, `data`) já usada no projeto. Evitar microserviços, sistema de plugins dinâmicos e abstrações sem demanda.
- **Quando planos forem validados:** separar os domínios em módulos de produto, mas manter dados e invariantes comuns (organização, unidade, membership, autoria, eventos e auditoria) no núcleo.
- **Entitlements no servidor:** a fonte do plano deve ser controlada no servidor/banco e vinculada ao escopo acordado (organização/unidade). A checagem deve falhar fechada para escritas do módulo premium; indisponibilidade de entitlement não deve inutilizar a leitura dos dados core.
- **RLS continua soberana:** entitlement apenas limita acesso comercial a um módulo; nunca concede papel, acesso cross-tenant ou permissão que RLS negaria. Aplicar verificação em RPC/API, exportação, storage e jobs, não só escondendo botões.
- **Downgrade sem perda de rastreabilidade:** definir data efetiva, restringir novas ações premium sem apagar registros antigos e decidir leitura/exportação de dados existentes antes de cobrar.
- **Dependências explícitas:** checklists têm entidades/evidências próprias; relatórios dependem de eventos consistentes; baixa depende de correção/replay; impressão local depende de compatibilidade e suporte. Não tratar os módulos como componentes independentes que podem ser habilitados sem esses pré-requisitos.
- **Sem paywall de controles essenciais:** autenticação, isolamento, histórico de rastreabilidade, consulta do fluxo contratado e integridade de dados não devem variar de plano.

## Roteiro recomendado

1. Em casa, iniciar Supabase local, completar DB/integration/E2E da 03D e revisar o limite de 1.000 registros. Manter a fase pendente até esses gates passarem.
2. Definir correção auditável para recebimentos e recuperação de reenvio depois do fechamento da aba; testar replay, revogação e concorrência.
3. Implementar baixa de consumo/descarte como eventos, sem fracionamento até modelagem própria, com testes de RLS, concorrência e auditoria.
4. Fazer ensaio da etiqueta em impressora/equipamento existente ou emprestado; decidir custo e uso com o responsável do piloto.
5. Observar uma cozinha e medir fluxo, erros, tempo de cadastro, reenvios, conferência de validade e esforço de onboarding/suporte.
6. Entrevistar comprador, operador e responsável técnico para ordenar checklists, relatórios, impressão e multiunidade. Só então propor planos e preços; não usar os preços concorrentes como benchmark direto.

## Perguntas para validar com usuários

- Em que etapa recente houve erro ou demora: recebimento, identificação, busca, correção ou descarte? Peça um caso concreto.
- Quem pode registrar e corrigir recebimentos, confirmar validade, consumir ou descartar? Qual motivo/histórico é necessário?
- Quais campos são realmente lidos na etiqueta e em qual equipamento/local? Existe impressora emprestada para o ensaio?
- A equipe faria checklist digital durante o turno? Quais duas rotinas são realmente críticas, quem recebe alertas e qual evidência precisa ser guardada?
- Uma unidade é suficiente para o piloto? Quem precisaria comparar várias unidades e que decisão tomaria com isso?
- Que relatório é usado hoje e por quem? Distinguir necessidade de registro operacional de analytics/CMV.
- Quanto tempo de preparação e suporte será necessário? Qual escopo de treinamento é delimitado e quem pagaria por ele?
- O cliente pagaria pelo fluxo de rastreabilidade/consulta como um todo ou por adicionais? Qual evidência concreta sustenta valor e recorrência, sem sugerir economia não medida?

## Conclusão dos agentes

A melhor melhoria não é igualar a lista de recursos dos concorrentes: é completar com segurança a promessa atual do Cozinha SaaS. Primeiro consulta e vencimentos; depois conserto/reenvio confiável; em seguida baixas auditáveis. Etiqueta básica e segurança permanecem no core. Checklists, impressão física, relatórios analíticos e experiência multiunidade podem gerar valor futuro, desde que uma necessidade real, o custo operacional e os critérios de segurança sejam comprovados antes de virar módulo de plano.
