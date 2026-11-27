import { describe, expect, it } from 'vitest';
import {
  parseArea,
  parseContainerParam,
  parsePlace,
  placeSearch,
} from './areas';

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
  it('PR-11: a ficha dentro da unidade só acompanha Etiquetas e Visão geral', () => {
    const id = '12345678-1234-4234-8234-123456789abc';
    expect(placeSearch('?a=1', unit, 'etiquetas', null, id)).toBe(
      `?a=1&unidade=${unit}&area=etiquetas&recipiente=${id}`,
    );
    expect(placeSearch('', unit, 'visao-geral', null, id)).toBe(
      `?unidade=${unit}&area=visao-geral&recipiente=${id}`,
    );
    expect(placeSearch('', unit, 'validade', null, id)).toBe(
      `?unidade=${unit}&area=validade`,
    );
    expect(placeSearch('', null, null, null, id)).toBe('');
    expect(placeSearch('', unit, 'etiquetas', null, 'nao-e-uuid')).toBe(
      `?unidade=${unit}&area=etiquetas`,
    );
    // Trocar de área ou sair da unidade remove o recipiente do endereço.
    const open = `?unidade=${unit}&area=etiquetas&recipiente=${id}`;
    expect(placeSearch(open, unit, 'etiquetas')).toBe(
      `?unidade=${unit}&area=etiquetas`,
    );
    expect(placeSearch(open, null, null)).toBe('');
  });
  it('PR-11: lê o recipiente do endereço e ignora valor inválido', () => {
    const id = '12345678-1234-4234-8234-123456789ABC';
    expect(parseContainerParam(`?recipiente=${id}`)).toBe(id.toLowerCase());
    expect(parseContainerParam('?recipiente=abc')).toBeNull();
    expect(parseContainerParam('')).toBeNull();
  });
});
