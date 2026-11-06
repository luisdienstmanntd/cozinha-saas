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
