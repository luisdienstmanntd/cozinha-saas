# Tarefa: Fase 6, fatia 6.0b — RLS por conjunto (P3)

- **ID:** fase-06b-rls-por-conjunto
- **Responsável / sessão:** Claude Code (sessão em nuvem, thread "Implementar fatia 6.0b (otimização de RLS)")
- **Estado:** aguardando_aceite (PR em rascunho, sem merge)
- **Objetivo e aceite:** seção 10, fatia 6.0b, de `FASE_06_DESENHO.md` (PR #3): `private.member_organizations(p_owner_only)`; todas as políticas reescritas; `memberships_read` com a regra atual (I-10b). Aceite: teste 12 da seção 8; benchmark antes e depois com 20 mil linhas; nenhuma expectativa de teste alterada; rollback testado; advisors de segurança limpos.
- **Branch / worktree / base:** `claude/fase-06b-rls`, a partir de `origin/claude/fase-06a-protecao-historico` em `f00c7d1` (PR #5, que parte do PR #2; nenhum dos dois mesclado na `main`).
- **Arquivos e recursos em uso:** nova migração `supabase/migrations/20261113030000_rls_set_based.sql` e rollback `supabase/rollback/rls_set_based.sql`; novo `supabase/tests/rls_set_based.test.sql`; novo `supabase/benchmarks/rls_set_based.sql`; `docs/FASE_06B.md`; `IA_ESTADO.md` (uma linha). `DECISOES.md` não foi alterado (D-035 proposta em `FASE_06B.md`).
- **Dependências e riscos:** integrar depois do PR #2 e do PR #5. Codex trabalha em paralelo na `main`; qualquer política nova com `has_membership` falhará no teste novo após a integração.
- **Próximo passo:** ver último checkpoint.

## Checkpoints

### 13/11/2026 02:00 UTC — Claude Code
- **Planejado / feito:** leitura de AGENTS, CLAUDE, coordenação, estado, desenho (seções 6, 8 e 10), revisão 05 (P3) e revisão cruzada (I-10b). luis aprovou o início da 6.0b.
- **Alterações e commits:** branch criada; nenhum commit.
- **Testes:** bateria atual no banco local: `test:db` 198 PASS.
- **Estado do ambiente:** container efêmero.
- **Pendências / riscos:** nenhuma.
- **Próximo passo:** pgTAP novo falhando primeiro, depois migração.

### 13/11/2026 02:40 UTC — Claude Code
- **Planejado / feito:** pgTAP novo (46 verificações), migração, rollback e benchmark versionado.
- **Alterações e commits:** ver PR rascunho da branch `claude/fase-06b-rls` (base `claude/fase-06a-protecao-historico`).
- **Testes:** falha primeiro reproduzida (rollback + `test:db`: 10 de 11 verificações de catálogo falham e o arquivo aborta). Comportamento equivalente com as políticas antigas (26/26). Depois de `db:reset`: `test:db` 244 PASS; advisors de segurança e desempenho sem ocorrências; `lint`, `typecheck`, `format:check`, `build` ok; `test` 76/76; `test:integration` 13/13 e Playwright 3/3, duas vezes; rollback e reaplicação com dados. Benchmark: ~140–180 ms → ~4,5–6,3 ms. CI do GitHub ainda não executada no momento deste checkpoint.
- **Estado do ambiente:** nenhum efeito fora do container efêmero.
- **Pendências / riscos:** aceite de luis; integrar depois do PR #2 e do PR #5.
- **Próximo passo:** aguardar aceite. A 6.0c só começa com aprovação própria.
