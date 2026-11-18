# Tarefa: Fase 8, fatia 8.4a — modo hospedado e ambiente de testes

- **ID:** fase-08-4a-hospedagem-testes
- **Responsável / sessão:** Claude Code (thread "Preparar modo hosted e ambiente de testes")
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** antecipar parcialmente a 8.4 (D-065/PLANO_INTEGRACAO): modo `hosted` preservando `local` e `demo`; falha explícita em hospedagem mal configurada; variáveis; CSP e cabeçalhos; migração de provisionamento e reset **validada só localmente**; cadastro público restrito; verificação de RLS/isolamento; reset do banco de testes com travas. Relatório: `docs/FASE_08_4A.md`.
- **Branch / worktree / base:** `claude/fase-08-4a-hospedagem-testes`, a partir da `main` em `98cfa5d` (já com #22 a #27 e #28; sem #29, #30 e o restante da cadeia). Nada foi aplicado no Supabase hospedado nem implantado no Cloudflare.
- **Arquivos e recursos em uso:** `src/shared/config/*`, `src/shared/security/headers.ts`, `src/app/*`, `vite.config.ts`, `supabase/migrations/20261118000000_hosted_provisioning.sql`, `scripts/hosted/`, `.env.example`, `docs/`.
- **Dependências e riscos:** a migração é posterior a todas as da cadeia (a mais nova, 20261116000000); aplicar no hospedado só depois da cadeia na `main` (ver o relatório). Sem merge, deploy ou alteração no banco hospedado sem autorização específica de luis.
- **Próximo passo:** aceite de luis; depois ele executa o guia de configurações do relatório.

## Checkpoints

### 18/11/2026 — Claude Code
- **Feito:** tudo da lista acima, com testes (resultados reais no relatório).
- **Pendências / riscos:** ver `docs/FASE_08_4A.md`, seção "Limites e decisões para luis".
