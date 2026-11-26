# Auditoria: o que o sistema tem e o que o site oferece (26/11/2026)

> **Estado:** auditoria somente leitura, sobre a `main` em `1baa836` (30 migrações). Nada foi implementado, nenhuma migração criada, nada alterado no Supabase hospedado e nenhuma decisão registrada: o próximo número livre segue **D-076**. Cada fatia da seção 5 exige aprovação própria de luis. Nada aqui afirma conformidade sanitária (Q10 segue pendente).

## 1. Método e limites

- Leitura das 30 migrações (funções, tabelas, concessões e políticas), dos gateways em `src/features/*/data`, das telas em `src/features/*/components`, de `src/app/App.tsx`, `workspaceAreas.ts` e `IdentityHome.tsx`, e dos documentos de decisão e de fatia.
- Cruzamento por busca de cada função pública do banco e de cada tabela com `select` liberado contra o código da interface.
- **Não foi aberto o site hospedado nem rodado o aplicativo**: a coluna "tela" vem do código. Falta confirmar visualmente os itens marcados "parcial" se luis quiser.
- Papéis reais no banco: só **`owner`** (Proprietário) e **`member`** (Colaborador). **Não existe "gestor"**. O anônimo não acessa nada: a rota do QR (`/recipiente/:id`) exige login (D-025/D-059); a demonstração pública só existe com variável própria.

## 2. Resumo em números

- **27 funções públicas** chamáveis pelo navegador. **26 têm tela**. Só **`pilot_metrics`** (métricas do piloto) não tem nenhuma.
- Tabela legível pelo proprietário sem tela: **`entity_changes`** (histórico de alterações de cadastros, nomes, conservação, configurações). `memberships` só aparece de forma indireta.
- Fluxos que **nem o banco tem**: convidar, listar, alterar papel ou revogar membro; trocar ou recuperar senha; MFA; editar ou arquivar produto e fornecedor; anular ou corrigir um recebimento; exportar dados; renomear local; desativar unidade.
- Funções que existem **só fora da interface, por desenho**: `bootstrap_owner_organization`, `add_member_to_organization` (SQL Editor, D-067), `reset_test_environment` (script), `validate-isolation` e `verify-hosted` (scripts).

## 3. Matriz funcionalidade x banco/API x tela

Legenda: **P** = Proprietário, **C** = Colaborador. "Tela" indica onde aparece (aba da unidade). ✅ tem, ➖ só leitura, ❌ não tem, ⚠️ parcial ou escondida.

### 3.1 Acesso e conta

| Funcionalidade | Banco / API | Tela | P | C |
|---|---|---|---|---|
| Entrar com e-mail e senha | Supabase Auth | Tela de acesso | ✅ | ✅ |
| Sair; expiração por 30 min parado | `touch_session`, `session_state` | Botão Sair, aviso de sessão | ✅ | ✅ |
| Trocar senha; "esqueci a senha" | Auth tem; **sem código no app** | ❌ | ❌ | ❌ |
| MFA (TOTP) | Ligado no Supabase; **sem código no app** (fatia 8.5, D-006/P4) | ❌ | ❌ | ❌ |
| Criar organização e primeiro proprietário | `private.bootstrap_owner_organization` (só SQL Editor) | ❌ por desenho | ❌ | ❌ |
| Adicionar membro | `private.add_member_to_organization` (só SQL Editor, exige conta já criada no painel) | ❌ | ❌ | ❌ |
| Listar membros da empresa | `memberships` legível pelo P | ⚠️ só nomes nos seletores de Produção/manipulação | ⚠️ | ❌ |
| Revogar membro ou mudar papel | coluna `revoked_at` e `role` existem, **nenhuma função ou política grava neles** | ❌ | ❌ | ❌ |
| Nome de exibição do membro | `set_member_display_name` (só P, para qualquer membro) | ⚠️ aparece só dentro de **Produção** ("sem nome") e na manipulação | ⚠️ | ❌ (não edita o próprio) |
| Renomear organização | `update(name)` em `organizations` | Organização | ✅ | ❌ |
| Criar e renomear unidade | `insert/update` em `establishments` | Organização > Unidades | ✅ | ❌ |
| Mudar o fuso da unidade | concedido no banco, **travado por gatilho** (D-036) | Texto explica que não muda | ❌ por desenho | ❌ |
| Desativar ou arquivar unidade | ❌ | ❌ | ❌ | ❌ |

### 3.2 Cadastros

| Funcionalidade | Banco / API | Tela | P | C |
|---|---|---|---|---|
| Criar produto, fornecedor, preparação própria | `insert` com RLS de proprietário | Produtos, Fornecedores, Preparações próprias | ✅ | ❌ |
| Definir conservação do produto (uma vez) | `set_product_storage_condition` | Produtos | ✅ | ➖ |
| Janela de registro da produção por preparação | `set_preparation_window` | Preparações próprias | ✅ | ➖ |
| **Editar nome/unidade, arquivar ou excluir** produto ou fornecedor | **Sem `update`/`delete` concedido** | ❌ | ❌ | ❌ |

### 3.3 Operação de estoque

| Funcionalidade | Banco / API | Tela | P | C |
|---|---|---|---|---|
| Registrar recebimento com validade, conservação e temperatura | `receive_batch` | Recebimentos | ✅ | ❌ |
| **Anular ou corrigir um recebimento** (produto, quantidade ou validade errados) | ❌ (`reverse_movement` só estorna saídas) | ❌ | ❌ | ❌ |
| Lista de validades, filtros por contador, esgotados | `list_containers`, `container_expiry_summary` | Validades, Visão geral | ✅ | ✅ |
| Saída: consumo ou descarte, em qualquer recipiente | `record_container_movement`, `record_movement` | Validades > Movimentações, QR | ✅ | ❌ (D-019) |
| Anular uma saída | `reverse_movement` | Movimentações | ✅ | ❌ |
| Abrir produto, porcionar | `handle_container` | QR e Validades | ✅ | ❌ |
| Anular manipulação | `void_handling` | QR | ✅ | ❌ |
| Mudar de local | `move_container` | QR e Validades | ✅ | ❌ |
| Criar local; desativar/reativar | `create_storage_location`, `set_storage_location_active` | Locais | ✅ | ➖ |
| **Renomear local** | ❌ | ❌ | ❌ | ❌ |
| Bloqueios e ocorrências: ver e decidir | `list_occurrences`, `decide_occurrence`, `container_blocks` | Validades > Bloqueios e ocorrências | ✅ | ➖ |
| Recuperar tentativa com resultado incerto | `find_operation` | Faixa de pendências | ✅ | ✅ |
| Etiqueta PDF e QR (reimprimir sem mexer no estoque) | `ensure_container`, leitura de `containers` | Etiquetas, QR | ✅ | ✅ |
| Ficha do recipiente com origem e derivados | `containers`, `container_handlings` | QR (com login) | ✅ | ✅ |

### 3.4 Produção da cozinha

| Funcionalidade | Banco / API | Tela | P | C |
|---|---|---|---|---|
| Registrar produção, validade pela janela | `register_production` | Produção | ✅ | ✅ só se a unidade permitir (7.6) |
| Anular produção | `void_production` | Produção | ✅ | só a própria, se permitido |
| Temperatura medida; registro de download da etiqueta | `record_production_temperature`, `record_production_label_download` | Produção | ✅ | idem |
| Quem registra, janela, limite sem etiqueta, regra da porção | `set_establishment_settings` | Unidade | ✅ | ➖ |
| **Invalidar uma medição errada** | ❌ (já no `BACKLOG.md`) | ❌ | ❌ | ❌ |
| **Buscar produções antigas** | dados guardados; tela mostra 50 | ❌ (já no `BACKLOG.md`) | ❌ | ❌ |

### 3.5 Leitura, acompanhamento e saída de dados

| Funcionalidade | Banco / API | Tela | P | C |
|---|---|---|---|---|
| **Métricas do piloto** (manipulações, atrasos, ocorrências, decisões, vencidos com saldo) | `pilot_metrics(empresa, unidade, de, até)` | ❌ | ❌ | ❌ |
| **Registro de alterações** (quem mudou conservação, janelas, nomes, configurações) | `entity_changes`, legível pelo P | ❌ | ❌ | ❌ |
| Histórico de saídas | `stock_movements` | Só **por recipiente**, até 1.000 linhas | ✅ | ➖ |
| **Histórico geral da unidade** (todas as saídas, manipulações, anulações por período) | dados existem | ❌ | ❌ | ❌ |
| **Exportar** (CSV, PDF de relatório) | ❌ | ❌ | ❌ | ❌ |
| Avisos fora da tela (e-mail, push) de vencimento | ❌ | ❌ | ❌ | ❌ |

## 4. Lacunas, priorizadas para o restaurante piloto

**Alta: bloqueiam o uso diário ou a segurança do piloto**

1. **Equipe (membros).** Hoje só dá para criar colaborador pelo painel do Supabase e por SQL. Não há tela para listar, nomear, trocar papel ou **revogar** alguém que saiu; a revogação nem existe como função. Em restaurante há rotatividade: um ex-funcionário continua entrando. Lacuna de segurança, não só de conforto.
2. **Corrigir erro de cadastro.** Produto ou fornecedor com nome errado (ou duplicado de grafia) não pode ser editado nem arquivado. Recebimento lançado com produto, quantidade ou validade errados não pode ser anulado, só "descartado", o que suja o histórico e as métricas de descarte.
3. **Conta: senha e MFA.** Sem trocar nem recuperar senha, qualquer esquecimento vira chamado ao painel do Supabase. MFA obrigatório já é pré-requisito comercial registrado (fatia 8.5).
4. **Acompanhamento do piloto sem tela.** `pilot_metrics` existe, é a base declarada para decidir janelas e papéis (R12, R13, R15), e hoje só se lê por SQL. Custo baixo: a função está pronta e testada.

**Média**

5. **Registro de alterações e histórico geral da unidade**, e **exportação** (CSV). O dado existe e é imutável; falta só mostrar e extrair. Útil para o RT (Q10) e para auditoria interna.
6. **Colaborador só consulta.** Por D-019 só o proprietário baixa, recebe, abre e move. Em cozinha real quem consome é o colaborador. A decisão já diz "reavaliar após o piloto"; esta auditoria só registra que é o maior limitador de uso e deve entrar na primeira observação do piloto.
7. **Nome de exibição escondido na Produção**, sem o próprio colaborador poder ajustá-lo.

**Baixa**

8. Renomear local; arquivar unidade; invalidar medição e buscar produções antigas (os dois últimos já no backlog); avisos de vencimento por e-mail ou push.

## 5. Fatias recomendadas (todas para aprovação; nenhuma iniciada)

| Fatia | Conteúdo | Banco | Risco | Observação |
|---|---|---|---|---|
| **A. Painel do piloto** | Tela só leitura com `pilot_metrics` para o proprietário (período, unidade) | **Sem migração** | Baixo | Mais barata e rápida; só interface e testes |
| **B. Equipe** | Listar membros; revogar (nunca o último proprietário); nome de exibição próprio; papel só leitura | 1 migração: função de revogação com auditoria, testes pgTAP e de isolamento | Médio | Criar a conta continua no painel do Supabase; convite pelo app exigiria função de servidor e **chave de serviço fora do navegador**, decisão separada de luis |
| **C. Conta** | Trocar senha logado; "esqueci minha senha" | Sem migração | Médio | Exige no hospedado o e-mail e a URL de retorno do Supabase configurados: alteração no projeto hospedado, só com autorização específica. MFA segue na 8.5 |
| **D. Corrigir cadastro** | Editar nome de produto e fornecedor, arquivar (sem apagar histórico) | 1 migração com função auditada | Médio | Decidir se arquivado some dos seletores e de recebimentos futuros |
| **E. Anular recebimento** | Anular lote **sem saídas**, com motivo, preservando o histórico | 1 migração, a mais delicada (afeta saldo, QR, etiquetas e métricas) | Alto | Pedir desenho antes (padrão da 6.4/7.4) |
| **F. Registro e exportação** | Tela de `entity_changes` e histórico da unidade por período, com CSV | Possível função de leitura paginada | Médio | Limites e retenção dependem de orientação jurídica (PRE_PILOTO §3) |

Ordem sugerida: **A** (agora), **B** e **C** (antes de o restaurante usar com mais de uma pessoa), **D**, depois **E** e **F**. Cada uma pede um número D próprio (a partir de D-076), testes de comportamento e aceite de luis; merge publica o site automaticamente, então só com autorização.

## 6. O que não é lacuna (conferido)

- Todas as demais funções públicas do banco têm tela, inclusive saída em porções, anulações, locais, ocorrências, produção, temperatura, etiqueta e configurações da unidade.
- Os itens "só pelo SQL Editor ou script" (criar empresa, reset, validar isolamento) são **por desenho** da D-067 e não devem ganhar tela sem decisão nova.
- Fuso imutável, ausência de cadastro público e QR só com login são decisões registradas, não omissões.
