# Fase 6, fatia 6.9 — locais de armazenamento e mudança de local

Implementada por Claude Code em 14/11/2026, conforme a seção 4.9, a fatia 6.9 e o teste 15 de `FASE_06_DESENHO.md` (D-030, Q9). luis aprovou o início em 14/11/2026 00:48 UTC ("6.9 aceito"). Registro da tarefa: `ia-tarefas/fase-06-9-locais.md`.

**Base:** branch do PR #16 (6.8). Uma migração (`20261114010000_locations.sql`, rollback `supabase/rollback/locations.sql`). Mudar de local **não altera saldo, validade nem conservação**. Só o proprietário escreve (D-019); o membro lê. Q1–Q10 preservadas; nenhum texto afirma conformidade sanitária.

## O que mudou

### Banco

- `storage_locations`: nome (até 40, único por unidade sem diferenciar maiúsculas), condição (ambiente, refrigerado, congelado), ativo. Criado e desativado, nunca apagado. Identificador de tentativa (`intent_id`).
- `location_moves` (append-only, guarda de histórico e pgTAP de segurança atualizados): recipiente, local anterior e novo, quem mudou (`handled_by`, com nome copiado), quem registrou, fuso, `intent_id`, `seq` gerado pelo banco e `mismatch_confirmed`. **Local atual = evento de maior `seq`** (I-8).
- `create_storage_location`, `set_storage_location_active`, `move_container` (SECURITY DEFINER no `private`, wrapper INVOKER no `public`, `search_path` vazio, sem execução para `anon`), `list_container_locations` (leitura pela RLS).
- `move_container` bloqueia a linha do recebimento; replay devolve o mesmo evento; recusa recipiente sem saldo, bloqueado por ocorrência (só o descarte vale), local desativado, de outra unidade ou empresa, mudança para o local em que já está, pessoa sem vínculo ativo ou sem nome.
- **Divergência** entre a condição do local e a do recipiente (derivado: a da manipulação; integral: a do recebimento, quando existe): recusa até a confirmação explícita, que fica gravada. Nada muda sozinho.
- **Derivado herda o local da origem** como evento `inherited`, na mesma transação da criação (gatilho em `containers`).
- **Anulação de manipulação** é recusada se algum derivado mudou de local pelo usuário (4.10); o evento herdado não conta (gatilho em `handling_voids`, sem reescrever `void_handling`).
- `find_operation` reconhece mudança de local e criação de local (prioridade menor que as demais, I-3).

### Tela

1. **Locais de armazenamento** (seção do catálogo): lista com condição e "(desativado)"; o proprietário cria (nome e condição) e desativa/reativa; o membro só vê.
2. **"Mudar de local"** em cada recipiente com saldo e sem bloqueio: mostra o local atual, o aviso "Não altera saldo, validade nem conservação", escolhe o novo local (só ativos) e quem mudou (pessoas com nome; quem está logado e ainda não tem nome o define ali mesmo). Divergência: o aviso do banco e o botão "Registrar mesmo assim" (mesmo identificador).
3. A linha do recipiente mostra "local: X". Falha ao carregar locais não derruba a lista.
4. Mudança de local e criação de local passam pelo decorador de tentativas pendentes (6.8): a faixa confere pelo `find_operation` e nunca reenvia sozinha.

## Testes

- **pgTAP (1034):** `locations.test.sql` (49): catálogo e privilégios, criar/replay/nome repetido, mover, divergência com e sem confirmação, saldo e validade intactos, outra unidade, local desativado, esgotado, bloqueado e liberado, herança nos derivados, anulação com e sem movimento de local, conservação, `find_operation`, membro e outra empresa, append-only. `security_guard` e `rls_set_based` incluem as tabelas e políticas novas (listas ampliadas, nada enfraquecido).
- **Integração (28):** `locations.test.mjs` com usuários reais: escrita só do proprietário, leitura do membro, outra empresa e anônimo sem acesso, replay sem duplicar, divergência, saldo e validade iguais, sem UPDATE/DELETE direto, duas mudanças concorrentes terminam com um local atual coerente com o maior `seq`.
- **Vitest (228):** mensagens conhecidas (cada uma existe nas migrações), criação, recusa, desativação, só leitura, mudança com confirmação e mesmo identificador, tentativa pendente (conexão mantém; recusa e sucesso apagam), gateway. O teste 16 de textos proibidos passou.
- **E2E (14 no total):** `locations.spec.mjs` — criar locais, nome repetido recusado, mudar de local (nome definido na tela, divergência confirmada, "local:" na linha, saldo e validade iguais, desativado não aparece como destino) e membro só lê.
- lint, typecheck, format e build ok. Capturas: `/mnt/project-files/capturas-fase-06-9/`.
- `scripts/catalog-fixture.mjs`: a limpeza passou a deixar locais e eventos de local (como o histórico), pois `service_role` só lê.

## Limites conhecidos

- **Local inicial:** o desenho previa local opcional no recebimento e na manipulação. Para não mudar as assinaturas de `receive_batch` e `handle_container` (já usadas por telas, testes e tentativas pendentes), o local do recebimento é registrado logo depois, por "Mudar de local" (duas operações, não uma). Só o derivado herda o local na mesma transação.
- **A etiqueta em PDF não mostra o local** (não pedido; mudar o PDF mudaria o texto desenhado e o teste 16).
- **Identificadores:** as outras funções de escrita não conferem o `intent_id` contra `location_moves` (a conferência é só de `move_container` contra elas). A tela gera UUIDs aleatórios; o risco é teórico.
- Sem histórico de locais na tela (os eventos existem no banco, com autoria); sem "mover vários de uma vez".
- Nome do local não é editável (desativar e criar outro).

## Pontos para luis decidir

1. **Local inicial em segunda operação** (limite acima) em vez de novo parâmetro em `receive_batch`/`handle_container`.
2. **Divergência exige confirmação** (e fica registrada) em vez de só avisar.
3. **Anulação de manipulação recusada** depois que um derivado mudou de local (herança não conta).
4. **Só o proprietário** cria, desativa e muda de local (D-019), como no resto do piloto.

## Decisão proposta para `DECISOES.md`

**D-046 — Locais de armazenamento e mudança de local (proposta):** locais por unidade (nome único, condição, ativo; criados e desativados pelo proprietário, nunca apagados) e eventos imutáveis de mudança de local com autoria; o local atual é o evento de maior `seq`; mudar de local não altera saldo, validade nem conservação; derivado herda o local da origem; recipiente sem saldo ou bloqueado não muda de local; divergência de condição exige confirmação registrada. **Revisar quando** o piloto pedir local na etiqueta, local inicial no recebimento ou histórico de locais na tela.

## Próximo passo

Aceite de luis dos 4 pontos e da D-046. Sem merge sem pedido dele. A 6.10 (trilha pré-piloto, sem tela) exige aprovação própria.
