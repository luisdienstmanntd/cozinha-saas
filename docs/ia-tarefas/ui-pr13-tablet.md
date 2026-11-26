# Tarefa: PR-13 do roadmap de interface — Tablet deitado (900 a 1199 px)

- **ID:** ui-pr13-tablet
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** em tablet deitado (900 a 1199 px) o menu lateral começa recolhido (só ícones), com botão de recolher/expandir de 44 px, e a escolha da pessoa fica lembrada. Decisão de luis (26/11/2026, "ok 93 deitado"): o piloto usa celular e tablet. Aceite: recolhido por padrão nessa faixa; notebook (1200 px ou mais) continua expandido; escolha lembrada por pessoa neste aparelho (`localStorage` com try/catch, só conveniência); alvos de toque de 44 px em toque; nada rola para o lado; permissão, sessão e áreas intactas; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr13-tablet`, base `main` `51ba137` (PR-12, #93). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `src/shared/ui/useCompactLayout.ts` (`useTabletLayout`, `TABLET_QUERY`), `src/features/navigation/domain/menuPreference.ts` (novo), `OperationsNav.tsx` (estado inicial pela largura; escolha prevalece), `App.tsx` (passa `personKey={userId}`), `src/app/styles.css` (alvo de 44 px do botão), `OperationsNav.test.tsx`, E2E novo `tests/e2e/tablet-menu.spec.mjs`, `docs/IA_ESTADO.md`.
- **Decisões:** a escolha explícita (recolher ou expandir) vale em qualquer largura de notebook ou tablet; sem escolha, vale o padrão da largura. Chave `cozzigo.menu-recolhido.<id da pessoa>`: por pessoa e por aparelho, nunca no servidor. Recolhido, o menu mostra todos os ícones (comportamento já existente do modo recolhido); os nomes continuam como `aria-label` e `title`. Com mouse (`pointer: fine`) os itens seguem com 36 px (PR-01, para caber em 1366×768); em toque, 44 px; por isso o E2E de tablet usa toque emulado. Celular e tablet em pé (até 899 px) seguem com a barra inferior do PR-12.
- **Dependências e riscos:** nenhuma migração, RPC, regra, permissão, rota ou QR. Risco baixo: só estado inicial do menu e um botão maior.
- **Próximo passo:** luis revisar capturas (1024×768 antes e depois); merge só com autorização específica (publica o site). PR-14 (CSS base neutro, risco médio-alto) e PR-15 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** hook de tablet, preferência lembrada, testes Vitest e E2E novo, capturas antes/depois. Bateria inteira local em execução.
