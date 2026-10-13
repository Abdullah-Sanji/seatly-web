import MockAdapter from 'axios-mock-adapter';
import { ApiError } from './errors';
import { http, setTokenSource } from './http';

function jwtExpiringIn(seconds: number, sub = 'u1'): string {
  const payload = { sub, email: 'a@b.c', exp: Math.floor(Date.now() / 1000) + seconds };
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `h.${b64}.s`;
}

// Tokens good for an hour, so the proactive refresh does not kick in.
const TOK = jwtExpiringIn(3600);
const OLD = jwtExpiringIn(3600, 'old');

describe('http interceptors', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(http);
  });

  afterEach(() => {
    mock.restore();
    setTokenSource({ getToken: () => null, refresh: async () => null });
  });

  it('attaches the bearer token when present', async () => {
    setTokenSource({ getToken: () => TOK, refresh: async () => null });
    mock.onGet('/events').reply((config) => {
      expect(config.headers?.Authorization).toBe(`Bearer ${TOK}`);
      return [200, []];
    });
    await expect(http.get('/events')).resolves.toBeDefined();
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const refresh = vi.fn(async () => 'new-tok');
    setTokenSource({ getToken: () => OLD, refresh });
    const envelope = { statusCode: 401, code: 'UNAUTHORIZED', message: 'x', details: {} };
    mock.onGet('/me/bookings').replyOnce(401, envelope).onGet('/me/bookings').replyOnce((config) => {
      expect(config.headers?.Authorization).toBe('Bearer new-tok');
      return [200, [{ id: 'b1' }]];
    });

    const res = await http.get('/me/bookings');
    expect(res.data).toEqual([{ id: 'b1' }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not loop when the retry also fails, and surfaces an ApiError', async () => {
    const refresh = vi.fn(async () => 'new-tok');
    setTokenSource({ getToken: () => OLD, refresh });
    const envelope = { statusCode: 401, code: 'UNAUTHORIZED', message: 'x', details: {} };
    mock.onGet('/me/bookings').reply(401, envelope);

    await expect(http.get('/me/bookings')).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('never tries to refresh for /auth/* calls', async () => {
    const refresh = vi.fn(async () => 'new-tok');
    setTokenSource({ getToken: () => null, refresh });
    mock.onPost('/auth/refresh').reply(401, { statusCode: 401, code: 'REFRESH_INVALID', message: 'x', details: {} });

    await expect(http.post('/auth/refresh')).rejects.toBeInstanceOf(ApiError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes and retries POST /auth/logout on 401', async () => {
    const refresh = vi.fn(async () => 'new-tok');
    setTokenSource({ getToken: () => OLD, refresh });
    mock
      .onPost('/auth/logout')
      .replyOnce(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'x', details: {} })
      .onPost('/auth/logout')
      .replyOnce((config) => {
        expect(config.headers?.Authorization).toBe('Bearer new-tok');
        return [204];
      });

    const res = await http.post('/auth/logout');
    expect(res.status).toBe(204);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes proactively before sending when the token is about to expire', async () => {
    const fresh = jwtExpiringIn(900);
    const refresh = vi.fn(async () => fresh);
    setTokenSource({ getToken: () => jwtExpiringIn(10), refresh });
    mock.onGet('/events').reply((config) => {
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(config.headers?.Authorization).toBe(`Bearer ${fresh}`);
      return [200, []];
    });

    await http.get('/events');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('gives up cleanly when refresh returns null', async () => {
    setTokenSource({ getToken: () => OLD, refresh: async () => null });
    mock.onGet('/me/bookings').reply(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'x', details: {} });
    await expect(http.get('/me/bookings')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
