import { describe, expect, it } from 'vitest';
import {
  bottomBarAreas,
  workspaceAreas,
  workspacePage,
} from './workspaceAreas';

describe('páginas da Mesa operacional', () => {
  const owner = workspaceAreas(true, true, true);
  const member = workspaceAreas(false, true, true);

  it('abre a visão geral e mantém links legados de validade e cadastros', () => {
    expect(workspacePage('', '', owner)).toBe('visao-geral');
    expect(workspacePage('?area=validade', '', owner)).toBe('validade');
    expect(
      workspacePage('?area=cadastros', '#cadastro-fornecedores', owner),
    ).toBe('fornecedores');
    expect(
      workspacePage('?area=cadastros', '#cadastro-organizacao', owner),
    ).toBe('config-organizacao');
    expect(workspacePage('?area=cadastros', '', member)).toBe('config-unidade');
  });

  it('valida as páginas explícitas pelo perfil vigente e aceita etiquetas', () => {
    expect(workspacePage('?area=produtos', '', member)).toBe('visao-geral');
    expect(
      workspacePage('?area=cadastros', '#cadastro-fornecedores', member),
    ).toBe('visao-geral');
    expect(workspacePage('?area=receber', '', member)).toBe('visao-geral');
    expect(workspacePage('?area=etiquetas', '', member)).toBe('etiquetas');
  });

  it('Indicadores (D-076) só aparece para o proprietário, logo após a visão geral', () => {
    expect(owner.map(({ id }) => id).slice(0, 2)).toEqual([
      'visao-geral',
      'indicadores',
    ]);
    expect(member.some(({ id }) => id === 'indicadores')).toBe(false);
    expect(workspacePage('?area=indicadores', '', owner)).toBe('indicadores');
    expect(workspacePage('?area=indicadores', '', member)).toBe('visao-geral');
  });
});

describe('PR-12: destinos da barra inferior do celular', () => {
  const ids = (areas: { id: string }[]) => areas.map(({ id }) => id);
  it('proprietário com Produção: Visão geral, Validades, Produção e Etiquetas; o resto em Mais', () => {
    const { bar, more } = bottomBarAreas(workspaceAreas(true, true, true));
    expect(ids(bar)).toEqual([
      'visao-geral',
      'validade',
      'producao',
      'etiquetas',
    ]);
    expect(ids(more)).toEqual([
      'indicadores',
      'receber',
      'locais',
      'produtos',
      'fornecedores',
      'preparacoes',
      'config-unidade',
      'config-organizacao',
      'config-conta',
    ]);
  });
  it('sem Produção, Recebimentos ocupa o lugar de Produção', () => {
    const { bar } = bottomBarAreas(workspaceAreas(true, false, false));
    expect(ids(bar)).toEqual([
      'visao-geral',
      'validade',
      'receber',
      'etiquetas',
    ]);
  });
  it('colaborador só vê as suas áreas e nenhuma área é perdida nem criada', () => {
    const all = workspaceAreas(false, true, true);
    const { bar, more } = bottomBarAreas(all);
    expect(ids(bar)).toEqual([
      'visao-geral',
      'validade',
      'producao',
      'etiquetas',
    ]);
    expect(ids(more)).toEqual(['locais', 'config-unidade', 'config-conta']);
    for (const owner of [true, false])
      for (const production of [true, false])
        for (const locations of [true, false]) {
          const areas = workspaceAreas(owner, production, locations);
          const split = bottomBarAreas(areas);
          expect([...ids(split.bar), ...ids(split.more)].sort()).toEqual(
            ids(areas).sort(),
          );
          expect(split.bar.length).toBeLessThanOrEqual(4);
        }
  });
  it('colaborador sem Produção completa a barra com Locais', () => {
    const { bar, more } = bottomBarAreas(workspaceAreas(false, false, true));
    expect(ids(bar)).toEqual([
      'visao-geral',
      'validade',
      'etiquetas',
      'locais',
    ]);
    expect(ids(more)).toEqual(['config-unidade', 'config-conta']);
  });
});
