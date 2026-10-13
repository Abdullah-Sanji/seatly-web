import { createPinia, setActivePinia } from 'pinia';
import { ApiError } from '@/api/errors';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from './auth.store';

vi.mock('@/api/auth.api', () => ({
  authApi: { register: vi.fn(), login: vi.fn(), refresh: vi.fn(), logout: vi.fn() },
}));

const token = (email: string) =>
  `h.${btoa(JSON.stringify({ sub: 'u1', email, exp: 9999999999 })).replace(/=+$/, '')}.s`;

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(authApi.refresh).mockReset();
    vi.mocked(authApi.login).mockReset();
    vi.mocked(authApi.logout).mockReset();
  });

  it('bootstrap resolves logged-out silently when there is no refresh cookie', async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(new ApiError(401, 'REFRESH_INVALID', 'x', {}));
    const store = useAuthStore();
    await expect(store.bootstrap()).resolves.toBeUndefined();
    expect(store.isAuthenticated).toBe(false);
    expect(store.ready).toBe(true);
  });

  it('bootstrap restores the session from the cookie', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue(token('ada@x.com'));
    const store = useAuthStore();
    await store.bootstrap();
    expect(store.isAuthenticated).toBe(true);
    expect(store.email).toBe('ada@x.com');
    expect(store.userId).toBe('u1');
  });

  it('login stores the token; logout clears it even if the API call fails', async () => {
    vi.mocked(authApi.login).mockResolvedValue(token('ada@x.com'));
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError(0, 'NETWORK', 'x', {}));
    const store = useAuthStore();
    await store.login('ada@x.com', 'Password123!');
    expect(store.accessToken).not.toBeNull();
    await store.logout();
    expect(store.accessToken).toBeNull();
  });

  it('refresh returns the new token or null', async () => {
    const store = useAuthStore();
    vi.mocked(authApi.refresh).mockResolvedValue(token('ada@x.com'));
    expect(await store.refresh()).toBe(token('ada@x.com'));
    vi.mocked(authApi.refresh).mockRejectedValue(new ApiError(401, 'REFRESH_INVALID', 'x', {}));
    expect(await store.refresh()).toBeNull();
    expect(store.accessToken).toBeNull();
  });

  it('refresh is single-flight: concurrent callers share one API call', async () => {
    let resolve!: (t: string) => void;
    vi.mocked(authApi.refresh).mockReturnValue(new Promise<string>((r) => (resolve = r)));
    const store = useAuthStore();
    const a = store.refresh();
    const b = store.refresh();
    resolve(token('ada@x.com'));
    const [ta, tb] = await Promise.all([a, b]);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
    expect(ta).toBe(token('ada@x.com'));
    expect(tb).toBe(ta);
  });
});
