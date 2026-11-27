# Tarefa: Auditoria de funcionalidades sem tela

- **ID:** auditoria-funcionalidades-sem-tela
- **Responsável / sessão:** Claude Code (thread do projeto)
- **Estado:** aguardando_aceite
- **Objetivo e aceite:** cruzar o que o banco e a camada de dados oferecem com o que a interface expõe, por papel, e propor fatias. Só documentação; nada implementado.
- **Branch / worktree / base:** `claude/auditoria-funcionalidades-sem-tela`, base `main` `1baa836`
- **Arquivos e recursos em uso:** `docs/AUDITORIA_FUNCIONALIDADES_SEM_TELA.md`, este registro, `docs/IA_ESTADO.md`. Nenhum acesso ao Supabase hospedado.
- **Dependências e riscos:** a coluna "tela" vem da leitura do código, não de navegação no site.
- **Próximo passo:** luis escolher quais fatias (A a F) aprovar; D-076 é o próximo número livre.

## Checkpoints

### 26/11/2026 — Claude Code
- **Feito:** auditoria escrita; PR em rascunho só de docs.
- **Testes:** não se aplica (sem código). Não executados.

## Retomada Codex — 27/11/2026

- Usuário aceitou os PRs #79 e #81 e autorizou merge e deploy. A `main` avançou a `e460a77`; ambos têm conflitos. Esta cópia isolada prepara a reconciliação do #79 com a main atual, preservando as entradas de coordenação das duas partes.
- Antes de concluir: confirmar CI no commit reconciliado, situação do #81 e aplicação segura da migração hospedada. O conector Supabase falhou ao iniciar; não presumir estado remoto. Evitar merge ou deploy enquanto os gates estiverem bloqueados.
