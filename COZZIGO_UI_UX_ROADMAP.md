# CozziGo — roadmap de UI e UX

**18/11/2026 · Direção visual oficial e proposta de telas para aceite.** Este documento substitui a direção anterior de identidade visual e paleta. A aplicação existente na base `2455034` serve de referência de comportamento.

## Marca oficial

A arte fornecida define a tipografia, a proporção, o C original (corpo grafite e curva laranja), o grafite de “Cozzi” e o laranja de “Go”. A matriz de entrega é:

| Arquivo previsto | Tratamento e uso |
| --- | --- |
| `cozzigo.webp` | Arte oficial transparente e sem subtítulo. Usada no login e na demonstração, e sobre base branca no menu grafite. |
| `cozzigo-mark.webp` | Recorte do C fornecido em `c.png`, com fundo transparente e margem uniforme. Cabeçalho compacto. |
| `favicon.png` e `favicon.ico` | Mesmo C, usado no favicon PNG de 32 px e no ICO com 16, 32 e 48 px. |

Os arquivos `logo.png` e `c.png` vieram no ZIP oficial. A remoção do fundo preservou o preenchimento das letras e suavizou as bordas da transparência. A logomarca fornecida já estava sem subtítulo. A placa clara do menu mantém as cores do ativo em superfícies escuras.

## Design tokens propostos

Usar camadas de referência e de intenção. Componentes consomem tokens semânticos. A cor de referência continua disponível para expressar a marca nos poucos pontos que precisam dela.

| Função | Valor | Uso |
| --- | --- | --- |
| `brand.orange` | `#FF5900` | Seleção no menu e destaques de marca, com texto `#1A1F24` (5,28:1). |
| `action.primary` / `action.onPrimary` | `#C2410C` / `#FFFFFF` | Ação principal, contraste de 5,18:1. Hover proposto em `#9A3412`. |
| `action.subtle` | `#FFF0E6` | Fundo de ação selecionada ou interação discreta. |
| `surface.nav` | `#272F35` | Menu lateral, com texto branco. |
| `text.primary` / `text.strongSecondary` | `#272F35` / `#374151` | Texto principal e hierarquia neutra. |
| `surface.canvas` / `surface.panel` | `#F6F7F9` / `#FFFFFF` | Área de trabalho, cabeçalho, cartões e formulários. |
| `border.subtle` / `border.control` | `#E2E8F0` / `#758398` | Divisórias decorativas e contornos funcionais, respectivamente. O contorno do controle supera 3:1 nas superfícies previstas. |
| `text.muted` | `#58677A` | 5,78:1 no branco, 5,39:1 no cinza e 5,19:1 no laranja suave. `#64748B` fica reservado ao branco quando usado como texto normal. |
| `focus.light` / `focus.dark` | `#C2410C` / `#FFFFFF` | Foco visível com afastamento ou anel duplo quando vizinho da mesma cor. |
| `status.success` | `#15803D` | Confirmação. Fundo suave proposto em `#F0FDF4`. |
| `status.warning` | `#D97706` / texto `#92400E` | Atenção. Texto escuro em fundo `#FFFBEB`. |
| `status.error` | `#DC2626` / texto `#B91C1C` | Erro, vencimento ou ação destrutiva. Texto escuro em fundo `#FEF2F2`. |
| `status.info` | `#2563EB` / texto `#1E40AF` | Informação. Fundo `#EFF6FF`. |

O branco e o grafite de marca sobre o laranja principal ficam em 3,14:1 e 4,33:1, respectivamente, abaixo dos 4,5:1 para texto normal. Verificar cada par aplicado, inclusive placeholder, links, hover, pressed, indicadores e foco. WCAG 2.2 AA pede 4,5:1 em texto normal, 3:1 em texto grande e 3:1 para informação visual funcional em controles e estados, nas condições aplicáveis.

### Tipografia e componentes

- **Tipografia:** Inter com fallback `system-ui, sans-serif`, escala inicial 12/14/16/20/24 px, corpo e campos editáveis de 16 px em telas de toque. Números tabulares em indicadores e quantidades. Servir WOFF2 local com a licença junto do projeto e respeitar a CSP hospedada.
- **Espaço e contorno:** escala 4/8/12/16/24/32 px, raios iniciais 6/8/12 px e elevação sutil reservada a sobreposições. Larguras, alturas e foco devem responder ao zoom e à fonte do usuário.
- **Ícones:** família linear com tamanhos 16/20/24, alinhada à linha de base. Ícones decorativos ficam ocultos para leitores de tela. Controles de ícone recebem nomes acessíveis.
- **Botões:** primário laranja escuro, secundário neutro contornado, terciário discreto e destrutivo semântico. Prever hover, foco, pressionado, processamento, indisponível e confirmação clara. O nome acessível explica a ação.
- **Campos:** rótulo persistente, ajuda e erro associado ao campo, grupos com `fieldset` e `legend`, preenchimento e navegação nativa. Alvo interno de 44 px no celular, inclusive rótulos de rádio/checkbox.
- **Tabelas e cartões:** cabeçalhos semânticos, quantidades alinhadas e valores de atenção rotulados. Em telas estreitas, lista de cartões quando preservar melhor a relação entre campos. Estado vazio, carregando, falha e indisponível por perfil têm tratamento próprio.
- **Modais e menus:** diálogos com rótulo, foco inicial previsível, Escape onde aplicável, foco devolvido ao acionador e fundo inerte. Links de área mantêm endereço próprio e `aria-current`. Submenus no celular deixam conteúdo e foco desobstruídos.
- **Indicadores e notificações:** cor acompanhada de texto e, quando útil, ícone. Erros usam anúncio imediato conforme o contexto, atualizações rotineiras usam anúncio educado. Mensagens persistem tempo suficiente para leitura e ação.

## Comparação das seis telas

| Tela | Anterior | Proposta e avaliação |
| --- | --- | --- |
| Login | Acesso em formulário com acentos verdes. Captura histórica da Fase 7. | Marca oficial no topo, fundo claro, rótulos de e-mail e senha e uma ação principal. A consistência começa antes do login. Validar autocomplete, colagem, gerenciador de senhas, erro associado e redirecionamento à rota de origem. |
| Visão geral | A seleção de unidade é o ponto inicial autenticado. A unidade abre em Validade. | Visão operacional dentro da unidade com contagens de validade, ocorrências abertas e atalhos autorizados. É uma tela nova. Usar somente dados reais disponíveis, cobrir carregamento/erro/vazio e manter Validade como entrada padrão até aceite da nova navegação. |
| Validades | Indicadores e cartões em tema verde. Busca e lista paginada. | Contagens de leitura rápida e estados textuais nos cartões. Separar urgência operacional de destaque de marca. Preservar consulta do servidor, paginação, fuso e bloqueios. Os totais não são controles de filtro. |
| Recebimentos | Formulário responsivo em duas ou uma coluna. | Grupos de produto e conservação, dados do lote e validade, no mesmo fluxo. Uma ação principal. Manter evidência de temperatura, motivo de ausência de medição, origem da validade e rascunho ao alternar área. |
| Produção | Registro no topo, filtro Hoje e cartões recentes. | Cabeçalho branco, registro em laranja, cartões com precedência de produto e quantidade, data e autoria em segunda linha. Ações destrutivas com menor ênfase e confirmação. Preservar escopo dos 50 recentes, Hoje pelo fuso, etiquetas e foco no formulário. |
| Navegação mobile | Barra inferior com ícones e destinos de acordo com perfil. | Marca compacta no topo e barra grafite com seleção laranja. Com Visão geral, considerar Mais para Locais e Cadastros/Configurações. Validar alvos, submenus, área segura inferior, textos longos e a variante de colaborador, com entrada somente em áreas permitidas. |

O refinamento dá unidade visual a cabeçalho, menu e painéis, e separa as ações das situações de risco. A leitura das contagens e da informação do lote melhora pela hierarquia de tamanho e posição. A eficiência deverá ser confirmada observando as tarefas de encontrar um vencimento, registrar um recebimento e abrir uma produção em desktop e celular.

## O que as 19 referências informam

- **1, 8–12 e 19:** prévia e etiqueta física, QR e confirmação. Prioridade funcional para que o usuário encontre o PDF e a ficha existentes com contexto de origem. Hardware e impressão térmica ficam fora deste incremento.
- **2 e 3:** produção do dia e indicadores operacionais. Aproveitar leitura rápida e próximos passos. Evitar importar métricas de outro produto ou apresentar totais a partir de resultados parciais.
- **4–7:** seleção de tarefas e entradas de recebimento. Agrupar campos pelo momento de uso, preservando o fluxo de confirmação e a auditoria.
- **13–16 e 18:** uso em bancada, telefone, tablet e desktop. Priorizar estados explícitos, toque e consistência entre tamanhos. As imagens de hardware não definem a identidade CozziGo.
- **17:** material comercial de planos, fora da interface operacional.

## Sequência e critérios de aceite

1. **Proposta e aceite visual.** Comparativo de seis telas com dados fictícios e capturas anteriores. Revisão cruzada de UX/UI, arquitetura frontend e qualidade. Confirmar a posição da marca, a Visão geral e o conteúdo de Mais antes de consolidar.
2. **Marca e fundações.** Preparar os arquivos derivados da arte oficial. Centralizar tokens e componentes pequenos em CSS compartilhado e `shared/ui`, começar pelo login e pelo shell. Usar recursos locais sob a CSP existente, com favicon e `theme-color` coerentes. Aplicar sem alterar sessão ou autenticação.
3. **Áreas operacionais.** Migrar Validades, Recebimentos e Produção em incrementos testáveis. Usar as mesmas regras de rotas, permissões e dados nas variantes desktop e mobile. Se a Visão geral for autorizada, usar as áreas disponíveis conforme papel e respeitar os links já existentes.
4. **Validação de implementação.** Rodar lint, tipos, testes, build e E2E autenticado em ambiente descartável. Medir contraste da cascata real. Conferir teclado, leitor de tela, foco não obstruído, áreas de toque, reflow em 320 px, zoom a 200%, desktop, dois perfis e preservação de rascunho e rotas. Testar estados vazio, erro, carregando, contato com validade vencida e ausência de temperatura. Confirmar CSP, tema e legibilidade do favicon nas duas superfícies.

Autorização, RLS, escopo por organização, auditoria, operações idempotentes, sessão e acesso a PDF/QR continuam regidos pelas decisões existentes. A interface não introduz novos poderes nem novas regras de validade. Deploy, migrações e merge na `main` requerem autorização.

## Fundações implementadas

O login, o menu lateral, a navegação inferior e o cabeçalho usam a primeira versão dos tokens. A Inter variável é servida pela própria aplicação. Formulários, botões, cartões e estados de validade herdam a paleta compartilhada. A arte oficial é usada no login, na demonstração e no menu. O C aparece no cabeçalho compacto e na aba do navegador. A reorganização funcional de cada área continua nas etapas previstas acima.

## Submenu de Cadastros

O proprietário pode expandir Cadastros e ir diretamente para Produtos, Fornecedores, Preparações próprias, Configurações da unidade ou Organização. O submenu aparece abaixo da área no desktop e acima da barra inferior no celular. Cada destino tem uma âncora e mantém os formulários montados para preservar o que foi digitado. Colaboradores continuam com Configurações em modo de leitura.

## Mesa operacional

A direção aprovada usa indicadores e tabela no desktop e coloca os alertas antes dos indicadores no celular. A navegação passa a agrupar Principal, Operação e Administração. Os cadastros usam páginas independentes, consulta com busca e filtros quando aplicáveis, e criação em painel lateral. Links antigos de Cadastros, Validades e QR continuam resolvíveis.

A Visão geral consulta o resumo completo de validade e mostra um recorte de até seis recipientes com saldo. Etiquetas consulta a listagem paginada de recipientes e leva à ficha existente para download autorizado. Cadastros pagina os registros retornados pelo gateway, cujo limite continua explícito na interface. Rascunhos ficam em memória por usuário e unidade enquanto a sessão e os acessos permanecem válidos.

## Revisão de compras e cozinha — 21/11/2026

- Operação permanece visível; Cadastros e Configurações iniciam recolhidos e abrem ao entrar em uma página do grupo. No celular, o menu limita a altura e fecha ao escolher um destino.
- Recebimento segue identificação da entrega → validade → temperatura, sem adicionar etapas de confirmação. Pré-requisitos ausentes exibem ações diretas para Produtos e Fornecedores, evitando campos sem opções.
- Produção usa duas colunas no desktop e uma no celular. Sem preparações, o proprietário recebe acesso ao cadastro; colaboradores recebem orientação ao proprietário.
- A página de locais passa a se chamar Locais de armazenamento, refletindo a função disponível. Consulta de recipientes e saldos continua em Validades.
- Alertas, justificativas, responsável, revisão final, permissões e regras de validade permanecem. Não inclui pedidos de compra ou um novo perfil de comprador.
