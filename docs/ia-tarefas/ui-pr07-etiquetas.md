# Tarefa: PR-07 do roadmap de interface — Etiquetas mais úteis

- **ID:** ui-pr07-etiquetas
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** na lista de Etiquetas, colunas **Saldo** e **Situação** (selo único; esgotado aparece como "Esgotado"), opção **Só com saldo** e busca ao digitar (300 ms, como em Validades). Aceite: esgotado identificado; paginação e "Primeira página" iguais; "Abrir ficha" igual; Enter e "Buscar" continuam consultando na hora; falha com alerta e repetição; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr07-etiquetas`, base `main` `4e0d8fa` (PR-06, #87). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `src/features/labels/components/LabelDirectory.tsx`, `LabelDirectory.test.tsx` (novo, 5 testes), `docs/IA_ESTADO.md`.
- **Decisão de padrão:** "Só com saldo" começa **ligado** (recomendação do diagnóstico, aceita por luis ao aprovar o PR-07); desmarcar mostra os esgotados, como a lista antiga mostrava sempre. Troca simples se luis preferir o contrário.
- **Dependências e riscos:** nenhuma migração, RPC, QR, contrato ou regra. `includeDepleted` já existia na consulta; Situação e Saldo usam campos que a linha já traz (`balance`, `unit`, `expiry_date`, `timezone`). Nenhuma mudança no download ou na reimpressão de etiqueta (baixar continua não comprovando impressão).
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site). PR-08 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** lista com Saldo/Situação, filtro, busca ao digitar, testes. Bateria inteira local em execução.
