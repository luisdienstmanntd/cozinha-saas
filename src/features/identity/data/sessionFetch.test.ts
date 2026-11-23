import { describe, expect, it, vi } from 'vitest';
import { createSessionFetch } from './sessionFetch';

function reply(status: number, body: string) {
  return vi.fn().mockResolvedValue(new Response(body, { status }));
}
describe('recusa de sessão pela API', () => {
  it('avisa quando a API responde 401 SESSION_EXPIRED e devolve a resposta intacta', async () => {
    const base = reply(401, '{"code":"SESSION_EXPIRED","message":"x"}');
    const events = createSessionFetch(base);
    const expired = vi.fn();
    events.onExpired(expired);
    const response = await events.fetch('http://x/rest/v1/a');
    expect(expired).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('ignora outros 401, outros códigos, corpo inválido e sucesso', async () => {
    for (const [status, body] of [
      [401, '{"code":"PGRST301"}'],
      [401, 'não é json'],
      [403, '{"code":"SESSION_EXPIRED"}'],
      [200, '{"code":"SESSION_EXPIRED"}'],
    ] as const) {
      const events = createSessionFetch(reply(status, body));
      const expired = vi.fn();
      events.onExpired(expired);
      await events.fetch('http://x');
      expect(expired).not.toHaveBeenCalled();
    }
  });
  it('deixa de avisar depois de cancelar a inscrição', async () => {
    const events = createSessionFetch(reply(401, '{"code":"SESSION_EXPIRED"}'));
    const expired = vi.fn();
    events.onExpired(expired)();
    await events.fetch('http://x');
    expect(expired).not.toHaveBeenCalled();
  });
});

describe('token da requisição recusada', () => {
  it('informa o token Bearer da requisição, em objeto ou Headers', async () => {
    const events = createSessionFetch(reply(401, '{"code":"SESSION_EXPIRED"}'));
    const expired = vi.fn();
    events.onExpired(expired);
    await events.fetch('http://x', {
      headers: { Authorization: 'Bearer token-antigo' },
    });
    await events.fetch('http://x', {
      headers: new Headers({ Authorization: 'Bearer token-novo' }),
    });
    await events.fetch('http://x');
    expect(expired.mock.calls).toEqual([
      ['token-antigo'],
      ['token-novo'],
      [null],
    ]);
  });
});
