# Tarefa: prévia da etiqueta (M9 do diagnóstico de interface)

- **ID:** previa-etiqueta
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** na ficha do recipiente, antes de baixar, "Ver prévia da etiqueta" mostra em tela o mesmo texto que o PDF imprime (modelo, nome, validade em destaque, linhas, código, ID, faixa de bloqueio e QR), com o aviso "Baixar o PDF não comprova impressão nem aplicação da etiqueta". Aprovada por luis (27/11/2026, "previa"). Aceite: **conteúdo do PDF e QR idênticos**; mesmas recusas do PDF; só leitura (não grava nem baixa); bateria inteira verde; luis aceita.
- **Branch / base:** `claude/previa-etiqueta`, base `main` `4da2d4a` (PR-15, #96). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `src/features/labels/application/labelContent.ts` (novo: fonte única dos textos, `refuse`, `validateLabels`), `pdf.ts` (passa a ler os textos de `labelContent`; fontes e posições intactas), `components/LabelPreview.tsx` (novo), `components/LabelView.tsx` (mostra a prévia junto do botão do PDF, sob as mesmas condições), `src/app/styles.css` (bloco `.label-sheet`), testes: `pdfContent.test.ts` (novo), `LabelPreview.test.tsx` (novo), `LabelView.test.tsx`, E2E `label-preview.spec.mjs`.
- **Como o PDF foi mantido igual:** antes de tocar `pdf.ts`, calculei o SHA-256 (sem a data de criação) do PDF de 11 casos (recebimento simples, completo, bloqueado e com nome longo; porção, porção bloqueada, abertura inteira e sem validade do fabricante; preparação, bloqueada e porção de preparação) e de um arquivo com todos juntos, com o gerador anterior. `pdfContent.test.ts` trava esses valores: o PDF novo sai byte a byte igual. Se atualizar o jsPDF ou mudar um texto de propósito, os valores mudam e precisam de revisão.
- **Prévia = PDF:** `LabelPreview.test.tsx` confere que cada texto da prévia aparece no PDF gerado (4 modelos, inclusive a faixa de bloqueio) e que as recusas (anulada, tardia sem liberação, caractere sem suporte, endereço não autorizado) têm a mesma mensagem.
- **Limites (honestos):** a prévia é uma imitação em tela, não a imagem do PDF: fonte e quebra de linha podem diferir do arquivo. Ela não prova impressão nem aplicação da etiqueta; o aviso diz isso na tela. Não escolhe impressora nem imprime. O nome muito longo que "não cabe" no PDF continua recusado só ao baixar (o ajuste de linhas é do desenho do PDF, que não mudou).
- **Dependências e riscos:** nenhuma migração, RPC, regra, permissão, rota ou QR. O QR da prévia usa a mesma URL e a mesma regra de endereço autorizado do PDF. Risco médio-baixo: `pdf.ts` foi refatorado, protegido pelos hashes.
- **Próximo passo:** luis revisar capturas (celular, tablet em pé e deitado, notebook); merge só com autorização específica (publica o site).

## Checkpoints

### 27/11/2026 — Claude Code

- **Feito:** extração do texto, componente de prévia, testes, capturas antes e depois. Bateria inteira local em execução.
