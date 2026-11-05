import { describe, expect, it } from 'vitest';
import { acknowledgeDemo } from './demoAcknowledgement';

describe('confirmação do escopo da demonstração', () => {
  it('recusa continuar sem reconhecer a ausência de persistência', () => {
    expect(acknowledgeDemo(false)).toEqual({
      accepted: false,
      message: 'Confirme que esta demonstração não salva dados.',
    });
  });
  it('confirma o escopo quando o aviso foi reconhecido', () => {
    expect(acknowledgeDemo(true)).toEqual({
      accepted: true,
      message: 'Escopo confirmado. Explore as etapas previstas abaixo.',
    });
  });
});
