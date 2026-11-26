# Tarefa: PR-15 do roadmap de interface — Produção (cartões) e proposta para Cadastros

- **ID:** ui-pr15-producao
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** M14 do diagnóstico: cartão de produção com produto em destaque, código e quantidade alinhados à direita, "Produzida em … por …" na segunda linha e ações numa linha própria com espaço igual. Pedido de luis (26/11/2026, via coordenação): seguir com o PR-15 em rascunho. Aceite: mesmo texto e mesmos botões; só apresentação; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr15-producao-cadastros`, base `main` `05bbde0` (PR-14, #95). O PR #81 (Equipe) não foi tocado por este PR.
- **Arquivos:** `src/app/styles.css` (bloco `.production-card`), `docs/IA_ESTADO.md`.
- **O que NÃO entrou (M15, tabela de Cadastros):** transformar a lista "Nome — unidade — conservação" em tabela com colunas exige separar o texto em células. Cerca de 25 consultas de teste (Vitest e E2E, em 14 arquivos) procuram exatamente o texto corrido `Arroz de teste — kg — Ambiente`; o Testing Library lê só o texto do próprio elemento, então dividir em células quebra essas consultas. Reescrever tantas consultas num PR só de visual é troca de risco por pouco ganho. Fica como **proposta para luis decidir**: (a) tabela com ajuste das consultas de teste em PR próprio, ou (b) manter a lista como está.
- **Dependências e riscos:** nenhuma migração, RPC, regra, permissão, rota ou QR. Risco baixo: CSS de um cartão. Os botões do cartão perdem a margem superior (a linha de ações usa `gap`), sem mudar tamanho.
- **Próximo passo:** luis revisar as capturas (antes e depois, 1366 e 390 px); merge só com autorização específica (publica o site).

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** CSS do cartão, capturas antes e depois em 1366 e 390 px. Bateria inteira local em execução.
