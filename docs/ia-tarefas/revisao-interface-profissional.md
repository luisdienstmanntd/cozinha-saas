# Tarefa: revisão da interface para apresentação de produto (D-075)

- **ID:** revisao-interface-profissional
- **Responsável / sessão:** Claude Code (nuvem), a pedido de luis em 25/11/2026
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** logo sempre visível; início só com escolha de unidade, alinhado; opções de configuração só em Configurações; mesmo cabeçalho em todas as áreas; nenhuma palavra de teste vinda do código; proposta de renomeação dos dados do hospedado. Bateria inteira verde, sem teste enfraquecido.
- **Branch / worktree / base:** `claude/revisao-interface-profissional` / `main` `0bbeec0`
- **Arquivos e recursos em uso:** `src/shared/ui/brand/BrandLogo.tsx` (novo), `src/features/identity/components/IdentityHome.tsx`, `src/features/navigation/components/OperationsNav.tsx`, `src/features/demo/components/DemoHome.tsx`, `src/features/batches/components/BatchPanel.tsx`, `src/features/settings/components/SettingsPanel.tsx`, `src/shared/format/dates.ts`, `src/app/styles.css`, testes novos e `tests/e2e/establishments.spec.mjs`, `tests/e2e/expiry-pagination.spec.mjs`; docs. Sem banco.
- **Dependências e riscos:** merge publica o site (só com aval de luis). Renomeação no hospedado só com autorização específica. Causa exata do logo quebrado no Cloudflare não observada (ambiente sem acesso a `pages.dev`); conferir na prévia do PR.
- **Próximo passo:** luis conferir a prévia do Cloudflare do PR e aceitar; depois decidir a renomeação dos dados.

## Checkpoints

### 25/11/2026 — Claude Code

- **Feito:** diagnóstico por área com Playwright (desktop e celular, proprietário e colaborador) em empresa fictícia local; implementação descrita em `docs/REVISAO_INTERFACE_PROFISSIONAL.md`.
- **Testes:** ver PR (lint, typecheck, Prettier, Vitest, build, scripts de CI, pgTAP, integração e E2E locais).
- **Estado do ambiente:** Supabase local em Docker; `db reset --local` antes do pgTAP.
- **Próximo passo:** CI do PR e aceite de luis.
