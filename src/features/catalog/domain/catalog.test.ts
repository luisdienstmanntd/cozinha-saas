import { describe, expect, it } from 'vitest';
import { parseCatalogInput } from './catalog';

describe('dados de catálogo', () => {
  it('normaliza o nome e preserva a unidade selecionada', () => {
    expect(parseCatalogInput('products', '  Arroz  ', 'kg')).toEqual({
      name: 'Arroz',
      unit: 'kg',
    });
    expect(parseCatalogInput('suppliers', ' Horta ', null)).toEqual({
      name: 'Horta',
      email: null,
      contact: null,
    });
  });
  it.each(['', '  ', 'a'.repeat(121)])('recusa nome inválido', (name) => {
    expect(() => parseCatalogInput('suppliers', name, null)).toThrow(
      'Informe um nome',
    );
  });
  it.each([null, '', 'caixa'])(
    'exige uma unidade de medida reconhecida',
    (unit) => {
      expect(() => parseCatalogInput('products', 'Arroz', unit)).toThrow(
        'Selecione a unidade de medida',
      );
    },
  );
});

it('normaliza contatos opcionais e valida e-mail e limite sem impor formato de telefone', () => {
  expect(
    parseCatalogInput(
      'suppliers',
      ' Horta ',
      null,
      ' compras@example.test ',
      ' +55 (51) 0011-2233 ramal 4 ',
    ),
  ).toEqual({
    name: 'Horta',
    email: 'compras@example.test',
    contact: '+55 (51) 0011-2233 ramal 4',
  });
  expect(parseCatalogInput('suppliers', 'Horta', null, ' ', '')).toEqual({
    name: 'Horta',
    email: null,
    contact: null,
  });
  expect(() =>
    parseCatalogInput('suppliers', 'Horta', null, 'inválido'),
  ).toThrow('e-mail válido');
  expect(() =>
    parseCatalogInput('suppliers', 'Horta', null, null, 'x'.repeat(81)),
  ).toThrow('80 caracteres');
});
