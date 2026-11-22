# Estado compartilhado entre assistentes

Leia `COORDENACAO_IA.md` antes de alterar o projeto. Este índice é uma fotografia, não um bloqueio nem garantia de atualidade. Confira sempre o Git e o GitHub; cada tarefa mantém detalhes e checkpoints próprios em `ia-tarefas/`. Para evitar conflitos, edite apenas a linha da tarefa e o resumo necessários, preservando registros de outras sessões.

## Situação verificada em 13/11/2026

- Com autorização de luis (13/11/2026), os PRs #1 a #12 foram integrados na `main` com commits de merge, na ordem #2, #1, #3, #4, #5 a #12. Os conflitos foram só em `DECISOES.md` e `IA_ESTADO.md`, conciliados mantendo as duas entradas. D-034 a D-041 passaram dos registros das fatias para `DECISOES.md`.
- Branches novas partem da `main`. A Fase 5 do Codex (anulação de movimentações) foi aceita por luis em 12/11/2026.

## Situação verificada em 10/11/2026

- A anulação auditável de movimentações foi publicada na `main` em `f831e22`; a coordenação foi adicionada em `8cbc9b8`. O incremento de anulação foi entregue para aceite humano; não há aceite posterior registrado nesta conversa. Evidências e limitações: `FASE_05_PLANO.md`.
- O [PR #1](https://github.com/luisdienstmanntd/cozinha-saas/pull/1), branch `claude/revisao-interface-unidades`, estava em rascunho e fora da `main`. A integração funcional passou pelos testes em `103f63a`; as instruções de coordenação foram incorporadas à branch em `605f31a`. Confira o HEAD remoto, pois outros commits podem existir. Ver relatório da própria branch `docs/REVISAO_INTERFACE_UNIDADES.md`. A integração requer a decisão/aceite humano aplicável. Criação de unidades ainda não é idempotente e a recarga pode descartar formulários não enviados.
- Havia um worktree separado em `D:/codex-cozinha-revisao` para o PR. `stash@{0}` na cópia principal é um rascunho anterior da fase 03D: preservar, não aplicar nem apagar automaticamente. Caminhos e existência devem ser reconfirmados em cada máquina.
- Pendências de produto antes do piloto incluem recuperação de tentativas após fechamento da aba, saldo pela rota QR, teste físico de etiqueta e condições operacionais descritas no plano da fase. Não presumir que são autorização para iniciar outra fase.

## Tarefas registradas

| Tarefa | Responsável / estado | Referência | Próximo passo |
|---|---|---|---|
| Acabamento profissional da interface (sem avisos de teste ou detalhes internos) | Codex; aceite visual de luis em 22/11/2026; PR #66 pronto para revisão, empilhado sobre o PR #56 | `ia-tarefas/cozzigo-interface-final.md`, D-074 | Revisão do PR; sem merge/produção sem autorização específica. |
| Anulação auditável de movimentações | Codex; aguardando aceite | `ia-tarefas/fase-05-anulacao.md` | Confirmar aceite humano antes da próxima fase. |
| Revisão de interface e unidades | Claude Code e Codex; integrada na `main` em 13/11/2026 (PR #1) | `ia-tarefas/revisao-interface-unidades.md` | Nenhum. |
| Desenho da Fase 6 | Claude Code; aprovado para planejamento e integrado na `main` em 13/11/2026 (PR #3) | `ia-tarefas/fase-06-desenho.md` | Seguir a ordem da seção 10; cada fatia exige aceite próprio. |
| Revisão cruzada da Fase 6 | Claude Code; B-1 a B-3 decididos por luis e incorporados ao desenho; integrada em 13/11/2026 (PR #4) | `ia-tarefas/revisao-cruzada-fase-06.md` | Nenhum. |
| Coordenação entre assistentes | Codex; concluída | `ia-tarefas/coordenacao-assistentes.md` | Consultar o protocolo e iniciar um registro para cada nova tarefa. |
| Revisão 05 — segurança, testes e produto | Claude Code; aceita e integrada na `main` em 13/11/2026 (PR #2) | `ia-tarefas/revisao-05-seguranca-produto.md` | Propostas P3, P5 e P6 executadas nas fatias 6.0a a 6.0c; demais seguem no desenho. |
| Fase 6, fatia 6.0a — proteção do histórico (P5) | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #5, D-034) | `ia-tarefas/fase-06a-protecao-historico.md` | Nenhum. |
| Fase 6, fatia 6.0b — RLS por conjunto (P3) | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #6, D-035) | `ia-tarefas/fase-06b-rls-por-conjunto.md` | Nenhum. |
| Fase 6, fatia 6.0c — fuso imutável e auditoria (P6) | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #7, D-036) | `ia-tarefas/fase-06c-fuso-auditoria.md` | Nenhum. |
| Fase 6, fatia 6.1 — saldo por recipiente | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #8, D-037) | `ia-tarefas/fase-06-1-saldo-recipiente.md` | Nenhum. |
| Fase 6, fatia 6.2 — painel e QR com saldo | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #9, D-038) | `ia-tarefas/fase-06-2-painel-saldo.md` | Nenhum. |
| Fase 6, fatia 6.3 — manipulação no banco | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #10, D-039) | `ia-tarefas/fase-06-3-manipulacao.md` | Nenhum. |
| Fase 6, fatia 6.4 — anulação de manipulação no banco | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #11, D-040) | `ia-tarefas/fase-06-4-anulacao.md` | Nenhum. |
| Fase 6, fatia 6.5a — conservação, temperatura e ocorrências no banco | Claude Code; aceita por luis e integrada na `main` em 13/11/2026 (PR #12, D-041) | `ia-tarefas/fase-06-5a-conservacao.md` | Nenhum. |
| Fase 6, fatia 6.5b — recebimento com conservação e temperatura, decisão de ocorrência e bloqueio na interface | Claude Code; aceita por luis em 13/11/2026 com a D-042 (PR #13 rascunho sobre a `main`, sem merge) | `ia-tarefas/fase-06-5b-recebimento-ui.md` | Merge só com pedido de luis; 6.6 exige aprovação própria. |
| Fase 6, fatia 6.6 — telas de abrir, porcionar e anular, QR com origem e derivados | Claude Code; aceita por luis em 13/11/2026 com a D-043 (PR #14, integrada na `main` em 13/11/2026) | `ia-tarefas/fase-06-6-telas-manipulacao.md` | Nenhum. |
| Fase 6, fatia 6.7 — etiquetas de recebimento e de produto aberto (PDF) | Claude Code; aceita por luis em 14/11/2026 com a D-044 (PR #15 rascunho sobre a `main`, sem merge) | `ia-tarefas/fase-06-7-etiquetas.md` | Merge só com pedido de luis. |
| Fase 6, fatia 6.8 — recuperação de tentativa (`find_operation`, faixa de conferência) e acesso tolerante | Claude Code; aceita por luis em 14/11/2026 com a D-045 (PR #16 em rascunho sobre a branch do PR #15) | `ia-tarefas/fase-06-8-recuperacao-tentativa.md` | Sem merge sem pedido de luis; 6.9 aprovada, em andamento. |
| Fase 6, fatia 6.9 — locais de armazenamento e mudança de local | Claude Code; aceita por luis em 14/11/2026 com a D-046 (PR #17 em rascunho sobre a branch do PR #16) | `ia-tarefas/fase-06-9-locais.md` | Sem merge sem pedido de luis; 6.10 aprovada, em andamento. |
| Fase 6, fatia 6.10 — trilha pré-piloto (provisionamento local, autenticação hospedada documentada, métricas, dados pessoais) | Claude Code; aprovada por luis em 14/11/2026 ("6.10 aprovado"); aceita por luis em 14/11/2026 com a D-047 (PR #18 em rascunho sobre a branch do PR #17) | `ia-tarefas/fase-06-10-pre-piloto.md` | Sem merge sem pedido de luis; Q10 (conferência normativa) pendente. |
| Fase 6, fatia 6.11 — consumo de vencido recusado, faixa VENCIDO e métricas do piloto | Claude Code; aceita por luis em 14/11/2026 com a D-048 (PR #20 em rascunho sobre a branch do PR #18) | `ia-tarefas/fase-06-11-vencido-metricas.md` | Sem merge sem pedido de luis; Q10 pendente. |
| Fase 7 — desenho da etiqueta de preparação própria (D-049 aceita, altera D-028) | Claude Code; desenho e D-049 aceitos por luis em 14/11/2026 (PR #19 rascunho sobre a branch do PR #18, sem merge) | `ia-tarefas/fase-07-preparacoes-desenho.md` | 7.1 só com aprovação própria e depois da 6.11 integrada; sem merge sem pedido de luis. |
| Fase 7, fatia 7.1 — preparação própria no banco (D-050 aceita) | Claude Code; aceita por luis em 14/11/2026, 15:50 UTC; PR #21 mesclado na `main` a pedido de luis (15:57 UTC) | `ia-tarefas/fase-07-1-producao-banco.md` | Concluída. |
| Fase 7, fatia 7.2 — anular produção no banco (D-051 aceita) | Claude Code; aceita por luis em 14/11/2026, 16:10 UTC (PR #22 rascunho sobre a `main`, sem merge) | `ia-tarefas/fase-07-2-anular-producao.md` | 7.3 autorizada por luis em 14/11/2026; sem merge sem pedido de luis. |
| Fase 7, fatia 7.3 — tela de produção da cozinha (D-052 aceita) | Claude Code; aceita por luis em 14/11/2026, 16:30 UTC (PR #23 rascunho sobre a branch do PR #22, sem merge) | `ia-tarefas/fase-07-3-producao-tela.md` | 7.4 autorizada; sem merge sem pedido de luis. |
| Fase 7, fatia 7.4 — etiqueta PDF "Preparação própria" (D-053 aceita) | Claude Code; aceita por luis em 14/11/2026, 16:41 UTC (PR #24 rascunho sobre a branch do PR #23, sem merge) | `ia-tarefas/fase-07-4-etiqueta-preparacao.md` | 7.5 autorizada; impressão física e RT são pendências do piloto. |
| Fase 7, fatia 7.5 — porcionar preparação e métricas de produção (D-054 aceita) | Claude Code; aceita por luis em 14/11/2026, 16:53 UTC (PR #25 em rascunho sobre a branch do PR #24) | `ia-tarefas/fase-07-5-porcionar-preparacao.md` | 7.6 a 7.9 exigem aprovação própria; sem merge sem pedido de luis. |
| Fase 7, fatia 7.6 — configurações da unidade (D-055 aceita com restrição) | Claude Code; aceita por luis em 14/11/2026, 20:30 UTC (PR #26 em rascunho sobre a branch do PR #25) | `ia-tarefas/fase-07-6-configuracoes-unidade.md` | 7.7 a 7.9 exigem aprovação própria; sem merge sem pedido de luis. |
| Fase 7, fatia 7.7 — janela de registro por preparação (D-056 aceita) | Claude Code; aceita por luis em 14/11/2026, 20:47 UTC (PR #27 em rascunho sobre a branch do PR #26) | `ia-tarefas/fase-07-7-janela-por-preparacao.md` | 7.8 e 7.9 exigem aprovação própria; sem merge sem pedido de luis. |
| Correção dos testes pgTAP instáveis (handling_void 26, list_containers 38) | Claude Code; autorizada por luis em 14/11/2026, 20:47 UTC (PR #28 em rascunho sobre a main) | `ia-tarefas/corrige-testes-instaveis.md` | Sem enfraquecer teste nem mudar regra; causas e soluções em `TESTES_QUALIDADE.md`. |
| Fase 7, fatia 7.8 — aviso de produção sem etiqueta (D-057 aceita) | Claude Code; aceita por luis em 14/11/2026, 21:20 UTC (PR #29 em rascunho sobre a branch do PR #27) | `ia-tarefas/fase-07-8-aviso-sem-etiqueta.md` | 7.9 autorizada; sem merge sem pedido de luis. |
| Fase 7, fatia 7.9 — temperatura opcional da produção (D-058 aceita) | Claude Code; aceita por luis em 14/11/2026, 21:42 UTC (PR #30 em rascunho sobre a branch do PR #29) | `ia-tarefas/fase-07-9-temperatura-opcional.md` | Relatório de encerramento em `FASE_07_ENCERRAMENTO.md`; sem merge sem pedido de luis. |
| Revisão visual e de uso da interface após a Fase 7 | Claude Code; aguardando aceite de luis (PR em rascunho sobre a branch do PR #30, só documentação) | `ia-tarefas/revisao-visual-fase-07.md` | luis escolhe as fatias V1 a V5; cada uma exige aprovação própria. |
| V2 — sessão persistente com inatividade de 30 min (D-059 aceita) | Claude Code; aceita por luis em 16/11/2026, CI verde (PR #32 em rascunho sobre a branch do PR #31) | `ia-tarefas/v2-sessao-persistente.md` | V1 autorizada; sem merge sem pedido. |
| V1 — navegação por áreas (D-060 aceita) | Claude Code; aceita por luis em 16/11/2026, CI verde (PR #33 em rascunho sobre a branch do PR #32) | `ia-tarefas/v1-navegacao.md` | V3 autorizada em outra thread; V4 e V5 só com aprovação própria; sem merge sem pedido. |
| V3 — lista de validade legível (D-061 aceita) | Claude Code; aceita por luis em 16/11/2026, 12:43 UTC; tecnicamente encerrada com CI verde (PR #34 em rascunho sobre a branch do PR #33; inclui a correção do PR #35) | `ia-tarefas/v3-lista-validade.md` | Proposta da V4 no PR #36, sem implementar; V5 só com aprovação própria; sem merge sem pedido. |
| Correção do teste pgTAP dependente do horário (`container_handling`, teste 69) | Claude Code; aprovada tecnicamente por luis em 16/11/2026, 12:43 UTC (PR #35 em rascunho sobre a `main`; mesmo commit levado à branch da V3, PR #34) | `ia-tarefas/corrige-teste-manipulacao-meia-noite.md` | Revisão de luis; sem merge sem pedido de luis. |
| V4 — acabamento visual (proposta) | Claude Code; proposta aprovada por luis em 16/11/2026, 13:10 UTC (D-062) | `ia-tarefas/v4-proposta.md` | Implementação na tarefa abaixo. |
| V4 — acabamento visual (implementação, D-062 aceita) | Claude Code; aceita por luis em 16/11/2026, 21:10 UTC, CI verde (PR #37 em rascunho sobre a branch do PR #36) | `ia-tarefas/v4-acabamento-visual.md` | Sem merge nem deploy sem autorização específica de luis; V5 (vírgula decimal) autorizada, em outra thread. |
| V5 — vírgula decimal nas quantidades (D-063 aceita) | Claude Code; aceita por luis em 16/11/2026, 22:08 UTC, CI verde (PR #38 em rascunho sobre a branch do PR #37) | `ia-tarefas/v5-virgula-decimal.md` | Sem merge nem deploy sem autorização específica de luis. |
| V5B — exibição com vírgula e temperatura do recebimento (proposta aprovada) | Claude Code; proposta aprovada por luis em 16/11/2026, 22:40 UTC (D-064) | `ia-tarefas/v5b-proposta.md` | Implementação na tarefa abaixo. |
| V5B — exibição com vírgula e temperatura do recebimento (implementação, D-064) | Claude Code; aceita por luis em 17/11/2026, 13:17 UTC, com correção de redação sobre `toFixed(3)` (PR #39 em rascunho sobre a branch do PR #38); etapa V1–V5B encerrada | `ia-tarefas/v5b-exibicao-virgula.md` | Revisão técnica integrada (tarefa abaixo); sem merge nem deploy sem autorização. |
| Revisão técnica integrada (somente análise) | Claude Code; aguardando decisão de luis (PR em rascunho sobre a branch do PR #39, só documentação) | `ia-tarefas/revisao-tecnica-integrada.md` | luis decide integração, MFA, nome, reversões, homologação e achados; sem merge nem deploy. |
| Plano de integração dos PRs e Fase 8 (D-065) | Claude Code; ACEITO por luis em 17/11/2026, 13:59 UTC (PR #41 em rascunho sobre a branch do PR #40, só documentação) | `ia-tarefas/plano-integracao.md` | Fatia 8.1 antes da integração; depois do aceite da 8.1, primeiro lote só o PR #28; demais lotes com autorização específica; sem merge nem deploy. |
| Fatia 8.1 — estabilização da CI e do E2E (D-066) | Claude Code; ACEITA por luis em 17/11/2026, 15:16 UTC; #42 integrado (`0685ffc`), #43 aguarda o #39; #28 integrado (`1acf671`) | `FASE_08_1.md`, `PROTECAO_MAIN_PROPOSTA.md`, `ia-tarefas/plano-integracao.md` |
| Fase 8, fatia 8.4a — modo hospedado e ambiente de testes (D-067 aceita) | Claude Code; aceita definitivamente por luis em 18/11/2026, 02:46 UTC; PR #44 integrado na `main` (`d05a6e7`, CI verde). Nada aplicado no Supabase hospedado; sem deploy | `ia-tarefas/fase-08-4a-hospedagem-testes.md`, `FASE_08_4A.md` | Configuração do Supabase passo a passo com luis; migrações e primeiro deploy só com autorização específica. |
| Fase 8, fatias 8.4b e 8.4c — identidade CozziGo, etiquetas no hospedado e procedimento de migração | Claude Code; #46 (identidade) e #47 (`VITE_APP_URL`, etiquetas) integrados na `main` em 18/11/2026 (`f525cc8`) com autorização de luis; procedimento de migração apenas documentado. Nada aplicado no Supabase hospedado; sem deploy | `FASE_08_4B.md`, `FASE_08_4C_MIGRACAO_HOSPEDADA.md` | luis autoriza a migração e, em separado, o primeiro deploy; antes, adicionar `VITE_APP_URL` no Cloudflare. |
| Fase 8, fatia 8.4d — validação de isolamento e sessões no hospedado | Claude Code; PR #50 mesclado (7d664d5); script revisado após os 9 pontos de luis (conteúdo por linha, parada imediata, papéis/unidades, payloads válidos, 21 tabelas anônimas, JWT com bytes alterados, finally + logout local) e aguardando nova revisão; script ainda NÃO executado no hospedado. Migrações aplicadas e `rls_auto_enable` ajustada em 18/11/2026 | `FASE_08_4D_VALIDACAO_ISOLAMENTO.md`, `FASE_08_4C_MIGRACAO_HOSPEDADA.md` | luis cria 3 contas fictícias, executa o SQL do passo 2 e, depois de revisar o PR, roda o script na máquina dele. |
| Fase 8, fatia 8.4e — hospedagem de testes no ar | Claude Code; PR de documentação; luis fez o deploy manual em 18/11/2026 | `FASE_08_4E_HOSPEDAGEM_ONLINE.md` | Projeto Cloudflare oficial `cozinha-saas`, https://cozinha-saas.pages.dev; cada merge na `main` publica o site automaticamente e os previews de branch estão ativos, então cada merge exige autorização de luis. Próximo: luis roda `validate-isolation.mjs --wait-inactivity` (ver "Onde paramos" no relatório); luis passou a trabalhar na interface/visual. |

Novas tarefas devem ter IDs distintos e arquivo próprio, criados a partir de `ia-tarefas/MODELO.md`. Se duas branches tiverem atualizado este índice, concilie as duas entradas; não escolha uma versão descartando a outra.

## Interface operacional — 18/11/2026

- Codex, implementação local verificada em `codex/interface-operacional`, na base `7d664d5`. E2E autenticado bloqueado pelo ambiente. [Registro](ia-tarefas/interface-operacional.md).

## Identidade CozziGo — 18/11/2026

- Comparativo de seis telas e roadmap concluídos localmente em `codex/cozzigo-proposta-visual`, com fundações, logomarca e favicon implementados localmente em `codex/cozzigo-fundacoes`. E2E autenticado bloqueado pelo armazenamento do Docker. [Registro](ia-tarefas/cozzigo-identidade-visual.md).

## Submenu de Cadastros

- Implementação local verificada em `codex/submenu-cadastros`; E2E autenticado pendente. [Registro](ia-tarefas/submenu-cadastros.md).

## Redesign estrutural

- Mesa operacional implementada localmente, E2E autenticado pendente, na branch `codex/mesa-operacional`. [Registro](ia-tarefas/redesign-estrutural.md).

## Correção do E2E da Mesa operacional — 21/11/2026

- Claude Code, branch `claude/correcao-e2e-mesa-operacional` sobre o PR #54. Corrige as 24 falhas de E2E da CI sem mudar o escopo da D-070; aguarda CI e aceite. [Registro](ia-tarefas/correcao-e2e-mesa-operacional.md).

## UX compras e cozinha — 21/11/2026

- Codex, aguardando aceite no PR #56, em `codex/ux-compras-cozinha`, base `820f77d`. Revisão e melhorias de navegação, pré-requisitos e formulários, sem backend. [Registro](ia-tarefas/ux-compras-cozinha.md).

## V6 — filtrar Validades pelos contadores (implementação) — 22/11/2026

- Claude Code. Proposta aprovada por luis (PR #57). Só interface, sem migração. CONCLUÍDA: integrada na `main` em 22/11/2026 (PR #59, `2f4f9bd`), com merge e publicação autorizados por luis. [Registro](ia-tarefas/v6-filtro-validades.md).


## Backlog — baixa manual de insumos — 22/11/2026

- Claude Code, branch `claude/backlog-baixa-manual-insumos`. Só documentação: `BACKLOG_BAIXA_MANUAL_INSUMOS.md` e D-073 proposta. Nada implementado; aguarda aceite de luis. [Registro](ia-tarefas/backlog-baixa-manual-insumos.md).

## Auditoria — baixa manual de insumos (D-073, etapa 1) — 22/11/2026

- Claude Code, branch `claude/auditoria-baixa-manual`. Só documentação: `AUDITORIA_BAIXA_MANUAL.md`. Banco já cobre consumo e descarte; lacunas na interface (derivados sem "Registrar saída"). CONCLUÍDA: aceita por luis e integrada na `main` em 22/11/2026 (PR #67). [Registro](ia-tarefas/auditoria-baixa-manual.md).

## D-073, etapa 2 — baixa manual em qualquer recipiente — 22/11/2026

- Claude Code, branch `claude/baixa-manual-recipiente`. Só interface, sem migração: saída e histórico em porções/derivados, mensagem de saldo insuficiente, aviso de esgotado, E2E do peito de peru. CONCLUÍDA: aceita por luis e integrada na `main` em 22/11/2026 (PR #69), com publicação do site autorizada. [Registro](ia-tarefas/baixa-manual-etapa2.md).
