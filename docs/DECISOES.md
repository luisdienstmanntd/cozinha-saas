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

## D-025 — Sessão no dispositivo da cozinha (proposta; detalhada pela D-059)

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

- **Status:** aprovada para planejamento por luis em 12/11/2026; implementação depende do aceite da fatia. Campos a conferir por profissional habilitado antes do piloto. **Alterada pela D-049** (14/11/2026): preparação própria entra com terceiro modelo de etiqueta.
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

- **Status:** aceita por luis em 14/11/2026 ("aceito todas", 00:46 UTC); implementada na fatia 6.8 ([registro](FASE_06_8.md), PR #16).
- **Decisão:** a tentativa de escrita é guardada no navegador (por usuário, até 24 horas) antes do envio e apagada por sucesso ou recusa definitiva; ao reabrir, o servidor é consultado por `find_operation` (só leitura, pela RLS) e a tela mostra "Registro confirmado" ou oferece "Enviar novamente" (mesmo identificador) ou "Descartar tentativa", sem nunca reenviar sozinha; uma empresa com dado inesperado não derruba o acesso às demais.
- **Motivo:** desenho 4.7, 7.5 e 7.7; I-3; P7 da revisão 05; D-019.
- **Consequência:** operação nova de escrita precisa passar por `trackGateways` e ter o `intent_id` em `find_operation`; recusa do banco precisa ser uma classe de recusa (código de erro) para não deixar tentativa pendente.
- **Revisar quando:** a 6.9 (transferências) ou o piloto mostrar que 24 horas ou 20 tentativas não servem.

## D-046 — Locais de armazenamento e mudança de local (14/11/2026)

- **Status:** aceita por luis em 14/11/2026 ("1OK2ok3ok4ok", 01:42 UTC); implementada na fatia 6.9 ([registro](FASE_06_9.md), PR #17).
- **Decisão:** locais por unidade (nome único, condição, ativo; criados e desativados pelo proprietário, nunca apagados) e eventos imutáveis de mudança de local com autoria; o local atual é o evento de maior `seq`; mudar de local não altera saldo, validade nem conservação; o derivado herda o local da origem; recipiente sem saldo ou bloqueado não muda de local; divergência de condição exige confirmação registrada.
- **Motivo:** desenho 4.9 e 4.10; D-019, D-030; teste 15.
- **Consequência:** tabela nova de histórico entra na guarda (`assert_history_protected`, pgTAP de segurança); anular manipulação é recusado depois que um derivado mudou de local.
- **Revisar quando:** o piloto pedir local na etiqueta, local inicial no recebimento ou histórico de locais na tela.

## D-047 — Trilha pré-piloto sem tela (14/11/2026)

- **Status:** aceita por luis em 14/11/2026 11:53 BRT ("aceito os 4 pontos"); implementada na fatia 6.10 ([registro](FASE_06_10.md), [procedimentos](PRE_PILOTO.md), PR #18).
- **Decisão:** provisionamento só local, com senhas temporárias apenas em arquivo 0600; configuração de autenticação hospedada documentada e protegida por teste, sem ser aplicada; métricas de observação por função de leitura pela RLS; procedimento de dados pessoais só documentado; recusas não são gravadas (métricas manuais).
- **Motivo:** desenho 6.10; P4 e P8; R6, R12, R13, R15; D-006; Q10 pendente.
- **Consequência:** MFA obrigatório para proprietários e o destino das cópias de nome em registros imutáveis seguem em aberto; nada afirma conformidade sanitária.
- **Revisar quando:** o ambiente hospedado for autorizado ou o piloto pedir recusas gravadas.

## D-048 — Consumo de recipiente vencido recusado (14/11/2026)

- **Status:** aceita por luis em 14/11/2026 14:50 UTC ("aceito"), com os 5 pontos da fatia 6.11 ([registro](FASE_06_11.md)).
- **Decisão:** o banco recusa consumo de recipiente cuja validade efetiva (a do próprio recipiente) é anterior à data de hoje no fuso da unidade; no dia da validade o consumo vale. Descarte e anulações continuam permitidos; o bloqueio por ocorrência é conferido antes e liberar a ocorrência não libera o vencido. A tela mostra a faixa "VENCIDO - somente descarte" e não oferece consumo nem manipulação; o PDF da etiqueta não muda. `pilot_metrics` conta vencidos com saldo agora; etiquetas fora do sistema ficam em folha de ronda manual.
- **Motivo:** revisão do relatório sanitário externo (itens com validade passada e sem etiqueta); D-004 (nenhum prazo calculado); a regra só olha o recipiente e cobre a preparação própria.
- **Consequência:** é regra de uso, não avaliação sanitária; a conferência normativa (Q10) segue pendente. Testes com validade fixa que registram consumo precisam de data futura distante ou relativa ao fuso da unidade.
- **Revisar quando:** a RT (Q10) se manifestar sobre uso no dia da validade ou o piloto pedir a contagem de etiquetas dentro do sistema.

## D-049 — Preparação própria como lote com validade informada (14/11/2026)

- **Status:** aceita por luis em 14/11/2026 (14:49 UTC), só desenho ([registro](FASE_07_DESENHO.md)); implementação depende da aprovação de cada fatia 7.x. **Altera a D-028**, que deixava alimento preparado para fase própria.
- **Decisão:** a cozinha registra o que produz como **lote de preparação**: item do catálogo marcado como preparação, produzido em (fuso da unidade, janela de 2 h com ocorrência acima), produzido por (nome curto), quantidade e **validade digitada pela pessoa, sem cálculo nem sugestão**. O lote é um `batch_receipts` de origem `produced` com recipiente integral, e usa saldo, consumo, descarte, porcionamento, ocorrências, vencido, locais, QR e recuperação de tentativa existentes, sem segundo estoque. Só o proprietário escreve. Anulação de produção só antes de qualquer movimento. Terceiro modelo de etiqueta, "Preparação própria", 100 × 100 mm, legível sem QR, sem afirmar conformidade. Ingredientes, origem dos insumos e ficha de preparo ficam fora.
- **Motivo:** cerca de metade dos itens sem etiqueta observados eram preparações próprias; fluxo descrito por luis em 14/11/2026; D-003, D-004, D-019, D-024, D-031, D-038, D-041, D-044, D-045, D-046.
- **Consequência:** a etiqueta vira o maior volume de escrita do proprietário (R-1); validade plausível mas errada não é detectada (R-2); o modelo de 100 × 100 mm continua provisório até o ensaio físico.
- **Revisar quando:** a nutricionista RT responder as perguntas da seção 10 (Q10), o piloto medir o atraso do registro, ou luis pedir ingredientes (8.1).

## D-050 — Preparação própria registrada no banco (14/11/2026)

- **Status:** aceita por luis em 14/11/2026 (15:50 UTC); implementada na fatia 7.1 ([registro](FASE_07_1.md)).
- **Decisão:** preparação é um item do catálogo de tipo `preparation`, definido na criação; o lote produzido é um `batch_receipts` de origem `produced` sem fornecedor, lote do fabricante ou temperatura de recebimento, com `batch_productions` append-only e escrita só por `register_production` (proprietário, idempotente, janela de 2 horas com ocorrência `late_production` que bloqueia o lote inteiro, validade digitada sem cálculo); abrir preparação é recusado; `find_operation` devolve `production`.
- **Motivo:** D-049 e os pontos aceitos em 14/11/2026; D-004, D-019, D-031, D-041, D-045.
- **Consequência:** escrita nova em lote precisa considerar a origem; tabela nova de histórico entra na guarda; a 7.2 precisa de tipo de movimento novo (três lugares da D-038).
- **Revisar quando:** a 7.2 a 7.5 chegarem ou a nutricionista RT responder a seção 10 do desenho.

## D-051 — Anulação de produção no banco (14/11/2026)

- **Status:** aceita por luis em 14/11/2026 (16:10 UTC) com os 3 pontos; implementada na fatia 7.2 ([registro](FASE_07_2.md)).
- **Decisão:** `void_production` (proprietário, idempotente, motivo obrigatório, uma vez por lote, só lote produzido) grava `production_voids` append-only e um movimento `production_void` que zera o saldo do integral; é recusada se o lote teve qualquer movimento (inclusive desfeito), porcionamento ou mudança de local, e aí o caminho é o descarte com motivo; a anulação não se desfaz e não fecha ocorrência de produção tardia.
- **Motivo:** D-049 (seção 4.6 do desenho), D-019, D-038, D-045.
- **Consequência:** tipo de movimento novo nos três lugares da D-038; a tela da 7.3 mostra "ANULADO" e a 7.4 recusa o PDF de lote anulado.
- **Revisar quando:** a 7.3 chegar ou a observação na cozinha mostrar outro erro frequente.

## D-052 — Tela de produção da cozinha (14/11/2026)

- **Status:** aceita por luis em 14/11/2026 (16:30 UTC) com os 3 pontos; implementada na fatia 7.3 ([registro](FASE_07_3.md)).
- **Decisão:** preparação própria tem seção própria no catálogo; a produção é registrada em passos (formulário, revisão por extenso com dia da semana e contagem de dias só para conferência, confirmação extra para validade no mesmo dia, resultado), com validade vazia e sem sugestão; "Anular produção" fica na lista das 50 produções mais recentes; registro e anulação entram na recuperação de tentativa; a página do recipiente mostra "Preparação própria", quem produziu e a faixa ANULADO, sem etiqueta para lote anulado.
- **Motivo:** D-049, D-050, D-051, D-043, D-045, D-004, D-019.
- **Consequência:** a 7.4 desenha o PDF a partir dos mesmos dados (`production` na etiqueta). A lista mostra só as 50 mais recentes; todo o histórico segue no banco, e a pesquisa histórica por data, preparação e lote fica como melhoria futura (`BACKLOG.md`).
- **Revisar quando:** a 7.4 e a 7.5 chegarem ou a observação na cozinha pedir outro fluxo.

## D-053 — Etiqueta "Preparação própria" (14/11/2026)

- **Status:** aceita por luis em 14/11/2026 (16:41 UTC) com os 3 pontos; implementada na fatia 7.4 ([registro](FASE_07_4.md)).
- **Decisão:** lote produzido e suas porções usam o terceiro modelo de 100 × 100 mm, com os campos da seção 5.2 na ordem do desenho (nome como maior texto, validade em negrito logo abaixo, "Validade informada pelo responsável", produzido em/por, conservação, quantidade e porção X de N, código e QR), sem lote nem fornecedor; o arquivo inteiro é recusado para produção anulada, produção tardia sem liberação ou dados da produção indisponíveis; gerar não grava nada.
- **Motivo:** D-003, D-044, D-049, D-050, D-051, D-052.
- **Consequência:** a 7.5 ajusta a tela de porcionar preparação sem mudar o modelo.
- **Revisar quando:** a impressão física for testada ou a nutricionista RT responder a seção 10 do desenho (ambas pendências do piloto, `PRE_PILOTO.md`, seção 5).

## D-054 — Porcionar preparação e métricas de produção (14/11/2026)

- **Status:** aceita por luis em 14/11/2026, 16:53 UTC ("Aprovo a decisão D-054", com os 3 pontos da 7.5); implementada na fatia 7.5 ([registro](FASE_07_5.md)).
- **Decisão:** preparação própria só é porcionada; o porcionamento do integral vale a partir do horário da produção; a porção leva a mesma validade do recipiente de origem (decisão B, padrão até a configuração da 7.6) e a tela não oferece campo de data; a sobra pode ficar no recipiente da produção; `pilot_metrics` ganha produções, produções tardias, atraso de registro (mediana e máximo), anulações de produção, porcionamentos de preparação e ocorrências de produção tardia.
- **Motivo:** D-049, D-050, D-053, decisão B de luis (14/11/2026), R-1 do desenho da Fase 7.
- **Consequência:** a 7.6 transforma a regra da porção em configuração ("igual" ou "igual ou menor", nunca maior).
- **Revisar quando:** a 7.6 chegar ou a observação do piloto mostrar outra necessidade.

## D-055 — Configurações da unidade (14/11/2026)

- **Status:** aceita por luis em 14/11/2026, 20:30 UTC ("Aprovo a D-055, com a restrição do ponto 2 registrada na decisão"); implementada na fatia 7.6 ([registro](FASE_07_6.md)).
- **Decisão:** cada unidade tem configurações escolhidas pelo proprietário e auditadas em `entity_changes`:
  - **Quem registra produção:** padrão só o proprietário. A opção "cada colaborador registra a própria produção" é uma exceção à D-019 só para o registro da produção, com a validade.
  - **Janela de registro da produção:** padrão 2 horas, de 15 minutos a 24 horas, guardada em cada registro.
  - **Tempo máximo sem etiqueta:** padrão 1 hora, usado pela 7.8.
  - **Validade da porção de preparação própria:** padrão igual à do lote; a regra "igual ou menor" (nunca maior) fica implementada e testada no banco e na tela de porcionar, mas **a opção de ativá-la fica oculta na interface até a avaliação da nutricionista RT** (restrição de luis ao ponto 2). Nada ativa a regra sozinho. Só uma nova decisão de luis mostra a opção (constante `PORTION_RULE_SELECTABLE`).
  - **Limites de 15 minutos a 24 horas:** servem só para recusar valor absurdo; **não são aprovação sanitária**, e os valores operacionais devem ser avaliados pela nutricionista RT.

  A mudança vale para os registros novos e nunca reescreve os antigos.

- **Motivo:** decisões A e B de luis (14/11/2026), R-1 do desenho da Fase 7, D-036.
- **Consequência:** a 7.7 acrescenta a janela por preparação; a 7.8 usa o tempo sem etiqueta.
- **Revisar quando:** a observação do piloto ou a nutricionista RT indicarem outra necessidade.

## D-056 — Janela de registro por preparação (14/11/2026)

- **Status:** aceita por luis em 14/11/2026, 20:47 UTC ("Aprovo a decisão D-056", com os 3 pontos da 7.7); implementada na fatia 7.7 ([registro](FASE_07_7.md)).
- **Decisão:** cada preparação própria pode ter uma janela de registro da produção, definida só pelo proprietário e auditada em `entity_changes`. Ela substitui a janela da unidade (D-055) só para aquela preparação; sem ela, vale a da unidade. Limites de 15 minutos a 24 horas, só para recusar o absurdo, sem aprovação sanitária. O registro de produção guarda a janela usada, e mudar a janela nunca reescreve registro antigo.
- **Motivo:** resposta 5 de luis ao questionário (14/11/2026), D-036, D-055.
- **Consequência:** o aviso de produção sem etiqueta (7.8) e a temperatura opcional (7.9) seguem como fatias próprias.
- **Revisar quando:** a nutricionista RT avaliar os valores operacionais.

## D-057 — Aviso de produção sem etiqueta (14/11/2026)

- **Status:** aceita por luis em 14/11/2026, 21:20 UTC (3 pontos, com observação); implementada na fatia 7.8 ([registro](FASE_07_8.md)).
- **Decisão:** o download da etiqueta do recipiente integral de uma produção é registrado em tabela append-only, sem criar estoque (D-003), por quem pode registrar produção (D-019 e fatia 7.6). A tela de Produção avisa "sem download de etiqueta registrado há X" nas produções não anuladas, sem download e acima do tempo máximo configurado na unidade (D-055). O banco não bloqueia nada, porque não sabe se a etiqueta foi impressa ou colada. **Observação de luis:** o aviso nunca afirma que a etiqueta não foi impressa ou colada, só que não há download registrado. Limitações aceitas provisoriamente para o piloto: download pela página do QR não registrado e aviso só na tela de Produção.
- **Motivo:** desenho da Fase 7 e resposta de luis ao questionário (aviso de 1 h sem etiqueta).
- **Consequência:** a temperatura opcional (7.9) segue como fatia própria.
- **Revisar quando:** a nutricionista RT avaliar o tempo e a observação do piloto mostrar se o aviso ajuda.

## D-058 — Temperatura opcional da produção (14/11/2026)

- **Status:** aceita por luis em 14/11/2026, 21:42 UTC (3 pontos); implementada na fatia 7.9 ([registro](FASE_07_9.md)).
- **Decisão:** a produção da cozinha pode ter temperaturas registradas (fim do resfriamento, reaquecimento), de forma opcional, em tabela append-only, por quem pode registrar produção (D-019 e fatia 7.6; o colaborador só da própria). O sistema não classifica, não usa faixa, não cria ocorrência, não bloqueia e não mexe no estoque (D-003, como a D-027).
- **Motivo:** resposta 7 de luis ao questionário (temperatura não obrigatória, mas a função deve existir) e desenho da Fase 7.
- **Consequência:** fecha as fatias 7.1 a 7.9 do desenho; o que sobrar fica em `FASE_07_DESENHO.md`, seção 8.
- **Observação de luis:** a faixa de -50 a 80 °C é só validação de entrada; o sistema nunca a usa para afirmar conformidade, liberar produto ou definir condição de conservação. Medição incorreta fica no histórico e se registra outra; a invalidação com motivo obrigatório, sem alterar o registro original, está no `BACKLOG.md`.
- **Revisar quando:** a nutricionista RT definir faixas e a observação do piloto mostrar se falta correção ou anulação de medição.

## D-059 — Sessão persistente com inatividade de 30 minutos (16/11/2026)

- **Status:** ACEITA por luis em 16/11/2026, condicionada à CI verde do PR #32 (confirmada) ([registro](V2_SESSAO.md)). Detalha a D-025. Riscos conhecidos e checklist pré-deploy em `V2_SESSAO.md`.
- **Decisão:** a sessão fica guardada no navegador (recarregar e abrir o QR não pedem login) e expira com 30 minutos sem uso. O limite vale no banco: toda requisição de usuário passa por `session_guard.check_request`, e as políticas RLS e as funções de escrita só valem com sessão ativa. Sair apaga a sessão no servidor.
- **Motivo:** B2 da revisão visual (sessão caía a cada recarga; cada leitura de etiqueta exigiria e-mail e senha) e D-025.
- **Consequência:** nova migração (`20261116000000_session_inactivity.sql`) que muda `has_membership` e `member_organizations`; reversão em `supabase/rollback/session_inactivity.sql`. Aparelho compartilhado: cada pessoa usa a própria conta; não há PIN nem troca rápida.
- **Revisar quando:** a observação do piloto mostrar se 30 minutos atrapalham a cozinha, ou houver MFA e autenticação hospedada.

## D-060 — Navegação por áreas da unidade (16/11/2026)

- **Status:** ACEITA por luis em 16/11/2026 (PR #33), com ressalva: a perda de rascunhos ao trocar de unidade, atualizar acesso ou recarregar é aceita provisoriamente ([registro](V1_NAVEGACAO.md)).
- **Decisão:** a unidade aberta tem cinco áreas (Validade, Receber, Produção, Locais, Cadastros), abre em Validade, com menu lateral no desktop e barra inferior no celular. A área está no endereço (`?unidade=&area=`). O colaborador vê só as áreas do perfil, apenas na interface; as permissões do banco não mudam. As áreas inativas ficam montadas e ocultas para não perder dados digitados.
- **Motivo:** B1 da revisão visual (sem navegação) e autorização de luis de 16/11/2026.
- **Consequência:** botão "Catálogo de X" passa a "Abrir X"; ferramentas da organização vão para Cadastros; V3 a V5 seguem como fatias próprias.
- **Revisar quando:** a observação do piloto mostrar se as áreas e o perfil do colaborador atendem a cozinha.

## D-061 — Lista de validade em cartões e ficha aberta pela lista (16/11/2026)

- **Status:** ACEITA por luis em 16/11/2026, 12:43 UTC, com os seis pontos do relatório ([registro](V3_LISTA_VALIDADE.md)). V3 funcionalmente aceita; encerramento técnico condicionado à CI verde.
- **Decisão:** cada recipiente da lista de Validade é um cartão: produto e código curto em destaque, selo de vencimento com texto e símbolo além da cor ("Vencido há N dias", "Vence hoje", "Vence amanhã", "Vence em N dias", "Esgotado"), validade em dd/mm/aaaa, saldo, lote e local. O UUID sai da lista e fica só na ficha (a busca pelo identificador continua). "Ver ficha" abre a ficha do recipiente no lugar da lista, para qualquer perfil e também para derivados, sem gravar nada; "Voltar para a lista" devolve o foco ao cartão. Datas e horários em dd/mm/aaaa HH:mm no fuso da unidade; o fuso aparece com nome legível. O histórico mostra o nome de exibição de quem registrou, com os identificadores recolhidos em "Identificadores (suporte)".
- **Motivo:** B3, B4, M3, M4 e M6 da revisão visual e autorização de luis de 16/11/2026.
- **Consequência:** só interface. O status continua vindo de `getExpiryStatus` (mesma data da unidade do banco); "em N dias" é a diferença de dias de calendário, sem nova faixa nem prazo. Nenhuma migração, política RLS ou função muda. O botão "Abrir etiqueta" da lista passa a "Ver ficha" e deixa de chamar `ensure_container`.
- **Revisar quando:** a observação do piloto mostrar se o cartão e o selo bastam na cozinha, ou se os contadores devem virar filtros (fora desta fatia).

## D-062 — Acabamento visual: níveis de botão, textos recolhíveis e celular (16/11/2026)

- **Status:** ACEITA por luis em 16/11/2026, 21:10 UTC, com CI verde (PR #37). Aprovada para implementação em 16/11/2026, 13:10 UTC, com dez definições ([proposta](V4_PROPOSTA.md), [relatório](V4_ACABAMENTO.md)). V4 tecnicamente encerrada; sem merge nem deploy.
- **Decisão:** três níveis de botão (principal verde cheio; secundário em contorno para consulta, navegação, fechamento e cancelamento; risco em contorno vermelho, com confirmação em vermelho cheio). Ações de risco: anular registro, anular manipulação, anular produção, descartar alimento, rejeitar ocorrência, desativar local e descartar tentativa pendente. Rádio e caixa alinhados ao texto, com o rótulo inteiro como alvo de 44 px. "Mudar de local" fecha após o sucesso e a confirmação fica no cartão. Só orientação geral e repetitiva vai para "Saiba mais"; alertas de validade, bloqueio, vencimento, responsabilidade, permissão, limitação do saldo físico e informação para confirmar operação crítica ficam sempre visíveis; nenhum texto apagado. Unidade vazia mostra primeiros passos por perfil. Rótulos visíveis curtos com o nome completo no nome acessível. No celular, "Mais ações" no cartão (sem esconder alertas nem o caminho do descarte) e título geral fora da tela (continua para leitor de tela), com unidade, usuário e Sair visíveis.
- **Motivo:** M1, M2, M10, M11, D1 e D3 da revisão visual e limitações registradas nas V1 e V3.
- **Consequência:** só interface. Nenhuma migração, política RLS, função do banco, regra de validade, estoque, permissão ou auditoria muda. Um E2E da Fase 6.9 deixou de clicar em "Fechar" depois de mudar de local e passou a verificar que o formulário fechou e que a confirmação recebeu o foco.
- **Diretriz do aceite:** **uma só ação principal por contexto, sempre que possível**. Ficam como principais os botões que iniciam a operação central da tela (como "Nova preparação", "Registrar decisão" e "Abrir / porcionar"); as ações destrutivas continuam diferenciadas pelo estilo de risco.
- **Revisar quando:** a observação do piloto mostrar se o critério de risco e os textos recolhidos atendem a cozinha.

## D-063 — Vírgula decimal nas quantidades, sem separador de milhar (16/11/2026)

- **Status:** ACEITA por luis em 16/11/2026, 22:08 UTC, com CI verde (PR #38) ([relatório](V5_VIRGULA_DECIMAL.md)). Autorizada em 16/11/2026, 21:10 UTC, com sete requisitos. luis confirmou que `1.500`, `1.000,50` e `1,000.50` continuam recusados com mensagem explicativa, sem separador de milhar. A exibição com vírgula nas demais telas e a vírgula na temperatura do recebimento foram tratadas na fatia complementar V5B ([V5B_PROPOSTA.md](V5B_PROPOSTA.md), D-064).
- **Decisão:** nas quantidades digitadas (recebimento, saída, abrir/porcionar, produção), vírgula e ponto são separadores decimais. No máximo um separador; não há separador de milhar (`1.000,50`, `1,000.50` e `1.000.000` são recusados). Vírgula é sempre decimal. Ponto seguido de exatamente três dígitos com parte inteira diferente de zero (`1.500`) é recusado como ambíguo; `0.250` e `1.25` são aceitos. A conversão mora só na tela (`src/shared/format/quantity.ts`), que entrega a forma com ponto aos esquemas de domínio e às funções do banco de sempre. Os textos de conferência da digitação mostram a quantidade com vírgula.
- **Motivo:** M5 da revisão visual; a cozinha brasileira digita vírgula, e um erro de milhar no saldo é pior do que pedir para digitar de novo.
- **Consequência:** muda o que a tela aceita: `1.500`, antes aceito como um e meio, passa a ser recusado com orientação. Nenhuma migração, política RLS, função do banco, esquema de domínio, saldo, movimentação, permissão ou auditoria muda. Listas, cartões, histórico, ficha e etiquetas continuavam mostrando o valor gravado com ponto; a D-064 muda isso.
- **Revisar quando:** a observação do piloto mostrar recusas frequentes de `1.500` com intenção decimal, ou quando a exibição com vírgula em todas as telas for aprovada.

## D-064 — Quantidades exibidas com vírgula e temperatura com vírgula ou ponto (16/11/2026)

- **Status:** ACEITA por luis em 17/11/2026, 13:17 UTC, com a correção da redação sobre `toFixed(3)` (arredonda, não trunca) ([relatório](V5B_EXIBICAO_VIRGULA.md), [proposta](V5B_PROPOSTA.md)). Aprovada por luis em 16/11/2026, 22:40 UTC, com quatro decisões e requisitos adicionais.
- **Decisão:** toda quantidade e todo saldo mostrados ao usuário (cartão da lista, movimentações e histórico, ficha e página do QR, abrir/porcionar, ocorrências, produções, texto das tentativas pendentes e etiquetas PDF) passam por uma só função, `formatQuantity` (`src/shared/format/quantity.ts`): vírgula decimal, **sem separador de milhar** (`1500 kg`) e **só as casas necessárias**, até três (`12,5 kg`, não `12,500 kg`). A função trabalha sobre o texto do número e não arredonda o que está guardado; só arredonda (`toFixed(3)`, arredondamento e não truncamento) resíduo de conta em ponto flutuante além da terceira casa, que o banco nunca guarda; todo valor válido guardado, de 1 a 3 casas, é preservado exatamente. A temperatura do recebimento e a da produção aceitam vírgula ou ponto pela mesma função, `toDotTemperature` (`src/shared/format/temperature.ts`), que só troca a vírgula decimal pelo ponto: faixa de -50 a 80 °C e uma casa decimal continuam as de sempre, sem limite sanitário novo. Etiquetas já impressas não são alteradas nem reimpressas; as novas saem no formato brasileiro. O QR continua levando só a URL e o ID do recipiente.
- **Motivo:** completar a V5 (D-063): a cozinha digita vírgula e passa a ler vírgula em todo lugar, com uma única fonte de formatação para tela e papel não divergirem.
- **Consequência:** só exibição e leitura da temperatura digitada. Nenhuma migração, política RLS, função do banco, esquema de domínio, saldo, movimentação, permissão ou auditoria muda; o que é enviado ao banco continua sendo a forma com ponto de sempre. 19 asserções de testes antigos tiveram só o texto esperado trocado de ponto para vírgula (nenhuma enfraquecida); uma varredura automática impede que um texto volte a mostrar quantidade crua.
- **Revisar quando:** a observação do piloto mostrar dúvida com valores sem separador de milhar (por exemplo `1500 kg`), ou se uma exportação de dados for criada (ela deve decidir o formato próprio).

## D-065 — Integração individual dos PRs e Fase 8 de preparação para produção (17/11/2026)

- **Status:** ACEITA por luis em 17/11/2026, 13:59 UTC ([plano](PLANO_INTEGRACAO.md), [diagnóstico](REVISAO_TECNICA_INTEGRADA.md)).
- **Decisão:** (1) os PRs #28, #22 a #27, #29 a #34, #36 a #39 e depois #40 e #41 entram na `main` **um a um, com merge commit** (sem squash nem rebase), com CI verde no SHA do PR e na `main` depois de cada merge: 19 merges. O #35 será fechado sem merge depois que o #34 estiver na `main`. (2) Nova **Fase 8 — Preparação para produção e piloto operacional** (fatias 8.0 a 8.8); o antigo F8 "futuro" passa a ser **Fase 9**. (3) A fatia 8.1 (estabilização da CI e do E2E) vem antes da integração; depois do aceite dela, o primeiro lote é só o #28. (4) Proposta de proteção da `main` autorizada, sem aplicar. (5) Decisões de produção do diagnóstico: MFA obrigatório para proprietários antes do piloto, nome de exibição até 80 caracteres preservando o histórico, reversões das 7 migrações sem reversão destrutiva com dados reais (recuperação por backup e restauração), Cloudflare Pages + Supabase (banco preferencialmente em São Paulo), homologação e produção totalmente separadas, backup diário como mínimo com teste de restauração documentado e retenção definida com orientação jurídica e sanitária, revisão independente de segurança antes do piloto.
- **Motivo:** a `main` está 17 PRs atrás; integrar com verificação a cada passo reduz o risco, e a CI instável precisa ser entendida antes (10 falhas em 100 execuções recentes).
- **Consequência:** nenhuma funcionalidade comercial nova; os demais achados da revisão ficam no backlog. Diretrizes permanentes: não enfraquecer, remover nem desabilitar teste para obter CI verde; sem novas tentativas indiscriminadas; sem mudar regra de negócio; preservar segurança, auditoria, estoque, validade e permissões; investigar causa desconhecida; sem segredo, credencial ou dado pessoal em log; sem push direto, force-push, squash ou rebase na `main` durante a integração; sem deploy, contratação ou publicação sem autorização específica.
- **Revisar quando:** ao fim de cada parada do plano (etapas 10, 12 e 19) e antes de qualquer contratação.

## D-066 — Estabilização da CI e do E2E (fatia 8.1) e proteção da `main` (17/11/2026)

- **Status:** ACEITA por luis em 17/11/2026, 15:16 UTC ([relatório](FASE_08_1.md), [proposta de proteção](PROTECAO_MAIN_PROPOSTA.md)).
- **Decisão:** a CI roda por `pull_request`, `push` só na `main` e execução manual; as portas 54320-54329 ficam fora da faixa efêmera; o banco local sobe por script que não imprime credenciais e faz no máximo uma nova tentativa, só para "address already in use", com aviso e diagnóstico; o teste E2E do título mede depois de a unidade reabrir; a `main` recebe o ruleset `main-protegida` (PR obrigatório, 0 aprovações, conversas resolvidas, só merge commit, checks `quality` e `banco-api-e2e`, sem force-push, exclusão ou bypass, atualização estrita desligada, sem auto-merge).
- **Motivo:** 10 falhas em 100 execuções, todas com causa explicada (seis classes); a classe da porta em uso é causa provável, não provada.
- **Consequência:** nenhum teste foi enfraquecido nem regra de negócio alterada. Qualquer recorrência de falha de infraestrutura deve ser registrada.
- **Revisar quando:** a classe A (porta em uso) reaparecer, ou ao fim da integração (reavaliar atualização estrita e 1 aprovação).

## D-067 — Ambiente hospedado de testes com dados fictícios (18/11/2026)

- **Status:** aceita definitivamente por luis em 18/11/2026, 02:46 UTC; integrada na `main` (PR #44, `d05a6e7`). Aprovada antes, com seis condições, tratadas em `FASE_08_4A.md` (seção 13) ([registro](FASE_08_4A.md)). Numeração: a D-066 pertence à fatia 8.1.
- **Decisão:** antecipar parcialmente a 8.4: modo `hosted` (Cloudflare Pages + Supabase em projeto próprio de testes), que nunca cai na demonstração (falha no build e na execução), com cabeçalhos de segurança e CSP restritos ao projeto, cadastro público desligado, primeiro proprietário/empresa/unidade criados por função administrativa executável só em sessão de administração do banco, e reset do banco de testes protegido por marcador de ambiente (`testes`/`producao`, este irreversível).
- **Motivo:** luis quer usar o sistema definitivo com dados fictícios enquanto o refina (18/11/2026); decisões 5 e 6 da revisão técnica (hospedagem, ambientes separados).
- **Consequência:** nenhuma regra de negócio, RLS ou histórico muda; a produção continua dependendo de MFA obrigatório (preservado como condição de lançamento comercial; sua ausência vale só nos testes privados com dados fictícios), revisão de segurança independente, backup com teste de restauração e Q10. A apresentação sem aviso visual de ambiente foi decidida depois na D-074.
- **Revisar quando:** a 8.4 completa (produção) for autorizada.

## D-068 — Consulta de produções recentes por dia (18/11/2026)

- **Status:** implementada na branch de revisão, aguardando aceite.
- **Decisão:** a lista de produções recentes abre em “Todas” e oferece “Hoje”, definido pela data civil da unidade. O filtro trabalha sobre a mesma consulta das 50 produções mais recentes. Formulários abertos nos cartões mantêm seus dados ao alternar o período.
- **Motivo:** localizar preparações do turno mais rapidamente usando a consulta existente.
- **Consequência:** o filtro tem o escopo da lista recente. Os quatro indicadores da validade seguem como contagens da unidade e a lista de recipientes continua paginada.
- **Revisar quando:** houver demanda por histórico por período ou contagem completa de produções do dia.

## D-069 — Destinos de Cadastros no menu da unidade

- **Decisão:** Cadastros expande seções existentes com links de âncora e foco em cada destino. Escape recolhe a lista e devolve o foco ao acionador. No celular, escolher um destino também recolhe a lista.
- **Motivo:** reduzir a rolagem para localizar os formulários e preservar as URLs e os rascunhos da área.
- **Consequência:** a lista de destinos depende da permissão já usada na área. Configurações continua como destino direto para colaboradores.

## D-070 — Mesa operacional e páginas por finalidade

- **Decisão:** shell autenticado com Visão geral, páginas operacionais e subpáginas de administração. As URLs legadas de Cadastros resolvem para o destino compatível com o perfil. O estado de trabalho de unidades visitadas fica em memória enquanto a sessão e o vínculo continuam válidos.
- **Motivo:** concentrar a consulta no conteúdo da página e tirar os formulários de criação da listagem, mantendo o contexto da unidade.
- **Dados:** os totais vêm do resumo autorizado por unidade. Alertas são um recorte explícito; rótulos de validade não classificam segurança. Etiquetas reutilizam a ficha e o acesso de leitura existente.

## D-071 — Orientação operacional para compras e cozinha

- **Decisão:** reduzir a administração inicialmente exposta, nomear Locais pela função real, ordenar recebimento por identificação/validade/temperatura e orientar pré-requisitos de cadastro conforme o perfil existente. Produção usa formulário responsivo, sem alterar seu processo de revisão.
- **Motivo:** reduzir campos sem caminho de conclusão e a troca de contexto nas entregas e no preparo.
- **Consequência:** somente frontend. Nenhuma permissão, migração, regra de alimento ou movimentação muda. O trabalho em compras continua limitado aos cadastros e recebimentos já existentes.
- **Validação:** testes de navegação, estados sem cadastros, rascunhos e responsividade; aceite humano pendente.

## D-072 — Contadores de validade como filtros da lista (V6, 22/11/2026)

- **Status:** aceita por luis e integrada na `main` em 22/11/2026 (PR #59, `2f4f9bd`). Proposta no PR #57. A D-071 está reservada ao PR #56.
- **Decisão:** os quatro contadores de Validades (Vencidos, Vence hoje, Vence amanhã, Posteriores) filtram a lista; tocar de novo ou "Limpar filtro" volta à lista completa. Os contadores da Visão geral levam a Validades já filtrada. O filtro fica no endereço (`validade=vencidos|hoje|amanha|posteriores`) só na área Validades.
- **Como:** cada categoria é um trecho contínuo da ordem do servidor (validade, recipiente). O começo vai como cursor (`dia anterior`, maior UUID) para `list_containers`, com a mesma data de referência no fuso da unidade usada por `container_expiry_summary`; a interface corta o fim da página e encerra a paginação na fronteira. Sem migração, RLS ou função nova.
- **Consequências:** a busca atua dentro da categoria; os contadores continuam sendo totais da unidade. Como eles não contam esgotados, escolher uma categoria desmarca "Mostrar esgotados" e marcar "Mostrar esgotados" limpa a categoria. A categoria não classifica a segurança do alimento; a validade continua sendo a informada pelo responsável. Substitui, no roadmap CozziGo, a linha "Os totais não são controles de filtro".
- **Revisar quando:** houver filtros por local, produto ou fornecedor, ou se a lista deixar de ser ordenada por validade no servidor.

## D-073 — Baixa manual de insumos por lote/recipiente (backlog, 22/11/2026)

- **Status:** aceita por luis em 22/11/2026 (auditoria no PR #67; etapa 2, baixa em qualquer recipiente, no PR #69). Registro original de requisito futuro ([backlog](BACKLOG_BAIXA_MANUAL_INSUMOS.md)). Chamada de "D-FUTURA" no pedido; recebeu o próximo número livre (D-071 reservada ao PR #56, D-072 da V6).
- **Decisão:** a primeira implementação da baixa de insumos será **manual, por lote/recipiente**, com os tipos consumo, descarte e ajuste de estoque (este só com permissão própria). A baixa automática por produção, receitas ou fichas técnicas fica como evolução futura. Saldo zero tira o item só da lista operacional de validades ativas, mesmo antes do vencimento, e ele continua nas consultas históricas; saldo zero não é vencimento nem descarte. Saldo nunca negativo, baixa limitada ao disponível, proteção contra baixa simultânea e duplicada, histórico sem exclusão, validade original intacta, isolamento entre organizações e unidades, permissões respeitadas e sem contar duas vezes quantidades de abertura, porcionamento, transferência ou produção.
- **Motivo:** pedido de luis em 22/11/2026: a lista de validades deve refletir o que a cozinha ainda tem (exemplo: 1 kg de peito de peru, consumos de 300, 500 e 200 g).
- **Consequência:** antes de programar, uma auditoria técnica confere o que já existe (há indícios de que consumo e descarte por recipiente, saldo derivado e "Mostrar esgotados" já cobrem boa parte) e propõe um plano incremental sem duplicar funcionalidade nem presumir tabelas novas. A interface definitiva será revisada com o Codex.
- **Revisar quando:** a funcionalidade for priorizada (etapa 1 do plano: auditoria) ou a baixa automática entrar em discussão.

## D-074 — Interface hospedada com apresentação de produto final (21/11/2026)

- **Status:** aceita por luis em 21/11/2026, com referência visual da ficha de recipiente na prévia do PR #56; aceite visual confirmado em 22/11/2026.
- **Decisão:** fluxos comuns não exibem avisos de “ambiente de testes”, “demonstração” ou implementação em andamento; detalhes técnicos como UUID interno não são apresentados como conteúdo ao usuário. A UI descreve somente a saída real do recurso (por exemplo, formato do PDF), sem declarar ensaio físico ou conformidade não realizados. Recursos que não tenham fluxo funcional completo permanecem fora da navegação até estarem prontos.
- **Segurança e operação:** o ambiente hospedado de testes continua separado internamente, com configuração estrita, projeto e banco próprios e reset protegido. A remoção da faixa não autoriza dados reais, publicação em produção nem flexibiliza MFA, segurança, backup, piloto ou validação normativa; essas condições seguem documentadas e devem estar atendidas antes do piloto.
- **Motivo:** pedido explícito de luis para desenvolver aos poucos com experiência profissional de produto final, sem mensagens de teste ou funções inacabadas na interface.
- **Consequência:** D-074 altera a apresentação da D-067, sem mudar seu isolamento técnico. Pendências de impressão física/QR e Q10 ficam na documentação e critérios internos de lançamento, não em avisos operacionais da ficha.
- **Revisar quando:** preparação do piloto ou inclusão de recurso cujo estado não possa ser representado sem expor uma função incompleta.

## D-075 — Revisão de apresentação: início, cabeçalhos e organização (25/11/2026)

- **Status:** proposta, aguardando aceite de luis (PR em rascunho, branch `claude/revisao-interface-profissional`).
- **Decisão:** a tela inicial da Mesa só serve para escolher a unidade (um cartão por organização, uma linha por unidade com fuso legível e "Abrir"); nome da organização e gestão de unidades ficam somente em Configurações > Organização, salvo quando a organização ainda não tem unidade. Todas as áreas usam o mesmo cabeçalho de página. O logo vai embutido no pacote, com o nome escrito como reserva. "Atualizar recebimentos" passa a "Atualizar lista" em Validades.
- **Motivo:** pedido de luis em 25/11/2026: opções de uma aba apareciam em outra, início desalinhado, logo quebrado no site publicado e aparência de produto real.
- **Consequência:** só interface; nenhum dado, permissão ou regra muda. Nomes de empresa e unidade com "Teste" no hospedado são dados: a renomeação está proposta em [REVISAO_INTERFACE_PROFISSIONAL.md](REVISAO_INTERFACE_PROFISSIONAL.md) e depende de autorização específica.
- **Revisar quando:** houver mais de uma organização por pessoa em uso real, ou se a gestão de unidades precisar de área própria.

## D-076 — Indicadores da unidade a partir de `pilot_metrics` (26/11/2026)

- **Status:** proposta, aguardando aceite de luis (PR em rascunho, branch `claude/painel-indicadores-piloto`). Fatia A da auditoria de funcionalidades sem tela (PR #79, `docs/AUDITORIA_FUNCIONALIDADES_SEM_TELA.md` naquela branch).
- **Decisão:** nova área **Indicadores**, logo abaixo de Visão geral, só para o proprietário. Lê a função existente `pilot_metrics` (sem migração) para os últimos 7, 30 ou 90 dias até agora, e mostra em grupos: situação agora (recipientes vencidos com saldo, com atalho para Validades filtrada), abertura e porcionamento, produção da cozinha, ocorrências e decisões, armazenamento. Tempos em mediana e máximo; sem registro, mostra "—" e "Sem registros no período", nunca zero inventado. Participações só quando há base.
- **Permissão:** a tela fica fora do menu e do endereço para o colaborador, como as demais áreas do proprietário. A função continua SECURITY INVOKER e só conta o que a RLS deixa a pessoa ler; ela **não** restringe a proprietário no banco (o colaborador já lê as mesmas linhas pela RLS). Esconder a área é apresentação, não barreira de segurança; nenhum dado novo fica exposto.
- **Nome:** "Indicadores" em vez de "piloto" na interface, pela D-074 (produto final, sem termos de ensaio). No código e no banco o nome `pilot_metrics` permanece.
- **Consequência:** só interface e testes; nenhum dado, regra, migração ou Supabase hospedado muda. Nada na tela avalia o alimento nem afirma conformidade (Q10 segue pendente).
- **Revisar quando:** o piloto pedir período personalizado, comparação entre unidades ou exportação (fatia F), ou se a D-019 mudar e o colaborador passar a precisar dos números.

## D-077 — Equipe da empresa pelo site (26/11/2026)

- **Status:** aceita por luis em 27/11/2026; integração em preparação (branch `claude/gestao-equipe`). Fatia B da auditoria de funcionalidades sem tela (PR #79). Exige migração (`20261126000000_team_management.sql`); aplicar no Supabase hospedado só com autorização específica de luis.
- **Decisão:** nova área **Equipe** em Configurações (entre Unidade e Organização), só para o proprietário. Lista quem tem acesso (nome de exibição, e-mail, papel, desde quando, "Você"), com ações de editar nome, trocar papel (Proprietário/Colaborador) e revogar acesso, as duas últimas com confirmação. Revogados ficam numa seção recolhida, com data e "Restaurar acesso". "Adicionar pessoa" vincula uma conta **já criada e confirmada** pelo e-mail, com nome e papel.
- **Regras no banco (não só na tela):** só o proprietário ativo da própria empresa age (sessão ativa da V2); ninguém troca o próprio papel nem revoga o próprio acesso; a empresa nunca fica sem proprietário ativo, com cadeado na linha da empresa para dois proprietários agindo ao mesmo tempo; uma conta tem um único vínculo ativo (D-025), e conta inexistente, não confirmada ou já vinculada a outra empresa recebem a mesma mensagem; revogar grava `revoked_at` e vale na hora (as políticas já exigiam vínculo ativo), restaurar reativa a mesma linha **como colaborador**; nada é apagado. Papel e acesso entram em `entity_changes` (campos `role` e `access`) por gatilho, por qualquer caminho; o vínculo feito pelo site também.
- **Fora desta decisão:** criar a conta ou convidar por e-mail pelo site (exige função de servidor com chave de serviço fora do navegador e e-mail configurado no projeto hospedado, fatia C); o colaborador editar o próprio nome. A conta continua sendo criada pela administração no painel do Supabase (Add user, Auto Confirm).
- **Consequência:** o restaurante deixa de depender de SQL para tirar o acesso de quem saiu. O proprietário passa a ver o e-mail das contas da própria empresa (dado pessoal mínimo, já conhecido por ele). O resumo de pessoas em Organização continua contando só os ativos.
- **Revisar quando:** a fatia C (e-mail no hospedado) for aprovada, permitindo convite; a D-019 mudar os papéis; ou o piloto pedir motivo da revogação.

## Indicadores — resumo visual da operação

- Pedido de luis: melhorar experiência e visualização, comparando indicadores com gráficos/análises possíveis. Escolhidos volumes independentes em barras de escala comum e proporções de atraso com base explícita. Sem somatório entre atividades, metas inventadas ou gráficos de tendência sem série temporal.
- Todos os números originais ficam em detalhamento nativo acessível. Vencidos atuais e pendências das ocorrências abertas no período continuam visíveis. O detalhamento aberto é preservado ao atualizar ou trocar período.
- Somente apresentação: mesmos dados, consultas, escopo e permissões. Não relacionar decisões no período a todas as ocorrências desse mesmo período como taxa de resolução. Relatório de alternativas e limites em `ia-tarefas/indicadores-visuais.md`.
