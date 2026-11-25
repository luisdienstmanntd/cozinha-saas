# Correção do E2E vermelho na `main` após a proteção de rascunhos (#75)

- **ID:** corrige-rascunho-falso-e2e
- **Responsável / sessão:** Claude Code (nuvem), a pedido de luis em 25/11/2026
- **Estado:** concluida (PR #77 integrado na `main` em 25/11/2026 com aval de luis, merge `74a0863`)
- **Branch / base:** `claude/rascunho-falso-e2e` / `main` `5f0ca12` (merge do #75)
- **Arquivos:** `src/features/identity/application/useUnitDrafts.ts`, `src/features/identity/components/IdentityDrafts.test.tsx`, `tests/e2e/catalog.spec.mjs`, `tests/e2e/navigation.spec.mjs`, este registro e `IA_ESTADO.md`. Sem banco nem migração.
- **Relação com o Codex:** o Codex investigou o mesmo teste em `D:/codex-e2e-main-20261125` (sem push) e parou por falta de créditos. A proposta dele era aceitar o diálogo no teste; aqui a correção foi feita na causa, sem enfraquecer o teste.

## Checkpoints

### 25/11/2026 — diagnóstico

- CI da `main` em `5f0ca12`: `banco-api-e2e` falhou 1/41 em `catalog.spec.mjs:145` ("Repetir tentativa" não aparece). O mesmo teste falhou em 3 de 5 execuções da CI (duas do PR #75 e a da `main`). `navigation.spec.mjs:382` falhou em uma delas.
- Reproduzido localmente com Supabase local (Docker): 1 falha em 2 baterias completas.
- Causa do `catalog.spec`: depois do recebimento, a tela troca o formulário por um novo; o antigo sai da página com o produto escolhido. O rastreador de rascunhos continuava comparando esse formulário desconectado e acusava alteração. Ao renomear a unidade, aparecia "Há alterações não salvas" (confirmação falsa); o Playwright recusa o diálogo, a lista não era atualizada e, conforme o tempo, a ficha mantinha a revisão ("Confirmar saída") em vez de remontar ("Repetir tentativa"). Instrumentação local confirmou o diálogo em 12/12 execuções, sempre pelo `productId` do recebimento desconectado.
- Causa do `navigation.spec:382`: o teste conferia a mensagem do diálogo logo após o clique, mas o aviso só abre depois que o acesso novo chega do servidor.

### 25/11/2026 — correção e validação

- `useUnitDrafts`: formulário sem chave de revisão (`data-unit-draft-key`) que saiu da página é descartado do rastreamento antes de verificar rascunhos. Formulários com chave continuam protegidos na etapa de revisão (comportamento do #75 mantido).
- Teste unitário novo: formulário sem revisão trocado após gravar não gera aviso (falha sem a correção, passa com ela).
- `catalog.spec`: renomear a unidade não pode abrir diálogo e a mensagem precisa ser exatamente "Nome da unidade atualizado." (sem a correção, falha sempre; com ela, 12/12).
- `navigation.spec:382`: responde o diálogo quando ele abre e só então confere a mensagem (12/12).
- Local: lint, typecheck, Prettier nos arquivos tocados, Vitest 645/645, build, scripts de CI 29/29, integração 66/66, pgTAP 1500/1500 (após `db reset` local, pois as execuções E2E deixam dados que o teste de provisionamento não espera). E2E completo 41/41 em duas baterias seguidas.
- **Próximo passo:** CI do PR; merge só com aval de luis (merge na `main` publica o site).
