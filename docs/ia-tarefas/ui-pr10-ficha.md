# Tarefa: PR-10 do roadmap de interface — Ficha organizada

- **ID:** ui-pr10-ficha
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento
- **Objetivo e aceite:** reorganizar a ficha do recipiente (`LabelView`) em blocos: título e selo, alertas (vencido, bloqueio, anulado, produção anulada, recusas de etiqueta), fatos (tipo, produção, produto e lote, quantidade e validade, saldo em destaque), bloco da etiqueta (formato + botão) e "Origem e derivados" com linha do tempo e ações agrupadas. Aceite: mesmos textos, papéis, ações, permissões e contratos; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/ui-pr10-ficha`, base `main` `cefb0ae` (PR-09, #90). O PR #81 (Equipe) não foi tocado.
- **Arquivos:** `src/features/labels/components/LabelView.tsx` (só marcação: contêineres `.ficha-*`; alertas movidos para antes dos fatos; o botão "Gerar etiqueta PDF" aparece nas mesmas condições de antes), `src/app/styles.css` (bloco `.ficha-*`), `LabelView.test.tsx` (2 testes novos), `docs/IA_ESTADO.md`.
- **Decisões:** nenhum texto mudou, então os testes e E2E existentes seguem valendo sem alteração; a região continua "Recipiente". Sem tabela `dl` para não quebrar leitores de tela nem as buscas por texto existentes. Só interface: sem migração, RPC, regra de validade, saldo, bloqueio, permissão, rota ou QR.
- **Dependências e riscos:** risco médio por mexer na tela de abrir/porcionar/anular; mitigado por manter o JSX das ações e formulários intactos (só a div `.ficha-actions` ao redor de "Abrir / porcionar"/formulário) e pelos testes existentes de ficha (Vitest e E2E de manipulação, produção e cartões).
- **Próximo passo:** luis revisar capturas antes/depois; merge só com autorização específica (publica o site). PR-11 só com aprovação própria.

## Checkpoints

### 26/11/2026 — Claude Code

- **Feito:** reorganização e 2 testes de regressão; Vitest da pasta labels verde (77). Bateria inteira local em execução.
