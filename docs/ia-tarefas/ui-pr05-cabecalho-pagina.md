# Tarefa: PR-05 do roadmap de interface — título de página único em h2

- **ID:** ui-pr05-cabecalho-pagina
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** todas as áreas passam a ter um único título de página em h2 (Validades, Recebimentos, Produção e Configurações da unidade estavam em h3). Aceite: um h2 visível por área; aparência dos cabeçalhos mantida; foco ao trocar de área continua indo ao conteúdo; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr05-cabecalho`, base `main` `7d05a8a` (PR-04, #85). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `BatchPanel.tsx`, `ProductionPanel.tsx`, `SettingsPanel.tsx` (h3 → h2), `src/app/styles.css` (as regras de `.operation-heading h3` valem também para h2), `tests/e2e/navigation.spec.mjs` (teste novo).
- **Decisão de escopo:** só a marcação do título mudou; o `PageHeader` do PR-03 ainda não substitui os cabeçalhos (a marcação `operation-heading`/`mesa-page-heading` tem CSS próprio e trocá-la mudaria o visual). Os subtítulos h4 dessas áreas seguem como estão (sem h3 entre eles); renumerar fica para um PR próprio.
- **Dependências e riscos:** nenhuma migração, regra, dado, permissão, rota ou QR.
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site). PR-06 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** títulos em h2, CSS, teste E2E novo (passa local). Bateria inteira local em execução.
