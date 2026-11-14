# Tarefa: Fase 6, fatia 6.9 — locais de armazenamento e mudança de local

- **Responsáveis / estado:** Claude Code; implementada em 14/11/2026 (aprovada por luis, 00:48 UTC), aceita por luis em 14/11/2026 01:42 UTC com a D-046.
- **Branch / base:** `claude/fase-06-9-locais`, sobre `claude/fase-06-8-recuperacao-tentativa` (PR #16, sem merge). PR em rascunho.
- **Escopo:** `storage_locations`, `location_moves` (append-only), `create_storage_location`, `set_storage_location_active`, `move_container`, `list_container_locations`, herança do local pelos derivados, painel de locais e "Mudar de local". Registro em `docs/FASE_06_9.md`.
- **Última evidência registrada:** lint, typecheck, format, build, 228 Vitest, 1034 pgTAP, 28 de integração e 14 E2E passaram.
- **Pendências:** local na etiqueta e local inicial atômico ficaram de fora (revisar no piloto).
- **Próximo passo:** sem merge sem pedido de luis; a 6.10 foi aprovada e segue em `fase-06-10-pre-piloto.md`.
