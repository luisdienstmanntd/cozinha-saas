# Brief do Produto — escopo aprovado na Fase 0

Síntese aprovada em 04/11/2026: `docs/DEBATE_AGENTS.md`. Aprovação autoriza somente a fase explicitamente solicitada; preço, datas, papéis e viabilidade física continuam sujeitos às validações registradas no debate.

## Problema
Cozinhas registram alimentos, preparações, datas, lotes e movimentos por planilhas/etiquetas manuais ou controles dispersos. Isso dificulta identificar rapidamente o que vence, de onde veio um recipiente, e qual movimentação ocorreu.

## Promessa do MVP (não sanitária)
Dar identidade rastreável a cada lote/recipiente, permitir registro responsável de validade, emitir etiqueta legível e exibir itens a vencer/vencidos com histórico de consumo/descarte.

## Público e modelo
- Piloto inicial proposto, a validar: uma unidade de restaurante independente acessível ao fundador, gestor presente e responsável técnico acessível. Hotel boutique fica como alternativa posterior.
- Comprador: dono/gestor de A&B; usuário: auxiliar, cozinheiro, chef, estoquista; potencial validador: nutricionista/responsável técnico.
- SaaS híbrido: assinatura recorrente + preparação e treinamento mínimos obrigatórios para operar; cobrança a decidir e serviços adicionais opcionais. Sem preço fechado antes das entrevistas.
- Restrição: quase nenhum dinheiro novo disponível. Reaproveitar VS Code, Codex e GitHub já existentes. Não comprar impressora até teste de demanda.

## Escopo da versão 0.1
- Login, organização/unidade, equipe com permissões mínimas.
- Produtos e fornecedores mínimos; lote de origem, datas e origem do prazo de validade.
- Recipiente/etiqueta com ID imutável, QR que resolve para registro sob autenticação.
- Impressão inicial PDF em um tamanho escolhido após ensaio físico, sem editor livre.
- Busca por produto/lote/recipiente; painel de hoje/amanhã/vencidos por timezone da unidade.
- Registro de consumo/descarte/baixa, histórico e auditoria com autor e data.
- Teste demonstrando isolamento entre duas organizações.
- Entrada simples, consumo e descarte com unidade de medida única por produto/recipiente, sem conversões automáticas. Origem/fornecedor mínimos preservados, sem módulo comercial amplo.

## Ampliação aprovada na Fase 6 (manipulação de recipientes)
Aprovada por luis em 12/11/2026 (desenho em `FASE_06_DESENHO.md`, PR #3), implementada por fatias com aceite individual. A partir da fatia 6.3 o banco registra **abertura e porcionamento** de um recipiente: a operação retira saldo da origem e cria recipientes derivados do mesmo lote, com ID e código curto próprios, validade após abertura informada pela pessoa (nunca posterior à da origem, nem com congelamento), hora real da manipulação, quem manipulou e quem registrou. Nada é criado do nada: a soma dos derivados sai da origem. Ainda sem tela (6.6) nem etiqueta de produto aberto (6.7). Alimento preparado, mistura de lotes, ficha técnica e prorrogação por congelamento continuam fora. Nada disso afirma conformidade sanitária; a conferência normativa por profissional habilitado é pendência pré-piloto.

## Explicitamente fora da v0.1
Controle de produção automático por ficha técnica, transformações e transferências além da abertura e do porcionamento da Fase 6, CMV, financeiro/nota fiscal, pagamento automático, IA, OCR, offline com sincronização, gestão de compras, app nativo, integração com impressora térmica, múltiplos idiomas, plano completo de inventário, integrações de PDV/ERP. Não implementar antecipadamente estruturas para essas áreas.

## Restrições operacionais
- Prazo de validade não deve ser gerado automaticamente sem parâmetros aprovados. A decisão de descarte/consumo é de operador autorizado.
- PDF serve para demonstração e piloto limitado somente quando legibilidade/aderência/corrente de trabalho for validada. Não prometer impressão direta por Bluetooth a partir do browser.
- Não anunciar "conformidade garantida" ou "perda zero". Normas devem ser verificadas por responsável técnico.
- Qualquer cliente pagante requer revisão de confiabilidade do serviço, política de backups/recuperação, privacidade, termos e suporte.

## Critério de êxito
Gestor do estabelecimento B não consegue ler/alterar qualquer recurso do A; impressão/reimpressão preserva lote; o operador consegue rastrear um item e registrar seu status em poucos passos; testes automatizados e logs comprovam comportamento.
