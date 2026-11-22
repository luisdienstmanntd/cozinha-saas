# D-073, etapa 2 — baixa manual em qualquer recipiente

- **Data:** 22/11/2026. Base: `main` em `f4ad019`. Aprovada por luis no cartão de decisão ("Aprovar a etapa 2").
- **Escopo:** só interface. Nenhuma migração, função, política RLS ou tipo de movimento novo; Supabase hospedado intocado. Auditoria que originou a fatia: `AUDITORIA_BAIXA_MANUAL.md` (PR #67), lacunas L1, L2, L3 e L6.
- **Permissões:** inalteradas (D-019: só o proprietário registra saídas). Ajuste de estoque segue fora (L5).

## O que mudou

1. **Porções e derivados (L1).** O cartão de um recipiente derivado ganha "Ver movimentações" (no celular, dentro de "Mais ações" quando há ação principal). O painel lê o histórico pelo `container_id` do recipiente e grava a saída por `record_container_movement`, que já existia e já era coberta pelo pgTAP e pela integração. O recipiente integral continua exatamente como antes (`record_movement` e histórico do integral). A tentativa guardada na aba tem chave própria por recipiente.
2. **Saldo insuficiente (L2).** A recusa "Quantidade excede saldo registrado." do banco vira `MovementOverBalance` e a tela diz: "Saída recusada: a quantidade é maior que o saldo registrado deste recipiente. Nada foi gravado."
3. **Depois da saída (L3).** "Saída registrada. Saldo agora: X." com o saldo relido do servidor. Se zerou: "Recipiente esgotado: ele sai das validades ativas e continua em "Mostrar esgotados" e no histórico."
4. **Testes (L6).** Vitest: 9 casos novos (painel, gateway e cartão do derivado). E2E `tests/e2e/manual-exit.spec.mjs`: o exemplo do peito de peru inteiro no desktop (1000 → 700 → 200 → 0 g, recusa acima do saldo, contadores, "Mostrar esgotados" com selo Esgotado e as três saídas no histórico) e a baixa numa porção derivada no celular (390 px, sem rolagem horizontal, origem intacta).

## Arquivos

`src/features/movements/application/movementGateway.ts`, `data/supabaseMovements.ts`, `components/MovementPanel.tsx`, `src/features/batches/components/BatchPanel.tsx`; testes em `MovementPanel.test.tsx`, `supabaseMovements.test.ts`, `BatchPanelBaixa.test.tsx` e `tests/e2e/manual-exit.spec.mjs`.
