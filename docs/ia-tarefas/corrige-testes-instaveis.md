# Tarefa: corrigir dois testes pgTAP instáveis

- **ID:** corrige-testes-instaveis
- **Responsável / sessão:** Claude Code (conversa "Desenhar etiqueta de preparação própria")
- **Estado:** correção pronta, aguardando revisão de luis
- **Objetivo e aceite:** tornar determinísticos `handling_void.test.sql` (teste 26) e `list_containers.test.sql` (teste 38), sem reduzir o rigor, remover verificações ou alterar regra de negócio. Autorizado por luis em 14/11/2026, 20:47 UTC.
- **Branch / worktree / base:** `claude/corrige-testes-instaveis`, sobre a `main`; a correção também foi integrada à branch da 7.7/7.8 (cadeia #22 a #28) para a CI dela passar.
- **Arquivos e recursos em uso:** `supabase/tests/handling_void.test.sql`, `supabase/tests/list_containers.test.sql`, `docs/TESTES_QUALIDADE.md` (seção "Testes pgTAP instáveis corrigidos").
- **Dependências e riscos:** nenhuma migração nem regra de negócio mudou. Sem merge sem pedido de luis.
- **Próximo passo:** revisão de luis.

## Checkpoints

### 14/11/2026 ~21:40 UTC — Claude Code
- **Causas e soluções:** em `docs/TESTES_QUALIDADE.md`.
- **Testes:** pgTAP 1165 passou 3 vezes seguidas com banco recém-criado na `main` com as correções; o teste 26 deu a mesma sequência em 6 execuções.
- **Próximo passo:** integrar à cadeia e seguir com a 7.8.
