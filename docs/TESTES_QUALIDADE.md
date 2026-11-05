# Política de Qualidade (obrigatória)

## Níveis de teste
1. **Unitários (Vitest):** funções puras (validade, status, quantidade, formatação, regras de data, limites). Casos normais, extremos e inválidos.
2. **Componentes (React Testing Library):** formulários, acessibilidade, erros de validação e mensagens. Evitar testes acoplados à implementação interna.
3. **Integração:** repositórios/serviços/API, gravação e recuperação, movimentação atômica e geração de PDF/QR.
4. **Banco + autorização (Supabase CLI / pgTAP + testes via cliente):** migrações, constraints, RLS, leitura/escrita negadas entre empresas, injeção de `organization_id`, acessos anônimos e colaboradores removidos.
5. **E2E (Playwright):** login, criar produto/lote, gerar/reimprimir etiqueta, pesquisar validade, registrar descarte, ver auditoria. Testes contra ambiente descartável com dados fictícios.

## Testes de regressão especialmente importantes
- A não consegue ler, editar, imprimir, exportar ou consultar registros de B.
- Usuário não pode mudar seu `organization_id` para adquirir permissão.
- Reimprimir etiqueta não aumenta saldo e não cria novos eventos de entrada.
- Clique duplo/reenvio não causa duplicidade de recebimento ou movimentação (idempotência).
- Dois operadores não podem consumir a mesma quantidade sem consistência transacional.
- Quantidades inválidas/negativas e unidade de medida incompatível são recusadas.
- Vencimento em limite de dia/fuso da cozinha aparece corretamente; futuro/presente/passado, mudança de timezone, datas inválidas.
- É impossível salvar validade antes da manipulação/original sem exceção explícita e rastreada.
- Alteração de validade mantém autoria, motivo e histórico; vencidos não desaparecem silenciosamente.
- QR não revela informação sensível a usuário sem permissão.
- Impressão com erro de conexão não elimina o lote e não registra movimentação fictícia.
- Mudança de migração não contorna RLS ou integridade referencial.

## Gates por etapa
- *Fase 0*: documentação e decisões, sem código de produto; testar estrutura/sintaxe dos arquivos de configuração.
- *Fase 1*: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` com resultado 0. Pelo menos um teste unitário e um de componente reais, sem testes fictícios.
- *Fase 2*: testes pgTAP e via cliente para políticas de organizações/unidades/membros, em ambiente Supabase local ou equivalente; resultado documentado.
- *Fase 3*: testes de produtos/lotes e datetimes + E2E para fluxo principal. Continuar sem deploy público.

## Regras obrigatórias
- Não fixar cobertura artificial por testes triviais; buscar cobertura significativa de decisões do domínio. Relatar cobertura por arquivo e lacunas.
- Se não houver Docker/navegador/serviço, reportar bloqueio; não substituir teste de integração por um mock e chamar de completo.
- Falhas em lint, TypeScript, unitário, build ou RLS atingida bloqueiam avanço.
- Registrar comandos e resultado exato ao final de cada fase; `SKIP` não é `PASS`.
- Não usar banco/produtos/usuários reais em testes automatizados.
