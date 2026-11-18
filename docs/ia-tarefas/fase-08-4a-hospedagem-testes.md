# Tarefa: Fase 8, fatia 8.4a — modo hospedado e ambiente de testes

- **ID:** fase-08-4a-hospedagem-testes
- **Responsável / sessão:** Claude Code (thread "Preparar modo hosted e ambiente de testes")
- **Estado:** aguardando_aceite (aprovada por luis em 18/11/2026 com seis condições, tratadas; PR #44 espera a integração da cadeia)
- **Objetivo e aceite:** antecipar parcialmente a 8.4 (D-065/PLANO_INTEGRACAO): modo `hosted` preservando `local` e `demo`; falha explícita em hospedagem mal configurada; variáveis; CSP e cabeçalhos; migração de provisionamento e reset **validada só localmente**; cadastro público restrito; verificação de RLS/isolamento; reset do banco de testes com travas. Relatório: `docs/FASE_08_4A.md`.
- **Branch / worktree / base:** `claude/fase-08-4a-hospedagem-testes`, a partir da `main` em `98cfa5d` (já com #22 a #27 e #28; sem #29, #30 e o restante da cadeia). Nada foi aplicado no Supabase hospedado nem implantado no Cloudflare.
- **Arquivos e recursos em uso:** `src/shared/config/*`, `src/shared/security/headers.ts`, `src/app/*`, `vite.config.ts`, `supabase/migrations/20261118000000_hosted_provisioning.sql`, `scripts/hosted/`, `.env.example`, `docs/`.
- **Dependências e riscos:** a migração é posterior a todas as da cadeia (a mais nova, 20261116000000); aplicar no hospedado só depois da cadeia na `main` (ver o relatório). Sem merge, deploy ou alteração no banco hospedado sem autorização específica de luis.
- **Próximo passo:** aceite de luis; depois ele executa o guia de configurações do relatório.

## Checkpoints

### 18/11/2026 — Claude Code
- **Feito:** tudo da lista acima, com testes (resultados reais no relatório).
- **Pendências / riscos:** ver `docs/FASE_08_4A.md`, seção "Limites e decisões para luis".

### 18/11/2026, 00:50 UTC — Claude Code
- **Feito:** seis condições de luis tratadas (D-066→D-067, lista explícita no reset, cadeado e nulos, sessões, MFA, exposição automática). Detalhes em `FASE_08_4A.md`, seção 13.
- **Testes:** pgTAP 1389, integração 43, E2E 19, advisors sem problemas; bateria repetida sem privilégios padrão de tabelas novas.
- **Próximo passo:** quando a cadeia (#29 em diante) estiver na `main`, merge da `main` nesta branch (sem reescrever histórico), classificar `production_label_downloads` e `production_temperatures` nas listas do reset, resolver os 4 conflitos e rodar a bateria completa no código combinado.

### 18/11/2026, tarde — Claude Code
- **Feito:** merge da `main` (`1e3cd0e`) na branch (`b3a9e44`), seis conflitos resolvidos; reset com `production_label_downloads` e `production_temperatures`; `session_activity` testada como intocada.
- **Testes (código combinado):** Vitest 552, pgTAP 1496, integração 57, E2E 35, advisors sem problemas; também sem privilégios padrão de tabelas novas.
- **Próximo passo:** aceite de luis; guia da primeira hospedagem em `FASE_08_4A.md`, seção 10. Sem merge, deploy ou migração no hospedado sem autorização.
