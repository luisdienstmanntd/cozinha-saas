# Trilha pré-piloto (fatia 6.10)

Documento operacional da 6.10 (`FASE_06_DESENHO.md`, seção 6.10; P4 e P8 de `REVISAO_05_SEGURANCA_PRODUTO.md`). **Nada aqui afirma conformidade sanitária ou legal**: a conferência normativa por nutricionista responsável técnico ou profissional habilitado (Q10) segue **pendente** e o profissional ainda não foi escolhido. Nenhum passo deste documento foi executado em ambiente hospedado; deploy e dados reais exigem autorização de luis (D-006).

## 1. Provisionar a empresa piloto

`scripts/provision.mjs` cria empresa, unidades, proprietário e membros com nome de exibição, tudo ou nada. **Só roda contra o Supabase local descartável**: qualquer outro destino é recusado. Para o ambiente hospedado, o procedimento equivalente fica para depois da autorização e da decisão sobre a chave de serviço.

```
node scripts/provision.mjs plano.json --credentials-out credenciais.json
```

Plano (JSON): `organization`, `establishments` (`name`, `timezone` IANA, por exemplo `America/Sao_Paulo`), `owner` (`email`, `displayName`) e `members`. O fuso é validado pelo banco e não muda depois do primeiro recebimento (6.0c).

- Senhas temporárias aleatórias vão **só** para o arquivo de credenciais (modo 0600, nunca sobrescreve). Nada de senha na saída do terminal. Entregue por canal seguro e apague o arquivo.
- Nomes de exibição passam pela função real (`set_member_display_name`, como proprietário) e ficam auditados.
- Repetir o plano é recusado (empresa de mesmo nome); plano inválido não deixa empresa nem usuário. A CI roda `tests/integration/provision.test.mjs`.
- Nome de exibição é dado pessoal (R6): nome curto, sem sobrenome completo, sem dado de saúde.

## 2. Autenticação hospedada (P4)

`supabase/production/auth.example.toml` reúne os valores a aplicar no projeto hospedado; o teste `src/compliance/productionAuth.test.ts` impede enfraquecê-los sem aviso. Lista de conferência:

| Item | Valor |
|---|---|
| Cadastro aberto e acesso anônimo | desligados |
| Senha | mínimo 12, com minúsculas, maiúsculas, dígitos e símbolos |
| Confirmação de e-mail | ligada |
| Troca segura de senha | ligada |
| MFA TOTP | inscrição e verificação ligadas |
| Limites de tentativa | mais baixos que os locais; revisar com o uso |
| Proteção contra senhas vazadas | **manual no painel** do projeto hospedado (não está no arquivo) |
| Senha temporária do provisionamento | trocada no primeiro acesso |

**Pendente, exige decisão de luis:** o P4 pede MFA **obrigatório** para proprietários. Ligar o TOTP só permite cadastrar o fator; torná-lo obrigatório exige código no aplicativo (tela de cadastro do fator e exigência de nível de autenticação nas políticas). Isso é funcionalidade nova e não entrou nesta fatia (I-16).

## 3. Dados pessoais (P8)

Onde há dado pessoal: e-mail (`auth.users`); nome de exibição (`memberships.display_name`); **cópias do nome** em registros imutáveis (`container_handlings.handled_by_name`, `location_moves.handled_by_name`); identificadores de autoria (`created_by` e semelhantes, que apontam para o usuário); texto livre de justificativas, observações e motivos (R6: a tela já pede para não escrever dados de pessoas).

Procedimento para pedido de exclusão (a definir e aprovar por luis antes do piloto; **nada disso está automatizado**):

1. Revogar o vínculo (`memberships.revoked_at`); a pessoa deixa de acessar e de aparecer como opção de "quem manipulou".
2. Anonimizar o usuário: trocar o e-mail por um endereço genérico, remover identidades e sessões, impedir novo login. O UUID permanece, para a autoria continuar íntegra.
3. Limpar `memberships.display_name` (a mudança fica em `entity_changes`).
4. **Cópias do nome nos registros imutáveis:** o histórico é append-only (6.0a). Sem suspender a proteção, o nome copiado não muda. Há duas saídas e **a escolha é de luis, com apoio jurídico e do profissional da Q10**: (a) manter o nome curto como parte do registro de rastreabilidade, informando isso à pessoa; (b) um procedimento controlado, auditado e fora do uso normal, que reescreve só essas colunas.
5. Texto livre: revisar a pedido da pessoa; a mesma restrição de imutabilidade vale.

Retenção e backup: **a definir** (prazo, local, quem acessa, teste de restauração). Não há número neste documento porque ele depende da orientação jurídica e sanitária ainda não obtida.

## 4. Métricas de observação do piloto

`public.pilot_metrics(empresa, unidade, de, até)` (só leitura, pela RLS; período até 366 dias) devolve, para o período:

| Métrica | Fonte | Para que serve (R12, R13, R15, I-17) |
|---|---|---|
| Manipulações; com validade igual à da origem; com validade menor | `container_handlings` | proporção de validades iguais à da origem |
| Atraso entre horário da manipulação e do registro (mediana e máximo, em segundos); manipulações tardias | `handled_at`, `created_at` | ajustar a janela provisória de 2 horas (D-031) |
| Ocorrências (total, tardias, sem decisão) | `occurrences` | peso do bloqueio |
| Decisões e tempo até a decisão (mediana e máximo) | `occurrence_decisions` | gargalo do proprietário (R15) |
| Anulações de manipulação; mudanças de local | `handling_voids`, `location_moves` | uso real |
| Recipientes vencidos que ainda têm saldo (fatia 6.11) | `container_balances` e validade do recipiente | vencidos esquecidos no estoque; fotografia **de agora**, na data da unidade, independente do período pedido |

**Não medido pelo banco** (as recusas não são gravadas e o papel fora do sistema não aparece lá): etiquetas feitas fora do sistema e tentativas de prazo recusadas. Durante a observação, registre à mão por turno: etiquetas feitas à mão, tentativas de "congelar para prorrogar" e pedidos de prazo acima da origem relatados pela equipe. Se o piloto mostrar que isso importa, a recusa passa a ser gravada em uma fatia própria.

### 4.1 Contagem manual de etiquetas fora do sistema (fatia 6.11)

O banco não sabe de etiqueta feita à mão nem de item sem etiqueta. A contagem é feita em papel ou planilha pelo proprietário (ou por quem ele indicar), na mesma ronda, sempre do mesmo jeito:

| Campo | Como preencher |
|---|---|
| Data e turno | data da ronda e turno (manhã, tarde, noite) |
| Local | o mesmo nome do local cadastrado no sistema (ex.: câmara 1, estoque seco) |
| Itens com etiqueta do sistema | quantos recipientes têm a etiqueta com QR |
| Itens com etiqueta feita à mão | quantos têm etiqueta fora do sistema |
| Itens sem etiqueta | quantos não têm etiqueta nenhuma |
| Itens com etiqueta de validade já passada | quantos, em qualquer tipo de etiqueta |
| Quem contou | iniciais ou função; **sem nome completo, foto ou outro dado pessoal** |

Regras: só números, sem foto e sem texto das etiquetas de terceiros; uma linha por local e turno; não apagar linha errada, riscar e escrever a correta ao lado. No fim da semana, comparar "etiqueta do sistema" com "à mão + sem etiqueta" e com a métrica de vencidos com saldo do banco. Se esse número for decisivo para o piloto, a contagem vira registro no sistema em fatia própria (ver `FASE_06_11.md`).

As métricas **não** medem segurança do alimento nem conformidade.
