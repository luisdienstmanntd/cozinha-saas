# Tarefa: Fase 6, fatia 6.3 — manipulação no banco

- **ID:** fase-06-3-manipulacao
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Implementar fatia 6.3 (manipulação no banco)")
- **Estado:** em_andamento
- **Objetivo e aceite:** seção 10 (6.3) de `FASE_06_DESENHO.md` (PR #3): `container_handlings`, `'transfer'`, FKs e únicos da 4.2 e 4.3; `handle_container` com a ordem de verificações da seção 5, `handled_at` com janela de 2 horas (fora dela, recusado nesta fatia), regra da sobra, `handled_by` com nome; `memberships.display_name` e `set_member_display_name`; front-end aceita `'transfer'` na leitura; brief atualizado. Aceite: testes 3 a 8, 10, 17, 18, 19 (manipulação) e 20 da seção 8; nenhuma tela de manipulação.
- **Branch / worktree / base:** `claude/fase-06-3-manipulacao`, a partir de `claude/fase-06-2-painel-saldo` (`0d8ad00`, PR #9). Ordem de integração: PR #2 → #5 → #6 → #7 → #8 → #9 → este.
- **Arquivos e recursos em uso:** migração `supabase/migrations/20261113070000_container_handling.sql` e rollback `supabase/rollback/container_handling.sql`; `supabase/tests/container_handling.test.sql` (novo); ajustes de lista fixa em `security_guard.test.sql`, `container_balance.test.sql` e fixtures de derivado em `container_balance.test.sql` e `list_containers.test.sql`; `tests/integration/container-handling.test.mjs` (novo); `src/features/movements`; `docs/FASE_06_3.md`, `docs/PRODUCT_BRIEF.md`.
- **Dependências e riscos:** PRs #2, #5, #6, #7, #8 e #9 sem merge; Codex trabalha na `main` (não tocar em `DECISOES.md`; decisões novas propostas em `FASE_06_3.md`).
- **Próximo passo:** migração e testes.

## Checkpoints

### 13/11/2026 13:10 UTC — Claude Code
- **Feito:** leitura do desenho (4.1–4.5, 5, 6, 8, 10), da revisão cruzada, de `FASE_06_1.md` e `FASE_06_2.md`; ambiente local (Node 24, Docker, Supabase); bateria da base verde (`test:db` 447, integração 17/17).
- **Próximo passo:** escrever pgTAP da manipulação e a migração.
