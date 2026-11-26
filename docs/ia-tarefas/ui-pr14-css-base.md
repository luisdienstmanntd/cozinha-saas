# Tarefa: PR-14 do roadmap de interface — CSS base neutro

- **ID:** ui-pr14-css-base
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** `button` (margem superior), `button span` (margem esquerda) e `h1` grande deixam de ser globais e passam a valer só na tela de demonstração (`.page`). Decisão de luis (26/11/2026, "94ok pr14ok"). Aceite: nenhuma área do app muda de posição ou tamanho (medido antes e depois nas 3 larguras); anulações que ficarem sem efeito saem; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr14-css-base`, base `main` `5b751fc` (PR-13 e #94 mesclados). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `src/app/styles.css` (`.page h1`, `.page button`, `.page button span`; removida a anulação `.tile.tile-filter span`), `src/app/styles.test.ts` (novo), `docs/IA_ESTADO.md`.
- **Como foi medido:** roteiro Playwright com dados fictícios nas duas pontas (antes na `main`, depois na branch), em 1366, 1024 e 390 px, para dono e colaborador: login, início, 12 áreas do dono, 6 do colaborador, ficha na lista e na unidade, formulário de novo produto, ficha do QR. Registra o retângulo de ~65 páginas × ~dezenas de elementos (botões, links, campos, títulos, textos, seções) e imagens de página inteira. Resultado: 0 diferença real de posição ou tamanho. A única linha que variou (largura do e-mail em "Minha conta") muda a cada execução porque o e-mail de teste é sorteado.
- **Decisões:** `button` mantém a aparência base (cor, raio, preenchimento, peso); só saem as margens, que eram da demonstração. Os `margin: 0` defensivos em outros botões do app ficam (não mudam nada, e removê-los não é necessário para a base neutra). `h2`/`h3` globais ficam como estão: não pediam mudança e o app já os sobrescreve por contexto.
- **Dependências e riscos:** nenhuma migração, RPC, regra, permissão, rota ou QR. Risco: um botão novo fora de `.page` sem margem própria fica sem o espaçamento antigo, o que agora é o comportamento esperado.
- **Próximo passo:** luis revisar; merge só com autorização específica (publica o site). PR-15 só com aprovação própria; #81 entra depois.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** escopo das regras, teste que impede o retorno de margem global, medição antes/depois sem diferença. Bateria inteira local em execução.
