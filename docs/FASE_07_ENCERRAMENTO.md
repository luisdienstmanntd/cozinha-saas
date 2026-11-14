# Fase 7 — relatório de encerramento técnico

> Pedido por luis em 14/11/2026 (21:42 UTC), junto com o aceite da 7.9. Cobre as fatias 7.1 a 7.9 (preparação própria da cozinha). Dados de teste sintéticos; **nenhum dado, nome, foto ou texto de documento do hotel piloto está neste repositório público**. **Nada aqui afirma conformidade sanitária ou legal**: a conferência pela nutricionista responsável técnica (Q10) e o teste físico de impressão seguem pendentes e são obrigatórios antes do piloto operacional. Este relatório não autoriza merge nem deploy.

## 1. Resumo

O desenvolvimento funcional das fatias 7.1 a 7.9 foi aceito por luis, **sujeito à integração dos PRs, à revisão final e aos testes completos**. A Fase 7 permite cadastrar uma preparação própria, registrar a produção com validade informada pelo responsável, imprimir a etiqueta, porcionar, anular enquanto não houve movimento, configurar a unidade, avisar produção sem download de etiqueta registrado e registrar temperatura opcional. A validade nunca é calculada nem sugerida (D-004).

Estado do Git em 14/11/2026: a `main` tem as fatias 6.7 a 6.11 e a 7.1 (PRs #15 a #21 mesclados por luis). **Os PRs #22 a #30 estão em rascunho, sem merge.**

## 2. Funcionalidades implementadas

| Fatia | O que entrega | Decisão | PR |
|---|---|---|---|
| 7.1 | Preparação própria no banco: tipo do item (`products.kind`), origem do lote, `register_production`, produção tardia com ocorrência | D-049, D-050 | #21 (mesclado) |
| 7.2 | Anular produção inteira, com motivo, só antes de qualquer movimento; depois, descarte com motivo | D-051 | #22 |
| 7.3 | Tela de produção: cadastro da preparação, registro em passos com revisão por extenso, lista, anulação | D-052 | #23 |
| 7.4 | Etiqueta PDF 100 × 100 mm "Preparação própria" (nome 16 pt, validade 15 pt em negrito, "Validade informada pelo responsável", produzido em/por, QR) | D-053 | #24 |
| 7.5 | Porcionar preparação (porção com a validade do lote) e métricas de produção em `pilot_metrics` | D-054 | #25 |
| 7.6 | Configurações da unidade: quem registra produção (padrão só o proprietário), janela de registro (padrão 2 h), tempo sem etiqueta (padrão 1 h); regra "igual ou menor" pronta, **oculta na tela** | D-055 | #26 |
| 7.7 | Janela de registro própria por preparação, definida só pelo proprietário e auditada | D-056 | #27 |
| 7.8 | Registro do download da etiqueta da produção (append-only) e aviso "sem download de etiqueta registrado há X" | D-057 | #29 |
| 7.9 | Temperatura opcional (fim do resfriamento, reaquecimento), sem avaliação, append-only | D-058 | #30 |
| Testes | Dois testes pgTAP instáveis tornados determinísticos | autorizado em 14/11/2026, 20:47 UTC | #28 |

Migrações novas da Fase 7: `20261114040000_kitchen_production` a `20261114100000_production_temperature` (sete arquivos), todas com histórico append-only protegido por `private.assert_history_protected()`.

### Regras que atravessam a fase

- D-003: reimprimir, baixar etiqueta e registrar temperatura nunca criam saldo nem movimento.
- D-004: o sistema não calcula, sugere nem limita prazo; a contagem de dias na revisão é só conferência.
- D-019: só o proprietário escreve; exceção única da 7.6 (colaborador registra a **própria** produção, quando a unidade permite; vale também para a temperatura).
- Nada classifica como conforme, nem a faixa de -50 a 80 °C da temperatura (só validação de entrada, ressalva de luis na 7.9).
- Os textos dos avisos não dizem que a etiqueta "não foi impressa ou colada", só "sem download de etiqueta registrado" (observação de luis na 7.8).

## 3. Pendências e limitações conhecidas (funcionais)

Aceitas por luis para avaliação no piloto, salvo indicação:

1. **Download pela página do QR não é registrado** e **o aviso aparece só na tela de Produção** (7.8). Melhoria futura em `BACKLOG.md`.
2. **Medição de temperatura não é corrigida nem invalidada** (7.9); invalidação com motivo obrigatório no `BACKLOG.md`.
3. **Pesquisa histórica de produções** (hoje as 50 mais recentes); `BACKLOG.md`.
4. **Opção "validade da porção igual ou menor"** implementada e testada, mas oculta até a avaliação da RT (constante `PORTION_RULE_SELECTABLE = false`).
5. **Limites de 15 minutos a 24 horas** (janela e tempo sem etiqueta) só recusam valor absurdo, sem valor sanitário.
6. **Nome de exibição limitado a 40 caracteres.** luis decidiu "nome completo" (14/11/2026), mas o limite não foi ampliado; nomes completos reais podem não caber. Decidir antes do piloto se amplia (por exemplo, para 80) e testar a etiqueta com o nome mais longo.
7. **Fora do mínimo, não implementado:** ingredientes com origem (8.1), ficha de preparo (8.2), alergênicos e lote de origem opcionais na etiqueta (8.3), integração com equipamentos de temperatura (8.4). Cada um exige aprovação própria.
8. **Reimpressão não confirma impressão nem colagem.** O sistema só sabe do download.
9. **Item 2 da lista de revisão sanitária (não conformidade no recebimento)** continua adiado até a lista da nutricionista (decisão anterior de luis); recusa de entrega fica no papel.

## 4. PRs aguardando integração e ordem recomendada

Os PRs #23 a #27, #29 e #30 foram abertos em **cadeia** (cada um tem como base a branch do anterior); o #22 tem como base a `main`. O #28 também parte da `main`, e o seu conteúdo já foi integrado à cadeia por merge no #27.

Ordem recomendada, uma de cada vez, esperando a CI ficar verde antes da seguinte:

1. **#28** (testes instáveis): só testes e documentação; deixa o pgTAP determinístico antes da cadeia.
2. **#22** (7.2) → **#23** (7.3) → **#24** (7.4) → **#25** (7.5) → **#26** (7.6) → **#27** (7.7) → **#29** (7.8) → **#30** (7.9).

Cuidados:

- Depois de cada merge, mudar a base do PR seguinte para a `main` (ou conferir que o GitHub o fez). Sem isso, o PR seguinte continua apontando para uma branch já integrada.
- Cada PR carrega as alterações dos anteriores; o diff do seguinte só fica pequeno depois que o anterior entra.
- Os documentos `IA_ESTADO.md` e `DECISOES.md` foram editados em vários PRs; se houver conflito de texto nesses arquivos, conciliar as duas entradas, sem descartar nenhuma.
- Se luis preferir uma única integração, a alternativa é mesclar só o **#30** (que contém todas as fatias) depois da revisão; isso perde o histórico de aceite por fatia nos PRs. Decisão dele.
- Nenhum merge foi feito nem será sem autorização específica de luis. Deploy também não (D-006).

## 5. Resultado dos testes

Última execução completa, no ambiente local descartável, com o banco recriado (`npm run db:reset`), na ponta da cadeia (PR #30):

| Verificação | Resultado |
|---|---|
| `npm run lint`, `typecheck`, `format:check`, `build` | ok |
| Vitest | 319 passaram |
| pgTAP | 1412 passaram em 26 arquivos (rodadas repetidas, sem oscilação) |
| `supabase db advisors` | sem problemas |
| Integração (API real) | 39 passaram |
| Playwright | 21 passaram |

CI dos PRs #22 a #27, #29 e #30: verde na ponta de cada um. No #28 houve uma execução vermelha por **falha de infraestrutura do executor** (porta do banco já em uso ao iniciar o Supabase) e a nova execução na mesma versão passou. No #30 houve uma execução vermelha por um erro meu nos testes de integração das fatias 7.8 e 7.9 (contagem de linhas do banco inteiro com testes em paralelo); foi corrigido contando só a empresa do teste, sem remover verificação.

Nenhum teste existente foi enfraquecido na fase. Mudanças em testes existentes foram só crescimento das listas fixas de segurança (`rls_set_based`, `security_guard`) e, na 7.6, a troca de um controle da tela que passou a ficar oculto (documentada em `FASE_07_6.md`).

**O que os testes não provam:** leitura do QR por celular, impressão no papel e na impressora reais, uso por pessoas na cozinha, desempenho com volume real, comportamento no ambiente hospedado. Nada foi executado fora do ambiente local.

## 6. Riscos

| # | Risco | Situação |
|---|---|---|
| 1 | Validade plausível mas errada: o sistema não conhece o prazo certo (D-004) | Mitigada por revisão por extenso, confirmação para "hoje", anulação antes de movimento; resto é conferência humana e da RT |
| 2 | Gargalo do proprietário (D-019) | Métricas de atraso e de ocorrência no piloto; exceção da 7.6 disponível |
| 3 | Etiqueta ilegível, descolando ou lida como garantia sanitária | Só o teste físico mostra; textos dizem "validade informada pelo responsável" |
| 4 | Aviso de etiqueta interpretado como prova de impressão ou colagem | Texto "sem download de etiqueta registrado" e rodapé explicando; limite 8 da seção 3 |
| 5 | Cadeia de 9 PRs: erro de ordem ou de base na integração | Seção 4 |
| 6 | Registro append-only impede corrigir dado pessoal e medição errada | Seção 7; invalidação de medição no backlog |
| 7 | Janelas e limites operacionais sem validação | Seção 8 |
| 8 | Dependência do provedor gratuito e ausência de teste de restauração | Seção 7 |
| 9 | Testes que dependem de ordem física de linhas (família do teste 26) | Corrigidos no #28; novos arquivos pgTAP continuam nomeados para rodar depois de `handling_void` por prudência |

## 7. Segurança, LGPD, retenção e backup (pendências)

Nada abaixo foi resolvido nesta fase; o documento operacional é `docs/PRE_PILOTO.md`.

**Segurança**

- **MFA obrigatório para proprietários (P4)** não está implementado: o TOTP só pode ser ligado no projeto hospedado; torná-lo obrigatório exige tela de cadastro do fator e exigência de nível de autenticação nas políticas. Decisão de luis pendente.
- **Proteção contra senhas vazadas** só se liga manualmente no painel do projeto hospedado.
- **Chave de serviço** e procedimento de provisionamento no ambiente hospedado: o `provision.mjs` só roda contra o Supabase local; o equivalente hospedado não existe.
- `service_role` ainda tem DELETE em tabelas de estoque para a limpeza dos testes (S6/P5 mitigado por gatilhos append-only; revisar antes do hospedado).
- **Revisão de segurança independente** não foi feita. Os testes pgTAP e de integração não substituem auditoria.
- Verificar no hospedado: políticas RLS das tabelas novas da fase (`production_label_downloads`, `production_temperatures`, `establishment_settings`, `batch_productions`, `production_voids`) com usuários reais de duas empresas.

**LGPD**

- Dado pessoal novo na fase: **nome copiado** de quem produziu (`batch_productions.handled_by_name`) e de quem registrou temperatura (`production_temperatures.recorded_by_name`); autoria (`created_by`, `downloaded_by`, `recorded_by`); texto livre (observação, justificativa de atraso, motivo de anulação).
- O histórico é append-only: **o nome copiado não muda** sem suspender a proteção. A escolha entre manter o nome curto como parte da rastreabilidade (informando a pessoa) e um procedimento controlado e auditado de reescrita é de luis, com apoio jurídico e da RT.
- O procedimento de exclusão/anonimização (revogar vínculo, anonimizar o usuário, limpar o nome de exibição) está descrito em `PRE_PILOTO.md` e **não está automatizado**.
- Falta definir base legal, aviso à equipe sobre o registro de autoria e canal para pedidos de titulares.

**Retenção e backup**

- **Prazo de retenção: não definido.** Depende de orientação jurídica e sanitária; este repositório não traz número.
- **Backup: não definido** (local, frequência, quem acessa, criptografia).
- **Teste de restauração: nunca feito.** Sem ele, o backup não conta.
- Registros append-only crescem sem expurgo previsto; definir arquivamento junto com a retenção.

## 8. Itens que dependem da nutricionista RT (Q10)

Profissional **ainda não escolhida**. As respostas de luis ao questionário (14/11/2026) são decisão de produto, **não substituem** a conferência. A RT deve avaliar, no mínimo:

1. Campos mínimos da etiqueta "Preparação própria" (nome, validade em negrito, produzido em/por, conservação, quantidade, porção X de N, código, QR); necessidade de alergênicos e lote de origem.
2. Quem pode definir a validade de cada preparação e se é preciso ficha de preparo aprovada antes.
3. Se a validade deve ser limitada pela menor validade dos ingredientes (hoje o sistema não limita).
4. Definição do horário de produção ("fim do preparo/início do resfriamento", decisão de produto).
5. A **janela de registro de 2 horas** (padrão) e janelas próprias por preparação; limites de 15 minutos a 24 horas.
6. **Validade da porção** igual à do lote (padrão) e se a regra "igual ou menor" pode ser habilitada; congelar sem gerar validade nova (hoje proibido).
7. **Temperatura** no fim do resfriamento e no reaquecimento: se é necessária, quais faixas e ações; hoje o sistema só registra o número (-50 a 80 °C é validação de entrada).
8. **Etiqueta impressa depois** de guardar o produto e o **tempo máximo sem etiqueta** (padrão 1 hora).
9. Nome completo de quem produziu ou nome curto (e o limite de 40 caracteres do campo).
10. Redação dos textos: "validade informada pelo responsável", "sem download de etiqueta registrado", textos de bloqueio por produção tardia.
11. Procedimento de produção tardia (lote bloqueado até decisão do proprietário) e de descarte de vencido.
12. Itens fora do mínimo e adiados: ingredientes e origem (8.1), ficha de preparo (8.2), alergênicos (8.3), equipamentos de temperatura (8.4); lista de não conformidade no recebimento (item 2 da revisão anterior).

Nenhum valor ou texto acima é aprovação sanitária enquanto a RT não o conferir.

## 9. Checklist para o teste físico das etiquetas e da leitura dos QR Codes

Executar em ambiente de teste, com dados fictícios, na impressora e no papel que a cozinha vai usar. Registrar o resultado em papel ou planilha, sem foto de documento de terceiros e sem dado pessoal.

**Preparação**

- [ ] Registrar uma preparação fictícia e uma produção de teste (validade fictícia, nome de quem produziu fictício).
- [ ] Baixar as etiquetas de todos os modelos: recebimento, produto aberto/fracionado e **preparação própria** (uma produção e uma porção).
- [ ] Anotar impressora, modelo, papel, tamanho configurado (100 × 100 mm, 100% sem "ajustar à página") e versão do navegador.

**Impressão**

- [ ] O tamanho impresso é 100 × 100 mm (medir com régua).
- [ ] Nenhum texto cortado nas bordas; margens aceitáveis.
- [ ] O **nome da preparação** é o maior texto e se lê a 1 m.
- [ ] A **validade** (dd/mm/aaaa, negrito) se lê a 1 m e vem logo abaixo do nome.
- [ ] "Validade informada pelo responsável" aparece e está legível.
- [ ] Produzido em/por, conservação, quantidade e (na porção) "porção X de N" aparecem.
- [ ] Nome longo (3 linhas) e nome completo de quem produziu no limite do campo não quebram o layout.
- [ ] Contraste suficiente e sem borrão; texto pequeno ainda legível.
- [ ] A etiqueta de produção anulada ou de produção tardia sem liberação **não** é gerada.

**Aderência e uso**

- [ ] A etiqueta cola em recipiente seco, frio e úmido, e resiste a frio (câmara) e umidade.
- [ ] A etiqueta resiste à lavagem/condensação e não descola em 24 horas.
- [ ] A cor e o material não somem sob luz forte nem sob a luz da câmara.

**Leitura do QR**

- [ ] Ler o QR com pelo menos dois celulares (um Android e um iPhone) e dois aplicativos de câmara/leitor.
- [ ] Ler a 20 cm, 40 cm e com a etiqueta levemente curvada no recipiente.
- [ ] Ler com pouca luz (câmara/estoque) e com brilho/reflexo.
- [ ] A página do QR abre sem login desnecessário para quem tem acesso e **pede login** para quem não tem; nenhuma informação sensível aparece sem permissão.
- [ ] A página mostra o conteúdo certo (preparação, validade informada, saldo) e, para produção anulada ou vencida, mostra "ANULADO" ou "VENCIDO".
- [ ] Reimprimir a mesma etiqueta não aumenta o saldo (conferir o saldo antes e depois).
- [ ] Baixar a etiqueta pela tela de Produção tira o aviso "sem download de etiqueta registrado"; baixar pela página do QR **não** tira (limitação conhecida).

**Resultado**

- [ ] Registrar o que falhou, com tamanho, papel e impressora, e voltar com os ajustes para decisão de luis e conferência da RT.
- [ ] O teste só vale para a combinação impressora + papel + celular testados; outra combinação exige novo teste.

## 10. Próximos passos

1. Revisão final do conjunto pelos humanos e, se luis quiser, uma revisão cruzada por outra IA antes do merge.
2. Decisão de luis sobre a forma de integração (seção 4) e merge, se e quando ele autorizar.
3. Escolher a nutricionista RT e levar a seção 8.
4. Executar o checklist da seção 9.
5. Decidir sobre MFA, retenção, backup, teste de restauração e nome completo (seções 3 e 7).
6. Só depois, piloto operacional com autorização específica de luis.
