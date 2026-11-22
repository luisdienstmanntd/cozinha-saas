# Fatia 8.4b — Etiquetas PDF no ambiente hospedado

Status: implementada em branch separada (`claude/etiquetas-origem-hospedada`), PR em rascunho. Sem merge, deploy nem migração. Autorizada por luis em 18/11/2026.

## 1. Problema
O gerador de PDF só aceitava `http://127.0.0.1:5173` e `:5174`. No site hospedado (`https://cozzigo.pages.dev`) toda etiqueta com QR falharia com "Endereço de demonstração indisponível".

## 2. O que muda
| Item | Como |
|---|---|
| Endereço oficial configurável | Nova variável `VITE_APP_URL`, **obrigatória** no modo `hosted` (sem ela o build e a inicialização falham; nunca há valor padrão silencioso) |
| Validação estrita | `parseOfficialOrigin` em `src/shared/config/environment.ts`: só `https`, igual a `URL.origin` (minúsculas, sem barra final), sem porta, usuário, caminho, parâmetros ou âncora; nome com ponto, rótulos válidos, TLD só de letras; recusa IP, `localhost` e sufixos internos (`.local`, `.internal`, `.test` etc.) |
| Uso no QR | `src/features/labels/application/labelOrigin.ts`: no hospedado o QR leva o endereço oficial; no local/demonstração continua o endereço da página |
| Autorização no gerador | `pdf.ts` aceita só `http://127.0.0.1:5173/5174` ou o endereço oficial validado; qualquer outro host é recusado ("Endereço não autorizado para o QR da etiqueta.") |
| Texto | A ficha informa "Etiqueta em PDF · 100 × 100 mm" em todos os modos, sem avisos de ambiente ou alegações de validação física. Ensaio de impressão e leitura do QR segue como requisito interno do piloto. |

Não mudam: regras de negócio das etiquetas, recusas (anulado, tardio, produção bloqueada), IDs, rastreabilidade (QR leva só URL e ID opaco), banco e segurança (CSP inalterada).

## 3. Ação de luis (antes do próximo deploy)
No Cloudflare Pages, adicionar `VITE_APP_URL = https://cozzigo.pages.dev` em Production (e em Preview, se Preview continuar ligado). Sem ela o build falha de propósito. Para um domínio próprio no futuro: trocar só esse valor e refazer o deploy (o QR de etiquetas antigas continua apontando para o endereço que estava impresso).

## 4. Testes
Vitest: validação do endereço (aceitos e recusados), `configureApp` guarda e limpa o endereço, os quatro modelos de etiqueta (recebimento, derivado, preparação, porção) e arquivo com várias páginas com o endereço oficial, hosts recusados (outro domínio, subdomínio, http, porta, prévia), recusas de negócio preservadas, texto da ficha local x hospedado. Fixtures hospedadas dos testes existentes ganharam `VITE_APP_URL`; nenhuma asserção foi enfraquecida (a mensagem de recusa foi renomeada de "Endereço de demonstração indisponível" para "Endereço não autorizado", e o teste continua exigindo a recusa).

## 5. Pendências
Impressão e leitura física do QR continuam sem validação (pendência do piloto).
