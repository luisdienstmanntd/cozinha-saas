# V1 — Navegação e estrutura

Autorizada por luis em 16/11/2026 (relatório `REVISAO_VISUAL_FASE_07.md`, bloqueio B1). D-060 ACEITA por luis em 16/11/2026 (PR #33), com a ressalva do ponto 6 abaixo. Sem merge nem deploy.

## O que mudou

- A unidade aberta passa a ter **cinco áreas**: Validade, Receber, Produção, Locais e Cadastros. Abrir a unidade cai direto em **Validade**.
- **Desktop (≥ 900 px):** menu lateral fixo à esquerda. **Celular (< 900 px):** barra de navegação inferior fixa, com alvos de pelo menos 44 px.
- O cabeçalho da unidade mostra organização, papel e nome da unidade; a barra de sessão mostra "Unidade: X. Conectado como e-mail." e o botão **Sair** (fixo no topo ao rolar). "Trocar de unidade" e "Atualizar acesso" ficam no cabeçalho.
- Avisos longos da sessão (30 min, aparelho compartilhado, ambiente) ficam em "Sobre a sessão e o ambiente" (`<details>`), para liberar a primeira tela do celular. O texto é o mesmo.
- Botão da lista inicial renomeado de "Catálogo de X" para "Abrir X".
- Ferramentas da organização (renomear, criar unidade) foram para **Cadastros** da unidade aberta.
- Link "Pular para o conteúdo" e foco movido para o conteúdo ao trocar de área; `aria-current="page"` no item ativo.

## Áreas por perfil (só interface; o banco continua decidindo)

| Área | Proprietário | Colaborador |
| --- | --- | --- |
| Validade | sim | sim |
| Receber | sim | não (não grava recebimento) |
| Produção | sim | sim |
| Locais | sim | sim (leitura) |
| Cadastros | sim | "Configurações" (somente leitura) |

Nenhuma política RLS, função ou migração mudou na V1. Endereço com `area=receber` para colaborador cai em Validade.

## Endereço

`?unidade=<uuid>&area=<id>`. Trocar de área usa `pushState` (voltar/avançar do navegador funcionam). Unidade desconhecida ou sem acesso não abre. Com a sessão persistente da V2, link direto e QR continuam funcionando; sem sessão pedem login e depois abrem. Sair limpa o endereço.

## Dados digitados

Todas as áreas ficam montadas; as inativas ficam com `hidden`. Trocar de seção não perde o que foi digitado. **Limitação:** "Trocar de unidade", "Atualizar acesso", recarregar e Sair desmontam a unidade e perdem rascunhos (comportamento anterior, não agravado).

## Testes

- Novos: `areas.test.ts`, `UnitNav.test.tsx`, `IdentityUnit.test.tsx` (unidade no endereço, voltar, trocar de unidade, Sair), `tests/e2e/navigation.spec.mjs` (5 testes: cinco áreas do dono e geometria do menu lateral; colaborador; dados preservados, voltar e link direto; celular 390 px; QR e sessão persistente).
- Ajustados (E2E existentes): nomes "Catálogo de X" → "Abrir X", passos `openArea` antes de acessar cada formulário, "Trocar de unidade" quando necessário. **Nenhuma asserção foi removida nem relaxada**; o teste de alvos pequenos passou a ignorar elementos ocultos (sem caixa na tela) e a incluir os links do menu.
- Bateria: format, lint, tipos, vitest, build, pgTAP (27 arquivos, 1433 testes), integração (49) e E2E Playwright (29) verdes. Assessores do banco não rodados de novo (nenhuma mudança de banco).

## Revisão visual

Capturas em `docs/capturas/revisao-visual-v1/`: `d-*` desktop 1366×900 e `m-*` iPhone 13 emulado; `dono` e `colab`; início e cada área. Menu lateral e barra inferior cabem, inclusive "Configurações" em 390 px; sem rolagem horizontal; conteúdo não fica atrás da barra.

## Limitações

- No celular a lista de Validade ainda começa abaixo da primeira tela (painel de bloqueios e cabeçalho acima). Candidato à V3.
- Sem teste em aparelho físico nem leitor de tela real.
- `BatchPanel.tsx`: diff grande por re-indentação (use `git diff -w`); lógica igual.
- Colaborador vê "Configurações" em vez de "Cadastros" porque os testes de Produção exigem a mensagem somente leitura ali.
- Não garante conformidade sanitária (Q10 pendente).

## Pontos para aceite de luis (todos aprovados em 16/11/2026)

1. Receber oculto para colaborador (o banco já recusa a escrita).
2. Colaborador com "Configurações" somente leitura no lugar de Cadastros.
3. Botão "Abrir X" no lugar de "Catálogo de X".
4. Avisos da sessão recolhidos em "Sobre a sessão e o ambiente" (texto preservado).
5. Ferramentas da organização dentro de Cadastros.
6. Limitação de rascunhos perdidos em "Trocar de unidade" / recarregar.
7. Seguir para V3 (lista de validade no celular), com aprovação própria.

## Aceite (16/11/2026)

luis aprovou os pontos 1 a 5 e o 7, e **aceitou provisoriamente o ponto 6**: perder rascunhos ao trocar de unidade, atualizar acesso ou recarregar é limitação anterior à V1. Fica no backlog avisar sobre formulários não salvos antes de ações **voluntárias** que descartem dados. Logout e expiração de sessão continuam limpando os dados e **nunca** podem ser impedidos por esse aviso. A V3 foi autorizada em thread própria.
