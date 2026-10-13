const DEFAULT_API_URL = 'http://localhost:3000';

export function resolveApiUrl(
  runtime: { apiUrl?: string } | undefined,
  envUrl: string | undefined,
): string {
  const raw = runtime?.apiUrl || envUrl || DEFAULT_API_URL;
  return raw.replace(/\/+$/, '');
}

export function apiUrl(): string {
  return resolveApiUrl(window.__SEATLY_CONFIG__, import.meta.env.VITE_API_URL as string | undefined);
}
