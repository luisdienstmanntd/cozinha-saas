# Tarefa: Validades compactas — cartões em estilo lista e ações em ícones (PR-16)

- **ID:** validades-compactas
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento (PR em rascunho; sem merge)
- **Pedido de luis (27/11/2026):** os cartões de Validades estão grandes por causa dos botões; deixar mais minimalista/lista e transformar "Ver ficha", "Ver movimentações" e "Mudar de local" em ícones minimalistas.
- **Branch / base:** `claude/validades-compactas`, base `main` `aec8466` (#99).
- **O que mudou:** novo `src/shared/ui/IconAction.tsx` (botão só com ícone; `aria-label` e `title` iguais ao texto de antes; ícone `aria-hidden`; alvo de 44 px, 36 px só com mouse e tela de 1200 px ou mais). Em `BatchPanel.tsx` as três ações secundárias usam `IconAction`; "Porcionar" / "Abrir / porcionar" continua botão com texto, à direita. O disclosure "Mais ações" do celular saiu (as ações cabem em uma linha); o CSS `.more-actions` foi removido. Em `styles.css` o cartão virou grade: título e fatos à esquerda, ações à direita (notebook e tablet); no celular (até 560 px) as ações descem para uma linha própria alinhada à direita.
- **Não mudou:** regras, permissões, condições para cada ação aparecer, textos de bloqueio e contadores, handlers (`onClick` idênticos), ordem da lista. Condição de cada ícone é a mesma de antes.
- **Testes que mudaram e por quê:** `BatchPanelV4.test.tsx` — três testes de celular verificavam o "Mais ações"; passam a verificar, nos dois layouts, que as três ações são botões de ícone visíveis com nome, `title`, `svg` oculto e sem texto, que a principal segue com texto, que não há `details`, que o vencido mostra o aviso e "Ver movimentações" sem ação principal e que o colaborador só tem ficha e movimentações (por `aria-label`). E2E `finishing.spec.mjs` (celular) e `manual-exit.spec.mjs`: sem clicar em "Mais ações"; ganharam a checagem de alvo de 44 px e de `title`. Nada removido sem equivalente.
- **Capturas antes e depois:** `/mnt/project-files/validades-compactas/` (celular, tablet, notebook).
- **Proposta (não feita):** o mesmo padrão pode valer para Etiquetas (ação "Abrir ficha") e Recebimentos; só com aprovação de luis.

## PR-17 (mesmo PR): Produção compacta — 27/11/2026

- **Pedido de luis:** o mesmo na tela Produção; cartões de "Produções recentes" minimalistas e ações em ícones.
- **O que mudou:** o cartão tem o bloco de título e detalhes (`production-card-main`) e, na mesma linha quando cabe (celular: logo abaixo, em uma linha), três ações em ícone: "Baixar etiqueta (C-…)", "Registrar temperatura C-…" e "Anular produção C-…". O nome acessível e a dica levam o código. Anular fica em contorno vermelho (`risk`, sem `secondary`) e abre o mesmo formulário de motivo e confirmação. `DownloadLabels`, `RecordTemperature` e `VoidProduction` ganharam a opção `icon` (padrão desligado; outros usos não mudam). Ordem no cartão: ações, aviso de etiqueta não baixada, "ANULADA", temperaturas, formulários.
- **Não mudou:** regras, permissões (quem vê cada ação), textos de recusa, o aviso de que baixar não comprova impressão, o painel "Produção registrada" (resultado).
- **Testes que mudaram e por quê:** o nome do botão "Anular produção" passa a levar o código; as buscas exatas por `'Anular produção'` viraram `/^Anular produção/` (unitários e E2E), inclusive as que verificam ausência, para não perder a checagem. Testes novos: ícones com nome, dica, sem texto e anular de risco.
- **Capturas antes e depois:** `/mnt/project-files/producao-compacta/`.
