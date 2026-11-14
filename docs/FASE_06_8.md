# Fase 6, fatia 6.8 — recuperação de tentativa e acesso tolerante

Implementada por Claude Code em 14/11/2026, conforme as seções 4.7, 7.5 e 7.7 e a fatia 6.8 de `FASE_06_DESENHO.md` e a proposta P7 de `REVISAO_05_SEGURANCA_PRODUTO.md`. luis aprovou em 14/11/2026 00:24 UTC ("6.8 aprovado"). Registro da tarefa: `ia-tarefas/fase-06-8-recuperacao-tentativa.md`.

**Base:** branch do PR #15 (6.7, ainda sem merge). Uma migração só de leitura (`find_operation`); nenhuma tabela, coluna ou dado novo. Permissão sem mudança (só o proprietário escreve, D-019). Q1–Q10 preservadas; nenhum texto afirma conformidade sanitária.

## O que mudou

### Banco (`20261114000000_find_operation.sql`, rollback `find_operation.sql`)

`public.find_operation(org, unidade, intent_id)`, `SECURITY INVOKER` (a RLS de cada tabela decide o que aparece), `search_path` vazio, sem execução para `anon`. Procura o identificador em manipulações, recebimentos, anulações de manipulação, decisões de ocorrência e movimentos e devolve tipo, id e data da primeira que achar (a manipulação tem prioridade, I-3, para quando a transferência de local da 6.9 repetir o identificador). Identificador nulo ou desconhecido não devolve nada. Verificação final: histórico protegido.

### Tela

1. **Tentativas pendentes:** toda escrita (recebimento, manipulação, anulação de manipulação, decisão de ocorrência, saída) é guardada no `localStorage` do navegador, por usuário, **antes** de ser enviada, e apagada quando dá certo ou quando o banco recusa de forma definitiva. Qualquer outro resultado (conexão caiu, resposta perdida, aba fechada) mantém a tentativa por até 24 horas (no máximo 20). Nada de senha, sessão ou chave é guardado. Os gateways são decorados em um único lugar (`trackGateways`); nenhum formulário mudou.
2. **Faixa "Há N registro(s) não confirmado(s)":** para cada tentativa a tela pergunta ao servidor. Se o servidor já tem a operação: "**Registro confirmado**: o servidor já tem esta operação. Nada será enviado de novo." ("Entendi"). Se não tem: "O servidor não tem este registro." com "**Enviar novamente**" (mesmo identificador e mesmos dados) e "**Descartar tentativa**". Falha na conferência só oferece "Conferir de novo". **Nunca reenvia sozinha.** Reenvio recusado mostra a mensagem do banco e confere de novo antes de qualquer outra tentativa.
3. **A lista se atualiza** depois de uma tentativa conferida ou reenviada.
4. **Acesso tolerante (P7):** cada empresa é validada separadamente. As válidas aparecem e uma nota diz "Não foi possível carregar 1 empresa." Se nenhuma carrega, a mensagem é "Não foi possível carregar sua empresa." (e não "Nenhum vínculo ativo").
5. O recebimento passou a distinguir recusa do banco (com código; definitiva) de erro de conexão (sem código; incerto) para decidir se a tentativa fica guardada.

## Testes

- **pgTAP (985):** `find_operation.test.sql` (9): catálogo e privilégios, cada tipo de operação encontrado, identificador nulo ou desconhecido, escopo trocado, membro vê o que o proprietário gravou, proprietário de B não vê nada de A, anônimo recusado.
- **Integração (27):** `find-operation.test.mjs` com usuários reais: nada antes de gravar, recebimento encontrado, membro vê o mesmo, outra empresa e anônimo não veem, repetir a mesma tentativa não duplica.
- **Vitest (217):** armazenamento (usuário, 24 horas, limite, lixo), decorador (guarda antes, sucesso e recusa definitiva apagam, conexão mantém, um resumo por tipo), faixa (confirmado, enviar de novo com o mesmo identificador e sem enviar sozinha, descartar, falha na conferência, outra unidade), gateway da conferência, recusa x incerto no recebimento, acesso tolerante no gateway e na tela. Teste 16 de textos proibidos passou sobre os textos novos.
- **E2E 34 (12 no total):** `pending.spec.mjs` — resposta perdida (o servidor gravou): ao reabrir, "Registro confirmado" e um único recebimento; pedido perdido (o servidor não gravou): "Enviar novamente" e um único recebimento; descartar; outro usuário no mesmo navegador não vê a tentativa. A falha é simulada na rede do navegador e a "aba fechada" é um recarregamento (que encerra a sessão), então a tentativa só vem do `localStorage`.
- lint, typecheck, format e build ok. Capturas: `/mnt/project-files/capturas-fase-06-8/`.

## Defeito de teste encontrado e corrigido

`container_handling.test.sql` (6.3) comparava datas do fuso da unidade com `current_date` do servidor (UTC). Entre 00:00 e 03:00 UTC (21:00 a 00:00 em São Paulo) dois testes de validade falhavam. As três linhas passaram a usar a data de hoje em São Paulo; o que se confere é o mesmo, sem enfraquecer nada. Nenhum código de produção estava errado.

## Limites conhecidos

- **O `localStorage` é do navegador:** outra máquina ou outro navegador não vê a tentativa; limpar os dados do site a apaga (o servidor continua sendo a fonte da verdade, e o histórico mostra o que foi gravado).
- **Dois mecanismos convivem:** a "tentativa pendente" por sessão do painel de saída (4.x) continua como era; a faixa nova é a rede de segurança entre sessões. Unificar fica para depois do piloto.
- **Uma tentativa por identificador:** a faixa não reconstrói a tela de origem; para manipulação ela mostra o resumo ("Porcionamento em 3 porções") e o horário, não os recipientes.
- **Transferência de local** (6.9) ainda não existe; `find_operation` já a trata pela prioridade da manipulação quando chegar.
- O tempo de 24 horas e o limite de 20 são fixos.

## Pontos para luis decidir

1. **Guardar a tentativa antes de enviar** (e não só em caso de falha): garante que um recarregamento no meio do envio não perde a tentativa, ao custo de gravar e apagar a cada escrita.
2. **"Descartar tentativa" só aparece quando o servidor confirma que não tem o registro**; se a conferência falhar, só "Conferir de novo".
3. **Convivência** com o mecanismo de sessão do painel de saída até depois do piloto.
4. **Mensagem de P7** ("Não foi possível carregar N empresa(s)") sem dizer qual.

## Decisão proposta para `DECISOES.md`

**D-045 — Recuperação de tentativa e acesso tolerante (proposta):** a tentativa de escrita é guardada no navegador (por usuário, até 24 horas) antes do envio e apagada por sucesso ou recusa definitiva; ao reabrir, o servidor é consultado por `find_operation` (só leitura, pela RLS) e a tela mostra "Registro confirmado" ou oferece "Enviar novamente" (mesmo identificador) ou "Descartar tentativa", sem nunca reenviar sozinha; uma empresa com dado inesperado não derruba o acesso às demais. **Revisar quando** a 6.9 (transferências) ou o piloto mostrar que 24 horas ou 20 tentativas não servem.

## Próximo passo

Aguardar o aceite de luis. Sem merge sem pedido dele. A 6.9 (locais e transferências) exige aprovação própria.
