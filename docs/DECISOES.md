# Registro inicial de decisões (ADR simplificado)

## D-001 — Monólito modular

- **Status:** provisório.
- **Decisão:** React + TypeScript strict + Vite; backend inicial Supabase/PostgreSQL.
- **Motivo:** baixo custo e pouca operação. Separar módulos de domínio, UI e persistência por feature. **Não** microserviços.
- **Revisar quando:** requisitos de integração/escala justificarem.

## D-002 — Multi-tenant no banco

- **Status:** obrigatória para piloto multiempresa.
- **Decisão:** tabelas com `organization_id` onde aplicável; RLS por vínculo real em `memberships`; políticas com testes de autorização positivos/negativos; FKs coerentes dentro de organização.
- **Motivo:** não confiar no isolamento por interface ou filtros.

## D-003 — Etiqueta não é estoque

- **Status:** obrigatória.
- **Decisão:** identidade do recipiente/etiqueta separada de eventos de estoque. Reimpressão não cria lote nem saldo; sequência de eventos é auditável.

## D-004 — Datas e validade

- **Status:** obrigatória.
- **Decisão:** distinguir validade original e pós-manipulação; nunca calcular prazos sanitários sem regra explicitamente aprovada; registrar timezone da unidade e autoria das edições.

## D-005 — PDF antes de impressora

- **Status:** provisório.
- **Decisão:** etiqueta PDF/QR para prototipar. Prova de conceito com impressora térmica antes de prometer produtividade em cozinha.

## D-006 — Serviços pagos

- **Status:** provisório.
- **Decisão:** usar desenvolvimento local e camadas gratuitas para protótipo. Antes de cobrar, avaliar disponibilidade, backup, privacidade e licença de hospedagem; nenhum deploy público sem autorização.

## D-007 — Workflow com testes

- **Status:** obrigatório.
- **Decisão:** alteração de comportamento vem com teste, verificação real e aceite por fase; incluir análise de RLS nas tarefas de banco.

## D-008 — Preço e nicho

- **Status:** hipótese a validar.
- **Decisão:** vender por assinatura; preparação e treinamento mínimos obrigatórios para operar, com cobrança a decidir. Serviços adicionais podem ser opcionais. Nenhuma tabela de preço aprovada ainda.

## D-009 — Fundação de demonstração (04/11/2026)

- **Status:** implementada na Fase 1, sujeita a aceite da fase.
- **Decisão:** fundação local sem persistência; feature `demo` separa componentes, aplicação e domínio. A camada `data` será criada quando existir acesso real a dados; não criar repositórios fictícios. Configuração pública validada com Zod aceita somente modo demo nesta fase.
- **Motivo:** permitir testar comportamento acessível e configuração sem antecipar autorização, regras sanitárias ou abstrações vazias.
- **Consequência:** confirmação fica apenas em memória. Nada é salvo; autenticação/RLS exigem banco e testes reais na Fase 2.
- **Revisar quando:** iniciar a feature de identidade e acesso a dados.

## D-010 — Ferramentas e CI localmente preparados (04/11/2026)

- **Status:** implementada na Fase 1, sujeita a aceite.
- **Decisão:** npm com versões exatas e lockfile, Node 24 na CI, ESLint flat config, Prettier, Vitest com jsdom/RTL e cobertura V8. Workflow GitHub Actions usa npm ci e gates; nenhum remoto criado ou workflow disparado externamente.
- **Motivo:** instalação reproduzível e testes DOM independentes com limpeza por caso, sem cobertura artificial mínima.
- **Consequência:** CI remota só será executada quando o projeto for hospedado/autorizado; relatório local não prova execução no GitHub.
- **Revisar quando:** ambiente de integração/DB e E2E forem introduzidos.

## D-011 — Identidade de teste local (05/11/2026)

- **Status:** validada localmente em 06/11/2026 e aceita na autorização para prosseguir à Fase 3.
- **Decisão:** owner/member por vínculo atual no banco, sem papéis no user_metadata; provisionamento de empresas/membros só em fixtures administrativas locais; IDs e organization_id imutáveis pelo cliente. Helper privado mínimo evita recursão de RLS. Frontend local usa somente chave publicável e sessão em memória.
- **Motivo:** demonstrar isolamento com o mínimo de superfície funcional e operacional.
- **Consequência:** sem cadastro público, convites ou gestão comercial da equipe. A interface retira dados após atualização, erro ou saída. A revogação impede a próxima leitura ou escrita no banco, mesmo com o token anterior; dados já renderizados permanecem visíveis até a interface atualizar.
- **Revisar quando:** forem definidos provisionamento de contas para o piloto ou novos papéis; evidências em [Fase 2](FASE_2.md).

## D-012 — Catálogo mínimo por estabelecimento (06/11/2026)

- **Decisão:** produto tem nome e uma unidade de medida explícita; fornecedor tem nome. Nomes são únicos sem distinção de maiúsculas por estabelecimento e tipo. As tabelas usam FK composta para garantir a coerência da empresa com o estabelecimento.
- **Motivo:** preparar a seleção de dados do lote sem presumir fornecedor fixo, conversão de unidades ou estoque. Manter as permissões da Fase 2: membros consultam e proprietários cadastram dentro da empresa.
- **Consequência:** não há correção, arquivamento ou remoção pela interface nesta etapa. Catálogos de duas unidades da mesma empresa são consultados separadamente, mas o papel abrange a empresa. Sem paginação, a API retorna até 1.000 itens por tipo e estabelecimento.
- **Revisar quando:** o piloto indicar necessidade de correção de cadastros, volume maior ou delegação do cadastro ao gestor. Medir esperas antes de ampliar papéis. Ver [Fase 03A](FASE_03A.md).

## D-013 — Recebimento de lote idempotente (06/11/2026)

- **Decisão:** guardar recebimento imutável com quantidade decimal exata, produto e fornecedor da mesma unidade, autoria e fuso do banco, e data civil com origem explícita. A gravação e o replay usam chave de intenção, reautorizam o usuário e recusam alterações de conteúdo. Não deduplicar pelo código de lote externo.
- **Motivo:** evitar duplicação por reenvio e preservar rastreabilidade sem introduzir saldo ou prazo sanitário calculado.
- **Consequência:** reenvio pela interface sobrevive apenas enquanto o armazenamento da aba estiver disponível; depois do fechamento, é necessária conferência antes de nova operação. Sem correção ou estorno nesta etapa.
- **Revisar quando:** forem definidos correção auditável e operação de piloto. Evidências em [Fase 03B](FASE_03B.md).

## D-014 — Recipiente integral e etiqueta demonstrativa (07/11/2026)

- **Decisão:** um recipiente imutável por recebimento, criado idempotentemente; QR contém somente URL local e ID opaco e sua consulta exige autorização atual. PDF é gerado a partir do registro autorizado sem movimentar quantidade.
- **Motivo:** permitir reimpressão rastreável sem antecipar fracionamento ou duplicar a entrada.
- **Consequência:** modelo 100 × 100 mm é provisório e não foi validado fisicamente; caracteres não suportados geram erro visível. QR local não funciona automaticamente em outro dispositivo.
- **Revisar quando:** forem definidos alocação/fracionamento, fonte Unicode e condições reais de impressão. Ver [Fase 03C](FASE_03C.md).

## D-015 — Consulta de validade somente leitura (07/11/2026)

- **Decisão:** classificar a data civil registrada com base no dia atual do fuso IANA do estabelecimento. A busca por produto, lote ou recipiente filtra a lista autorizada, sem criar ou alterar registros.
- **Motivo:** entregar consulta operacional básica sem inferir validade sanitária nem introduzir movimentações de estoque antes de definir correção e baixa auditáveis.
- **Consequência:** consulta em páginas ordenadas por ID até 10.000 recebimentos; acima disso a interface mostra erro sem apresentar totais parciais. Não há snapshot entre páginas: inserções antes do cursor podem aparecer somente ao atualizar. Classificação depende do relógio do dispositivo e do fuso atual do estabelecimento, visíveis no painel. ID de recipiente só é pesquisável depois que o recipiente existe.
- **Revisar quando:** volume exigir mais de 10.000 recebimentos ou consistência transacional de leitura; antes de disponibilizar consumo/descarte, e quando forem aprovados correção auditável e recuperação de tentativas. Ver [Fase 03D](FASE_03D.md).

## D-016 — Base de eventos de saída por recebimento (08/11/2026)

- **Decisão:** registrar consumo e descarte como eventos imutáveis vinculados ao recebimento; owner grava por função autorizada, membro consulta por RLS. A função serializa baixas no recebimento, reautoriza reenvios e impede saldo negativo. A quantidade original e a etiqueta permanecem independentes dos eventos.
- **Motivo:** manter histórico e quantidades consistentes com o modelo atual de um recipiente integral por recebimento, sem antecipar fracionamento ou conversões.
- **Consequência:** a interface demonstra baixa, histórico e saldo registrado, com confirmação e reenvio da mesma intenção na aba. Ainda não há correção auditável de erros nem recuperação confiável após fechamento da aba. Não está pronta para piloto. A equivalência entre recebimento e recipiente depende do modelo atual. O motivo é obrigatório para descarte; a consulta limita-se a 1.000 eventos por recebimento, recusando totais parciais.
- **Revisar quando:** criar a interface, recuperação de tentativas ou correção por evento compensatório; antes de ampliar permissões ou modelar múltiplos recipientes. Ver [plano da Fase 5](FASE_05_PLANO.md).

## D-017 — Gestão de unidades pela interface, sem edição de fuso (08/11/2026)

- **Decisão:** proprietário ativo cria e renomeia unidades pela interface, usando os grants e políticas já existentes (sem migração). O fuso é escolhido só na criação, numa lista curta de fusos brasileiros, com confirmação. Depois fica só para leitura. Vínculos aparecem apenas como contagem, sem identificadores.
- **Motivo:** fechar uma lacuna entre banco e interface sem antecipar auditoria de unidade. Trocar o fuso reclassificaria a validade de recebimentos já registrados (D-015), e `establishments` não guarda autoria das edições exigida por D-004.
- **Consequência:** a unidade não tem trilha de auditoria de nome, não pode ser excluída e a criação não é idempotente. Um resultado incerto recarrega a lista e pede conferência antes de nova tentativa. Nomes repetidos são permitidos pelo banco e geram rótulos iguais na interface. Recarregar após gravar desmonta a área de trabalho aberta, como já acontecia ao salvar o nome da organização.
- **Revisar quando:** for necessário mudar fuso ou excluir/arquivar unidade (exige migração de auditoria em fase própria), quando houver convite de membros, ou antes de uma visão multiunidade. Ver [revisão da interface](REVISAO_INTERFACE_UNIDADES.md).

## D-018 — Anulação integral de movimentação (08/11/2026)

- **Decisão:** proprietário pode anular integralmente um consumo ou descarte mediante motivo, criando uma única compensação vinculada ao original, sem alterar ou remover eventos. A quantidade é derivada do movimento original no banco; saídas e anulações bloqueiam o mesmo recebimento, e o reenvio é idempotente e reautorizado.
- **Motivo:** corrigir registro incorreto sem perder autoria, histórico ou consistência do saldo registrado.
- **Consequência:** anulação não recupera alimento fisicamente; para substituir quantidade ou tipo é necessário registrar uma nova saída. Não há estorno parcial nem estorno de estorno. A recuperação após fechamento da aba permanece pendente e a rota do QR ainda não exibe saldo.
- **Revisar quando:** a operação de piloto exigir recuperação durável, substituição atômica ou outras formas de correção.

## D-019 — Escrita somente pelo proprietário no piloto (12/11/2026)

- **Status:** decidida por luis em 12/11/2026.
- **Decisão:** no piloto, só o proprietário registra recebimentos, etiquetas, saídas, anulações e cadastros. Cozinheiro e auxiliar (membros) consultam.
- **Motivo:** manter o controle de permissão simples enquanto a operação real da cozinha não foi observada. Proposta alternativa (membro registra consumo, descarte e etiqueta) registrada na [revisão 05](REVISAO_05_SEGURANCA_PRODUTO.md).
- **Consequência:** o autor registrado é sempre o proprietário, mesmo quando outra pessoa manipulou o alimento; a interface deve dizer "registrado por". Pode virar gargalo no turno. Proposta para a etiqueta: registrar à parte quem manipulou (D-021, Q7 do desenho), sem dar escrita ao membro.
- **Revisar quando:** após a observação da cozinha no piloto. Funções novas mantêm o requisito de papel em um único parâmetro e a matriz de papéis testada, para a troca ser pequena.

> As decisões D-020 a D-033 abaixo vêm do [desenho da Fase 6](FASE_06_DESENHO.md), escrito por Claude Code em 12/11/2026. luis aprovou o desenho **para planejamento** em 12/11/2026, com as respostas a Q1–Q10 e as correções da revisão cruzada (PR #4), registradas na seção 14 do desenho. Isso não autoriza implementação: cada fatia exige aceite próprio, e migração, deploy e merge exigem autorização explícita. Nenhuma está implementada. Até a conferência normativa por profissional habilitado (pendência pré-piloto), nada no produto afirma conformidade sanitária.

## D-020 — Saldo pertence ao recipiente

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia.
- **Decisão:** cada recipiente tem quantidade inicial e saldo próprios; movimentos passam a referenciar o recipiente. O recipiente integral é criado na mesma transação do recebimento, e os existentes são preenchidos por migração.
- **Motivo:** permitir abertura e porcionamento sem perder a rastreabilidade do recebimento, com uma única fórmula de saldo.
- **Consequência:** substitui o modelo "um recipiente por recebimento" de D-014 e D-016. Migração de `containers` e `stock_movements` com dados existentes; rollback só enquanto não houver derivados.
- **Revisar quando:** surgir mistura de lotes ou produção (fora do escopo).

## D-021 — Manipulação: abertura e porcionamento

- **Status:** revista com a análise sanitária trazida por luis (RDC 216/2004, Portaria SES/RS 799/2023) e aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia. Conferência normativa pendente antes do piloto.
- **Decisão:** o proprietário registra a abertura (1 derivado, quantidade até o saldo) ou o porcionamento (2 a 20 derivados por operação, sem limite por recebimento) de um recipiente, com o horário real da manipulação (D-031). A validade após abertura é sempre informada, sem sugestão, e o banco recusa data posterior à validade efetiva da origem, inclusive quando congelado; origem vencida na data da manipulação não pode ser manipulada; a regra "nunca posterior" é uma restrição `CHECK` sobre a validade da origem copiada e conferida por FK. **Sobra:** só uma embalagem originalmente fechada mantém a condição de origem; a sobra fica na origem apenas quando ela é o recipiente integral e a pessoa confirma que o restante continua fechado. Caso contrário, a sobra vira mais uma porção ou é descartada na mesma operação. Conservação obrigatória. A operação guarda quem registrou (`created_by`) e quem manipulou (`handled_by`, qualquer vínculo ativo validado pelo banco, com cópia do nome e `user_id` original no histórico; Q7 aprovada). Correção futura de `handled_by` só por evento que preserve a auditoria. Abertura simples também gera ID novo e código curto. Nenhuma manipulação cria estoque.
- **Motivo:** é o momento em que a etiqueta é usada na cozinha (revisão 05, produto item 2), mantendo D-004; a abertura não reinicia a validade do fabricante.
- **Consequência:** a etiqueta antiga continua existindo fisicamente e o QR dela aponta para os derivados. Porcionar uma origem já aberta exige incluir a sobra como porção ou descartá-la; retirar quantidade para uso é consumo, não manipulação. Manipulação errada é anulada por D-032. Prorrogação por congelamento e alimento preparado ficam fora.
- **Revisar quando:** houver procedimento técnico validado para preparações próprias ou congelamento, ou o piloto pedir validades diferentes por porção.

## D-022 — Painel por recipiente com saldo calculado no servidor

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia.
- **Decisão:** função `SECURITY INVOKER` paginada devolve recipientes com saldo e validade efetiva; o painel mostra só recipientes com saldo maior que zero, com esgotados sob filtro.
- **Motivo:** alertas de itens que não existem mais ensinam a equipe a ignorar o painel (revisão 05, P9 e produto item 3).
- **Consequência:** remove os tetos de 10.000 recebimentos (D-015) e 1.000 eventos no navegador (D-016). Critério de desempenho de 50 ms para 200 linhas com 200 mil eventos; plano B é saldo mantido pela função de escrita.
- **Revisar quando:** o critério de desempenho não for atingido.

## D-023 — Histórico append-only para todos os papéis e RLS por conjunto

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia.
- **Decisão:** em três fatias separadas (6.0a, 6.0b, 6.0c, decisão de luis). 6.0a: triggers recusam UPDATE, DELETE e TRUNCATE nas tabelas de histórico para qualquer papel, inclusive `service_role`, com `revoke truncate` e teste de catálogo de trigger habilitado; testes de integração deixam de apagar histórico. 6.0b: RLS por conjunto, mantendo a regra atual de `memberships`. Políticas passam a `organization_id in (select private.member_organizations())`. 6.0c: fuso da unidade imutável depois do primeiro recebimento, com `FOR SHARE` da unidade em `receive_batch`, e mudanças de nome auditadas.
- **Motivo:** propostas P3, P5 e P6 da revisão 05; precisam vir antes das tabelas novas.
- **Consequência:** muda a forma de limpar a integração (D-033); nenhuma mudança de comportamento para o usuário. P5 não protege contra o superusuário do banco.
- **Revisar quando:** houver necessidade legal de apagar dado (tratada pelo procedimento de P8, sem apagar eventos).

## D-024 — Nome de exibição curto por vínculo

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia.
- **Decisão:** `memberships.display_name` com até 40 caracteres, definido por função do proprietário auditada (usada também pelo provisionamento); `handled_by` sem nome é recusado. A lista de pessoas e seus nomes continua visível só ao proprietário. A manipulação copia o nome de quem manipulou no momento da operação, e é essa cópia que a etiqueta imprime.
- **Motivo:** a etiqueta de manipulação precisa dizer quem registrou; hoje o sistema não guarda nome (D-011).
- **Consequência:** novo dado pessoal; entra no procedimento de anonimização (P8).
- **Revisar quando:** houver convite de membros ou perfil editável.

## D-025 — Sessão no dispositivo da cozinha (proposta)

- **Status:** proposta, a detalhar na trilha pré-piloto (fatia 6.10); não incluída na aprovação de planejamento como regra fechada.
- **Decisão:** sessão persistente no aparelho fixo da cozinha com expiração curta por inatividade e saída visível; login individual rápido para registrar autoria.
- **Motivo:** `persistSession: false` desloga a cada recarga e torna o QR impraticável no tablet (revisão 05, produto item 5).
- **Consequência:** aumenta o risco de uso por outra pessoa no mesmo aparelho; exige tempo de inatividade definido com luis.
- **Revisar quando:** após o ensaio na cozinha.

## D-026 — Recuperação de tentativa após fechar a aba

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia.
- **Decisão:** intenções pendentes ficam no `localStorage` por usuário, unidade e operação, por até 24 horas; uma função consulta pelo `intent_id` se a operação já existe. A interface nunca reenvia sem o usuário ver.
- **Motivo:** pendência registrada em D-013, D-016 e D-018.
- **Consequência:** não cobre troca de aparelho; dados da tentativa ficam no navegador até confirmação.
- **Revisar quando:** houver uso em mais de um aparelho por pessoa.

## D-027 — Conservação e temperatura no recebimento

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia.
- **Decisão:** produto tem condição de conservação exigida; recebimento novo registra a conservação (padrão do produto) e a situação da medição. Para refrigerado e congelado, a temperatura aferida é obrigatória no fluxo normal; quando não houver medição, aplica-se D-029. O sistema registra a temperatura e não a classifica como conforme.
- **Motivo:** separar condição exigida, temperatura na conferência e local, que acontecem em momentos diferentes (análise sanitária; Q8 aprovada com condições).
- **Consequência:** `receive_batch` e o formulário de recebimento mudam; registros antigos ficam sem esses dados, sem preenchimento inventado.
- **Revisar quando:** o responsável técnico definir limites e procedimento para temperatura fora do esperado.

## D-028 — Etiquetas por tipo de operação

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia. Campos a conferir por profissional habilitado antes do piloto.
- **Decisão:** dois modelos: recebimento (validade original, lote, fornecedor, conservação, quantidade como "entrada") e produto aberto/fracionado (produto, data de abertura, validade após abertura em destaque, validade do fabricante, lote, conservação, responsável, código curto e QR). Etiqueta legível sem QR. Etiqueta de alimento preparado fica para fase própria.
- **Motivo:** não confundir validade do fabricante com validade após manipulação.
- **Consequência:** o gerador de PDF passa a ter dois modelos; o modelo de 100 × 100 mm continua provisório até o ensaio físico (D-014).
- **Revisar quando:** após o ensaio físico e a conferência normativa.

## D-029 — Ocorrências com bloqueio de uso

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia.
- **Decisão:** ocorrência é aberta na mesma transação da operação que a causa, com justificativa e autoria, em dois casos: recebimento refrigerado ou congelado sem medição (gravado como `not_measured`, sem temperatura fictícia; Q8) e manipulação registrada fora da janela de horário (D-031). Até a decisão, consumo, manipulação e transferência de local dos recipientes afetados são recusados pelo banco; descarte é permitido; a etiqueta de derivado com ocorrência tardia não é gerada. A decisão (liberar ou rejeitar) é um evento imutável único, com justificativa e autoria, tomada pelo proprietário seguindo o procedimento sanitário da cozinha, e bloqueia a linha do recebimento. Nada libera automaticamente.
- **Motivo:** decisão de luis sobre Q8 e sobre B-2 da revisão cruzada.
- **Consequência:** item bloqueado pode travar o turno; o painel mostra o bloqueio e o tempo desde a ocorrência. Enquanto o procedimento não for aprovado por profissional habilitado, o sistema só registra a decisão e o fundamento informado.
- **Revisar quando:** o procedimento sanitário for aprovado ou surgirem outros tipos de ocorrência.

## D-030 — Locais de armazenamento e transferências

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia. Incremento separado (fatia 6.9), depois de estabilizados os fluxos principais. Localização atual pelo evento de maior `seq`; a transferência bloqueia a linha do recebimento.
- **Decisão:** locais por unidade com condição de conservação; localização atual de cada recipiente dada pelo último evento imutável de transferência, com quem moveu, quem registrou e instante. Transferir não altera saldo, validade nem conservação; divergência entre condição do local e do recipiente gera aviso e confirmação, sem mudança automática.
- **Motivo:** decisão de luis sobre Q9.
- **Consequência:** locais são desativados, nunca apagados; descongelamento com validade nova continua sendo manipulação.
- **Revisar quando:** houver registro de temperatura de equipamentos (fora desta fase).

## D-031 — Horário real da manipulação e janela de registro

- **Status:** aprovada para planejamento por luis em 12/11/2026 (B-2 da revisão cruzada); implementação depende do aceite da fatia.
- **Decisão:** a manipulação guarda `handled_at` (quando a pessoa abriu ou porcionou, informado) separado de `created_at` (quando foi registrada). A etiqueta imprime `handled_at`. Janela máxima provisória de **2 horas** entre os dois, numa única função; `handled_at` futuro ou anterior à origem é recusado. Fora da janela, o registro só é aceito com justificativa e abre ocorrência (D-029); horário desconhecido não é registrado. Vencimento da origem é avaliado na data de `handled_at`; a validade nova não pode ser anterior à data do registro.
- **Motivo:** com D-019, o registro acontece depois da abertura física; usar o horário do registro imprimiria uma abertura mais recente que a real.
- **Consequência:** nenhuma etiqueta sai com horário não aceito; o proprietário pode informar o horário errado, o que é tema de observação do piloto.
- **Revisar quando:** após validação operacional e sanitária da janela, com a métrica de atraso do piloto.

## D-032 — Anulação de manipulação

- **Status:** aprovada para planejamento por luis em 12/11/2026; antecipada para antes das telas de manipulação (fatia 6.4).
- **Decisão:** o proprietário anula uma manipulação inteira, com justificativa, enquanto nenhum derivado teve consumo, descarte, manipulação ou transferência de local. Na mesma transação: devolução da transferência à origem, um evento por derivado que zera o saldo dele e anulação do descarte de sobra, se houver. Uma anulação por manipulação; idempotente; bloqueia a linha do recebimento.
- **Motivo:** validade digitada errada é o erro mais provável; a primeira tela de manipulação já deve sair com a correção.
- **Consequência:** a origem volta com a própria validade, mesmo vencida; derivados anulados não geram etiqueta.
- **Revisar quando:** o piloto pedir correção parcial.

## D-033 — Transição segura de esquema e testes

- **Status:** aprovada para planejamento por luis em 12/11/2026 (B-1 e B-3 da revisão cruzada); implementação depende do aceite da fatia.
- **Decisão:** backfill sob histórico append-only por **suspensão transacional controlada** dos triggers de proteção, na própria migração, com bloco final que verifica que todas as proteções existem e estão habilitadas e aborta a migração se não estiverem; a alternativa de ativar a proteção só depois da migração foi comparada e descartada (deixa tabelas sem proteção entre fatias). Testes existentes preservam comportamento, segurança e rastreabilidade: só fixtures e preparação mudam (limpeza sem apagar histórico, trigger que cria o integral no recebimento, preenchimento de `container_id` em inserções legadas, leitura de movimentos por recipiente no front-end). Nenhum teste é removido, pulado ou enfraquecido.
- **Motivo:** preservar tudo o que já funciona enquanto o modelo muda.
- **Consequência:** banco local de testes cresce até um `db:reset`; o preenchimento automático de `container_id` existe só por compatibilidade, e as funções novas não dependem dele.
- **Revisar quando:** a assinatura antiga de `record_movement` for removida.

> A revisão cruzada que originou D-031 a D-033 foi feita pelo mesmo assistente em papéis sequenciais e sem executar testes (ressalva de luis, 12/11/2026). Cada fatia confirma os achados com teste antes de corrigir.

> D-034 a D-041 foram propostas nos registros das fatias 6.0a a 6.5a, aceitas por luis uma a uma e integradas à `main` em 13/11/2026 (PRs #5 a #12). O texto abaixo é o do registro de cada fatia.

## D-034 — Histórico append-only verificável (12/11/2026)

- **Status:** aceita por luis em 12/11/2026; implementada na fatia 6.0a ([registro](FASE_06A.md), PR #5).
- **Decisão:** histórico append-only por gatilho por comando `ENABLE ALWAYS` em recebimentos, recipientes e movimentos; `service_role` só lê; qualquer suspensão para backfill termina com `private.assert_history_protected()` na mesma transação.
- **Motivo:** P5 (S6) e B-1: chave de serviço e scripts não podem apagar auditoria, e a proteção precisa ser verificável ao fim de cada migração.
- **Consequência:** testes não limpam histórico; banco local de testes só volta a vazio por `db:reset`; correções continuam por novos eventos.
- **Revisar quando:** surgir tabela nova de histórico (entra nas duas listas fixas), ou se for necessário um papel de manutenção com escrita.

## D-035 — RLS por conjunto (13/11/2026)

- **Status:** aceita por luis em 13/11/2026; implementada na fatia 6.0b ([registro](FASE_06B.md), PR #6).
- **Decisão:** políticas RLS de `public` usam `organization_id in (select private.member_organizations([true]))`; `has_membership` fica só para funções de escrita que verificam uma organização.
- **Motivo:** P3 (S4): a função por linha custava ~140–180 ms em 20 mil linhas; o conjunto custa ~5 ms, com a mesma regra de acesso.
- **Consequência:** política nova segue o padrão (o teste `rls_set_based` recusa `has_membership` em política e escrita sem a variante de proprietário); `memberships_read` mantém a regra própria (I-10b).
- **Revisar quando:** surgir papel novo com escrita (D-019 reavaliada), ou se usuários com centenas de organizações aparecerem.

## D-036 — Fuso imutável e auditoria de cadastros (13/11/2026)

- **Status:** aceita por luis em 13/11/2026; implementada na fatia 6.0c ([registro](FASE_06C.md), PR #7).
- **Decisão:** o fuso da unidade é imutável a partir do primeiro recebimento, garantido no banco; nome e fuso de organização e unidade são auditados em `entity_changes` (append-only, leitura só do proprietário); `receive_batch` lê a unidade com `FOR SHARE`.
- **Motivo:** P6 (S8) e I-11: mudar o fuso reclassificaria vencimentos já registrados, e a corrida entre mudança e recebimento deixaria recebimentos com fuso diferente do da unidade.
- **Consequência:** correção de fuso errado exige procedimento administrativo; toda função futura que leia o fuso para gravar evento deve ler a unidade com `FOR SHARE` quando criar o primeiro registro da unidade (hoje só `receive_batch`; as demais já têm recebimento, logo fuso congelado).
- **Revisar quando:** o piloto mostrar necessidade de corrigir fuso, ou na 6.3 (nome de exibição).

## D-037 — Saldo por recipiente (13/11/2026)

- **Status:** aceita por luis em 13/11/2026; implementada na fatia 6.1 ([registro](FASE_06_1.md), PR #8).
- **Decisão:** todo recebimento tem exatamente um recipiente integral, criado pelo banco na mesma transação do recebimento (revisa D-014, que criava sob demanda ao gerar a etiqueta); todo movimento pertence a um recipiente do mesmo recebimento e a anulação fica no mesmo recipiente; saldo por recipiente; código curto `C-NNNNNN` por `sequence` global; `record_container_movement` é a escrita por recipiente e `record_movement` opera no integral; backfills futuros terminam com `assert_history_protected()` e a verificação de conservação.
- **Motivo:** P9 e a base da manipulação (6.3); B-1, B-3, I-5, I-7 e I-14 da revisão cruzada.
- **Consequência:** a lista de recebimentos mostra o ID do recipiente desde o recebimento, não só depois da etiqueta. Todo tipo de movimento novo precisa de regra de saldo em `container_balance` e `stock_conservation_problems`.
- **Revisar quando:** a 6.3 criar derivados de verdade, ou se luis preferir esconder o ID até a primeira etiqueta.

## D-038 — Saldo mantido na escrita (13/11/2026)

- **Status:** aceita por luis em 13/11/2026; implementada na fatia 6.2 ([registro](FASE_06_2.md), PR #9).
- **Decisão:** o painel e a rota do QR leem recipientes pelo servidor (`list_containers` e `container_expiry_summary`, `SECURITY INVOKER`), só com saldo por padrão e em ordem de validade efetiva. O saldo atual fica em `container_balances`, mantido por gatilho na transação do movimento (plano B da 4.4), com o histórico como fonte da verdade e `container_balance_problems()` como verificação.
- **Motivo:** P9 e o critério de 50 ms, que a agregação a cada leitura não cumpriu (~250 ms contra 6 a 8 ms).
- **Consequência:** todo tipo de movimento novo precisa de regra de saldo em três lugares (`container_balance`, `stock_conservation_problems` e `apply_movement_to_balance`); backfills terminam também com `container_balance_problems()` vazio.
- **Revisar quando:** a 6.3 criar `transfer`, ou se luis preferir o saldo calculado a cada leitura aceitando o tempo maior.

## D-039 — Manipulação registrada no banco (13/11/2026)

- **Status:** aceita por luis em 13/11/2026; implementada na fatia 6.3 ([registro](FASE_06_3.md), PR #10).
- **Decisão:** abrir e porcionar são uma manipulação única e auditada (`container_handlings` + derivados + `transfer` + descarte de sobra na mesma transação), escrita só por `handle_container`, com validade após abertura nunca posterior à da origem como restrição do banco, janela de 2 horas para `handled_at` (fora dela recusado até a 6.5a), sobra com tratamento obrigatório (`none`, `sealed` só em integral, `discard`, `portion`), `handled_by` com vínculo ativo e nome de exibição copiado, e os três pontos acima.
- **Motivo:** seções 4.1–4.5 e 5.1 do desenho; B-2, I-2, I-3, I-4, I-10b e I-12 da revisão cruzada; Q2, Q5, Q6 e Q7.
- **Consequência:** nenhum estoque é criado; a conservação continua fechando por recebimento. Movimentos de manipulação não são anulados individualmente. A 6.5a precisa trocar a restrição `late = false` pela ocorrência tardia e passar a aceitar `p_late_reason`.
- **Revisar quando:** a 6.4 (anulação) e a 6.5a (ocorrências) chegarem, ou se a observação no piloto mostrar que a janela de 2 horas ou o limite de 20 porções não servem.

## D-040 — Anulação de manipulação no banco (13/11/2026)

- **Status:** aceita por luis em 13/11/2026; implementada na fatia 6.4 ([registro](FASE_06_4.md), PR #11).
- **Decisão:** anular uma manipulação é um registro novo e único (`handling_voids`), escrito só por `void_handling` e só pelo proprietário, com motivo obrigatório. Na mesma transação e com o recebimento bloqueado: `transfer_reversal` na origem (devolve a transferência), `handling_void` em cada derivado (zera o saldo) e a anulação do descarte de sobra, se houve. Só é permitida se nenhum derivado teve qualquer movimento; a origem volta com a validade dela, mesmo vencida. Nenhum desses eventos é desfeito por "Anular registro".
- **Motivo:** seção 4.10 e 5.4 do desenho; I-9 da revisão cruzada; histórico append-only (6.0a); D-038; ponto 3 aceito na 6.3.
- **Consequência:** a fórmula de saldo continua sem exceção; a conservação ganha uma verificação por manipulação anulada. Tipo de movimento novo continua exigindo atualizar os três lugares da D-038. Não criar outra FK de `stock_movements` para `containers` (quebra a junção da API).
- **Revisar quando:** a 6.6 (tela de anulação) e a 6.9 (transferência de local, que entra na condição) chegarem, ou se a observação no piloto mostrar que a regra estrita do ponto 1 atrapalha.

## D-041 — Conservação, temperatura e ocorrências no banco (13/11/2026)

- **Status:** aceita por luis em 13/11/2026; implementada na fatia 6.5a ([registro](FASE_06_5A.md), PR #12).
- **Decisão:** conservação do produto definida uma vez pelo proprietário, auditada; recebimento com conservação e situação da medição obrigatórias (assinatura nova), temperatura registrada sem classificação. Refrigerado ou congelado sem medição e manipulação registrada mais de 2 horas depois de feita só entram com justificativa e abrem ocorrência na mesma transação. Recipiente com ocorrência aberta ou rejeitada não é consumido nem manipulado; descarte permitido. Só o proprietário decide, uma vez, com justificativa, sob o bloqueio do recebimento; nada é liberado sozinho.
- **Motivo:** Q8/D-029, B-2/D-031, seções 4.8 e 5 do desenho, I-6 e S-2 da revisão cruzada; histórico append-only (6.0a); D-019.
- **Consequência:** escrita nova precisa chamar o bloqueio (`container_blocks`) e cruzar identificadores com `occurrence_decisions`; tabela nova de histórico entra nas listas fixas; a assinatura antiga de `receive_batch` sai na 6.5b.
- **Revisar quando:** a 6.5b (tela) e a 6.9 (locais) chegarem; quando a nutricionista RT conferir o procedimento (Q10); ou se o piloto mostrar bloqueios sem decisão (R12) ou janela inadequada (R13).

## D-042 — Recebimento, decisão e bloqueio na interface (13/11/2026)

- **Status:** aceita por luis em 13/11/2026; implementada na fatia 6.5b ([registro](FASE_06_5B.md), PR #13). Por ora a decisão aparece como "pelo proprietário"; cópia do nome de quem decidiu fica para fatia futura.
- **Decisão:** todo recebimento informa conservação e situação da medição (assinatura antiga retirada); a conservação do produto é definida no catálogo antes do primeiro recebimento; a tela lê bloqueios do servidor (`list_occurrences`, mesmas ligações de `container_blocks`), mostra-os no topo do painel, na linha, nas movimentações e na etiqueta (faixa), e a decisão é registrada só pelo proprietário com justificativa, sem sugestão de resposta.
- **Motivo:** desenho 7.2, 7.3 e 7.6; ponto 2 do aceite da 6.5a; I-15 e S-10 da revisão cruzada; D-019, D-029, D-041.
- **Consequência:** produto antigo sem conservação precisa ser definido antes de receber; integração e testes chamam só a assinatura nova; nova lista de expressões proibidas vale para toda tela, PDF e mensagem do banco futura.
- **Revisar quando:** houver mais de um proprietário (nome na decisão), a 6.8 (recuperação de tentativa) ou a conferência normativa (Q10) pedir outro texto.

## D-043 — Telas de abrir, porcionar e anular (13/11/2026)

- **Status:** aceita por luis em 13/11/2026; implementada na fatia 6.6 ([registro](FASE_06_6.md), PR #14).
- **Decisão:** a manipulação entra pela tela em passos (formulário, revisão, confirmação, resultado), só pelo proprietário, sem prazo sugerido ou calculado e sem regra nova fora do banco; a anulação é uma ação explícita da tela do recipiente e do resultado, com motivo; o QR do recipiente mostra origem, derivados, quem manipulou e anulação, e o derivado não gera PDF até a etiqueta própria (6.7).
- **Motivo:** desenho 7.1 e 7.4; D-019, D-030, D-039, D-040, D-041; Q1–Q10.
- **Consequência:** nenhum texto novo afirma conformidade (teste 16); mensagem nova do banco precisa entrar em `handling/domain/messages.ts` para aparecer na tela; a 6.7 passa a definir a etiqueta do derivado.
- **Revisar quando:** a 6.7 (etiquetas), a 6.8 (recuperação de tentativa) ou o piloto mostrar que o formulário é longo demais para a cozinha.

## D-044 — Etiquetas de recebimento e de produto aberto (13/11/2026)

- **Status:** aceita por luis em 14/11/2026; implementada na fatia 6.7 ([registro](FASE_06_7.md), PR #15). Data em dd/mm/aaaa nos dois modelos.
- **Decisão:** dois modelos de PDF 100 × 100 mm (recebimento; produto aberto ou fracionado), com todos os campos obrigatórios legíveis sem o QR; reimpressão não grava nada; "baixar esta" e "baixar todas"; manipulação anulada, tardia sem liberação ou sem dados da manipulação recusam o arquivo inteiro com mensagem; nenhum texto afirma conformidade sanitária.
- **Motivo:** desenho 7.2; D-003, D-028, D-043; S-7 e S-9 da revisão cruzada.
- **Consequência:** campo novo na etiqueta exige teste do texto desenhado e passagem pelo teste 16; ensaio físico segue pendente.
- **Revisar quando:** o ensaio físico (tamanho, QR, impressora) ou a conferência normativa (Q10) pedirem outro texto ou tamanho.

## D-045 — Recuperação de tentativa e acesso tolerante (14/11/2026)

- **Status:** proposta; implementada na fatia 6.8 ([registro](FASE_06_8.md)), aguardando aceite de luis.
- **Decisão:** a tentativa de escrita é guardada no navegador (por usuário, até 24 horas) antes do envio e apagada por sucesso ou recusa definitiva; ao reabrir, o servidor é consultado por `find_operation` (só leitura, pela RLS) e a tela mostra "Registro confirmado" ou oferece "Enviar novamente" (mesmo identificador) ou "Descartar tentativa", sem nunca reenviar sozinha; uma empresa com dado inesperado não derruba o acesso às demais.
- **Motivo:** desenho 4.7, 7.5 e 7.7; I-3; P7 da revisão 05; D-019.
- **Consequência:** operação nova de escrita precisa passar por `trackGateways` e ter o `intent_id` em `find_operation`; recusa do banco precisa ser uma classe de recusa (código de erro) para não deixar tentativa pendente.
- **Revisar quando:** a 6.9 (transferências) ou o piloto mostrar que 24 horas ou 20 tentativas não servem.
