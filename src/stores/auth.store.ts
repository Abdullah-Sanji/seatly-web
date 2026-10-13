import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '@/api/auth.api';
import { decodeJwtPayload, tokenExpiresWithin } from '@/utils/jwt';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const ready = ref(false);

  const payload = computed(() => (accessToken.value ? decodeJwtPayload(accessToken.value) : null));
  const isAuthenticated = computed(() => accessToken.value !== null);
  const email = computed(() => payload.value?.email ?? null);
  const userId = computed(() => payload.value?.sub ?? null);

  let inflight: Promise<string | null> | null = null;

  /** Single-flight: the API consumes refresh tokens atomically, so parallel refreshes would invalidate each other. */
  function refresh(): Promise<string | null> {
    if (!inflight) {
      inflight = authApi
        .refresh()
        .then((token) => {
          accessToken.value = token;
          return token;
        })
        .catch(() => {
          accessToken.value = null;
          return null;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  /** Returns a token valid for at least 30 s more, refreshing first if needed; null when logged out. */
  async function ensureFresh(): Promise<string | null> {
    const token = accessToken.value;
    // Logged out: nothing to refresh (bootstrap already tried the cookie).
    if (!token || !tokenExpiresWithin(token, 30)) return token;
    return refresh();
  }

  /** Silent session restore via the httpOnly refresh cookie. Never throws: no cookie just means logged out. */
  async function bootstrap(): Promise<void> {
    try {
      await refresh();
    } finally {
      ready.value = true;
    }
  }

  async function login(emailInput: string, password: string): Promise<void> {
    accessToken.value = await authApi.login(emailInput, password);
  }

  async function register(emailInput: string, password: string): Promise<void> {
    accessToken.value = await authApi.register(emailInput, password);
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // The server-side token may already be gone; local logout always succeeds.
    } finally {
      accessToken.value = null;
    }
  }

  return { accessToken, ready, isAuthenticated, email, userId, bootstrap, refresh, ensureFresh, login, register, logout };
});
