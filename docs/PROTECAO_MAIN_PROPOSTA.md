# Proposta de proteção da `main` (não aplicada)

**Estado: proposta, aguardando o aceite de luis.** Autorizada por luis em 17/11/2026, 13:59 UTC ("preparar a proposta de proteção da `main`, sem aplicar a configuração até meu aceite"). **Nada foi configurado:** hoje o repositório não tem ruleset nenhum (consulta feita em 17/11/2026: 0 rulesets) e a proteção clássica da `main` aparece como não protegida. Este arquivo é novo e não altera nenhum documento compartilhado, para não gerar conflito na integração dos PRs.

## 1. Objetivo

Transformar em regra do GitHub o que o plano de integração (D-065) exige por disciplina: nada entra na `main` sem PR, sem CI verde, por merge commit, e a história da `main` não pode ser reescrita nem apagada.

## 2. Regras propostas

| # | Regra | Por quê | Observação |
|---|---|---|---|
| 1 | **Exigir pull request** para entrar na `main` (sem push direto) | diretriz de luis: sem push direto na `main` durante a integração | revisores exigidos: **0** (ver 4.2) |
| 2 | **Somente merge commit** permitido | decisão 1 de luis; squash e rebase quebram a cadeia empilhada | restringe o método no próprio ruleset |
| 3 | **Exigir os dois checks da CI**: `quality` e `banco-api-e2e` | "CI verde antes do merge" | sem exigir que a branch esteja atualizada (ver 4.1) |
| 4 | **Bloquear force-push** (`non_fast_forward`) | diretriz: sem force-push | — |
| 5 | **Bloquear exclusão** da `main` | proteção básica | — |
| 6 | **Exigir resolução das conversas** do PR | nada de comentário aberto passa | opcional; baixo custo |
| 7 | **Sem exceção (bypass) para ninguém** | a regra vale também para quem administra | se luis precisar de um caminho de emergência, ele desativa o ruleset de propósito e registra o motivo |

**Não incluir:** histórico linear obrigatório (`required_linear_history`). Ele **proibiria merge commit** e contradiz a decisão 1.

## 3. Ruleset proposto (JSON, para `gh api`)

```json
{
  "name": "main-protegida",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["merge"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "quality" },
          { "context": "banco-api-e2e" }
        ]
      }
    }
  ]
}
```

Aplicação (somente depois do aceite de luis, por pessoa com permissão de administrador):

```
gh api -X POST repos/luisdienstmanntd/cozinha-saas/rulesets --input main-protegida.json
```

Conferência depois de aplicar: `gh api repos/luisdienstmanntd/cozinha-saas/rulesets` lista o ruleset ativo; abrir um PR de teste e confirmar que o botão de merge exige os dois checks e só oferece "Create a merge commit". Reversão: `gh api -X DELETE repos/luisdienstmanntd/cozinha-saas/rulesets/<id>` (o ruleset não apaga nada; só deixa de valer). A sessão de nuvem em que isto foi preparado **não consegue ler a proteção clássica da `main`** (resposta 403 para a integração), então também pode não conseguir aplicar; nesse caso a aplicação é feita por luis no painel (Settings → Rules → Rulesets) com os mesmos valores da tabela.

## 4. Decisões e consequências

### 4.1 "Exigir que a branch esteja atualizada" fica desligado durante a integração

Com `strict_required_status_checks_policy: true`, depois de cada merge o próximo PR ficaria "atrás" da `main` (falta o merge commit) e precisaria de "Update branch", gerando um commit novo, uma CI nova (cerca de 4 minutos) e mudando o SHA que luis aprovou, a cada uma das 19 etapas. A segurança equivalente vem da CI **na `main` depois de cada merge** (regra 3.4 do plano). Depois de concluída a integração, vale reavaliar ligar o modo estrito.

### 4.2 Zero aprovações exigidas

Os PRs deste repositório são abertos sob a conta de luis; o GitHub não permite aprovar o próprio PR. Exigir 1 aprovação travaria todas as etapas. A aprovação humana continua existindo como **autorização escrita de luis na thread** antes de cada merge (diretriz do plano). Se houver uma segunda pessoa com acesso, vale passar para 1 aprovação.

### 4.3 O que muda na prática

- A partir da aplicação, nem Claude nem ninguém empurra direto para a `main`; tudo passa por PR.
- Os PRs empilhados continuam funcionando: a regra vale para a base `main`. PRs com outra base (por exemplo, #23 sobre a branch do #22) não são afetados até a base ser trocada para `main`.
- O merge de cada etapa só fica disponível com `quality` e `banco-api-e2e` verdes no PR. Uma falha de infraestrutura (classe A em `FASE_08_1.md`) exige uma nova execução do job, e o aviso fica registrado.
- Os nomes `quality` e `banco-api-e2e` são nomes de job do `.github/workflows/quality.yml`; renomear um job sem atualizar o ruleset bloquearia todos os merges.
- A regra de "somente merge commit" faz o GitHub recusar squash e rebase pelo botão e pela API.

### 4.4 Configurações complementares (opcionais, também sem aplicar)

- Desligar **squash** e **rebase** no nível do repositório (Settings → General → Pull Requests). Redundante com a regra 2, mas deixa a decisão visível.
- **Não** ligar "excluir branch depois do merge" durante a integração: o plano troca a base do PR seguinte manualmente.
- **Não** ligar auto-merge durante a integração: cada merge depende de autorização específica.

## 5. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Check obrigatório que nunca roda (filtro de caminho, job renomeado) | merge bloqueado | o workflow não tem filtro de caminho; testar com um PR de documentação antes da etapa 1 |
| CI com falha de infraestrutura trava a fila | atraso | fatia 8.1 reduz a falha de porta; uma nova execução do job é permitida |
| Zero aprovações | a barreira humana é só a autorização na thread | manter a regra de autorização por etapa; avaliar 1 aprovação quando houver segunda pessoa |
| Ninguém consegue corrigir a `main` em emergência | atraso | caminho documentado: desativar o ruleset de propósito, com registro; ou `revert` por PR |
| Sessão de nuvem sem permissão para aplicar | aplicação manual | valores desta proposta bastam para o painel |

## 6. Pedido a luis

Aceitar, ajustar ou recusar esta proposta. Se aceitar, dizer se a aplicação é feita por ele no painel ou se quer que seja tentada por comando, e confirmar se prefere **0 aprovações** (como proposto) ou 1. Nenhuma configuração será alterada antes disso.
