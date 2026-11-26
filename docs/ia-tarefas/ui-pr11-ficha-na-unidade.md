# Tarefa: PR-11 do roadmap de interface — Ficha dentro da unidade

- **ID:** ui-pr11-ficha-na-unidade
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** a ficha aberta por Etiquetas ou pela Visão geral abre dentro da unidade (menu e contexto da unidade visíveis) em vez de ir para a página do QR. Decisão de luis (26/11/2026, "ok 91 p11 aprovado"). Aceite: endereço `?unidade=&area=&recipiente=`; atualizar a página mantém a ficha; voltar e avançar do navegador funcionam; "Voltar para a lista" devolve o foco ao link; trocar de área sai da ficha; a rota do QR `/recipiente/:id` não muda; isolamento por unidade e permissões intactos; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr11-ficha-na-unidade`, base `main` `bad8310` (PR-10, #91). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `src/app/App.tsx` (ficha na unidade, `fichaHref`, `openFicha`, `closeFicha`), `src/features/navigation/domain/areas.ts` (`recipiente` em `placeSearch`, `parseContainerParam`), `src/features/navigation/domain/openInUnit.ts` (clique simples abre na unidade; Ctrl/Cmd/Shift/meio mantêm o link comum), `LabelDirectory.tsx` e `OperationsOverview.tsx` (props opcionais `fichaHref`/`onOpenFicha`), `LabelView.tsx` (prop opcional `unitId`), testes Vitest e `tests/e2e/ficha-unidade.spec.mjs`.
- **Decisões:** o parâmetro `recipiente` só vale em Etiquetas e Visão geral e some ao trocar de área ou sair da unidade; a lista fica oculta (não desmontada) para preservar busca e filtro. Dentro da unidade `LabelView` recusa recipiente de outra unidade com a mesma mensagem de acesso negado (o banco já filtra por RLS; isto evita mostrar a ficha sob a unidade errada). Permissão de manipular é a mesma do Validades (`canCreate`, proprietário). Sem migração, RPC, regra, contrato ou QR.
- **Dependências e riscos:** mexe em navegação (histórico). Mitigação: `popstate` já atualiza o estado; E2E cobre abrir, atualizar, voltar, avançar, voltar para a lista e a rota do QR.
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site).

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** implementação, testes Vitest e E2E novo. Bateria inteira local em execução.
