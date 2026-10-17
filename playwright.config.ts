import { defineConfig, devices } from '@playwright/test';

/**
 * Browser e2e against the full Docker stack from seatly-api (postgres + redis + api + web),
 * started as a separate compose project ("seatly-e2e") on its own host ports so it never
 * collides with a developer's `docker compose up` stack.
 *
 *   SEATLY_API_DIR   path to the seatly-api checkout to build the API from (default ../seatly-api)
 *   E2E_REUSE_STACK  "0" forces `docker compose up --build` even if the e2e stack is already serving
 *   E2E_BASE_URL     override the web URL entirely (then no stack is started)
 *
 * The compose web service builds from WEB_DIR = this checkout, so a worktree tests its own code.
 * Only one e2e stack can run on a machine at a time.
 */
const apiDir = process.env.SEATLY_API_DIR ?? '../seatly-api';
const ports = { api: 3100, web: 8180, pg: 5433, redis: 6380 };
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${ports.web}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `docker compose -p seatly-e2e -f ${apiDir}/docker-compose.yml --profile full up --build`,
        url: `${baseURL}/config.js`,
        timeout: 300_000,
        reuseExistingServer: process.env.E2E_REUSE_STACK !== '0',
        env: {
          WEB_DIR: process.cwd(),
          API_PORT: String(ports.api),
          WEB_PORT: String(ports.web),
          PG_PORT: String(ports.pg),
          REDIS_PORT: String(ports.redis),
          WEB_ORIGIN: `http://localhost:5173,http://localhost:${ports.web}`,
        },
      },
});
