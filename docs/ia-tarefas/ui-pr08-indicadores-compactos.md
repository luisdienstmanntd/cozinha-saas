# Tarefa: PR-08 do roadmap de interface — Indicadores compactos

- **ID:** ui-pr08-indicadores
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** Indicadores ocupam menos altura no desktop sem inventar número. Aceite: "—" e "Sem registros no período" mantidos; zero real continua "0"; barra de participação só quando há base (total > 0), sempre com o número e "N% do total" em texto; a barra fica fora da leitura de tela; celular e tablet iguais; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr08-indicadores`, base `main` `da9cd34` (PR-07, #88). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `UnitMetricsPanel.tsx`, `metrics.test.tsx` (1 teste novo), `src/app/styles.css`, `docs/IA_ESTADO.md`.
- **O que mudou:** (1) "Situação agora" vira uma faixa baixa (título à esquerda, número à direita), sem sair do lugar nem do nome de região; (2) a partir de 1200 px os quatro grupos de período ficam lado a lado (2 colunas) e cada indicador vira uma linha rótulo/número, no lugar de cartões; (3) o seletor de período fica ao lado do título; (4) `<progress>` estilizado como barra de participação (sem estilo inline, por causa da CSP) quando há base. Medida em 1366×768 com os dados fictícios do fixture (todos zero): altura do painel 1.667 px → 1.196 px (−28%); **não chegou à metade** prometida no diagnóstico (os grupos têm 7 e 7 linhas; só dá para cortar mais mexendo no conteúdo). Em ≤ 1199 px nada mudou.
- **Decisão de escopo:** "Situação agora" não foi movida para dentro do cabeçalho (mantém DOM, região e link "Ver vencidos em Validades" que os testes usam).
- **Dependências e riscos:** nenhuma migração, RPC, regra, dado, permissão, rota ou QR; mesmos números do `pilot_metrics`.
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site). PR-09 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** CSS, barra, teste; capturas conferidas. Bateria inteira local em execução.
