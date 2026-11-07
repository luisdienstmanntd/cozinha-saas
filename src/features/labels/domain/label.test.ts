import { describe, expect, it } from 'vitest';
import { containerPath, parseContainerPath } from './label';

describe('endereço do recipiente', () => {
  const id = '12345678-1234-4234-8234-123456789abc';
  it('usa somente ID opaco na rota local', () => {
    expect(containerPath(id)).toBe(`/recipiente/${id}`);
    expect(parseContainerPath(containerPath(id))).toBe(id);
  });
  it('recusa caminhos e identificadores inválidos', () => {
    expect(parseContainerPath('/recipiente/../../outro')).toBeNull();
    expect(parseContainerPath('/recipiente/invalido')).toBeNull();
    expect(() => containerPath('invalido')).toThrow();
  });
});
