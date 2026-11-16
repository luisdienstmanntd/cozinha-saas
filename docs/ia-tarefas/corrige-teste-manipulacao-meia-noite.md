# Tarefa: corrigir teste pgTAP dependente do horário (manipulação perto da meia-noite)

- **ID:** corrige-teste-manipulacao-meia-noite
- **Responsável / sessão:** Claude Code (conversa "Corrigir teste pgTAP dependente do horário")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** tornar determinístico o teste 69 de `container_handling.test.sql`, que falhava entre 00:00 e 00:10 em São Paulo, sem reduzir o rigor, remover verificações ou alterar regra de negócio. Aprovado por luis em 16/11/2026, em tarefa separada da V3.
- **Branch / worktree / base:** `claude/corrige-teste-manipulacao-meia-noite`, sobre a `main` (mesmo padrão do PR #28).
- **Arquivos e recursos em uso:** `supabase/tests/container_handling.test.sql`, `docs/TESTES_QUALIDADE.md` (seção "Teste pgTAP dependente do horário corrigido").
- **Dependências e riscos:** nenhuma migração nem regra de negócio mudou. `docs/TESTES_QUALIDADE.md` também recebe uma seção no PR #28; se os dois forem integrados, conciliar mantendo as duas seções. Sem merge sem pedido de luis.
- **Próximo passo:** revisão de luis.

## Checkpoints

### 16/11/2026 ~12:30 UTC — Claude Code
- **Causa e solução:** em `docs/TESTES_QUALIDADE.md`.
- **Alterações:** só o teste 69 passa `p_handled_at => now()`, com comentário explicando o motivo.
- **Testes:** na `main` com a correção: lint, typecheck, format:check, Vitest (242), build, pgTAP (1165), advisors de segurança (sem avisos), integração (33) e E2E (15), todos passando.
- **Próximo passo:** revisão de luis; o PR #34 pode ter a CI refeita fora da janela de 00:00 a 00:10 de São Paulo.
