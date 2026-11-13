# Fase 6, fatia 6.6 — telas de abrir, porcionar e anular

Implementada por Claude Code em 13/11/2026, conforme as seções 7.1, 7.4, 8 (testes 27, 28, 30, 31 e 33) e 10 (6.6) de `FASE_06_DESENHO.md`. luis aprovou em 13/11/2026 23:08 UTC ("6.6 aprovado"). Registro da tarefa: `ia-tarefas/fase-06-6-telas-manipulacao.md`.

**Base:** branch do PR #13 (6.5b, ainda sem merge). **Nenhuma migração, nenhuma regra nova no banco:** a tela só chama `handle_container` e `void_handling` (6.3 a 6.5a) e lê o que a RLS devolve. Permissão sem mudança: só o proprietário escreve (D-019); o membro consulta. Q1–Q10 preservadas. Nenhum deploy. Nenhum texto afirma conformidade sanitária; a conferência por nutricionista RT (Q10) segue pendente antes do piloto.

## O que mudou

### Abrir e porcionar (7.1)

1. **Entrada:** botão "Abrir / porcionar" na linha do painel (só proprietário, só com saldo) e na tela do recipiente (QR). Recipiente bloqueado mostra o motivo ("BLOQUEADO - aguardando decisão" ou "REJEITADO - somente descarte") no lugar do formulário; sem saldo, o aviso "Recipiente sem saldo registrado.".
2. **Formulário:** abrir embalagem (uma quantidade) ou dividir em 2 a 20 porções; "Dividir igualmente" só preenche os campos (a última porção absorve o arredondamento; unidades inteiras em `un`). A tela mostra a soma, a sobra e "excede o saldo registrado" antes de enviar.
3. **Sobra:** em embalagem integral, "O restante continua fechado na embalagem original?" (sim = fica na origem, não = incluir como porção ou descartar, com motivo). Em origem já aberta (derivada) a sobra nunca fica "fechada": só porção ou descarte (D-030/Q1).
4. **Validade:** campo de data sem valor sugerido, com o texto "Informe a validade após a abertura definida pelo responsável. O sistema não calcula prazos." e a validade da origem como teto. Congelar mostra "Congelar não prorroga a validade nesta versão. Não registre um recebimento novo para isso."
5. **Horário:** "Aberto em" no fuso da unidade. Sem edição, vale o instante exato do registro; editado a mais de 2 horas, a tela avisa "Registro fora da janela. Ficará bloqueado até a decisão do responsável." e exige justificativa (o banco decide o resto).
6. **Quem manipulou:** lista de pessoas com nome de exibição; quem não tem nome (por exemplo o próprio proprietário na primeira vez) o define na própria tela ("Definir nome", `set_member_display_name`). "Registrado por" é quem está logado.
7. **Revisão e confirmação:** tela de revisão com tudo o que será gravado; confirmar usa um identificador de tentativa guardado na sessão (repetir não duplica); recusa definitiva do banco gera nova tentativa na próxima vez; conflito de identificador exige "Já conferi; iniciar nova tentativa". Só mensagens conhecidas do banco são repetidas (lista em `handling/domain/messages.ts`, conferida por teste contra as migrações).
8. **Resultado:** recipientes criados (código curto, porção, quantidade), sobra fechada ou descartada e o aviso de que a etiqueta de produto aberto chega na 6.7 (até lá, anotar o código curto). "Anular manipulação" aparece aqui.

### Anular (7.4)

"Anular manipulação" (proprietário) pede o motivo (até 500) e explica o efeito: a quantidade volta para a origem, os derivados ficam zerados e sem etiqueta, nada do histórico é apagado, não há anulação parcial e só vale enquanto nenhum derivado teve movimento (D-040). A recusa do banco aparece como está.

### QR e tela do recipiente

- Seção "Origem e derivados": o derivado mostra a origem (com botão para abri-la), "Porcionamento de C-… em … — porção 1 de 3", quem manipulou, a validade após a abertura e a sobra descartada; a origem aberta mostra "Este recipiente foi aberto em …. Use a etiqueta nova do produto aberto." e a lista de manipulações com os derivados e seus saldos; manipulação anulada aparece com a data e o motivo e os derivados como zerados.
- A quantidade inicial e a validade mostradas são as **do próprio recipiente** (derivado: "após manipulação"), não as do recebimento.
- **Navegação sem recarregar:** como a sessão não é persistida, recarregar desloga; abrir origem ou derivado muda a tela e o endereço sem recarregar.
- O membro vê tudo isso e "Somente o proprietário abre, porciona ou anula."; nenhum botão de escrita.

## Testes

- **Vitest (193):** domínio (quantidades, soma sem erro de ponto flutuante, divisão igual, horário no fuso, janela de 2 horas, esquema, anulação com motivo), **cada mensagem repetida pela tela existe nas migrações**, formulário (bloqueio, excesso, revisão e confirmação única, recusa do banco, conflito e nova tentativa, origem derivada), tela do recipiente (derivado, membro, anulada, origem aberta). O teste 16 de textos proibidos passou sobre os textos novos.
- **Integração (26):** `handling-ui.test.mjs` com usuários reais: nome de exibição só pelo proprietário; membro e anônimo não manipulam nem anulam; excesso de saldo recusado; proprietário e membro leem a mesma manipulação e os mesmos derivados, outra empresa não lê nada; anulação registrada, repetida com recusa, derivados zerados e saldo de volta à origem. Membro enxerga só o próprio vínculo (o nome de quem manipulou chega pela manipulação).
- **E2E (9):** `handling.spec.mjs` — E2E 27 (abrir 4 kg de 10, sobra fechada, nome definido na tela), 28 (porcionar o derivado em 3 de 1 kg, sobra de 1 kg só porção ou descarte, descarte com motivo), 31 (QR da origem avisa a abertura e leva aos derivados; PDF do derivado indisponível), 33 (membro sem os botões) e anulação pela tela da porção; E2E 30 na parte da tela: horário mais de 2 horas antes avisa e exige justificativa.
- pgTAP 968 (sem mudança no banco), lint, typecheck, format, build ok.
- Capturas: `/mnt/project-files/capturas-fase-06-6/` (1 formulário, 2 revisão, 3 resultado, 4 QR da origem, 5 QR da porção, 6 QR anulada).

## Limites conhecidos

- **E2E 30 incompleto na ponta do banco:** a manipulação tardia aceita (com ocorrência e bloqueio dos derivados) não pôde ser executada na tela, porque o horário não pode ser anterior à criação do recipiente e o recipiente nasce junto do teste. O desenho do banco está coberto pelos pgTAP da 6.5a (`occurrences.test.sql`); na tela o teste confere o aviso, a justificativa e a recusa do banco. Cobrir a ponta inteira exige um recipiente criado há mais de 2 horas (relógio simulado ou fixture com data antiga).
- **PDF do derivado indisponível:** o modelo de etiqueta do recebimento imprimiria a validade da origem; a etiqueta de produto aberto (validade nova, quem abriu) é a 6.7. Até lá a tela do derivado diz isso e não gera arquivo (`makeLabelPdf` recusa `kind === 'derived'`).
- **Consumo e descarte de derivado na tela** ainda não existem (o painel de movimentações é do integral); o banco já os aceita. Enquanto isso, a anulação nunca é recusada por movimento de derivado feito pela tela.
- **Defeito encontrado e corrigido durante a E2E:** o horário padrão truncado ao minuto podia cair antes da criação do recipiente e ser recusado; sem edição, a tela agora envia o instante exato.
- Até 200 recipientes por recebimento na família; a tela avisa quando passa disso.

## Pontos para luis decidir

1. **PDF do derivado fica bloqueado até a 6.7**, em vez de imprimir o modelo do recebimento. Interpretação do "baixar PDFs" do E2E 27: o PDF só é gerado para o integral nesta fatia.
2. **Nome de exibição definido na própria tela de manipulação** (uma vez por pessoa, pelo proprietário). Alternativa: tela própria de pessoas, em fatia futura.
3. **Horário padrão = instante do registro**, editável; a janela de 2 horas e a justificativa seguem o banco.
4. **Texto de validade:** "O sistema não calcula prazos", sem data sugerida, e o aviso de congelamento exatamente como acima.

## Decisão proposta para `DECISOES.md`

**D-043 — Telas de abrir, porcionar e anular (proposta):**

- **Decisão:** a manipulação entra pela tela em passos (formulário, revisão, confirmação, resultado), só pelo proprietário, sem prazo sugerido ou calculado e sem regra nova fora do banco; a anulação é uma ação explícita da tela do recipiente e do resultado, com motivo; o QR do recipiente mostra origem, derivados, quem manipulou e anulação, e o derivado não gera PDF até a etiqueta própria (6.7).
- **Motivo:** desenho 7.1 e 7.4; D-019, D-030, D-039, D-040, D-041; Q1–Q10.
- **Consequência:** nenhum texto novo afirma conformidade (teste 16); mensagem do banco nova precisa entrar em `handling/domain/messages.ts` para aparecer na tela; a 6.7 passa a definir a etiqueta do derivado.
- **Revisar quando:** a 6.7 (etiquetas), a 6.8 (recuperação de tentativa) ou o piloto mostrar que o formulário é longo demais para a cozinha.

## Próximo passo

**Aceita por luis em 13/11/2026 23:42 UTC**, respondendo "1 ok, 2 ok, 3 sim, 4 ok" aos quatro pontos: PDF do derivado bloqueado até a 6.7; nome de exibição definido na própria tela; horário padrão igual ao instante do registro; textos de validade e congelamento mantidos. Interpretado como aceite da fatia e da D-043 (agora aceita em `DECISOES.md`). O aceite não autoriza merge: integrar só com pedido de luis, depois do PR #13. A 6.7 (etiquetas de recebimento e produto aberto) exige aprovação própria.
