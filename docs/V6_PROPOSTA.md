# V6 — Filtrar Validades pelos contadores (proposta, sem implementação)

- **Estado:** proposta aguardando aprovação de luis. Nenhum código de aplicação alterado.
- **Base revisada:** `main` em `820f77d` (Mesa operacional, D-070; fundações CozziGo #52; submenu #53). PR #56 do Codex (D-071, recebimento e produção) aberto e considerado.
- **Origem:** pedido de luis em 16/11/2026, no aceite da V3 (D-061), registrado em `BACKLOG.md` como "Filtros de validade por categoria acionados pelos contadores".
- **Decisão proposta:** D-072 (a D-071 já é usada pelo PR #56).

## 1. Por que esta fatia agora

A Mesa operacional colocou os quatro contadores (Vencidos, Vencem hoje, Vencem amanhã, Após amanhã) na primeira tela da unidade, mas eles só informam. Para agir sobre os vencidos, a pessoa vai para Validades e percorre a lista inteira, que mistura todas as categorias. O pedido de luis é exatamente transformar esses contadores em atalhos. A fatia é pequena, só de interface, e não depende do hospedado.

## 2. Escopo

1. **Validades:** os quatro contadores viram botões de filtro (`aria-pressed`), mais um "Todos". O filtro ativo aparece em texto acima da lista, por exemplo "Mostrando: Vencidos (12 com saldo)", com ação "Limpar filtro".
2. **Visão geral:** os quatro contadores passam a ser links para Validades já filtrada. "Ver todos" continua levando à lista completa.
3. **Endereço:** o filtro fica na URL (`?unidade=…&area=validade&validade=vencidos|hoje|amanha|posteriores`). Recarregar, voltar e compartilhar o link mantêm o filtro. Valor inválido é ignorado e a lista abre completa. Links antigos continuam valendo.
4. **Combinação com a busca:** a busca atua dentro da categoria escolhida. Os contadores continuam mostrando os totais da unidade, não os da busca, e o texto deixa isso claro.
5. **"Incluir esgotados":** os contadores contam só recipientes com saldo. Para não mostrar números que não batem, escolher uma categoria desmarca "Incluir esgotados", e marcar "Incluir esgotados" limpa a categoria. O comportamento é explicado em uma linha.

### Fora do escopo

Mudança no banco, RLS ou funções SQL; filtros por local, produto ou fornecedor; contagens por busca; histórico de produções; Recebimentos, Produção, Etiquetas e QR; qualquer deploy ou migração no hospedado.

## 3. Como o filtro funciona (sem migração)

A lista já é ordenada no servidor por `(validade, recipiente)` e paginada por cursor (`p_after_expiry`, `p_after_id`). Cada categoria é um intervalo contínuo dessa ordem, calculado a partir da **mesma data de referência no fuso da unidade** usada pelo resumo (`container_expiry_summary`):

| Categoria | Início (cursor enviado ao servidor) | Fim (aplicado ao resultado) |
|---|---|---|
| Vencidos | sem cursor (começo da lista) | validade < hoje |
| Vence hoje | depois de (ontem, maior UUID) | validade = hoje |
| Vence amanhã | depois de (hoje, maior UUID) | validade = amanhã |
| Posteriores | depois de (amanhã, maior UUID) | sem fim |

O servidor começa a lista exatamente no início da categoria, com a autorização de sempre (RLS e escopo da unidade). O navegador só corta o fim da página quando a próxima categoria começa, e esconde "Carregar mais" quando isso acontece. Assim o filtro vale para todos os recipientes da unidade, e não só para a página já carregada, como o backlog exige. O cálculo do intervalo fica numa função pura de domínio, testável sem tela.

**Alternativa considerada:** novos parâmetros de intervalo em `list_containers`. É mais explícita, mas exige migração, pgTAP novo e, depois, migração no Supabase hospedado com autorização. Não recomendo agora, porque a ordenação e o cursor já entregam o mesmo resultado sem tocar no banco.

## 4. Telas e arquivos afetados

- `src/features/batches/components/BatchPanel.tsx` (contadores, estado do filtro, `loadMore`, texto do filtro).
- `src/features/batches/domain/` (nova função pura do intervalo e do corte).
- `src/features/overview/components/OperationsOverview.tsx` (contadores como links).
- `src/features/navigation/domain/areas.ts` (ler e escrever o parâmetro `validade`).
- `src/app/styles.css` (estado pressionado dos contadores, alvo de toque de 44 px).
- Documentação: `DECISOES.md` (D-072), `BACKLOG.md`, `IA_ESTADO.md`, registro em `ia-tarefas/`, e a linha do `COZZIGO_UI_UX_ROADMAP.md` que hoje diz "Os totais não são controles de filtro".

## 5. Riscos

1. **Roadmap em conflito.** O roadmap do Codex diz que os totais não são filtros. O pedido de luis no backlog diz o contrário. Aprovar esta fatia significa atualizar essa linha. Se a intenção do roadmap era outra, decidir antes de codar.
2. **Conflito com o PR #56.** Ele mexe em `BatchPanel.tsx` (parte de Recebimentos, linhas 1050 em diante) e usa a D-071. A sobreposição é pequena, mas a fatia deve partir da `main` depois da decisão sobre o #56 para evitar retrabalho.
3. **Leitura de segurança.** Um filtro "Posteriores" não significa "seguro". Os rótulos de validade continuam como estão, e o texto mantém que a validade é a informada pelo responsável.
4. **Virada do dia.** Se a página ficar aberta depois da meia-noite no fuso da unidade, a data de referência muda. O filtro usa a mesma data dos contadores e é recalculado junto com eles, como já acontece hoje.
5. **Página na fronteira.** Uma página de 100 pode conter o fim de uma categoria e o começo da outra. O corte precisa ser coberto por teste com mais de 100 recipientes na mesma categoria.
6. **Cursor com o maior UUID.** O início da categoria usa `ffffffff-ffff-ffff-ffff-ffffffffffff` como recipiente do cursor. Confirmar que nenhuma validação (Zod ou SQL) rejeita esse valor, e fixar o comportamento com um caso pgTAP.

## 6. Testes

- **Unitários (Vitest):** intervalo de cada categoria, incluindo virada de mês, de ano e 29/02; corte do resultado; leitura do parâmetro da URL com valores válidos, inválidos e ausentes.
- **Componente:** clicar em cada contador envia o cursor certo; `aria-pressed` e "Limpar filtro"; busca dentro da categoria; regra de "Incluir esgotados"; "Carregar mais" para na fronteira; erro de carregamento; mesmo comportamento para proprietário e colaborador; links da Visão geral.
- **pgTAP:** um caso novo em `list_containers.test.sql` garantindo que o cursor `(data, maior UUID)` começa no dia seguinte. Nenhum teste existente muda (1496 hoje).
- **E2E (Playwright, pela CI):** nova especificação com recipientes nas quatro categorias; filtro por clique, pela Visão geral e após recarregar; mais de 100 recipientes numa categoria; colaborador; 390 e 320 px.
- **Bateria inteira:** lint, tipos, Vitest, build, pgTAP, integração e E2E verdes na CI do PR, sem enfraquecer nenhum teste. Neste ambiente de nuvem o Supabase local não sobe, então pgTAP e E2E rodam pela CI.

## 7. Entrega

Branch `claude/v6-filtro-validades` a partir da `main`, PR em rascunho, capturas de antes e depois em desktop e celular, e registro em `ia-tarefas/`. Sem merge, deploy ou alteração no hospedado sem autorização específica de luis. A prévia por branch do Cloudflare usa o banco de testes atual, que não precisa de migração para esta fatia.
