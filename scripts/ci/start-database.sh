#!/usr/bin/env bash
# Fatia 8.1 (D-065): sobe o Supabase local da CI sem imprimir credenciais e sem esconder falhas.
# - A saída da CLI vai para um arquivo; o log da CI mostra só um resumo. Se falhar, mostra o final do
#   arquivo com chaves, senhas e tokens mascarados.
# - Uma nova tentativa só acontece para UM erro conhecido de infraestrutura do executor ("address already
#   in use" ao ligar uma porta do Supabase local), depois de registrar um aviso visível, de diagnosticar
#   quem usa a porta e de esperar os sockets dela liberarem. Qualquer outra falha (migração, imagem, teste) termina na hora, sem repetir.
set -uo pipefail

LOG="${RUNNER_TEMP:-/tmp}/supabase-start.log"

mask() {
  sed -E \
    -e 's/("(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY|PUBLISHABLE_KEY|JWT_SECRET|DB_URL|S3_[A-Z_]+)":")[^"]*/\1***/g' \
    -e 's/(sb_(secret|publishable)_)[A-Za-z0-9_-]+/\1***/g' \
    -e 's/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_.-]+/***jwt***/g' \
    -e 's#(postgres(ql)?://[^:]+:)[^@]+@#\1***@#g'
}

# Sockets TCP (em qualquer estado, inclusive TIME_WAIT) cuja porta LOCAL é 5432x. `ss -l` não mostra
# esses casos, e eles impedem o Docker de ligar a porta.
sockets_5432x() { ss -tan 2>/dev/null | awk 'NR>1 && $4 ~ /:5432[0-9]$/ {print}'; }

diagnose() {
  echo "::group::Diagnóstico: portas 5432x, faixa efêmera e contêineres"
  echo "faixa de portas efêmeras: $(cat /proc/sys/net/ipv4/ip_local_port_range 2>/dev/null)"
  echo "portas reservadas: $(cat /proc/sys/net/ipv4/ip_local_reserved_ports 2>/dev/null)"
  (sudo -n ss -tanp 2>/dev/null || ss -tan 2>/dev/null) | awk 'NR==1 || $4 ~ /:5432[0-9]$/' | head -20
  docker ps -a --format '{{.Names}}  {{.Status}}  {{.Ports}}' 2>/dev/null | head -30 || true
  echo "::endgroup::"
}

# Espera os sockets em 5432x (TIME_WAIT dura até ~60 s) sumirem antes da segunda tentativa.
wait_ports_free() {
  local rounds="${PORT_WAIT_ROUNDS:-25}" step="${PORT_WAIT_STEP:-3}" i
  for i in $(seq 1 "$rounds"); do
    [ -z "$(sockets_5432x)" ] && return 0
    sleep "$step"
  done
  return 1
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
  wait_ports_free || echo "::warning title=Portas 5432x ainda ocupadas::Tentando mesmo assim; veja o diagnóstico acima."
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
