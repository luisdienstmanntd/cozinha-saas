# COMANDO 00 — DEBATE E APROVAÇÃO DO PRODUTO (cole no Codex)

Leia `AGENTS.md`, `docs/PRODUCT_BRIEF.md`, `docs/SUFLEX_EVIDENCIAS.md`, `docs/DEBATE_PRELIMINAR.md`, `docs/DECISOES.md`, `docs/TESTES_QUALIDADE.md` e `docs/RISCOS.md`.

**Ainda NÃO programe, não inicialize npm, não crie serviços, não altere configurações de conta.**

Crie três subagentes independentes usando exatamente os tipos customizados:
1. `suflex_analyst` — o que está PUBLICAMENTE comprovado sobre a Suflex, jornada de operação, pontos fortes e lacunas informacionais.
2. `business_strategist` — viabilidade de SaaS híbrido para fundador com pouco capital, piloto, custos e diferenciação.
3. `architect_qa` — segurança multi-tenant, arquitetura manutenível, testes em cada incrementação e riscos de validade/impressão.

**Rodada 1 (independência):** peça relatório de cada agente com fatos, suposições, 5 recomendações prioritárias, 5 riscos e referências. Espere todos terminarem.

**Rodada 2 (debate real):** compartilhe resumos objetivos das conclusões entre os agentes; peça que cada um critique concretamente no mínimo 2 recomendações dos outros, explique possíveis falhas e proponha mitigação ou mudança de prioridade. Espere todas as respostas. Não invente que subagentes foram executados.

**Síntese pelo agente principal:** escreva `docs/DEBATE_AGENTS.md` com:
- participante, critérios, argumentos e referências;
- divergências e resposta de cada agente;
- decisões consensuais, decisões provisórias e impasses;
- comparação entre proposta antiga e revisada;
- MVP final (dentro/fora) e demonstração de fluxo completo;
- 10 riscos maiores ordenados;
- perguntas que dependem de responsável técnico/cliente;
- custo mínimo e pontos que exigirão pagamento;
- checklist de aprovação que bloqueia implementação.

Se subagentes não estiverem disponíveis, anuncie isso claramente e faça três revisões **sequenciais**, rotulando-as como tal. Não simule execuções paralelas.

Você pode atualizar apenas arquivos de documentação necessários à síntese; não altere `AGENTS.md` nem as configurações de agentes sem apresentar motivo. Apresente o relatório e **pare para aprovação humana** antes da Fase 1.
