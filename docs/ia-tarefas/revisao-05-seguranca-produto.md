# Tarefa: Revisão 05 — segurança, testes, manutenção e produto

- **ID:** revisao-05-seguranca-produto
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Revisar projeto e propor melhorias")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** revisar segurança (RLS, multiempresa, validação), bugs, organização, escalabilidade, testes e ideia de MVP; registrar relatório em `docs/REVISAO_05_SEGURANCA_PRODUTO.md`; publicar somente correções seguras com testes em PR rascunho, sem merge e sem alterar comportamento de produto sem decisão do usuário.
- **Branch / worktree / base:** `claude/revisao-05-seguranca-produto`, a partir de `origin/main` em `4c39e9f`.
- **Arquivos e recursos em uso:** nova migração e rollback de endurecimento, novo `supabase/tests/security_guard.test.sql`, workflow de CI, este registro, `IA_ESTADO.md` (uma linha) e o relatório. Não toca componentes nem migrações existentes.
- **Dependências e riscos:** Codex trabalha em paralelo na `main`; PR #1 em rascunho não é alterado. A migração recria `private.record_movement` (mesma lógica, consulta de saldo com filtro de escopo) — conflita com qualquer outra alteração simultânea dessa função.
- **Próximo passo:** ver último checkpoint.

## Checkpoints

### 12/11/2026 15:20 UTC — Claude Code
- **Planejado / feito:** leitura de AGENTS, coordenação, estado, decisões, migrações, testes e adaptadores. Gates atuais executados na `main` (`4c39e9f`) antes de qualquer alteração.
- **Alterações e commits:** nenhuma ainda.
- **Testes:** `npm run lint`, `npm run typecheck`, `npm run test` (76), `npm run build`: sucesso. `supabase test db`: 118 verificações, sucesso. `npm run test:integration`: 13, sucesso. `playwright test` (config local com Chromium do container): 3, sucesso.
- **Estado do ambiente:** container efêmero; Supabase local iniciado manualmente.
- **Pendências / riscos:** nenhuma.
- **Próximo passo:** escrever teste de guarda de segurança (falhando primeiro) e migração de correção.

### 12/11/2026 15:45 UTC — Claude Code
- **Planejado / feito:** guarda pgTAP escrita primeiro (33/37; 4 falhas de nome invisível reproduzidas); migração de endurecimento (CHECK de nome visível em organização e unidade; soma de saldo de `record_movement` com filtro de escopo); job de CI `banco-api-e2e`; relatório `REVISAO_05_SEGURANCA_PRODUTO.md`.
- **Alterações e commits:** ver PR rascunho da branch `claude/revisao-05-seguranca-produto`.
- **Testes:** `npm run db:reset` + `npm run test:db`: 155, sucesso. `npm run test:integration`: 13, sucesso. `playwright test`: 3, sucesso. `lint`, `typecheck`, `test` (76), `format:check`: sucesso. Advisors de segurança: sem ocorrências. Rollback e reaplicação local: sucesso. Benchmark de baixa com 200 mil eventos: 19,05 ms → 0,30 ms.
- **Estado do ambiente:** nenhum efeito fora do container efêmero.
- **Pendências / riscos:** job novo da CI ainda não executado no GitHub. Propostas P3–P9 e itens de produto aguardam decisão do usuário. Se outra sessão alterar `private.record_movement`, reconciliar com a linha alterada aqui.
- **Próximo passo:** conferir o resultado da CI no PR e aguardar aceite.
