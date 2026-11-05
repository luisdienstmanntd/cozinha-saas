# Gestão de cozinha — fundação local

Fase 0 aprovada. Fase 1: React, Vite e TypeScript strict, tela de demonstração em português e testes automatizados. Sem marca final, persistência, login ou conexão com serviços. As etapas exibidas são previstas para fases futuras; esta versão não salva dados.

## Rodar no Windows

Requer Node.js 24 ou superior com npm. Ambiente validado: Node 24.12.0 / npm 11.6.2. Abra o PowerShell na pasta do projeto:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Acesse o endereço local informado pelo Vite (normalmente http://127.0.0.1:5173). Encerre com Ctrl+C. O arquivo `.env` é opcional nesta fase: a ausência de `VITE_APP_MODE` usa `demo`; qualquer outro valor é recusado com mensagem visível. Campos `VITE_*` são públicos no bundle: nunca inserir segredos. Nenhuma credencial Supabase é necessária.

## Verificações

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:coverage
npm run format:check
```

`test` termina após uma execução; `test:watch` acompanha alterações. Cobertura HTML em `coverage/index.html`; arquivos gerados não são versionados. `npm run preview` serve o build local após `build`. `format` formata apenas o código/configuração da fundação e seus documentos operacionais, preservando instruções e documentos anteriores.

Na sandbox Windows do agente, bundlers e processos de testes podem exigir autorização de execução ampliada por restrição de leitura de diretórios ancestrais. O terminal normal do usuário não tem essa restrição específica do agente.

## Organização

- `src/app`: composição inicial e estilos globais.
- `src/features/demo/components`: interface da demonstração.
- `src/features/demo/application`: coordenação de estado/caso de uso.
- `src/features/demo/domain`: regra pura de confirmação do escopo.
- `src/shared/config`: validação da configuração pública com Zod.
- `src/test`: jsdom, matchers e limpeza entre testes.

Features com persistência terão sua própria camada `data` quando necessária. Não há banco simulado ou autorização por filtro de interface. RLS e testes reais de isolamento são obrigatórios na Fase 2 antes de qualquer uso multiempresa. Datas, quantidades, QR e impressão ainda não foram implementados.

## CI e decisões

`.github/workflows/quality.yml` prepara npm ci, lint, typecheck, test e build em Node 24. O arquivo está apenas local: nenhum remoto foi criado, nenhum workflow remoto foi executado e não houve deploy ou contratação. As dependências diretas têm versões exatas e `package-lock.json` deve ser preservado.

O override transitivo de minimatch em `package.json` corrige alerta da ferramenta de lint; rever sua necessidade ao atualizar ESLint/typescript-eslint. TypeScript 5.9 foi mantido por compatibilidade com o parser; jsdom 29 é compatível com o Node instalado.

Consulte [o relatório da Fase 1](docs/FASE_1.md), [as decisões](docs/DECISOES.md), [o debate aprovado](docs/DEBATE_AGENTS.md) e [a política de qualidade](docs/TESTES_QUALIDADE.md). Leia AGENTS.md e o prompt de cada fase antes de alterar código. Subagentes de análise não editam arquivos.

O foco aprovado é uma unidade piloto de restaurante independente. Preparação mínima para operar é obrigatória, com cobrança a decidir. Preço, demanda, datas, permissões e material físico continuam sujeitos às validações do debate. Não iniciar a próxima fase sem aceite humano; não criar serviços, publicar ou contratar equipamentos sem autorização.

