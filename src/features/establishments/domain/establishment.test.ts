import { describe, expect, it } from 'vitest';
import {
  parseEstablishmentName,
  parseNewEstablishment,
  summarizeMemberships,
  timezoneLabel,
} from './establishment';
import { brazilTimezones, defaultTimezone } from './timezones';

describe('regras de unidade', () => {
  it('aceita nome aparado e fuso da lista curta', () => {
    expect(parseNewEstablishment('  Cozinha 2  ', 'America/Manaus')).toEqual({
      name: 'Cozinha 2',
      timezone: 'America/Manaus',
    });
  });
  it('recusa nome vazio, só espaços ou acima de 120 caracteres', () => {
    for (const name of ['', '   ', 'x'.repeat(121), null])
      expect(() => parseNewEstablishment(name, defaultTimezone)).toThrow(
        'Informe o nome da unidade',
      );
    expect(() => parseEstablishmentName('   ')).toThrow(
      'Informe o nome da unidade',
    );
  });
  it('recusa fuso fora da lista, inclusive IANA válido não brasileiro', () => {
    for (const zone of ['UTC', 'Europe/Lisbon', 'Invalid/Zone', '', undefined])
      expect(() => parseNewEstablishment('Cozinha', zone)).toThrow(
        'Selecione um fuso horário da lista.',
      );
  });
  it('lista curta não tem duplicatas, contém o padrão e é aceita pelo Intl', () => {
    const ids = brazilTimezones.map((zone) => zone.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(defaultTimezone);
    for (const id of ids)
      expect(
        () => new Intl.DateTimeFormat('pt-BR', { timeZone: id }),
      ).not.toThrow();
  });
  it('rótulo mostra nome legível e identificador; fuso desconhecido aparece cru', () => {
    expect(timezoneLabel('America/Sao_Paulo')).toBe(
      'Brasília — SP, RJ, MG, Sul, GO e DF (America/Sao_Paulo)',
    );
    expect(timezoneLabel('UTC')).toBe('UTC');
  });
  it('resume vínculos sem expor identificadores', () => {
    expect(
      summarizeMemberships([
        { role: 'owner' },
        { role: 'member' },
        { role: 'member' },
      ]),
    ).toEqual({ owners: 1, members: 2 });
  });
});
