# Equipe da empresa pelo site (D-077, fatia B da auditoria)

Status: implementada na branch `claude/gestao-equipe` (base `main` `a504672`), PR em rascunho. **Nada aplicado no Supabase hospedado** e nada publicado. Desenho aprovado na thread do projeto em 26/11/2026; aceite final de luis pendente.

## 1. Problema

Até aqui a equipe só mudava por SQL (`private.add_member_to_organization`, D-067). Não havia tela para ver quem tem acesso, e **nenhum caminho gravava `memberships.revoked_at`**: um ex-funcionário continuava entrando. Ver `AUDITORIA_FUNCIONALIDADES_SEM_TELA.md` (PR #79), item 1 e fatia B.

## 2. O que muda na tela

- Área **Equipe** em Configurações, entre Unidade e Organização, **só para o proprietário** (colaborador não vê o item; o endereço direto `?area=config-equipe` volta à Visão geral).
- Cabeçalho padrão das áreas: título "Equipe", descrição e o botão "Adicionar pessoa".
- **Com acesso (n):** nome de exibição, papel (Proprietário/Colaborador), e-mail da conta, "desde" e a marca "Você" na própria linha. Ações: Editar nome; Tornar proprietário/colaborador; Revogar acesso. A própria linha só tem Editar nome. Trocar papel e revogar pedem confirmação com o efeito explicado ("perde o acesso na hora, inclusive se estiver com o aplicativo aberto; os registros continuam no histórico").
- **Acesso revogado (n):** seção recolhida, com a data e "Restaurar acesso" (volta como colaborador).
- **Adicionar pessoa:** e-mail da conta, nome de exibição e papel. A conta precisa existir e estar confirmada.
- Mensagens só em português, da lista fechada de recusas do banco; erro inesperado vira "Não foi possível concluir. Tente de novo." sem detalhe técnico.

## 3. Regras no banco (`20261126000000_team_management.sql`)

| Regra | Como |
|---|---|
| Só o proprietário ativo da própria empresa age | `private.lock_team` confere `has_membership(org, true)` (inclui sessão ativa da V2) **depois** de trancar a linha da empresa |
| Dois proprietários ao mesmo tempo não deixam a empresa sem dono | `select … for update` na empresa serializa; o segundo reconfere o próprio papel e recebe "Acesso negado" (teste de integração com duas sessões reais) |
| Ninguém troca o próprio papel nem se revoga | `22023`, mensagem orientando a pedir a outro proprietário |
| Nunca sem proprietário ativo | `active_owner_count` antes de rebaixar ou revogar um proprietário (`23514`) |
| Uma conta, um vínculo ativo (D-025) | Conta inexistente, não confirmada ou já vinculada em outra empresa: **mesma mensagem** (`P0002`), sem revelar a outra empresa |
| Nada é apagado | Revogar grava `revoked_at`; restaurar limpa `revoked_at` na mesma linha e volta como `member` |
| Revogação vale na hora | As políticas e funções de escrita já exigiam `revoked_at is null`; nenhuma mudança nelas |
| Auditoria | Gatilhos gravam em `entity_changes` (`entity='membership'`, campos `role` e `access`, com `changed_by`). O vínculo criado numa sessão (pelo site) também; o provisionamento por SQL continua sem autor, como antes |
| API | Funções privadas SECURITY DEFINER com `search_path` vazio; fachada pública SECURITY INVOKER; `anon` sem execução; nenhum INSERT/UPDATE direto em `memberships` |

Funções da API: `list_team_members(org)`, `add_team_member(org, email, nome, papel)`, `set_team_member_role(org, pessoa, papel)`, `revoke_team_member(org, pessoa)`, `restore_team_member(org, pessoa)`. Editar nome usa a função existente `set_member_display_name`.

## 4. Fora desta fatia

- **Criar a conta ou convidar por e-mail pelo site.** Exige função de servidor com a chave de serviço fora do navegador e e-mail configurado no projeto hospedado (fatia C). Até lá, a conta é criada em Authentication > Users (Add user, Auto Confirm) e o proprietário a vincula pela tela Equipe.
- Colaborador editar o próprio nome; motivo da revogação; encerrar à força as sessões do revogado (não é preciso: ele já não lê nem grava nada).

## 5. Testes

- **pgTAP** `supabase/tests/team_management.test.sql`: privilégios; colaborador, revogado e proprietário de outra empresa recusados; listagem com e-mail, ordem e "você"; validações; mensagem igual para conta inexistente, não confirmada e de outra empresa; vincular, trocar papel (idempotente), revogar (idempotente, efeito imediato na leitura), restaurar (como colaborador, mesma linha, sem duplicar); rebaixado perde o poder na operação seguinte; auditoria com autor; UPDATE/DELETE diretos recusados; colaborador não lê a auditoria.
- **Integração** `tests/integration/team-management.test.mjs`: fluxo pela API real (supabase-js) com a sessão aberta da pessoa revogada; corrida entre dois proprietários com duas sessões psql.
- **Vitest** `src/features/team/team.test.tsx` e `workspaceAreas.test.ts`: domínio, gateway, tela (confirmações, cancelar, último proprietário, recusas, erro sem detalhe, editar nome, restaurar, falha ao carregar).
- **E2E** `tests/e2e/team.spec.mjs`: proprietário (recusa genérica, adicionar, trocar papel, revogar com o colaborador logado em outro navegador, restaurar, celular sem rolagem lateral) e colaborador sem a área.

Resultados reais da bateria: no registro da tarefa (`ia-tarefas/equipe-empresa.md`) e no PR.

## 6. Aplicação no hospedado (NÃO executada; só com autorização específica de luis)

Ordem obrigatória: **migração antes do merge**. O merge publica o site; se o site novo sair antes da migração, a área Equipe mostra "Não foi possível carregar a equipe." (o resto do site não depende dela).

1. Autorização escrita de luis para aplicar **esta** migração em `cozinha-saas-testes`.
2. Na máquina de luis, na branch do PR atualizada: `npx supabase link --project-ref wtscafnacsmyfmqcaffy`.
3. `npx supabase db push --remote --dry-run`: deve listar **só** `20261126000000_team_management.sql` (as 30 anteriores já estão aplicadas desde 18/11). Qualquer outra: pare.
4. `npx supabase db push --remote`; depois `npx supabase migration list --remote` (local e remoto iguais) e, no SQL Editor, `notify pgrst, 'reload schema';`.
5. Conferências só de leitura: `npx supabase db advisors --linked --type security --level warn` sem aviso novo; `select count(*) from pg_tables where schemaname='public' and not rowsecurity;` = 0.
6. Só então, com autorização própria, o merge (publica o site). Depois, com o proprietário fictício: abrir Equipe, conferir a lista e revogar/restaurar o colaborador fictício.

**Reversão:** a migração não cria tabela nem coluna e não altera dados. Para desfazer, remover as funções e gatilhos listados no fim do arquivo da migração; os `revoked_at` gravados continuam valendo e as linhas de auditoria ficam (append-only).

## 7. Capturas

Antes (menu sem Equipe) e depois (lista, recusa, confirmação, revogados, celular) na pasta do projeto, fora do repositório (`capturas-equipe-d077/`). Dados fictícios.
