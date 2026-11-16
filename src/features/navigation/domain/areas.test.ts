import { describe, expect, it } from 'vitest';
import {
  areasFor,
  parseArea,
  parsePlace,
  placeSearch,
  resolveArea,
} from './areas';

const all = { production: true, locations: true };
const unit = '30000000-0000-4000-8000-000000000001';

describe('áreas da unidade (V1)', () => {
  it('proprietário vê as cinco áreas, na ordem pedida', () => {
    expect(areasFor({ owner: true, ...all }).map((a) => a.label)).toEqual([
      'Validade',
      'Receber',
      'Produção',
      'Locais',
      'Cadastros',
    ]);
  });
  it('colaborador não vê Receber nem o cadastro, mas vê as regras da unidade', () => {
    const areas = areasFor({ owner: false, ...all });
    expect(areas.map((a) => a.id)).toEqual([
      'validade',
      'producao',
      'locais',
      'cadastros',
    ]);
    expect(areas.at(-1)?.label).toBe('Configurações');
  });
  it('omite Produção e Locais quando o cliente não os tem', () => {
    expect(
      areasFor({ owner: true, production: false, locations: false }).map(
        (a) => a.id,
      ),
    ).toEqual(['validade', 'receber', 'cadastros']);
  });
  it('área não permitida ao perfil cai em Validade', () => {
    const member = areasFor({ owner: false, ...all });
    expect(resolveArea('receber', member)).toBe('validade');
    expect(resolveArea('locais', member)).toBe('locais');
    expect(resolveArea(null, member)).toBe('validade');
  });
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
});
