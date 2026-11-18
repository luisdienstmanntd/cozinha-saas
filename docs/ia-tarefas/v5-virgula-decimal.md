# Tarefa: V5 — Vírgula decimal nas quantidades (D-063)

- **ID:** v5-virgula-decimal
- **Responsável / sessão:** Claude Code (thread "Implementar V5 vírgula decimal")
- **Estado:** concluida (aceite de luis em 16/11/2026, 22:08 UTC; sem merge)
- **Objetivo e aceite:** implementar a V5 autorizada por luis em 16/11/2026, 21:10 UTC, com sete requisitos (vírgula e ponto decimais; regra explícita para ambiguidades; validações, saldos, cálculos e persistência intactos; testes unitários, de integração e E2E; permissões, RLS e auditoria preservadas). Bateria completa verde, nenhum teste enfraquecido, PR em rascunho para aceite.
- **Branch / base:** `claude/revisao-v5-virgula-decimal` sobre `claude/revisao-v4-acabamento` (PR #37, ponta `66f685c` com o aceite final da V4).
- **Arquivos e recursos em uso:** `src/shared/format/quantity.ts`, `BatchPanel.tsx`, `MovementPanel.tsx`, `HandlingForm.tsx`, `ProductionPanel.tsx` e testes; banco local Supabase só para testes. Sem migração.
- **Dependências e riscos:** depende das V1 a V4 (rascunhos sem merge). `1.500` passa a ser recusado (era aceito como 1,5): a confirmar por luis.
- **Próximo passo:** nenhum na V5. Proposta da fatia complementar em `V5B_PROPOSTA.md` (tarefa `v5b-proposta`). Merge só com autorização específica de luis.

## Checkpoints

### 16/11/2026 21:15 UTC — Claude Code

- **Planejado / feito:** branch criada a partir da V4; ambiente (Node 24, Docker, Supabase local) preparado; mapeadas as quatro telas com quantidade digitada.
- **Próximo passo:** regra de leitura e testes.

### 16/11/2026 21:40 UTC — Claude Code

- **Planejado / feito:** regra em `quantity.ts`, telas convertidas, testes unitários, de integração e E2E novos; relatório `V5_VIRGULA_DECIMAL.md`; D-063. Primeira versão colocava a conversão dentro dos esquemas de domínio e quebrava a releitura da camada de dados (`1,250` → `1.250` seria recusado como ambíguo na segunda leitura); a conversão foi movida para a tela e os esquemas voltaram a ser os de antes.
- **Alterações e commits:** ver branch e PR. Sem migração.
- **Testes:** lint, typecheck, format:check, build ok; vitest 455; pgTAP 1433; advisors sem problemas; integração 50; E2E 33 — todos verdes.
- **Estado do ambiente:** `playwright.local.config.mjs` local, não versionado; imagem `pg_prove` falhou por 403 no proxy e o CLI repetiu.
- **Pendências / riscos:** aceite de luis; exibição com vírgula nas demais telas e temperatura do recebimento ficaram fora.
- **Próximo passo:** aceite de luis.

### 16/11/2026 22:20 UTC — Claude Code

- **Planejado / feito:** **Aceite de luis em 16/11/2026, 22:08 UTC** (PR #38, CI verde): aprovou a implementação da V5 e a D-063 e considerou a V5 tecnicamente aceita. Confirmou expressamente que valores ambíguos como `1.500`, `1.000,50` e `1,000.50` continuam recusados, com mensagem explicativa. Manter: vírgula e ponto como separadores decimais quando não houver ambiguidade; ausência de separador de milhar; limites de quantidade, precisão e validações existentes; nenhuma alteração em saldos, históricos, permissões ou regras do banco. Na mesma mensagem autorizou **preparar a proposta** de uma fatia complementar (exibição com vírgula e temperatura do recebimento), **sem implementar**: ver [V5B_PROPOSTA.md](V5B_PROPOSTA.md).
- **Alterações e commits:** só documentação (`V5_VIRGULA_DECIMAL.md`, `DECISOES.md`, este registro, `IA_ESTADO.md`, `V5B_PROPOSTA.md`).
- **Testes:** sem mudança de código; bateria e CI da V5 já registradas acima.
- **Próximo passo:** nenhum; merge só com autorização específica de luis.
