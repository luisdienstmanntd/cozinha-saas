# Submenu de Cadastros

- Base: `d5f55f8`. Branch: `codex/submenu-cadastros`. Estado: implementação local verificada, E2E autenticado pendente.
- Aceite: Cadastros expande destinos existentes no desktop e celular, com links para seções, operação por teclado e acesso por perfil preservado. Formulários continuam montados. Sem mudança de banco ou fluxo de publicação.
- Verificar a imagem do menu hospedado e registrar o resultado da verificação.

- Implementação: submenu com cinco destinos, links com âncora, foco por teclado e barra móvel. O WebP hospedado respondeu com HTTP 200, tipo `image/webp` e bytes idênticos aos do repositório.
- Verificação intermediária: 31 testes focados passaram. O Chromium com componentes reais e dados fictícios conferiu expansão, foco, âncora, Esc, dimensões de toque e ausência de rolagem horizontal em 1440, 390 e 320 px.

- Lint, TypeScript, 592 testes Vitest, build e `git diff --check` passaram. O Playwright autenticado ficou bloqueado na inicialização porque o Supabase local estava indisponível. O cenário de navegação recebeu uma asserção de URL e foco para validar no CI quando a branch for publicada.
