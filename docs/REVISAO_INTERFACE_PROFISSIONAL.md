# Revisão da interface para apresentação de produto (D-075)

Pedido de luis em 25/11/2026: o site estava desorganizado, ao clicar em uma aba apareciam opções de
outra, a tela de início estava mal alinhada e com o logo quebrado, e nenhuma página deveria ter
palavras de teste. O site deve se apresentar como o produto real do piloto.

Só interface e testes. Sem banco, sem migração, sem alteração no Supabase hospedado.

## Método

Supabase local, empresa fictícia criada com `scripts/provision.mjs` (duas unidades, proprietário e
colaborador), quatro recebimentos com validades vencida, hoje, amanhã e em 30 dias. Todas as áreas
percorridas com Playwright em 1440 × 900 e 390 × 844, como proprietário e como colaborador, clicando
no menu (não só abrindo o endereço). Capturas antes/depois ficam fora do repositório, na pasta do
projeto `capturas-revisao-interface-25-11/` (sem dados reais).

## O que foi encontrado, por área

| Área | Problema | Mudança |
| --- | --- | --- |
| Logo | No site publicado, a imagem do menu não carrega (caixa branca com ícone quebrado). Localmente o arquivo e a referência estão corretos; a causa no Cloudflare não pôde ser observada daqui (o ambiente não alcança `pages.dev`). | Logo e marca embutidos no pacote como `data:` (já permitido pela CSP `img-src 'self' data: blob:`), sem segundo download. Se a imagem não decodificar, aparece o nome "CozziGo" escrito (`BrandLogo`). |
| Início (Unidades) | Lista com marcadores, fuso técnico ("America/Sao_Paulo"), botões "Abrir" desalinhados; "Gerenciar unidades" e "Nome da organização / Salvar nome" (opções de Configurações) misturados na escolha de unidade. | Um cartão por organização com selo do papel e uma linha por unidade: nome, fuso legível ("Horário Padrão de Brasília") e "Abrir" alinhado à direita. Gestão de unidades e nome da organização saem do início. Exceção: organização sem unidade continua mostrando a gestão no início, senão o proprietário não teria como criar a primeira. |
| Organização | Página sem título, só dois controles soltos. | Título "Organização" com subtítulo; bloco "Dados da organização" (nome) e bloco "Unidades" (gestão), com rótulo acima do campo e botão alinhado. |
| Validades | Título "Validade" diferente do menu ("Validades"); botão "Atualizar recebimentos" com termo de outra área. | Título "Validades" com subtítulo; botão "Atualizar lista" (renomeação já sugerida em `FASE_06_2.md`). No celular o subtítulo fica oculto para o primeiro cartão continuar na primeira tela (V3). |
| Recebimentos, Produção, Unidade | Cabeçalho em cartão pequeno, diferente de Visão geral, Etiquetas, Locais e Cadastros. | Mesmo cabeçalho de página em todas as áreas (título grande, subtítulo, ação principal à direita). Recebimentos ganhou subtítulo. Configurações da unidade: resumo das regras em cartão, uma por linha. |
| Palavras de teste | O código não exibe "teste", "demonstração" ou "fictício" no modo hospedado (D-074 já tinha tirado a faixa). Os nomes "CozziGo Teste B" e "Unidade Teste B" vêm dos **dados** do projeto hospedado. | Proposta de renomeação abaixo, para aprovação de luis. Nada foi executado no hospedado. |

Mantido de propósito: "Bloqueios e ocorrências" continua no fim de Validades (bloqueia itens da lista);
mover para Recebimentos fica a critério de luis.

## Renomeação dos dados no hospedado (proposta, não executada)

Executar só com autorização específica de luis, no SQL Editor do projeto hospedado, depois de conferir
os nomes atuais com a primeira consulta. Os nomes novos são fictícios e sem relação com o piloto real.

```sql
-- 1. Conferir o que existe (somente leitura).
select o.id, o.name as organizacao, e.id as unidade_id, e.name as unidade
from public.organizations o
left join public.establishments e on e.organization_id = o.id
order by o.name, e.name;

-- 2. Renomear (tudo ou nada). Ajuste os nomes antigos ao que a consulta 1 mostrar.
begin;
update public.organizations set name = 'Restaurante Bela Vista' where name = 'CozziGo Teste A';
update public.organizations set name = 'Cantina Serra Azul'     where name = 'CozziGo Teste B';
update public.establishments set name = 'Cozinha central'
  where name = 'Unidade Teste A'
    and organization_id = (select id from public.organizations where name = 'Restaurante Bela Vista');
update public.establishments set name = 'Cozinha principal'
  where name = 'Unidade Teste B'
    and organization_id = (select id from public.organizations where name = 'Cantina Serra Azul');
-- Conferir antes de confirmar: devem sobrar zero nomes com "Teste".
select name from public.organizations where name ilike '%teste%'
union all
select name from public.establishments where name ilike '%teste%';
commit; -- ou rollback; se algo não bater
```

A troca fica registrada no histórico (`entity_changes`) como mudança administrativa, sem autor
(`changed_by` nulo), como as demais feitas fora de uma sessão.

Alternativa sem SQL: o proprietário de cada empresa renomeia pela própria interface
(Configurações > Organização), que grava pela mesma função usada no produto.

Outros pontos só sugeridos (não alterados): o e-mail das contas de teste aparece em "Minha conta";
o nome do projeto Supabase (`cozinha-saas-testes`) e o endereço `cozinha-saas.pages.dev` não aparecem
na interface, mas um domínio próprio (ver `FASE_08_4E_HOSPEDAGEM_ONLINE.md`) daria um endereço de
produto ao piloto.

## Testes

- Novos: `BrandLogo.test.tsx` (logo embutido e texto de reserva), `IdentityHomeShell.test.tsx`
  (início só com unidades e fuso legível; gestão no início quando não há unidade; página Organização),
  `dates.test.ts` (`timezoneName`).
- Ajustados para o novo lugar das funções, sem afrouxar: `establishments.spec.mjs` (gestão de unidades
  e nome da organização em Organização; o início não mostra mais esses controles e mostra o fuso
  legível, sem o identificador) e `expiry-pagination.spec.mjs` (botão "Atualizar lista").
