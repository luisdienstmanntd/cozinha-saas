import { describe, expect, it } from 'vitest';
import { workspaceAreas, workspacePage } from './workspaceAreas';

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
});
