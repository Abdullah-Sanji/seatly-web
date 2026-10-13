import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { apiUrl } from '@/config';
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

export const http = axios.create({ baseURL: apiUrl(), withCredentials: true });

http.interceptors.request.use((config: RetriableConfig) => {
  // A retried request already carries the freshly refreshed token.
  if (config._retried) return config;
  const token = tokenSource.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const isAuthRoute = config?.url?.startsWith('/auth/') ?? false;
  if (error.response?.status === 401 && config && !config._retried && !isAuthRoute) {
    config._retried = true;
    const token = await tokenSource.refresh();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      return http(config);
    }
  }
  throw toApiError(error);
});
