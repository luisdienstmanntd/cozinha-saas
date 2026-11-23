# Tarefa: Entrar só depois que o Sair termina

- **ID:** sair-antes-de-entrar
- **Responsável / sessão:** Claude Code (thread "Revisar projeto e propor próximos passos")
- **Estado:** em_andamento (segunda correção em PR próprio)
- **Objetivo e aceite:** depois de tocar em Sair, o botão Entrar fica desativado até o servidor confirmar a saída, para que a resposta atrasada do Sair não encerre a sessão de quem entra em seguida no mesmo aparelho. Aceite: teste novo falha sem a correção e passa com ela; bateria inteira verde na CI, sem enfraquecer testes; E2E `locations.spec.mjs:152` verde.
- **Branch / worktree / base:** `claude/sair-antes-de-entrar`, base `main` `209f93f`.
- **Arquivos e recursos em uso:** `src/features/identity/components/IdentityHome.tsx` (só o botão Sair e o Entrar), `IdentityHome.test.tsx`, `docs/TESTES_QUALIDADE.md`, este registro.
- **Dependências e riscos:** o PR #68 do Codex também altera `IdentityHome.tsx`, em outros trechos (botão Atualizar acesso e áreas da unidade); conflito, se houver, é mecânico. Sem banco, RLS ou migração.
- **Próximo passo:** CI do PR; merge só com aval de luis (publica o site).

## Checkpoints

### 23/11/2026, 00:20 UTC — Claude Code
- **Planejado / feito:** a CI da `main` (`209f93f`, depois do #66) falhou duas vezes seguidas no E2E `locations.spec.mjs:152` ("membro vê os locais"): depois de recarregar, o proprietário toca em Sair e o colaborador entra em seguida; o botão "Abrir Cozinha principal" não aparece. O mesmo teste já tinha falhado uma vez no #64. Causa provável, pelo código: o Sair limpa a tela e libera o formulário antes de `signOut` responder; se o colaborador entra antes, a resposta do Sair (evento `SIGNED_OUT` do Supabase) limpa a sessão nova. Correção: estado `signingOut` que mantém Entrar desativado (e o envio ignorado) até `signOut` terminar, com sucesso ou erro.
- **Alterações e commits:** `IdentityHome.tsx` (+8/−1), teste novo em `IdentityHome.test.tsx`.
- **Testes:** o teste novo falhou sem a correção e passou com ela. Local: lint, typecheck, `format:check`, Vitest 635/635. E2E e banco não sobem nesta nuvem (o proxy bloqueia as imagens do Supabase); ficam com a CI.
- **Estado do ambiente:** nada alterado no Supabase hospedado.
- **Pendências / riscos:** a causa não foi reproduzida em navegador local; a CI do PR é a prova.
- **Próximo passo:** acompanhar a CI do PR.

### 23/11/2026, 01:00 UTC — Claude Code
- **Feito:** #71 mesclado com aval de luis (`6255a8a`), mas o E2E continuou falhando na `main`. Com um diagnóstico temporário (branch `claude/diagnostico-e2e-locais`, não mesclada), 3 de 3 execuções mostraram o colaborador sendo tirado com "Sessão encerrada por inatividade". Causa real: resposta 401 `SESSION_EXPIRED` atrasada, de uma requisição feita com o token do proprietário que já saiu, encerrava a sessão nova.
- **Correção:** branch `claude/expiracao-token-antigo`: `sessionFetch.ts` passa o token Bearer da requisição recusada; `supabaseIdentity.ts` ignora a recusa quando o token não é o da sessão atual (sem token, mantém o comportamento anterior).
- **Testes:** teste novo de `supabaseIdentity` falhou sem a correção e passou com ela; lint, typecheck, `format:check`, Vitest 637/637. E2E pela CI.
- **Próximo passo:** CI do PR repetida; merge só com aval de luis.
