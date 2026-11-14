# Tarefa: Fase 6, fatia 6.9 — locais de armazenamento e mudança de local

- **Responsáveis / estado:** Claude Code; implementada em 14/11/2026 (aprovada por luis: "6.9 aceito", 00:48 UTC), aguardando aceite.
- **Branch / base:** `claude/fase-06-9-locais`, sobre `claude/fase-06-8-recuperacao-tentativa` (PR #16, sem merge). PR em rascunho.
- **Escopo:** `storage_locations`, `location_moves` (append-only), `create_storage_location`, `set_storage_location_active`, `move_container`, `list_container_locations`, herança do local pelos derivados, painel de locais e "Mudar de local". Registro em `docs/FASE_06_9.md`.
- **Última evidência registrada:** lint, typecheck, format, build, 228 Vitest, 1034 pgTAP, 28 de integração e 14 E2E passaram.
- **Pendências:** aceite de luis (4 pontos, D-046); local na etiqueta e local inicial atômico ficaram de fora.
- **Próximo passo:** luis revisa os 4 pontos. Sem merge sem pedido dele; 6.10 exige aprovação própria.
