import MockAdapter from 'axios-mock-adapter';
import { ApiError } from './errors';
import { http, setTokenSource } from './http';

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
    setTokenSource({ getToken: () => 'tok', refresh: async () => null });
    mock.onGet('/events').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer tok');
      return [200, []];
    });
    await expect(http.get('/events')).resolves.toBeDefined();
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const refresh = vi.fn(async () => 'new-tok');
    setTokenSource({ getToken: () => 'old', refresh });
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
    setTokenSource({ getToken: () => 'old', refresh });
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

  it('gives up cleanly when refresh returns null', async () => {
    setTokenSource({ getToken: () => 'old', refresh: async () => null });
    mock.onGet('/me/bookings').reply(401, { statusCode: 401, code: 'UNAUTHORIZED', message: 'x', details: {} });
    await expect(http.get('/me/bookings')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
