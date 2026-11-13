# Tarefa: Fase 6, fatia 6.1 — saldo por recipiente

- **ID:** fase-06-1-saldo-recipiente
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Implementar fatia 6.1")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** seção 10 (6.1) de `FASE_06_DESENHO.md` (PR #3) e B-1/B-3/I-5/I-7/I-14 de `REVISAO_CRUZADA_FASE_06.md` (PR #4). Sem mudança de fluxo; conservação verdadeira para os dados existentes; proteção do histórico verificada ao fim da migração; casos de `movements.test.sql` repetidos com recipiente derivado; `short_code` sem repetição sob concorrência; rollback recusa com derivados.
- **Branch / worktree / base:** `claude/fase-06-1-saldo-recipiente`, a partir de `claude/fase-06c-fuso-auditoria` (`7c80e61`, PR #7). Ordem de integração: PR #2 → #5 → #6 → #7 → este.
- **Arquivos e recursos em uso:** nova migração `supabase/migrations/20261113050000_container_balance.sql` e rollback `supabase/rollback/container_balance.sql`; `supabase/tests/container_balance.test.sql` (novo), `security_guard.test.sql` e `history_append_only.test.sql` (adaptações); `tests/integration/container-balance.test.mjs` (novo); `src/features/batches/data/supabaseBatches.ts`, `src/features/movements/data/supabaseMovements.ts`; `docs/FASE_06_1.md`.
- **Dependências e riscos:** PRs #2, #5, #6, #7 sem merge; Codex trabalha na `main` (não tocar em `DECISOES.md`, decisão proposta vai em `FASE_06_1.md`). Backfill sob append-only pela estratégia A (B-1).
- **Próximo passo:** aceite de luis; sem merge antes dos PRs #2, #5, #6 e #7.

## Checkpoints

### 13/11/2026 02:55 UTC — Claude Code
- **Planejado / feito:** leitura do desenho, da revisão cruzada, das 6.0a–6.0c e do código atual. Ambiente: Node 24, Docker e Supabase local; `npm run test:db` na base: 282 PASS.
- **Alterações e commits:** este registro.
- **Testes:** só a linha de base acima.
- **Pendências / riscos:** nenhuma ainda.
- **Próximo passo:** testes pgTAP e de integração da 6.1.

### 13/11/2026 03:40 UTC — Claude Code
- **Planejado / feito:** testes escritos e vistos falhando sem a migração (pgTAP, guarda, integração, Vitest); migração `20261113050000_container_balance.sql` com backfill pela estratégia A e verificação final de proteção e conservação; rollback `container_balance.sql` (recusa com derivado); gateways da interface filtrando o integral; `FASE_06_1.md` com D-037 proposta.
- **Alterações e commits:** branch `claude/fase-06-1-saldo-recipiente`; ver `git log`.
- **Testes:** backfill em banco com 6.042 recebimentos e 26.818 movimentos: 0 problema de conservação, dados anteriores idênticos; rollback com dados + bateria da 6.0c (282 e 15/15) verde; reaplicação determinística; `db:reset` + `test:db` 371 PASS; integração 16/16 duas vezes; Playwright 3/3; Vitest 78/78; lint, typecheck, format, build ok; advisors (warn) limpos. Detalhes em `FASE_06_1.md`.
- **Estado do ambiente:** banco local da nuvem descartável; nada fora dele.
- **Pendências / riscos:** ID do recipiente aparece desde o recebimento (única diferença visível, decisão de luis); colunas de manipulação ficam para a 6.3.
- **Próximo passo:** aceite de luis.
