# Tarefa: Minha conta — trocar senha e ativar verificação em duas etapas (MFA)

- **ID:** minha-conta
- **Responsável / sessão:** Claude Code (thread "Diagnóstico e roadmap de interface")
- **Estado:** em_andamento (PR em rascunho; sem merge)
- **Objetivo e aceite:** cada pessoa troca a própria senha e liga/desliga um segundo fator por aplicativo autenticador (TOTP). Quem ativou passa a informar o código na entrada. Aceite: tela em celular e tablet; código errado recusado; remover o fator exige o código atual; bateria inteira verde; luis aceita.
- **Branch / base:** `claude/minha-conta`, base `main` `6a2c9ed` (prévia da etiqueta, #97). O PR #81 (Equipe) não foi tocado.
- **Viabilidade (verificada no Auth local, `tests/integration/account-mfa.test.mjs`):** cadastro, confirmação, nova entrada, desafio, troca de senha e remoção funcionam. `touch_session` (regra dos 30 minutos) funciona com sessão aal1 e aal2. **Não há migração e a regra de sessão de 30 minutos não mudou.**
- **Arquivos:** `src/features/account/*` (domínio, gateway, `supabaseAccount.ts`, `AccountPanel.tsx`); nova área `config-conta` ("Senha e acesso", grupo Configurações, todos os perfis) em `areas.ts`, `workspaceAreas.ts`, `areaIcons.ts` e `App.tsx` (só monta ao abrir); passo do código na entrada em `IdentityHome.tsx`, `identityGateway.ts` (`mfaRequired`, `verifyMfa`) e `supabaseIdentity.ts`; `supabase/config.toml` (TOTP ligado para o Auth **local e do CI**); `scripts/totp.mjs` (gera o código nos testes); testes unitários, `tests/integration/account-mfa.test.mjs` e `tests/e2e/account.spec.mjs`; helper `areas.mjs` (grupo Configurações).
- **Decisões:** o nome da área é "Senha e acesso" porque o menu do cabeçalho já se chama "Minha conta" (e-mail e Sair). Senha nova: 8 a 72 caracteres, com confirmação; a troca não pede a senha atual (o Auth local não exige; ver riscos). Remover o fator exige o código atual. Cadastro iniciado e não confirmado é descartado ao cancelar ou ao iniciar outro. Recarregar uma sessão que só tem a senha (aal1) de quem tem fator **não** entra: `currentUser()` devolve nulo e a consulta que falha conta como pendente (nega por padrão).
- **Limites (importante):** (1) **o banco não exige aal2**: a verificação é uma trava da tela e do Auth; quem tiver uma sessão só com senha ainda alcança a API pelas políticas atuais. Exigir aal2 nas políticas é outra proposta (migração), fora desta fatia. (2) **O MFA TOTP precisa ser ligado no painel do Supabase hospedado** (Authentication → Sign In / Providers → Multi-Factor) por luis; sem isso, "Ativar" mostra erro em português. Confirmar se o plano Free permite. (3) Sem códigos de recuperação nem troca de aparelho: quem perder o aplicativo precisa de ajuda de suporte (remoção do fator no Auth). (4) MFA obrigatório para o comercial continua pendência.
- **Testes novos:** domínio, gateways (`supabaseAccount.test.ts`, `supabaseIdentity.test.ts`), tela (`AccountPanel.test.tsx`, `IdentityMfa.test.tsx`), integração com TOTP real, E2E completo (ativar, sair, entrar com código errado e certo, recarregar, trocar senha, remover). Listas de áreas dos testes de navegação ganharam "Senha e acesso" (acréscimo; nada enfraquecido).
- **Capturas:** `/mnt/project-files/minha-conta/` (celular e tablet).

## Checkpoints

### 27/11/2026 — Claude Code

- **Feito:** implementação, testes novos e capturas. Bateria inteira local em execução.
