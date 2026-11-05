# COMANDO 03 — PRIMEIRA FATIA VERTICAL OPERACIONAL

Somente após F2 passar em RLS e ser aprovada. Leia `AGENTS.md`, `docs/PRODUCT_BRIEF.md`, `docs/TESTES_QUALIDADE.md` e decisões.

Meta: dentro de **um** estabelecimento autorizado, cadastrar produto/fornecedor, registrar lote, criar ID de recipiente/etiqueta, gerar PDF/QR e consultar validade. **Não** controlar produção, inventário completo ou CMV.

Planejar migrations/constraints e estados antes de implementar. Ao criar/alterar cada recurso, escrever testes unitários, de componente, integração SQL e RLS. Testes adicionais críticos:
- reimpressão preserva identidade e quantidade;
- submissão dupla não duplica lote nem entrada;
- origens de validade (original e definida pelo responsável) não são confundidas;
- limite de dia/fuso da cozinha e datas inconsistentes;
- um usuário A não recupera lote ou QR de B;
- geração de PDF usa dados do recipiente correto e nenhuma informação sensível desnecessária.

Se for grande para uma iteração, divida em 03A produtos, 03B lotes, 03C etiquetas e 03D validade. Conclua cada incremento com testes reais e solicite aprovação. **Não faça deploy**.
