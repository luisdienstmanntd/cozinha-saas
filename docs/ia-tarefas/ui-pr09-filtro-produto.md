# Tarefa: PR-09 do roadmap de interface — Recebimento com filtro de produto

- **ID:** ui-pr09-filtro-produto
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** campo **Filtrar produtos** (nome ou conservação) acima da lista de produtos do recebimento, para catálogos grandes. Aceite: não muda ordem, campos, regras nem envio; o produto já escolhido nunca some ao filtrar; o filtro não vai no envio e volta vazio depois de registrar; rascunho preservado ao trocar de área; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr09-filtro-produto`, base `main` `3550a5f` (PR-08, #89). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `src/features/batches/components/BatchPanel.tsx` (estado `productFilter` e lista filtrada só na tela), `BatchPanel.test.tsx` (1 teste novo), `docs/IA_ESTADO.md`.
- **Decisões:** o filtro compara nome e rótulo de conservação sem diferenciar maiúsculas; a ordem é a do catálogo; sem resultado mostra "Nenhum produto encontrado." (`role=status`); com filtro ativo mostra "N de M produtos". Não há cálculo de validade nem regra de recebimento envolvidos.
- **Dependências e riscos:** nenhuma migração, RPC, regra, dado, permissão, rota ou QR. O campo novo não tem `name`, então não entra no `FormData`.
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site). PR-10 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** filtro e teste. Bateria inteira local em execução.
