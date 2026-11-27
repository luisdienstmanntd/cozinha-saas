# Indicadores — leitura visual da operação

- **Responsável:** Codex /root
- **Estado:** aguardando_aceite
- **Branch/base:** codex/indicadores-visuais, main aec8466, worktree /workspace/work/cozzigo-indicadores.
- **Pedido/aceite:** melhorar experiência e visualização; gráficos legíveis no celular, dados exatos disponíveis, período e fotografia atual distintos, ausência de dados sem percentual fictício.
- **Coordenação:** roadmap visual do Claude até PR-15 já integrado; PRs abertos #79 auditoria, #81 equipe e #98 fornecedores não reservam métricas. Não alterar esses trabalhos nem publicar main neste incremento.
- **Arquivos:** feature metrics, estilos escopados, testes métricas e E2E relacionado; nenhuma migração/RPC/permissão.
- **Revisões:** UX, negócio e QA independentes e crítica cruzada concluídas. Não somar métricas sobrepostas, não confundir decisões e ocorrências de coortes diferentes.
- **Próximo passo:** implementar resumo visual e detalhamento acessível; validar componentes, mobile, gates e CI.

## Comparação de apresentações

| Indicador | Apresentação escolhida | Motivo/limite |
|---|---|---|
| Manipulações, produções e mudanças de local | Barras horizontais com escala comum e números | Compara volume de registros; são atividades independentes, não partes de um total. |
| Registros com atraso | Duas barras de 0 a100%, com x de n | Compara proporções com bases próprias; sem base, sem percentual. Não representa meta ou desempenho individual. |
| Vencidos com saldo | Número destacado e atalho existente | Fotografia atual, independente do período. |
| Pendências de ocorrências do período | Aviso visível quando houver | Somente ocorrências abertas na janela e ainda sem decisão na consulta; não é backlog total. |
| Mediana, máximo, anulações e demais números | Detalhamento sob demanda | Preserva precisão e reduz duplicação na leitura inicial. |
| Validade igual/menor que origem | Possível composição futura | Categorias exclusivas, mas menor validade não significa perda ou falha. Fora deste primeiro incremento para evitar excesso de gráficos. |
| Pizza ou funil de ocorrências e decisões | Não implementados | As categorias não são etapas ou partes exclusivas da mesma base. |
| Linhas diárias, evolução e comparação anterior | Não implementadas | API retorna agregados; comparação anterior exigiria segunda consulta e janelas adjacentes. Sem série diária disponível. |
| Custos, perdas, compras ou produtividade | Não implementados | Dados atuais não sustentam essas inferências. |

Períodos usam a data de gravação. Decisões e anulações do período podem se referir a registros anteriores. Gráficos usam os dados já carregados, sem chamadas extras e sem biblioteca externa. Texto/valores permanecem acessíveis, barras são apenas reforço visual e não dependem de cor ou hover.

## Implementação e primeira verificação
- Resumo com2gráficos CSS/nativos, números e bases visíveis; detalhamento controlado preserva abertura ao atualizar; aviso de pendências da coorte sempre visível; sem alteração de consulta.
- 12 testes focados passaram, cobrindo escala, taxas, zero/sem base, atualização/erro e detalhamento. Ajustados os cenários anteriores para abrir os detalhes explicitamente.
- Navegador com componente real e gateway fictício: desktop e janela estreita (~500px), abertura/fechamento, mudança de período, leitura de bases e ausência de registros observados. Prévia local não versionada; não confundir com E2E autenticado.
- Lint inicialmente encontrou uso de document fora do contexto global no E2E; corrigido. Typecheck pediu tuplas explícitas no teste novo; corrigido. Gates completos em andamento. Nenhum banco hospedado alterado.
- Banco local não inicializado por espaço limitado do ambiente; E2E autenticado em390/320px e regressão de acesso serão executados na CI descartável.

## Revisão final e validação remota
- QA independente não encontrou bloqueadores no código. Atendida recomendação de alternar7/30dias em ambas as larguras do E2E; teste agora registra duas produções autenticadas (uma com atraso) e confere barras positivas e50% em390/320px.
- Lint e typecheck passaram após os ajustes finais; bateria completa em andamento. Testes focados12/12 aprovados. Resultado final da CI e endereço da prévia serão registrados no PR.
- Prévia usa componentes reais, sem dados hospedados. Nenhuma gravação ou migração no hospedado. Publicação da main exige aceite/autorização do usuário; esta entrega é revisão em branch separada.
