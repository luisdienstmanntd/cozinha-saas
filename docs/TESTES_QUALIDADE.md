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

## Teste pgTAP dependente do horário corrigido (16/11/2026)

luis aprovou, em 16/11/2026, corrigir em tarefa separada o teste 69 de `container_handling.test.sql`, que falhava quando executado entre 00:00 e 00:10 no horário de São Paulo, com a mesma condição da correção anterior: determinístico **sem reduzir o rigor, remover verificações ou alterar regra de negócio**. Nenhuma migração, função ou regra do produto foi tocada.

### `container_handling.test.sql`, teste 69 ("origem vencida na data da manipulação recusada")

- **Sintoma:** a CI do PR #34 falhou às 03:06 UTC de 16/11/2026 (00:06 em São Paulo). O banco recusou a manipulação, mas com a mensagem "A validade após abertura não pode passar da validade do recipiente de origem." em vez de "Recipiente de origem vencido na data da manipulação; manipular não recupera validade.".
- **Causa:** o recipiente de origem do teste vence ontem no fuso da unidade (`(now() at time zone 'America/Sao_Paulo')::date - 1`), mas a manipulação usava o horário padrão do auxiliar `pg_temp.h`, `now() - interval '10 minutes'`. O banco confere a validade da origem contra o **dia da manipulação** no fuso da unidade. Entre 00:00 e 00:10, "10 minutos antes" cai no dia anterior, que é a própria validade da origem; naquele dia a origem ainda não estava vencida, e a recusa vinha da regra seguinte (validade pedida posterior à da origem). Fora dessa janela o teste passava.
- **Solução:** o teste 69 passa `p_handled_at => now()`, o instante do registro, que está sempre no dia de hoje do fuso da unidade, depois do recebimento da origem e dentro da janela de 2 horas. A origem fica, a qualquer hora, vencida desde o dia anterior ao da manipulação.
- **Rigor mantido:** o teste confere a mesma regra, com o mesmo código (`22023`) e a mesma mensagem exata, e continua recusando pela regra de origem vencida, que é a primeira das verificações de validade. A contagem de testes do arquivo (148) não mudou. Nenhum outro teste do arquivo depende do horário padrão perto da meia-noite: os demais usam validades com folga de vários dias ou comparam com o dia de hoje no fuso da unidade.

### Como conferir

Além de `npx supabase test db`, a falha pode ser reproduzida a qualquer hora trocando, numa cópia do arquivo, `America/Sao_Paulo` por um fuso real cuja hora local esteja entre 00:01 e 00:08 e executando a cópia com `psql` no contêiner do banco. A versão anterior falha no teste 69; a corrigida passa nos 148.
