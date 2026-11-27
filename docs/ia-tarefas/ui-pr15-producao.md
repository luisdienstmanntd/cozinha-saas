# Tarefa: PR-15 do roadmap de interface — Produção (cartões) e proposta para Cadastros

- **ID:** ui-pr15-producao
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** pronto para merge (autorizado por luis)
- **Objetivo e aceite:** M14 do diagnóstico: cartão de produção com produto em destaque, código e quantidade alinhados à direita, "Produzida em … por …" na segunda linha e ações numa linha própria com espaço igual. Pedido de luis (26/11/2026, via coordenação): seguir com o PR-15 em rascunho. Aceite: mesmo texto e mesmos botões; só apresentação; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr15-producao-cadastros`, base `main` `05bbde0` (PR-14, #95). O PR #81 (Equipe) não foi tocado por este PR.
- **Arquivos:** `src/app/styles.css` (bloco `.production-card`), `docs/IA_ESTADO.md`.
- **O que NÃO entrou (M15, tabela de Cadastros):** transformar a lista "Nome — unidade — conservação" em tabela com colunas exige separar o texto em células. Cerca de 25 consultas de teste (Vitest e E2E, em 14 arquivos) procuram exatamente o texto corrido `Arroz de teste — kg — Ambiente`; o Testing Library lê só o texto do próprio elemento, então dividir em células quebra essas consultas. Reescrever tantas consultas num PR só de visual é troca de risco por pouco ganho. Fica como **proposta para luis decidir**: (a) tabela com ajuste das consultas de teste em PR próprio, ou (b) manter a lista como está.
- **Dependências e riscos:** nenhuma migração, RPC, regra, permissão, rota ou QR. Risco baixo: CSS de um cartão. Os botões do cartão perdem a margem superior (a linha de ações usa `gap`), sem mudar tamanho.
- **Próximo passo:** luis revisar as capturas (antes e depois, 1366 e 390 px); merge só com autorização específica (publica o site).

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** CSS do cartão, capturas antes e depois em 1366 e 390 px. Bateria inteira local em execução.

### 26/11/2026 — decisão de luis

- **Cadastros (M15):** luis decidiu **manter a lista como está**, sem PR de tabela ("2 manter como está"). Não há pendência de tabela.
- **Fila de interface concluída:** os 15 PRs do roadmap de 26/11/2026 (PR-01 a PR-15) estão entregues, com o PR-15 nesta tarefa. Ficam fora da sequência, cada um com proposta e aprovação próprias: prévia da etiqueta (M9), filtro por local em Validades, série diária para gráfico, histórico/exportação, editar/arquivar cadastros e Minha conta com senha/MFA.
- **Equipe (#81):** continua sem merge; a migração `20261126000000_team_management.sql` ainda precisa ser aplicada no hospedado (ver `FASE_EQUIPE.md` §6).
