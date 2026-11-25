// V3 (M3): datas e horários sempre no formato brasileiro, no fuso da unidade.
// Só formatam: nenhuma regra de validade ou de data de referência mora aqui.

// Data civil `aaaa-mm-dd` (validade, data de referência) para `dd/mm/aaaa`, sem passar por Date
// (evita deslocamento de fuso). Texto fora do formato volta como veio.
export function formatCivilDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

// Instante (ISO do banco ou Date) para `dd/mm/aaaa HH:mm` no fuso informado.
export function formatDateTime(value: string | Date, timezone: string): string {
  const instant = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(instant.getTime()))
    return typeof value === 'string' ? value : '';
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(instant)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
  } catch {
    return instant.toISOString();
  }
}

// D-075: só o nome legível do fuso ("Horário de Brasília"), para telas de escolha. Se o navegador não
// souber o nome, devolve o identificador.
export function timezoneName(timezone: string, now: Date = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      timeZoneName: 'longGeneric',
    })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value;
    return name || timezone;
  } catch {
    return timezone;
  }
}

// Nome legível do fuso ("Horário de Brasília"), com o identificador entre parênteses para suporte.
// Se o navegador não souber o nome, mostra só o identificador.
export function timezoneLabel(
  timezone: string,
  now: Date = new Date(),
): string {
  const name = timezoneName(timezone, now);
  return name !== timezone ? `${name} (${timezone})` : timezone;
}
