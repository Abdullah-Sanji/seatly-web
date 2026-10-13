import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { apiUrl } from '@/config';
import { tokenExpiresWithin } from '@/utils/jwt';
import { toApiError } from './errors';

export interface TokenSource {
  getToken(): string | null;
  refresh(): Promise<string | null>;
}

let tokenSource: TokenSource = { getToken: () => null, refresh: async () => null };

/** The auth store registers itself here; keeps http.ts free of store imports (no circular deps). */
export function setTokenSource(source: TokenSource): void {
  tokenSource = source;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/** Routes that must never trigger a refresh (they either issue tokens or are the refresh itself). */
const NO_REFRESH_ROUTES = ['/auth/login', '/auth/register', '/auth/refresh'];

/** Refresh proactively when the access token expires within this many seconds. */
const EXPIRY_MARGIN_SECONDS = 30;

function isNoRefreshRoute(config: InternalAxiosRequestConfig): boolean {
  return NO_REFRESH_ROUTES.some((p) => config.url === p || (config.url?.startsWith(p + '?') ?? false));
}

export const http = axios.create({ baseURL: apiUrl(), withCredentials: true });

http.interceptors.request.use(async (config: RetriableConfig) => {
  // A retried request already carries the freshly refreshed token.
  if (config._retried) return config;
  let token = tokenSource.getToken();
  if (token && !isNoRefreshRoute(config) && tokenExpiresWithin(token, EXPIRY_MARGIN_SECONDS)) {
    token = (await tokenSource.refresh()) ?? token;
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  if (error.response?.status === 401 && config && !config._retried && !isNoRefreshRoute(config)) {
    config._retried = true;
    const token = await tokenSource.refresh();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      return http(config);
    }
  }
  throw toApiError(error);
});
