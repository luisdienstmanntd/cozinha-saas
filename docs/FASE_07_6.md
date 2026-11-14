# Fase 7, fatia 7.6 — configurações da unidade

> Autorizada por luis em 14/11/2026 (16:53 UTC), junto com o aceite da 7.5: "Autorizo o início da Fase 7.6, conforme o planejamento existente, sem antecipar as fatias 7.7 a 7.9." Segue o [desenho da Fase 7](FASE_07_DESENHO.md), seção 16 (decisões A e B de luis, 14/11/2026), e as D-019, D-036 e D-049 a D-054. Decisão proposta: **D-055** (abaixo), **aguardando aceite de luis**. **Nada aqui afirma conformidade sanitária**; a conferência pela nutricionista RT (Q10) e o teste físico de impressão seguem pendentes (`PRE_PILOTO.md`, seção 5). Dados de teste sintéticos.

## O que mudou

### Banco (migração `20261114070000_establishment_settings.sql`)

- **`establishment_settings`**: uma linha por unidade, criada na primeira gravação. Sem linha valem os padrões, que são as regras de antes da 7.6. O sistema não sugere outros valores.

| Configuração | Padrão | Valores aceitos |
|---|---|---|
| Quem registra produção | Só o proprietário | Só o proprietário; cada colaborador registra a própria produção |
| Janela de registro da produção | 2 horas | 15 minutos a 24 horas, em minutos inteiros |
| Tempo máximo sem etiqueta | 1 hora | 15 minutos a 24 horas (só guardado; o aviso é a 7.8) |
| Validade da porção de preparação própria | Igual à do lote | Igual à do lote; igual ou menor (nunca maior) |

- **Quem muda:** só o proprietário ativo, pela função `set_establishment_settings`. A tabela não aceita escrita direta de ninguém (nem do `service_role`). Todos os vínculos ativos da empresa leem.
- **Auditoria (D-036):** cada valor alterado vai para `entity_changes`, com o anterior (na primeira vez, o padrão), o novo, quem mudou e quando. Repetir os mesmos valores não grava nada.
- **`register_production`:**
  - No modo "colaboradores" (decisão A, opção b), quem não é proprietário registra **só a própria produção**, com a validade. Em nome de outra pessoa a recusa é "Quem não é proprietário registra só a própria produção.". No padrão, o colaborador recebe a mesma recusa da 7.1.
  - A janela da unidade decide se a produção é tardia. As mensagens trazem a duração, por exemplo "mais de 1 hora e 30 minutos"; com o padrão, o texto continua igual ao de antes.
  - A janela usada fica guardada no registro, em `batch_productions.late_window_minutes`. As produções anteriores têm 120 minutos, a janela fixa que valia. Uma regra do banco confere que a marcação de tardia bate com a janela guardada.
  - Mudar a configuração nunca reescreve registro antigo.
- **Continuam só do proprietário (D-019):** decidir ocorrência, anular produção, porcionar, consumo, descarte, local, catálogo e nome de exibição.
- **`handle_container`:** com a regra "igual ou menor", a porção de preparação aceita validade menor que a do lote. Maior continua recusada pela regra da 6.3, e congelar continua sem prorrogar (D-021, D-039). A manipulação de recebimento continua com a janela fixa de 2 horas.

### Tela

- **Nova seção "Configurações da unidade"**, aberta para todos os vínculos.
  - Mostra as quatro configurações em vigor.
  - Só o proprietário vê "Alterar configurações", que segue os passos formulário, revisão com "antes → depois" e confirmação.
  - Escolher o modo "colaboradores" mostra o que continua só do proprietário.
- **Produção da cozinha:**
  - No modo "colaboradores", o colaborador vê "Registrar produção", e "Produzida por" mostra só ele mesmo. Sem nome de exibição, a tela orienta a pedir ao proprietário. "Anular produção" não aparece para ele.
  - O aviso de atraso e a justificativa seguem a janela da unidade.
  - A lista mostra a janela usada em cada produção tardia.
- **Porcionar preparação:**
  - Com "igual ou menor", aparece o campo "Validade da porção", preenchido com a validade do lote. A tela recusa data maior, e a revisão mostra a validade do lote ao lado.
  - Com "igual" (padrão), a tela é a da 7.5.

## Testes

Todos executados neste ambiente, com o banco local recém-recriado (`npm run db:reset`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | ok |
| `npm run test` (Vitest) | 289 passaram (14 novos: configurações, produção pelo colaborador, janela, mensagens, porção "igual ou menor") |
| `npm run test:db` (pgTAP) | 1284 passaram, 3 vezes seguidas com banco recém-criado (23 arquivos; `production_settings.test.sql` com 61 novos) |
| `npx supabase db advisors --type security --level warn --fail-on warn` | sem problemas |
| `npm run test:integration` | 36 passaram (`establishment-settings.test.mjs` novo) |
| Playwright (config local com o Chromium do ambiente) | 18 passaram (1 novo: proprietário libera, colaborador registra a própria produção) |

**Listas fixas de segurança, só ampliadas:**
- `rls_set_based.test.sql` ganhou a política `establishment_settings_read`.
- `security_guard.test.sql` ganhou `establishment_settings` na lista de tabelas sem INSERT ou UPDATE direto.

Nenhum teste existente foi enfraquecido ou alterado.

Na primeira rodada, o teste 67 de `production.test.sql` ("membro não registra produção") recebeu uma mensagem nova de recusa. A função voltou a usar "Acesso negado." no padrão, e o teste passou sem mudança.

**Testes instáveis que já existiam antes desta fatia** (não alterados, fora do escopo):
1. **`handling_void.test.sql`, teste 26** ("a sequência inclui anulações de manipulação bem-sucedidas"). O sorteio usa `setseed`, mas escolhe linhas com `order by random()`, e o resultado depende da ordem física das linhas. Essa ordem muda com as linhas desfeitas pelos arquivos de teste que rodam antes.
   - **Banco recém-criado** (caso da CI): o resultado é sempre o mesmo. Com o arquivo novo desta fatia chamado `establishment_settings.test.sql`, que roda antes de `handling_void`, o sorteio passou a dar 4 anulações em vez de pelo menos 5, e a CI do PR #26 falhou duas vezes.
   - **Correção nesta fatia:** o arquivo novo passou a se chamar `production_settings.test.sql`, que roda depois. Com isso a bateria passou 3 vezes seguidas com banco recém-criado. O teste 26 não foi alterado.
   - **Banco reaproveitado** (uso local): o resultado continua variando; em 12 rodadas na branch da 7.5 deu de 2 a 11 anulações.
2. **`list_containers.test.sql`, teste 38** ("busca por lote"). Falhou na CI do PR #25 porque a busca "f-78" também pode casar com o ID aleatório de outro recipiente.

Proposta: uma correção pequena, com aprovação própria, que torna os dois testes determinísticos sem afrouxar o que conferem.

## Limites conhecidos

1. **Tempo máximo sem etiqueta** só é guardado e mostrado. O aviso, que exige registrar quando a etiqueta foi baixada, é a 7.8.
2. **Janela por preparação** no catálogo é a 7.7; aqui a janela é só por unidade.
3. **Nome completo:** o limite do nome de exibição continua em 40 caracteres. A decisão C prevê ampliar para 80 só se nomes reais não couberem, e até agora não houve caso.
4. **Nome de exibição do colaborador** continua definido pelo proprietário. No modo "colaboradores", quem não tem nome não registra até o proprietário definir.
5. A tela de configurações não mostra o histórico de mudanças. O registro fica em `entity_changes`, legível pelo proprietário.

## Pontos para luis decidir

1. **O colaborador registra só a própria produção**, nunca em nome de outra pessoa, e não anula. Proposta: manter. Assim, "produzido por" é sempre quem registrou, e a correção continua com o proprietário.
2. **"Igual ou menor" fica disponível, mas o padrão continua "igual à do lote".** Você pediu essa regra só depois da avaliação operacional e da nutricionista RT. Proposta: manter a opção pronta e não ativá-la até essa avaliação. Se preferir, a opção pode ficar escondida na tela até lá.
3. **Limites de 15 minutos a 24 horas** para a janela e para o tempo sem etiqueta. Eles servem só para recusar valores absurdos. Proposta: manter.

## Decisão proposta para `DECISOES.md`

> **D-055 — Configurações da unidade (14/11/2026).** Status: proposta, aguardando aceite de luis; implementada na fatia 7.6 ([registro](FASE_07_6.md)). Decisão: cada unidade tem configurações escolhidas pelo proprietário e auditadas em `entity_changes`: quem registra produção (padrão só o proprietário; opção "cada colaborador registra a própria produção", exceção à D-019 só para o registro da produção, com a validade), janela de registro da produção (padrão 2 horas; 15 minutos a 24 horas; guardada em cada registro), tempo máximo sem etiqueta (padrão 1 hora; usado pela 7.8) e validade da porção de preparação própria (padrão igual à do lote; opção igual ou menor, nunca maior). Mudança vale para os registros novos e nunca reescreve os antigos. Motivo: decisões A e B de luis (14/11/2026), R-1 do desenho da Fase 7, D-036. Consequência: a 7.7 acrescenta a janela por preparação; a 7.8 usa o tempo sem etiqueta. Revisar quando: a observação do piloto ou a nutricionista RT indicarem outra necessidade.

## Próximo passo

Aceite de luis (3 pontos e D-055). As fatias 7.7 a 7.9 exigem aprovação própria. Sem merge, deploy ou mudança fora do escopo sem autorização específica de luis.
