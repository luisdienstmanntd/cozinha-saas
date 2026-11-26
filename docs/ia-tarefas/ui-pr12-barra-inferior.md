# Tarefa: PR-12 do roadmap de interface — Barra inferior e "Mais"

- **ID:** ui-pr12-barra-inferior
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** no celular e no tablet em pé (até 899 px) o botão "☰ Menu" dá lugar a uma barra inferior fixa com 4 atalhos por perfil e "Mais", que abre uma folha com as demais áreas. Decisão de luis (26/11/2026, "1 sim 2 ambos"): aprovada a barra inferior (D-078); o piloto usa celular e tablet. Aceite: troca de área em um toque nos 4 atalhos; conteúdo nunca escondido atrás da barra (`padding-bottom` + `env(safe-area-inset-bottom)`); colaborador só vê as suas áreas; "Mais" com foco dentro, Tab preso, Escape fecha e devolve o foco; alvos de toque de 44 px ou mais; atualizar a página e voltar do navegador mantêm a área; notebook (900 px ou mais) continua com o menu lateral; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr12-barra-inferior`, base `main` `31dfdc7` (PR-11, #92). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `src/features/navigation/components/BottomNav.tsx` (novo), `areaIcons.ts` (ícones movidos de `OperationsNav.tsx`), `OperationsNav.tsx` (usa a barra quando `useCompactLayout()`), `domain/workspaceAreas.ts` (`bottomBarAreas`), `src/app/styles.css`, testes `OperationsNav.test.tsx` e `workspaceAreas.test.ts`, E2E novo `bottom-nav.spec.mjs`, helper `tests/e2e/areas.mjs` e dois trechos de celular de `navigation.spec.mjs`, `docs/IA_ESTADO.md`.
- **Decisões:** atalhos: Visão geral, Validades, Produção (ou Recebimentos, sem Produção) e Etiquetas; sem Produção nem Recebimentos (colaborador) entra Locais. O resto vai em "Mais", agrupado (Operação, Cadastros, Configurações). A divisão só reparte as áreas que `workspaceAreas` já entrega ao perfil; nenhuma área é criada, escondida ou liberada. A folha é um `role="dialog"` modal próprio (foco preso, Escape, clique fora, botão Fechar). A barra usa o mesmo `aria-label` "Áreas da unidade" do menu lateral (só um existe por vez). O CSS antigo do botão Menu em telas pequenas ficou sem uso e será removido no PR-14. Não mudei `viewport-fit` (a área segura só vale em tela cheia/PWA ou aparelho com recorte; fica pronta no CSS).
- **Testes que mudaram e por quê:** o helper `openArea` e dois trechos de celular do `navigation.spec.mjs` usavam o botão "Menu", que deixa de existir no celular por decisão aprovada. Mantive as verificações (alvos de 44 px, abrir Produtos por Cadastros, alertas antes dos indicadores) e acrescentei as da barra e da folha; nada foi removido sem equivalente. O "grupo Cadastros fechado" era comportamento do menu sanfonado e agora é a seção "Cadastros" da folha.
- **Dependências e riscos:** nenhuma migração, RPC, regra, permissão, rota ou QR. Risco médio por trocar a navegação do celular. Próximo: PR-13 (tablet 900–1199 px, menu recolhido por padrão), só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** barra, folha, testes Vitest e E2E, capturas antes/depois. Bateria inteira local em execução.
