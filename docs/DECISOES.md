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
