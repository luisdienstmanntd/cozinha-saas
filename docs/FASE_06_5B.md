# Fase 6, fatia 6.5b — recebimento, decisão e bloqueio na interface

Implementada por Claude Code em 13/11/2026, conforme as seções 7.2, 7.3, 7.6, 8 (testes 16, 29 e 33) e 10 (6.5b) de `FASE_06_DESENHO.md`, o ponto 2 do aceite da 6.5a (retirar a assinatura antiga de `receive_batch`) e os achados I-15 e S-10 de `REVISAO_CRUZADA_FASE_06.md`. luis aprovou em 13/11/2026 ("faça todos merges faltantes e prossiga. aprovo"). Registro da tarefa: `ia-tarefas/fase-06-5b-recebimento-ui.md`.

**Base:** `main` depois da integração dos PRs #1 a #12 (`7eb1fb9`). Permissão sem mudança: só o proprietário escreve e decide (D-019); o membro consulta e vê os bloqueios. Q1–Q10 preservadas. Nenhum deploy. O sistema **registra** a temperatura e **não a classifica**; nenhum texto afirma conformidade sanitária (a conferência por nutricionista RT, Q10, segue pendente antes do piloto).

## O que mudou

### Banco (`20261113100000_receiving_occurrence_ui.sql`, rollback `receiving_occurrence_ui.sql`)

1. **Assinatura antiga de `receive_batch` retirada** (`public` e `private`, 10 parâmetros). O núcleo perdeu o ramo legado; as regras, mensagens e códigos da assinatura nova não mudam. Não há mais caminho de recebimento sem conservação e situação da medição. O reenvio de um recebimento anterior à 6.5a (conservação nula) pela assinatura nova é recusado como "identificador já utilizado com outros dados", como qualquer reenvio com dados diferentes.
2. **`public.list_occurrences(org, unidade, 'open' | 'all', limite ≤ 200)`**, `SECURITY INVOKER` (a RLS filtra), sem execução para `anon`. Devolve cada ocorrência com produto, lote, motivo, data, fuso, situação (`pending`, `released`, `rejected`), justificativa e data da decisão, e os recipientes **com saldo** que ela bloqueia. `'open'` = sem decisão, ou rejeitada que ainda bloqueia saldo (aguardando descarte); sem decisão primeiro. As ligações são as mesmas de `container_blocks` (recebimento → todos os recipientes; manipulação tardia → só os derivados dela) e o pgTAP confere que a lista e o banco bloqueiam exatamente os mesmos recipientes depois de cada passo.
3. Nenhuma tabela ou coluna nova, nenhum dado reescrito, nenhum gatilho de proteção suspenso. Verificação final: histórico protegido, nenhuma assinatura de 10 parâmetros, `occurrence_problems()` vazio.

### Tela

1. **Catálogo:** o cadastro de produto pede a **conservação** (ambiente, refrigerado, congelado), com o aviso de que é definida uma vez e não pode ser trocada. O produto sem conservação (antigo, ou cuja definição falhou) aparece como "conservação não definida", e o proprietário define ali, uma vez (`set_product_storage_condition`, auditada).
2. **Recebimento (7.6):** mostra a conservação do produto. Refrigerado ou congelado: "Temperatura medida" (°C, −50 a 80, uma casa decimal) ou "Não foi possível medir" com justificativa (até 300 caracteres) e o aviso "O recebimento ficará bloqueado para uso até a decisão do responsável." Ambiente: temperatura opcional. Produto sem conservação não pode ser recebido ("Defina a conservação deste produto no catálogo antes de receber.").
3. **Bloqueios no topo do painel (7.3):** seção "Bloqueios e ocorrências" com "BLOQUEADO - aguardando decisão" ou "REJEITADO - somente descarte", tipo, produto, lote, motivo, data no fuso da unidade e tempo desde a ocorrência, e os recipientes com saldo. A linha do recipiente bloqueado leva o mesmo texto. "Mostrar todas as ocorrências, inclusive decididas" lista também as liberadas, como "Liberado pelo proprietário" com data e justificativa — nunca "aprovado" (S-10).
4. **Decisão (7.6):** só para o proprietário, "Registrar decisão": liberar ou rejeitar, justificativa obrigatória (até 500) e o texto "Decida seguindo o procedimento sanitário da cozinha. A decisão fica registrada com a justificativa e não pode ser trocada." (I-15). A tela não sugere nenhuma das opções. Repetir após falha de rede reaproveita o mesmo identificador; decisão já registrada é recusada com orientação para atualizar. O membro vê o bloqueio e "Somente o proprietário registra a decisão."
5. **Movimentações:** recipiente bloqueado mostra o aviso; o banco continua sendo a barreira, e a recusa de consumo aparece com a mensagem dele ("Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido."). O descarte continua permitido (D-029). Rejeitada sai da lista de bloqueios quando o saldo é descartado.
6. **Etiqueta (7.2):** recipiente bloqueado (integral ou derivado) gera PDF com a faixa preta "BLOQUEADO / aguardando decisão" ou "REJEITADO / somente descarte"; depois de liberado, a reimpressão sai sem a faixa. Derivado de manipulação tardia sem liberação continua sem etiqueta (6.5a).

## Testes

- **pgTAP:** `receiving_ui.test.sql` (novo, 45): catálogo e privilégios de `list_occurrences`, ausência das assinaturas antigas, núcleo único, validação de parâmetros, escopo (outra unidade, unidade de outra empresa, proprietário de B), membro lê mas não decide, liberação e rejeição, rejeitada até o descarte, manipulação tardia listando só as porções, e **lista = `container_blocks`** em cada passo. Testes existentes passaram a chamar a assinatura nova (`batches`, `security_guard`, `occurrences`); os que testavam o comportamento da assinatura antiga foram convertidos para conferir que ela não existe mais e que o caminho sem temperatura não serve para refrigerado (nenhum removido; total 923 → 968).
- **Integração:** chamadas de recebimento passaram à assinatura nova; `occurrences.test.mjs` confere a ausência da antiga (`PGRST202`); `receiving-ui.test.mjs` (novo) com usuários reais: proprietário e membro veem o mesmo bloqueio, outra empresa e anônimo não veem, membro não decide, liberada sai da lista aberta. 25/25.
- **Vitest (174):** tela de recebimento, bloqueios, decisão (inclusive repetição com o mesmo identificador), membro sem decisão, falha de leitura sem painel parcial, catálogo com conservação, gateways, faixa no PDF e na tela, recusa de consumo com a mensagem do banco. **Teste 16** (`src/compliance/forbiddenTexts.test.ts`): lista única de expressões proibidas aplicada aos textos da interface, ao texto desenhado nos PDFs e às mensagens `raise exception` de todas as migrações.
- **E2E (7/7):** `occurrences.spec.mjs` cobre os E2E 29 e 33: recebimento sem medição, etiqueta com faixa, consumo recusado na tela, membro sem a ação, liberação com justificativa, reimpressão sem faixa, consumo depois da liberação (repetindo a tentativa recusada, sem duplicar) e ocorrências decididas. `catalog.spec.mjs` passou a escolher a conservação.
- lint, typecheck, format, build ok; advisors do banco limpos; rollback aplicado e migração reaplicada com funções e privilégios idênticos.
- Capturas: `/mnt/project-files/capturas-fase-06-5b/` (1 a 7, na ordem do E2E).

## Limites conhecidos

- **Nome de quem decidiu:** a tela diz "Liberado pelo proprietário" sem o nome. A decisão não guarda cópia do nome, e o membro não lê os vínculos de outros (RLS). Com um só proprietário no piloto, o texto é exato; para mostrar o nome, a decisão precisaria copiar `display_name` como a manipulação faz (ver ponto 2 abaixo).
- **Aviso de bloqueio no formulário, não numa etapa de revisão separada:** o recebimento ainda não tem tela de revisão; o aviso aparece ao marcar "Não foi possível medir" e na confirmação.
- **Recuperação de decisão após fechar a aba** fica com a 6.8, como as demais tentativas.
- **Até 200 ocorrências** por consulta; a tela avisa quando chega ao limite.
- O texto da faixa no PDF usa hífen (o modelo de PDF não tem travessão).

## Pontos para luis decidir

1. **Conservação no catálogo, não no recebimento:** produto sem conservação não é recebido até o proprietário defini-la no catálogo (uma vez, auditada). Alternativa: definir no próprio recebimento, o que fixaria a conservação do produto a partir de um recebimento.
2. **Nome na decisão:** manter "pelo proprietário" ou, numa fatia futura (sugestão: junto da 6.7, etiquetas), copiar o nome de quem decidiu, como na manipulação.
3. **Rejeitada fica no topo até o descarte do saldo** e depois só aparece em "todas as ocorrências".
4. **Textos da faixa:** "BLOQUEADO - aguardando decisão" e "REJEITADO - somente descarte", iguais no painel, no recipiente e no PDF.

## Decisão proposta para `DECISOES.md`

Transcrita em `DECISOES.md` como **D-042** com o aceite:

- **Decisão:** todo recebimento informa conservação e situação da medição (assinatura antiga retirada); a conservação do produto é definida no catálogo antes do primeiro recebimento; a tela lê bloqueios do servidor (`list_occurrences`, mesmas ligações de `container_blocks`), mostra-os no topo do painel, na linha, nas movimentações e na etiqueta (faixa), e a decisão é registrada só pelo proprietário com justificativa, sem sugestão de resposta.
- **Motivo:** desenho 7.2, 7.3 e 7.6; ponto 2 do aceite da 6.5a; I-15 e S-10 da revisão cruzada; D-019, D-029, D-041.
- **Consequência:** produto antigo sem conservação precisa ser definido antes de receber; integração e testes chamam só a assinatura nova; nova lista de expressões proibidas vale para toda tela, PDF e mensagem do banco futura.
- **Revisar quando:** houver mais de um proprietário (nome na decisão), a 6.8 (recuperação de tentativa) ou a conferência normativa (Q10) pedir outro texto.

## Próximo passo

**Aceita por luis em 13/11/2026 23:04 UTC**, respondendo "sim" aos quatro pontos ("1 sim, 2 sim, 3 sim, 4 sim"): conservação definida no catálogo antes do recebimento; "pelo proprietário" na decisão por enquanto, com a cópia do nome de quem decidiu considerada numa fatia futura (sugestão: 6.7); rejeitada no topo até o descarte; textos das faixas mantidos. Interpretado como aceite da fatia e da D-042 (transcrita em `DECISOES.md`). O aceite não autoriza merge: integrar só com pedido de luis. A 6.6 (telas de abrir, porcionar e anular) exige aprovação própria.
