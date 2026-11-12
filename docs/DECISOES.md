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

## D-018 — Anulação integral de movimentação (08/11/2026)

- **Decisão:** proprietário pode anular integralmente um consumo ou descarte mediante motivo, criando uma única compensação vinculada ao original, sem alterar ou remover eventos. A quantidade é derivada do movimento original no banco; saídas e anulações bloqueiam o mesmo recebimento, e o reenvio é idempotente e reautorizado.
- **Motivo:** corrigir registro incorreto sem perder autoria, histórico ou consistência do saldo registrado.
- **Consequência:** anulação não recupera alimento fisicamente; para substituir quantidade ou tipo é necessário registrar uma nova saída. Não há estorno parcial nem estorno de estorno. A recuperação após fechamento da aba permanece pendente e a rota do QR ainda não exibe saldo.
- **Revisar quando:** a operação de piloto exigir recuperação durável, substituição atômica ou outras formas de correção. A numeração D-017 está reservada à revisão de unidades na ramificação paralela.

## D-019 — Escrita somente pelo proprietário no piloto (12/11/2026)

- **Status:** decidida por luis em 12/11/2026.
- **Decisão:** no piloto, só o proprietário registra recebimentos, etiquetas, saídas, anulações e cadastros. Cozinheiro e auxiliar (membros) consultam.
- **Motivo:** manter o controle de permissão simples enquanto a operação real da cozinha não foi observada. Proposta alternativa (membro registra consumo, descarte e etiqueta) registrada na [revisão 05](REVISAO_05_SEGURANCA_PRODUTO.md).
- **Consequência:** o autor registrado é sempre o proprietário, mesmo quando outra pessoa manipulou o alimento; a interface deve dizer "registrado por". Pode virar gargalo no turno.
- **Revisar quando:** após a observação da cozinha no piloto. Funções novas mantêm o requisito de papel em um único parâmetro e a matriz de papéis testada, para a troca ser pequena.

> As decisões D-020 a D-026 abaixo são **propostas** do [desenho da Fase 6](FASE_06_DESENHO.md), escritas por Claude Code em 12/11/2026. Nenhuma está aceita nem implementada; aguardam aceite de luis.

## D-020 — Saldo pertence ao recipiente (proposta)

- **Status:** proposta, aguardando aceite.
- **Decisão:** cada recipiente tem quantidade inicial e saldo próprios; movimentos passam a referenciar o recipiente. O recipiente integral é criado na mesma transação do recebimento, e os existentes são preenchidos por migração.
- **Motivo:** permitir abertura e porcionamento sem perder a rastreabilidade do recebimento, com uma única fórmula de saldo.
- **Consequência:** substitui o modelo "um recipiente por recebimento" de D-014 e D-016. Migração de `containers` e `stock_movements` com dados existentes; rollback só enquanto não houver derivados.
- **Revisar quando:** surgir mistura de lotes ou produção (fora do escopo).

## D-021 — Manipulação: abertura e porcionamento (proposta)

- **Status:** proposta, aguardando aceite e validação dos campos com o responsável técnico.
- **Decisão:** o proprietário abre (1 derivado com todo o saldo) ou porciona (2 a 20 derivados) um recipiente. A validade nova é sempre informada pelo responsável, sem sugestão; data posterior à validade da origem exige confirmação explícita e fica marcada; data anterior a hoje é recusada. Armazenamento obrigatório. Uma operação auditada e idempotente transfere o saldo da origem para os derivados.
- **Motivo:** é o momento em que a etiqueta é usada na cozinha (revisão 05, produto item 2), mantendo D-004.
- **Consequência:** abertura gera ID e etiqueta novos; a etiqueta antiga continua existindo fisicamente e o QR dela passa a apontar para os derivados. Perda no porcionamento é registrada como descarte separado. Manipulação errada só pode ser anulada enquanto nenhum derivado teve movimento.
- **Revisar quando:** o responsável técnico responder às questões Q1–Q3 do desenho, ou o piloto pedir validades diferentes por porção.

## D-022 — Painel por recipiente com saldo calculado no servidor (proposta)

- **Status:** proposta, aguardando aceite.
- **Decisão:** função `SECURITY INVOKER` paginada devolve recipientes com saldo e validade efetiva; o painel mostra só recipientes com saldo maior que zero, com esgotados sob filtro.
- **Motivo:** alertas de itens que não existem mais ensinam a equipe a ignorar o painel (revisão 05, P9 e produto item 3).
- **Consequência:** remove os tetos de 10.000 recebimentos (D-015) e 1.000 eventos no navegador (D-016). Critério de desempenho de 50 ms para 200 linhas com 200 mil eventos; plano B é saldo mantido pela função de escrita.
- **Revisar quando:** o critério de desempenho não for atingido.

## D-023 — Histórico append-only para todos os papéis e RLS por conjunto (proposta)

- **Status:** proposta, aguardando aceite.
- **Decisão:** triggers recusam UPDATE e DELETE em recebimentos, recipientes, manipulações e movimentos para qualquer papel, inclusive `service_role`; testes de integração limpam por reset. Políticas passam a `organization_id in (select private.member_organizations())`. Fuso da unidade fica imutável depois do primeiro recebimento e mudanças de nome são auditadas.
- **Motivo:** propostas P3, P5 e P6 da revisão 05; precisam vir antes das tabelas novas.
- **Consequência:** muda a forma de rodar a integração; nenhuma mudança de comportamento para o usuário.
- **Revisar quando:** houver necessidade legal de apagar dado (tratada pelo procedimento de P8, sem apagar eventos).

## D-024 — Nome de exibição curto por vínculo (proposta)

- **Status:** proposta, aguardando aceite.
- **Decisão:** `memberships.display_name` com até 40 caracteres, definido pelo provisionamento, impresso como responsável na etiqueta derivada.
- **Motivo:** a etiqueta de manipulação precisa dizer quem registrou; hoje o sistema não guarda nome (D-011).
- **Consequência:** novo dado pessoal; entra no procedimento de anonimização (P8).
- **Revisar quando:** houver convite de membros ou perfil editável.

## D-025 — Sessão no dispositivo da cozinha (proposta)

- **Status:** proposta, a detalhar na trilha pré-piloto.
- **Decisão:** sessão persistente no aparelho fixo da cozinha com expiração curta por inatividade e saída visível; login individual rápido para registrar autoria.
- **Motivo:** `persistSession: false` desloga a cada recarga e torna o QR impraticável no tablet (revisão 05, produto item 5).
- **Consequência:** aumenta o risco de uso por outra pessoa no mesmo aparelho; exige tempo de inatividade definido com luis.
- **Revisar quando:** após o ensaio na cozinha.

## D-026 — Recuperação de tentativa após fechar a aba (proposta)

- **Status:** proposta, aguardando aceite.
- **Decisão:** intenções pendentes ficam no `localStorage` por usuário, unidade e operação, por até 24 horas; uma função consulta pelo `intent_id` se a operação já existe. A interface nunca reenvia sem o usuário ver.
- **Motivo:** pendência registrada em D-013, D-016 e D-018.
- **Consequência:** não cobre troca de aparelho; dados da tentativa ficam no navegador até confirmação.
- **Revisar quando:** houver uso em mais de um aparelho por pessoa.
