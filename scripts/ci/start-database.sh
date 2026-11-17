#!/usr/bin/env bash
# Fatia 8.1 (D-065): sobe o Supabase local da CI sem imprimir credenciais e sem esconder falhas.
# - A saída da CLI vai para um arquivo; o log da CI mostra só um resumo. Se falhar, mostra o final do
#   arquivo com chaves, senhas e tokens mascarados.
# - Uma nova tentativa só acontece para UM erro conhecido de infraestrutura do executor ("address already
#   in use" ao ligar uma porta do Supabase local), depois de registrar um aviso visível e de diagnosticar
#   quem usa a porta. Qualquer outra falha (migração, imagem, teste) termina na hora, sem repetir.
set -uo pipefail

LOG="${RUNNER_TEMP:-/tmp}/supabase-start.log"

mask() {
  sed -E \
    -e 's/("(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY|PUBLISHABLE_KEY|JWT_SECRET|DB_URL|S3_[A-Z_]+)":")[^"]*/\1***/g' \
    -e 's/(sb_(secret|publishable)_)[A-Za-z0-9_-]+/\1***/g' \
    -e 's/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_.-]+/***jwt***/g' \
    -e 's#(postgres(ql)?://[^:]+:)[^@]+@#\1***@#g'
}

diagnose() {
  echo "::group::Diagnóstico: portas 5432x e contêineres"
  (sudo -n ss -ltnp 2>/dev/null || ss -ltn 2>/dev/null) | grep -E ':5432[0-9]\b' || echo "nenhuma porta 5432x em escuta"
  docker ps -a --format '{{.Names}}  {{.Status}}  {{.Ports}}' 2>/dev/null | head -30 || true
  echo "::endgroup::"
}

start() { npm run db:start >"$LOG" 2>&1; }

if start; then
  echo "Supabase local iniciado (saída da CLI omitida para não imprimir credenciais)."
  exit 0
fi

if grep -q "address already in use" "$LOG"; then
  echo "::warning title=Porta do Supabase local em uso::Falha conhecida do executor (classe A, docs/FASE_08_1.md). Diagnosticando e tentando UMA vez depois de limpar os contêineres do Supabase."
  mask <"$LOG" | grep -E "address already in use|failed to bind" | head -3
  diagnose
  npx supabase stop --no-backup >/dev/null 2>&1 || true
  if start; then
    echo "::warning title=Supabase iniciou na segunda tentativa::A primeira falhou por porta em uso; registre a ocorrência em docs/TESTES_QUALIDADE.md."
    echo "Supabase local iniciado na segunda tentativa."
    exit 0
  fi
  echo "::error title=Supabase local não iniciou::Falhou de novo depois da limpeza."
else
  echo "::error title=Supabase local não iniciou::Falha que não é a de porta em uso; sem nova tentativa."
fi

echo "---- final da saída da CLI (credenciais mascaradas) ----"
tail -n 60 "$LOG" | mask
exit 1
