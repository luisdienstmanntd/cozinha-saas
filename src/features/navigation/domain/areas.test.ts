import { describe, expect, it } from 'vitest';
import { parseArea, parsePlace, placeSearch } from './areas';

const unit = '30000000-0000-4000-8000-000000000001';

describe('áreas da unidade (V1)', () => {
  it('lê unidade e área do endereço e ignora valores inválidos', () => {
    expect(parsePlace(`?unidade=${unit}&area=producao`)).toEqual({
      unit,
      area: 'producao',
    });
    expect(parsePlace('?unidade=abc&area=<script>')).toEqual({
      unit: null,
      area: null,
    });
    expect(parsePlace('')).toEqual({ unit: null, area: null });
    expect(parseArea('cadastros')).toBe('cadastros');
    expect(parseArea('x')).toBeNull();
  });
  it('monta o endereço preservando outros parâmetros', () => {
    expect(placeSearch('?a=1', unit, 'locais')).toBe(
      `?a=1&unidade=${unit}&area=locais`,
    );
    expect(placeSearch(`?unidade=${unit}&area=locais`, null, null)).toBe('');
    expect(placeSearch('?a=1', null, 'locais')).toBe('?a=1');
  });
  it('V6: o filtro de validade só acompanha a área Validades', () => {
    expect(placeSearch('?a=1', unit, 'validade', 'vencidos')).toBe(
      `?a=1&unidade=${unit}&area=validade&validade=vencidos`,
    );
    const filtered = `?unidade=${unit}&area=validade&validade=hoje`;
    expect(placeSearch(filtered, unit, 'producao')).toBe(
      `?unidade=${unit}&area=producao`,
    );
    expect(placeSearch(filtered, unit, 'validade')).toBe(
      `?unidade=${unit}&area=validade`,
    );
    expect(placeSearch(filtered, null, null, 'hoje')).toBe('');
    expect(placeSearch('', unit, 'producao', 'hoje')).toBe(
      `?unidade=${unit}&area=producao`,
    );
  });
});
