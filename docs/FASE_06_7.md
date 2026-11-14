# Fase 6, fatia 6.7 — etiquetas de recebimento e de produto aberto

Implementada por Claude Code em 13/11/2026, conforme a seção 7.2 e a fatia 6.7 de `FASE_06_DESENHO.md`. luis aprovou em 13/11/2026 23:44 UTC ("aprovado", "os dois": mesclar os PRs #13 e #14 e começar a 6.7); os dois PRs foram mesclados na `main` antes. Registro da tarefa: `ia-tarefas/fase-06-7-etiquetas.md`.

**Base:** `main` com os PRs #1 a #14. **Nenhuma migração:** só interface e geração de PDF. Reimpressão nunca grava nada (D-003). Permissão sem mudança (só o proprietário escreve; o membro nem vê o botão da etiqueta no painel). Q1–Q10 preservadas; nenhum texto afirma conformidade sanitária (teste 16 cobre os dois modelos); a conferência por nutricionista RT (Q10) segue pendente e é exigida antes do piloto, não antes da fatia.

## O que mudou

1. **Modelo "Produto aberto / fracionado"** (100 × 100 mm), legível sem ler o QR: cabeçalho "PRODUTO ABERTO" ou "PRODUTO FRACIONADO"; produto em destaque; "Aberto em" com data, hora e fuso da unidade; **VALIDADE APÓS ABERTURA** em corpo grande, com "definida por <nome> em <data>" (S-9); "Validade do fabricante" quando a do recebimento é original; lote original; conservação; "Manipulado por" (S-7); "Porção 2 de 4"; quantidade rotulada "na criação"; código curto e ID; QR só com URL e ID opaco.
2. **Modelo "Recebimento":** cabeçalho "RECEBIMENTO", lote, fornecedor, conservação, "Quantidade inicial: X (entrada)", validade (com a origem), código curto, ID e QR. Validade em dd/mm/aaaa, como no modelo de produto aberto (ver "Próximo passo").
3. **Faixa de bloqueio** nos dois modelos (embaixo, "BLOQUEADO aguardando decisão" ou "REJEITADO somente descarte"); sai na reimpressão depois da liberação.
4. **Recusas** com mensagem: manipulação anulada, manipulação tardia sem liberação, e derivado sem os dados da manipulação legíveis (falha fechada: nunca imprime a validade da origem no lugar da validade após a abertura).
5. **Baixar:** "Gerar etiqueta PDF" (esta) em qualquer recipiente; "Baixar esta" por recipiente e "Baixar PDF de todas" (uma etiqueta por página) na tela do resultado da manipulação e, por manipulação, na tela do recipiente. Cada recipiente é relido e reautorizado ao gerar; qualquer recusa interrompe o arquivo todo.
6. O gerador de PDF é carregado só quando alguém pede a etiqueta (`import()` dinâmico; chunk `pdf` separado).
7. A leitura do recipiente (`supabaseLabels`) passou a trazer conservação, fornecedor e os dados da manipulação (RLS, mesmas leituras da 6.6). O bloqueio do PDF do derivado, da 6.6, foi retirado.

## Testes

- **Vitest (202):** campos obrigatórios de cada modelo no texto desenhado, abertura inteira sem "Porção", validade do fabricante só quando original, recusa sem dados da manipulação, faixa no derivado, PDF de várias páginas e recusa do arquivo todo, leitura dos dados da manipulação no gateway, botões das telas. **Teste 16:** textos proibidos sobre os PDFs dos dois modelos (recebimento e produto aberto, com e sem bloqueio).
- **E2E (9):** `handling.spec.mjs` agora baixa o PDF do recipiente criado (E2E 27), o PDF de todas as porções (3 páginas, E2E 28) e o do derivado pelo QR (E2E 31); `catalog.spec.mjs` e `occurrences.spec.mjs` passam sem alteração.
- pgTAP 968 (sem mudança no banco), integração 26, lint, typecheck, format e build ok.
- Capturas das etiquetas renderizadas: `/mnt/project-files/capturas-fase-06-7/` (1 produto aberto, 2 produto fracionado, 3 recebimento bloqueado, 4 recebimento).

## Limites conhecidos

- **Ensaio físico não feito:** impressão, leitura do QR e legibilidade em etiqueta real seguem agendados (aceite do desenho). O QR usa o endereço local da demonstração.
- **"definida por <nome> em <data>"** usa o nome de quem manipulou e a data da manipulação; o banco não guarda outra pessoa como autora da validade.
- **Faixa sem hífen:** o modelo de PDF não tem travessão; a faixa mostra "BLOQUEADO aguardando decisão".
- Texto longo demais (nome, fornecedor, nome de quem manipulou) recusa a etiqueta com mensagem, em vez de cortar.
- Sem impressão direta nem fila; só PDF (D-028).

## Pontos para luis decidir

1. **Data no recebimento:** manter ISO ou passar para dd/mm/aaaa. luis respondeu "não" a manter: os dois modelos usam dd/mm/aaaa.
2. **Autor da validade:** "definida por <manipulou> em <data da manipulação>" serve, ou a tela deve pedir quem definiu a validade (campo próprio)?
3. **Texto da faixa** sem hífen, como acima.
4. **Quantidade** impressa na etiqueta (rotulada "na criação" e "entrada"), como no desenho 7.2.

## Decisão proposta para `DECISOES.md`

**D-044 — Etiquetas de recebimento e de produto aberto (proposta):** dois modelos de PDF 100 × 100 mm, com todos os campos obrigatórios legíveis sem o QR; reimpressão não grava nada; "baixar esta" e "baixar todas"; recusa (anulada, tardia sem liberação, dados da manipulação ausentes) interrompe o arquivo; nenhum texto afirma conformidade sanitária. **Revisar quando** o ensaio físico (tamanho, QR, impressora) ou a conferência normativa (Q10) pedirem outro texto ou tamanho.

## Próximo passo

**Aceita por luis em 14/11/2026 00:24 UTC** ("1 não, 2 ok, 3 ok, 4 ok"): data unificada em dd/mm/aaaa nos dois modelos (a asserção do E2E de catálogo e a do teste do PDF foram atualizadas para o novo formato, conferindo o mesmo campo, sem enfraquecê-las); "definida por" com quem manipulou; faixa sem hífen; quantidade como no desenho. Interpretado como aceite da fatia e da D-044 (agora aceita em `DECISOES.md`). O aceite não autoriza merge: integrar só com pedido de luis. A 6.8 foi aprovada na mesma mensagem.
