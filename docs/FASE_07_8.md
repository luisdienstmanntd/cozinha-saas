# Fase 7, fatia 7.8 — aviso de produção sem etiqueta

> Autorizada por luis em 14/11/2026 (20:47 UTC), junto com o aceite da 7.7: "Autorizo o início da Fase 7.8, conforme o desenho existente, sem antecipar a 7.9." Segue o [desenho da Fase 7](FASE_07_DESENHO.md) (7.8: "registrar quando a etiqueta foi baixada, sem criar estoque, D-003, e mostrar no painel as produções acima do tempo configurado; o banco não bloqueia, porque não sabe se a etiqueta foi colada") e a D-055 (tempo máximo sem etiqueta, padrão 1 hora). Decisão: **D-057** (abaixo), **aceita por luis em 14/11/2026, 21:20 UTC, com uma observação sobre o texto do aviso**. **Nada aqui afirma conformidade sanitária**: o aviso é um lembrete operacional, não prova que a etiqueta foi colada, e o tempo configurado depende da nutricionista RT (Q10, pendente). O teste físico de impressão também segue pendente. Dados de teste sintéticos.

## O que mudou

### Banco (migração `20261114090000_production_label.sql`)

- **`production_label_downloads`:** registro append-only (ninguém altera, apaga ou trunca, nem o `service_role`) de cada vez que a etiqueta do recipiente integral de uma produção foi baixada: lote, recipiente, quem baixou e quando. Cada download vira uma linha; o aviso usa o primeiro.
- **`record_production_label_download(empresa, unidade, recipiente)`:** devolve o horário gravado. Aceita só o recipiente **integral de lote produzido pela cozinha**; recebimento, porção e recipiente de outra empresa são recusados. Produção anulada recusa o registro.
- **Quem registra:** o proprietário e, quando a unidade deixa o colaborador registrar produção (7.6), o colaborador. No padrão, só o proprietário (D-019). A recusa é a mesma "Acesso negado." da produção.
- **Não é estoque (D-003):** o registro não cria lote, recipiente, saldo nem movimento. Um teste confere as contagens antes e depois.
- **O banco não bloqueia nada:** ele sabe que o arquivo foi baixado, não que foi colado. O bloqueio por atraso da etiqueta (lote tardio sem liberação) é da 7.4 e não mudou.
- **Proteção do histórico:** `private.assert_history_protected()` passou a incluir a tabela nova (as listas fixas dos testes só cresceram).

### Tela (Produção da cozinha)

- **Registro ao baixar:** depois que o PDF é gerado e baixado, a tela registra o download e relê a lista. Se o PDF falha (por exemplo, lote bloqueado), nada é registrado. Se só o registro falha, a tela avisa que a etiqueta foi baixada mas o horário não foi registrado; o PDF não é desfeito.
- **Aviso por produção:** "— sem download de etiqueta registrado há 1 hora e 35 minutos (acima de 1 hora)", quando a produção não está anulada, tem recipiente, ainda não teve a etiqueta baixada e passou do tempo configurado na unidade.
- **Resumo no alto:** "1 produção está sem download de etiqueta registrado há mais de 1 hora. É só um aviso: o sistema registra o download, não a impressão nem a aplicação da etiqueta."
- A tela usa o tempo da unidade (7.6). Nada calcula ou sugere validade (D-004).

## Testes

Todos executados neste ambiente, com o banco local recém-recriado (`npm run db:reset`):

| Comando | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | ok |
| `npm run test` (Vitest) | 308 passaram (9 novos: regra do aviso, tela e registro) |
| `npm run test:db` (pgTAP) | 1360 passaram (25 arquivos; `production_label.test.sql` com 33 novos; 3 rodadas seguidas verdes) |
| `npx supabase db advisors` | sem problemas |
| `npm run test:integration` | 38 passaram (`production-label.test.mjs` novo) |
| Playwright (config local com o Chromium do ambiente) | 20 passaram (1 novo) |

O pgTAP novo cobre: tabela, RLS, privilégios, gatilho append-only, papéis (proprietário, colaborador no padrão e no modo da 7.6, outra empresa, vínculo revogado), recipiente certo (recebimento, porção e inexistente recusados), produção anulada, ausência de efeito no estoque e leitura isolada por empresa.

**Mudanças em testes existentes (só crescimento de listas fixas, nenhum teste enfraquecido):** `rls_set_based.test.sql` (política `production_label_downloads_read`) e `security_guard.test.sql` (a tabela nova entra nas listas de histórico: sem escrita direta, gatilho append-only, `service_role` só lê).

Durante a escrita do pgTAP novo, dois erros meus apareceram e foram corrigidos no próprio teste: uma contagem de recipientes novos que eu havia calculado errado (2 em vez de 4) e uma verificação que dependia da ordem entre duas linhas gravadas na mesma transação (mesmo horário). A segunda ficou determinística, comparando o conjunto de pessoas que baixaram.

O arquivo de teste novo se chama `production_label.test.sql` para rodar depois de `handling_void.test.sql`. Esse teste foi tornado determinístico no PR #28, mas a convenção continua válida.

## Limites conhecidos

1. **Só o download feito na tela de Produção é registrado.** A etiqueta baixada pela página do QR (recipiente aberto pelo código) não passa por aqui e não tira o aviso.
2. **O aviso aparece só na tela de Produção**, não no painel de vencimentos.
3. **Baixar não é colar.** O aviso some quando o arquivo é baixado; a cozinha continua responsável por imprimir e colar.
4. **Quem não pode registrar produção** (colaborador no padrão da unidade) baixa a etiqueta, mas o download não é registrado e o aviso continua.
5. O aviso vale para as 50 produções mais recentes da lista.

## Pontos para luis decidir

1. **Quem registra o download.** Proposta: o mesmo grupo que registra produção (proprietário sempre; colaborador só se a unidade permitir, 7.6). A alternativa seria deixar qualquer pessoa com vínculo registrar, o que abriria uma escrita nova para o colaborador no padrão.
2. **O aviso some no primeiro download.** Proposta: manter, deixando claro na tela que é só um aviso. Reimpressões ficam registradas, mas não reabrem o aviso.
3. **Limites conhecidos 1 e 2** (download pela página do QR não registrado; aviso só na tela de Produção). Proposta: aceitar na 7.8 e tratar, se luis quiser, em fatia própria depois da observação na cozinha.

## Decisão proposta para `DECISOES.md`

> **D-057 — Aviso de produção sem etiqueta (14/11/2026).** Status: aceita por luis em 14/11/2026, 21:20 UTC (com observação sobre o texto do aviso). Implementada na fatia 7.8 ([registro](FASE_07_8.md)). Decisão: o download da etiqueta do recipiente integral de uma produção é registrado em tabela append-only, sem criar estoque (D-003), por quem pode registrar produção (D-019 e 7.6). A tela de Produção avisa "sem download de etiqueta registrado há X" nas produções não anuladas, sem download e acima do tempo máximo configurado na unidade (D-055). O banco não bloqueia nada. Motivo: desenho da Fase 7 e resposta de luis ao questionário (aviso de 1 h sem etiqueta). Consequência: a temperatura opcional (7.9) segue como fatia própria. Revisar quando: a nutricionista RT avaliar o tempo e a observação do piloto mostrar se o aviso ajuda.

## Aceite de luis (14/11/2026, 21:20 UTC)

1. **Aprovado:** o registro do download fica com o proprietário e com os colaboradores autorizados a registrar produção, seguindo as permissões da unidade.
2. **Aprovado:** o aviso encerra no primeiro download registrado; as reimpressões continuam no histórico sem reabrir o aviso.
3. **Aceito provisoriamente:** download feito pela página do QR não é registrado e o aviso aparece só na tela de Produção. **Essas limitações ficam registradas para avaliação durante o piloto.**

Aprovou a D-057 **com a observação** de que o sistema distinga etiqueta não baixada de etiqueta não impressa ou não colada, porque não há confirmação física. Por isso os avisos dizem **"sem download de etiqueta registrado"** (texto ajustado neste PR, na tela, nos testes e na D-057). Pediu como **melhoria futura** acompanhar os downloads feitos por diferentes telas e usuários autorizados, sem enfraquecer os controles de acesso (anotada em `BACKLOG.md`). Autorizou a 7.9 exclusivamente conforme o desenho existente. A validação normativa da nutricionista RT e o teste físico de impressão seguem obrigatórios antes do piloto operacional.

## Próximo passo

7.9 (temperatura opcional), autorizada. Sem merge, deploy ou mudança fora do escopo sem autorização específica de luis.
