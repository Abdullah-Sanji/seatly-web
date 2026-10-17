/**
 * The webServer wait only proves nginx serves /config.js; the API container may still be
 * starting. Block until the API health endpoint answers 200 so tests never race the backend.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_BASE_URL) return;
  const url = `http://localhost:${process.env.API_PORT ?? '3100'}/health`;
  const deadline = Date.now() + 180_000;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API not healthy at ${url} within 180s (${last})`);
}
