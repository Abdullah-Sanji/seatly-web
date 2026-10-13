# Seatly Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `seatly-web`, the deliberately plain Vue 3 frontend for the finished Seatly API: register/login, events list, a live seat map with hold → confirm, and a bookings page, shipped as an nginx Docker image that the API repo's compose `full` profile can build.

**Architecture:** A Vite single-page app. One axios instance carries the in-memory access token and silently refreshes it once on 401 via the API's httpOnly refresh cookie. A Pinia seat-map store is the single source of truth for one event's seats; REST responses and Socket.IO `seat_update` messages both write into it through pure reducer functions that are unit-tested in isolation. The API base URL is injected at container start through a `config.js` file so one image serves any environment.

**Tech Stack:** Node 22, pnpm 11, Vue 3.5, Vite 6, TypeScript (strict), Vue Router 4, Pinia 3, axios 1, socket.io-client 4, Tailwind CSS 4 (`@tailwindcss/vite`), Vitest 3 + Vue Test Utils 2 + jsdom, axios-mock-adapter, vue-tsc, nginx:alpine.

**Spec:** `/Users/sanji/WebstormProjects/seatly-api/docs/superpowers/specs/2026-10-12-seatly-design.md` — §8 (web app), §6 (API surface), §7 (error envelope), §5.6 (live updates). The spec lives in the API repo; this plan copies the contract values it needs so executors never have to guess.

## Global Constraints

- Repo root `/Users/sanji/WebstormProjects/seatly-web` (git, remote `https://github.com/Abdullah-Sanji/seatly-web.git`, branch `main`). All paths below are relative to it. The API repo is a sibling at `../seatly-api`; its compose file builds this repo via `build: ../seatly-web` under profile `full`.
- Node 22, pnpm 11. Never npm or yarn. TypeScript `strict: true`; no `any`.
- **API contract (from the running API, verified 2026-10-13):**
  - Base URL default `http://localhost:3000`. API CORS allows `WEB_ORIGIN` (default `http://localhost:5173` for Vite dev; `http://localhost:8080` in Docker) with credentials. Every request must send `withCredentials: true` so the refresh cookie travels.
  - `POST /auth/register` `{ email, password }` (password 8–72 chars) → `200 { accessToken }` + sets httpOnly cookie `seatly_refresh` (`Path=/auth`, `SameSite=Lax`). `POST /auth/login` same shape → 200. `POST /auth/refresh` (cookie only, no body) → `200 { accessToken }` or `401 REFRESH_INVALID`. `POST /auth/logout` (bearer) → 204, clears cookie. Access token is a JWT with payload `{ sub, email, iat, exp }`, 15 min.
  - `GET /events` → `EventSummary[]`; `GET /events/:id` (optional bearer) → `EventDetail`; seat `state ∈ available | held | held_by_me | sold`; `held_by_me` only when the bearer is sent.
  - `POST /events/:id/seats/:seatId/hold` (bearer) → `200 { seatId, expiresAt }`; `DELETE …/hold` → 204; `POST /events/:id/bookings` → `201 { bookingId, seatIds, totalCents }`; `GET /me/bookings` → `MyBooking[]`.
  - Error envelope always `{ statusCode, code, message, details }`. Codes: `VALIDATION_FAILED, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, REQUEST_FAILED, REFRESH_INVALID, RATE_LIMITED, EMAIL_TAKEN, EVENT_NOT_FOUND, SEAT_NOT_FOUND, SALES_NOT_OPEN, SEAT_SOLD, SEAT_HELD, HOLD_LIMIT_REACHED, NOT_HOLDER, NO_HELD_SEATS, HOLD_EXPIRED, INTERNAL`. `HOLD_EXPIRED` carries `details.lostSeatIds: string[]`; `HOLD_LIMIT_REACHED` carries `details.maxSeats` (6); `VALIDATION_FAILED` carries `details.errors: string[]`.
  - Socket.IO at the API base URL, handshake `auth: { token }` (access JWT; missing/invalid → server disconnects). Client → server `join_event { eventId }` / `leave_event { eventId }` (ack `{ joined }` / `{ left }`). Server → client `seat_update { type: 'held'|'released'|'sold', seatIds: string[], expiresAt?: string }` and `sales_opened { type: 'sales_opened' }`. Anonymous viewers get no live updates (the seat map is still viewable via REST).
- Access token lives in memory only (Pinia). Never `localStorage`/`sessionStorage` for tokens. The refresh cookie is never read by JS.
- Max 6 held seats per user per event; hold TTL 300 s (`expiresAt` from the hold response is the countdown target).
- Money is `priceCents` (integer); display as `SAR 150.00` via one `formatCents` helper.
- Tests: Vitest, colocated `*.spec.ts` next to the code. `pnpm test` must be green and quiet before every commit. `pnpm typecheck` (`vue-tsc --noEmit`) must pass.
- Commit after every task with a conventional message ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No component library, no extra state libraries, no i18n. Tailwind utility classes only.

## Review Focus

Inputs the spec implies but no flow states; each line's test is added to the task named.

1. **A `held` socket message for a seat the viewer holds must not downgrade `held_by_me` to `held`** (the server broadcasts the viewer's own hold back to them). Test in Task 5.
2. **The socket reconnects after a dropped connection: the page must re-join the room and refetch the map once** (missed messages are not replayed). Test in Task 6.
3. **Confirm returns `HOLD_EXPIRED`: the lost seats leave "your seats", are highlighted, and the map is refetched** so the panel never shows a seat the server no longer holds. Test in Task 5 (reducer) and Task 6 (view wiring).
4. **First visit with no refresh cookie: bootstrap must resolve logged-out silently** (no error banner, no console noise), and a protected route must redirect to `/login?redirect=<path>` and return there after login. Test in Task 3.
5. **An anonymous viewer clicking a seat is sent to login with a redirect back to the event**, not shown a 401 error. Test in Task 6.

---

## File structure (end state)

```
.
├── .dockerignore  .env.example  .gitignore  index.html  package.json  pnpm-lock.yaml
├── tsconfig.json  tsconfig.node.json  vite.config.ts  vitest.config.ts  README.md
├── .github/workflows/ci.yml
├── Dockerfile  docker/nginx.conf  docker/40-config.sh
├── public/config.js                      # dev config: window.__SEATLY_CONFIG__
└── src/
    ├── main.ts  App.vue  style.css
    ├── config.ts                         # resolveApiUrl()
    ├── api/
    │   ├── types.ts                      # API contracts (EventSummary, SeatView, …)
    │   ├── errors.ts                     # ErrorCode, ApiError, toApiError()
    │   ├── http.ts                       # axios instance, bearer + refresh-once interceptors, setTokenSource()
    │   ├── auth.api.ts  events.api.ts  bookings.api.ts
    ├── utils/jwt.ts  utils/money.ts  utils/time.ts
    ├── stores/auth.store.ts
    ├── stores/seat-map.logic.ts          # pure reducers
    ├── stores/seat-map.store.ts          # Pinia wrapper + API actions
    ├── realtime/event-socket.ts          # connectEventSocket()
    ├── router/index.ts
    ├── components/AppHeader.vue  AuthForm.vue  EventCard.vue  SeatCell.vue  SeatGrid.vue  HoldPanel.vue  Countdown.vue
    └── views/LoginView.vue  RegisterView.vue  EventsView.vue  EventDetailView.vue  MyBookingsView.vue
```

---

### Task 1: Scaffold (Vite + Vue + TS + Tailwind + Vitest), config resolution, app shell

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `.env.example`, `public/config.js`, `src/main.ts`, `src/App.vue`, `src/style.css`, `src/config.ts`, `src/vite-env.d.ts`, `src/router/index.ts`, `src/views/EventsView.vue` (placeholder text only, replaced in Task 4)
- Test: `src/config.spec.ts`

**Interfaces:**
- Produces: `resolveApiUrl(runtime: { apiUrl?: string } | undefined, envUrl: string | undefined): string` and `apiUrl(): string` (reads `window.__SEATLY_CONFIG__` then `import.meta.env.VITE_API_URL`, default `http://localhost:3000`).
- Produces: `router` (Vue Router, history mode) with a placeholder `/events` route; later tasks add routes to the same `routes` array.
- Produces scripts: `dev`, `build`, `preview`, `test`, `typecheck`.

- [ ] **Step 1: Initialise the repo and install dependencies**

```bash
cd /Users/sanji/WebstormProjects/seatly-web
git init -b main
git remote add origin https://github.com/Abdullah-Sanji/seatly-web.git
pnpm init
pnpm add vue@3 vue-router@4 pinia@3 axios@1 socket.io-client@4
pnpm add -D vite@6 @vitejs/plugin-vue@5 typescript@5 vue-tsc@2 @types/node@22 \
  tailwindcss@4 @tailwindcss/vite@4 \
  vitest@3 @vue/test-utils@2 jsdom@26 axios-mock-adapter@2 @pinia/testing@1
```
If a pinned major is unavailable, install the latest major compatible with Vue 3.5 + Vite 6 and record the version in the report.

- [ ] **Step 2: Write `package.json` (keep the dependency blocks pnpm generated)**

```json
{
  "name": "seatly-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "vue-tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: TypeScript, Vite, Vitest, HTML and ignore files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "jsx": "preserve",
    "types": ["vite/client", "vitest/globals", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vitest.config.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
});
```

`vitest.config.ts`:
```ts
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.spec.ts'] },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Seatly</title>
    <script src="/config.js"></script>
  </head>
  <body class="bg-slate-50 text-slate-900">
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`public/config.js` (dev value; Docker overwrites this file at container start):
```js
window.__SEATLY_CONFIG__ = { apiUrl: 'http://localhost:3000' };
```

`.gitignore`:
```
node_modules
dist
.env
coverage
```

`.env.example`:
```
VITE_API_URL=http://localhost:3000
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

interface SeatlyRuntimeConfig {
  apiUrl?: string;
}

declare global {
  interface Window {
    __SEATLY_CONFIG__?: SeatlyRuntimeConfig;
  }
}

export {};
```

`src/style.css`:
```css
@import 'tailwindcss';
```

- [ ] **Step 4: Write the failing config test**

`src/config.spec.ts`:
```ts
import { resolveApiUrl } from './config';

describe('resolveApiUrl', () => {
  it('prefers the runtime config injected by config.js', () => {
    expect(resolveApiUrl({ apiUrl: 'https://api.example.com' }, 'http://env')).toBe('https://api.example.com');
  });

  it('falls back to the build-time env, then to localhost', () => {
    expect(resolveApiUrl(undefined, 'http://env:3000')).toBe('http://env:3000');
    expect(resolveApiUrl({}, undefined)).toBe('http://localhost:3000');
  });

  it('strips a trailing slash', () => {
    expect(resolveApiUrl({ apiUrl: 'http://x/' }, undefined)).toBe('http://x');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL, "Failed to resolve import './config'".

- [ ] **Step 6: Implement config, router skeleton, app shell**

`src/config.ts`:
```ts
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
```

`src/router/index.ts`:
```ts
import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/events' },
  { path: '/events', name: 'events', component: () => import('@/views/EventsView.vue') },
];

export const router = createRouter({ history: createWebHistory(), routes });
```

`src/views/EventsView.vue` (placeholder, replaced in Task 4):
```vue
<script setup lang="ts"></script>

<template>
  <h1 class="text-2xl font-semibold">Events</h1>
</template>
```

`src/App.vue`:
```vue
<script setup lang="ts"></script>

<template>
  <main class="mx-auto max-w-5xl p-4">
    <RouterView />
  </main>
</template>
```

`src/main.ts`:
```ts
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
```

- [ ] **Step 7: Run test, typecheck, build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: 3 tests PASS; typecheck clean; `dist/` produced. Then `pnpm dev` briefly and open http://localhost:5173/events → "Events" heading (stop the server).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vue 3 app with Vite, Tailwind, Vitest and runtime API config

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: API layer: types, error mapping, axios with bearer + refresh-once

**Files:**
- Create: `src/api/types.ts`, `src/api/errors.ts`, `src/api/http.ts`, `src/api/auth.api.ts`, `src/api/events.api.ts`, `src/api/bookings.api.ts`
- Test: `src/api/errors.spec.ts`, `src/api/http.spec.ts`

**Interfaces:**
- Produces (types.ts): `EventStatus`, `SeatState`, `SeatView`, `EventSummary`, `EventDetail`, `HoldResponse`, `BookingResult`, `MyBooking`, `SeatUpdateMessage`, `SalesOpenedMessage`, `ErrorBody` — exactly the API shapes in Global Constraints.
- Produces (errors.ts): `type ErrorCode` (API codes + `'NETWORK'`), `class ApiError extends Error { status: number; code: ErrorCode; details: Record<string, unknown> }`, `toApiError(error: unknown): ApiError`, `isApiError(e: unknown): e is ApiError`.
- Produces (http.ts): `http` (axios instance, `withCredentials: true`, baseURL from `apiUrl()`), `interface TokenSource { getToken(): string | null; refresh(): Promise<string | null> }`, `setTokenSource(source)`. Rules: attach `Authorization: Bearer <token>` when a token exists; on a 401 for a non-`/auth/` URL, call `refresh()` once, retry the request with the new token; any other failure is thrown as `ApiError`.
- Produces: `authApi.register(email, password): Promise<string>` (access token), `authApi.login`, `authApi.refresh(): Promise<string>`, `authApi.logout(): Promise<void>`; `eventsApi.list(): Promise<EventSummary[]>`, `eventsApi.get(id): Promise<EventDetail>`; `bookingsApi.hold(eventId, seatId): Promise<HoldResponse>`, `bookingsApi.release(eventId, seatId): Promise<void>`, `bookingsApi.confirm(eventId): Promise<BookingResult>`, `bookingsApi.myBookings(): Promise<MyBooking[]>`.

- [ ] **Step 1: Write the types**

`src/api/types.ts`:
```ts
export type EventStatus = 'upcoming' | 'on_sale' | 'closed';
export type SeatState = 'available' | 'held' | 'held_by_me' | 'sold';

export interface SeatView {
  id: string;
  rowLabel: string;
  seatNumber: number;
  priceCents: number;
  state: SeatState;
}

export interface EventSummary {
  id: string;
  name: string;
  venueName: string;
  startsAt: string;
  salesOpenAt: string;
  status: EventStatus;
  availableCount: number;
}

export interface EventDetail extends EventSummary {
  seats: SeatView[];
}

export interface HoldResponse {
  seatId: string;
  expiresAt: string;
}

export interface BookingResult {
  bookingId: string;
  seatIds: string[];
  totalCents: number;
}

export interface MyBooking {
  id: string;
  eventName: string;
  seats: { rowLabel: string; seatNumber: number }[];
  totalCents: number;
  createdAt: string;
}

export interface SeatUpdateMessage {
  type: 'held' | 'released' | 'sold';
  seatIds: string[];
  expiresAt?: string;
}

export interface SalesOpenedMessage {
  type: 'sales_opened';
}

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing tests**

`src/api/errors.spec.ts`:
```ts
import { AxiosError, AxiosHeaders } from 'axios';
import { ApiError, isApiError, toApiError } from './errors';

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
  error.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

describe('toApiError', () => {
  it('maps the API envelope to an ApiError', () => {
    const err = toApiError(
      axiosErrorWith(409, { statusCode: 409, code: 'SEAT_HELD', message: 'Seat is held', details: {} }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('SEAT_HELD');
    expect(err.message).toBe('Seat is held');
  });

  it('keeps details such as lostSeatIds', () => {
    const err = toApiError(
      axiosErrorWith(409, { statusCode: 409, code: 'HOLD_EXPIRED', message: 'x', details: { lostSeatIds: ['s1'] } }),
    );
    expect(err.details).toEqual({ lostSeatIds: ['s1'] });
  });

  it('maps a missing response to NETWORK', () => {
    const err = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'));
    expect(err.code).toBe('NETWORK');
    expect(err.status).toBe(0);
  });

  it('passes an ApiError through and wraps unknown errors as INTERNAL', () => {
    const original = new ApiError(500, 'INTERNAL', 'boom', {});
    expect(toApiError(original)).toBe(original);
    expect(toApiError(new Error('x')).code).toBe('INTERNAL');
    expect(isApiError(original)).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
  });
});
```

`src/api/http.spec.ts`:
```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL on missing modules `./errors` / `./http`.

- [ ] **Step 4: Implement errors, http and the API modules**

`src/api/errors.ts`:
```ts
import { AxiosError } from 'axios';
import { ErrorBody } from './types';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'REQUEST_FAILED'
  | 'REFRESH_INVALID'
  | 'RATE_LIMITED'
  | 'EMAIL_TAKEN'
  | 'EVENT_NOT_FOUND'
  | 'SEAT_NOT_FOUND'
  | 'SALES_NOT_OPEN'
  | 'SEAT_SOLD'
  | 'SEAT_HELD'
  | 'HOLD_LIMIT_REACHED'
  | 'NOT_HOLDER'
  | 'NO_HELD_SEATS'
  | 'HOLD_EXPIRED'
  | 'INTERNAL'
  | 'NETWORK';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function isErrorBody(data: unknown): data is ErrorBody {
  return typeof data === 'object' && data !== null && typeof (data as ErrorBody).code === 'string';
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;
  if (error instanceof AxiosError) {
    const data: unknown = error.response?.data;
    if (error.response && isErrorBody(data)) {
      return new ApiError(error.response.status, data.code as ErrorCode, data.message, data.details ?? {});
    }
    if (!error.response) {
      return new ApiError(0, 'NETWORK', 'Cannot reach the server', {});
    }
    return new ApiError(error.response.status, 'REQUEST_FAILED', error.message, {});
  }
  return new ApiError(500, 'INTERNAL', error instanceof Error ? error.message : 'Unexpected error', {});
}
```

`src/api/http.ts`:
```ts
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

http.interceptors.request.use((config) => {
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
```

`src/api/auth.api.ts`:
```ts
import { http } from './http';

interface AccessTokenResponse {
  accessToken: string;
}

export const authApi = {
  async register(email: string, password: string): Promise<string> {
    const { data } = await http.post<AccessTokenResponse>('/auth/register', { email, password });
    return data.accessToken;
  },
  async login(email: string, password: string): Promise<string> {
    const { data } = await http.post<AccessTokenResponse>('/auth/login', { email, password });
    return data.accessToken;
  },
  async refresh(): Promise<string> {
    const { data } = await http.post<AccessTokenResponse>('/auth/refresh');
    return data.accessToken;
  },
  async logout(): Promise<void> {
    await http.post('/auth/logout');
  },
};
```

`src/api/events.api.ts`:
```ts
import { http } from './http';
import { EventDetail, EventSummary } from './types';

export const eventsApi = {
  async list(): Promise<EventSummary[]> {
    const { data } = await http.get<EventSummary[]>('/events');
    return data;
  },
  async get(eventId: string): Promise<EventDetail> {
    const { data } = await http.get<EventDetail>(`/events/${eventId}`);
    return data;
  },
};
```

`src/api/bookings.api.ts`:
```ts
import { http } from './http';
import { BookingResult, HoldResponse, MyBooking } from './types';

export const bookingsApi = {
  async hold(eventId: string, seatId: string): Promise<HoldResponse> {
    const { data } = await http.post<HoldResponse>(`/events/${eventId}/seats/${seatId}/hold`);
    return data;
  },
  async release(eventId: string, seatId: string): Promise<void> {
    await http.delete(`/events/${eventId}/seats/${seatId}/hold`);
  },
  async confirm(eventId: string): Promise<BookingResult> {
    const { data } = await http.post<BookingResult>(`/events/${eventId}/bookings`);
    return data;
  },
  async myBookings(): Promise<MyBooking[]> {
    const { data } = await http.get<MyBooking[]>('/me/bookings');
    return data;
  },
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (3 + 4 + 5 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add typed API layer with error mapping and refresh-once interceptor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Auth store, login/register views, router guard, app header

**Files:**
- Create: `src/utils/jwt.ts`, `src/stores/auth.store.ts`, `src/components/AuthForm.vue`, `src/components/AppHeader.vue`, `src/views/LoginView.vue`, `src/views/RegisterView.vue`
- Modify: `src/router/index.ts`, `src/main.ts`, `src/App.vue`
- Test: `src/utils/jwt.spec.ts`, `src/stores/auth.store.spec.ts`, `src/router/guard.spec.ts`

**Interfaces:**
- Produces: `decodeJwtPayload(token: string): { sub: string; email: string; exp: number } | null`.
- Produces `useAuthStore()` with state `accessToken: string | null`, `ready: boolean`; getters `isAuthenticated`, `email: string | null`, `userId: string | null`; actions `bootstrap(): Promise<void>` (silent refresh; never throws), `login(email, password)`, `register(email, password)`, `logout()` (clears the token even if the API call fails), `refresh(): Promise<string | null>`.
- Produces: `requireAuth` navigation guard installed in `router` for routes with `meta.requiresAuth`; redirects to `/login?redirect=<fullPath>`.
- Produces: routes `/login`, `/register`, and `/me/bookings` (placeholder component until Task 7, `requiresAuth`).
- Consumes: `authApi`, `setTokenSource`, `ApiError`.

- [ ] **Step 1: Write the failing tests**

`src/utils/jwt.spec.ts`:
```ts
import { decodeJwtPayload } from './jwt';

function fakeJwt(payload: object): string {
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${b64}.sig`;
}

describe('decodeJwtPayload', () => {
  it('decodes sub, email and exp', () => {
    const token = fakeJwt({ sub: 'u1', email: 'a@b.c', exp: 123 });
    expect(decodeJwtPayload(token)).toEqual({ sub: 'u1', email: 'a@b.c', exp: 123 });
  });

  it('returns null for garbage', () => {
    expect(decodeJwtPayload('nope')).toBeNull();
    expect(decodeJwtPayload('a.b.c')).toBeNull();
  });
});
```

`src/stores/auth.store.spec.ts`:
```ts
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
});
```

`src/router/guard.spec.ts`:
```ts
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { installGuards, routes } from './index';

describe('requireAuth guard', () => {
  beforeEach(() => setActivePinia(createPinia()));

  function makeRouter() {
    const router = createRouter({ history: createMemoryHistory(), routes });
    installGuards(router);
    return router;
  }

  it('redirects anonymous users to /login with the original path', async () => {
    const router = makeRouter();
    await router.push('/me/bookings');
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/me/bookings');
  });

  it('lets authenticated users through', async () => {
    useAuthStore().accessToken = 'h.e30.s';
    const router = makeRouter();
    await router.push('/me/bookings');
    expect(router.currentRoute.value.path).toBe('/me/bookings');
  });

  it('leaves public routes alone', async () => {
    const router = makeRouter();
    await router.push('/events');
    expect(router.currentRoute.value.path).toBe('/events');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL on missing modules (`./jwt`, `./auth.store`, `installGuards`).

- [ ] **Step 3: Implement jwt util, store, guards, routes**

`src/utils/jwt.ts`:
```ts
export interface JwtPayload {
  sub: string;
  email: string;
  exp: number;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const parsed: unknown = JSON.parse(atob(padded));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as JwtPayload).sub === 'string' &&
      typeof (parsed as JwtPayload).email === 'string'
    ) {
      const { sub, email, exp } = parsed as JwtPayload;
      return { sub, email, exp };
    }
    return null;
  } catch {
    return null;
  }
}
```

`src/stores/auth.store.ts`:
```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '@/api/auth.api';
import { decodeJwtPayload } from '@/utils/jwt';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const ready = ref(false);

  const payload = computed(() => (accessToken.value ? decodeJwtPayload(accessToken.value) : null));
  const isAuthenticated = computed(() => accessToken.value !== null);
  const email = computed(() => payload.value?.email ?? null);
  const userId = computed(() => payload.value?.sub ?? null);

  /** Silent session restore via the httpOnly refresh cookie. Never throws: no cookie just means logged out. */
  async function bootstrap(): Promise<void> {
    try {
      accessToken.value = await authApi.refresh();
    } catch {
      accessToken.value = null;
    } finally {
      ready.value = true;
    }
  }

  async function refresh(): Promise<string | null> {
    try {
      accessToken.value = await authApi.refresh();
    } catch {
      accessToken.value = null;
    }
    return accessToken.value;
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

  return { accessToken, ready, isAuthenticated, email, userId, bootstrap, refresh, login, register, logout };
});
```

Replace `src/router/index.ts`:
```ts
import { createRouter, createWebHistory, Router, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/events' },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
  { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue') },
  { path: '/events', name: 'events', component: () => import('@/views/EventsView.vue') },
  {
    path: '/me/bookings',
    name: 'my-bookings',
    component: () => import('@/views/MyBookingsView.vue'),
    meta: { requiresAuth: true },
  },
];

export function installGuards(router: Router): void {
  router.beforeEach((to) => {
    if (to.meta.requiresAuth && !useAuthStore().isAuthenticated) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
    return true;
  });
}

export const router = createRouter({ history: createWebHistory(), routes });
installGuards(router);
```

`src/views/MyBookingsView.vue` (placeholder, replaced in Task 7):
```vue
<script setup lang="ts"></script>

<template>
  <h1 class="text-2xl font-semibold">My bookings</h1>
</template>
```

`src/components/AuthForm.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ submitLabel: string; busy: boolean; error: string | null }>();
const emit = defineEmits<{ submit: [email: string, password: string] }>();

const email = ref('');
const password = ref('');

function onSubmit(): void {
  if (props.busy) return;
  emit('submit', email.value.trim(), password.value);
}
</script>

<template>
  <form class="flex max-w-sm flex-col gap-3" @submit.prevent="onSubmit">
    <label class="flex flex-col gap-1 text-sm">
      Email
      <input v-model="email" type="email" required autocomplete="email" class="rounded border px-3 py-2" />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      Password
      <input
        v-model="password"
        type="password"
        required
        minlength="8"
        maxlength="72"
        autocomplete="current-password"
        class="rounded border px-3 py-2"
      />
    </label>
    <p v-if="error" role="alert" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <button type="submit" :disabled="busy" class="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
      {{ busy ? 'Please wait…' : submitLabel }}
    </button>
  </form>
</template>
```

`src/views/LoginView.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isApiError } from '@/api/errors';
import AuthForm from '@/components/AuthForm.vue';
import { useAuthStore } from '@/stores/auth.store';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const busy = ref(false);
const error = ref<string | null>(null);

async function onSubmit(email: string, password: string): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await auth.login(email, password);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/events';
    await router.push(redirect);
  } catch (e) {
    error.value = isApiError(e) && e.code === 'UNAUTHORIZED' ? 'Wrong email or password.' : 'Login failed. Try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">Log in</h1>
    <AuthForm submit-label="Log in" :busy="busy" :error="error" @submit="onSubmit" />
    <p class="text-sm">
      No account?
      <RouterLink class="underline" :to="{ path: '/register', query: route.query }">Register</RouterLink>
    </p>
  </section>
</template>
```

`src/views/RegisterView.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isApiError } from '@/api/errors';
import AuthForm from '@/components/AuthForm.vue';
import { useAuthStore } from '@/stores/auth.store';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const busy = ref(false);
const error = ref<string | null>(null);

async function onSubmit(email: string, password: string): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await auth.register(email, password);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/events';
    await router.push(redirect);
  } catch (e) {
    if (isApiError(e) && e.code === 'EMAIL_TAKEN') error.value = 'That email is already registered.';
    else if (isApiError(e) && e.code === 'VALIDATION_FAILED') error.value = 'Use a valid email and a password of 8–72 characters.';
    else error.value = 'Registration failed. Try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">Register</h1>
    <AuthForm submit-label="Create account" :busy="busy" :error="error" @submit="onSubmit" />
    <p class="text-sm">
      Have an account?
      <RouterLink class="underline" :to="{ path: '/login', query: route.query }">Log in</RouterLink>
    </p>
  </section>
</template>
```

`src/components/AppHeader.vue`:
```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

const auth = useAuthStore();
const router = useRouter();

async function onLogout(): Promise<void> {
  await auth.logout();
  await router.push('/events');
}
</script>

<template>
  <header class="mb-6 flex items-center justify-between border-b pb-3">
    <RouterLink to="/events" class="text-xl font-bold">Seatly</RouterLink>
    <nav class="flex items-center gap-4 text-sm">
      <RouterLink to="/events" class="underline">Events</RouterLink>
      <template v-if="auth.isAuthenticated">
        <RouterLink to="/me/bookings" class="underline">My bookings</RouterLink>
        <span class="text-slate-500">{{ auth.email }}</span>
        <button type="button" class="rounded border px-3 py-1" @click="onLogout">Log out</button>
      </template>
      <template v-else>
        <RouterLink to="/login" class="underline">Log in</RouterLink>
        <RouterLink to="/register" class="underline">Register</RouterLink>
      </template>
    </nav>
  </header>
</template>
```

Replace `src/App.vue`:
```vue
<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue';
</script>

<template>
  <main class="mx-auto max-w-5xl p-4">
    <AppHeader />
    <RouterView />
  </main>
</template>
```

Replace `src/main.ts` (bootstrap the session before mounting so guards never see an unknown state):
```ts
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { setTokenSource } from '@/api/http';
import App from './App.vue';
import { router } from './router';
import { useAuthStore } from './stores/auth.store';
import './style.css';

async function start(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  const auth = useAuthStore(pinia);
  setTokenSource({ getToken: () => auth.accessToken, refresh: () => auth.refresh() });
  await auth.bootstrap();

  app.use(router);
  await router.isReady();
  app.mount('#app');
}

void start();
```

- [ ] **Step 4: Run tests, typecheck, and a manual check against the real API**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (all suites), typecheck clean.

Manual: in `../seatly-api` run `docker compose up -d` (API on :3000, `WEB_ORIGIN` defaults to `http://localhost:5173` only when started via `pnpm start:dev`; when using the compose `api` service, start it with `WEB_ORIGIN=http://localhost:5173 docker compose up -d`). Then `pnpm dev`, open http://localhost:5173/register, create an account, confirm the header shows your email, reload the page and confirm you stay logged in (cookie refresh), log out. Note any console errors in the report.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add auth store, login/register views, router guard and header

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Events list

**Files:**
- Create: `src/utils/money.ts`, `src/utils/time.ts`, `src/components/EventCard.vue`
- Modify: `src/views/EventsView.vue` (replace placeholder)
- Test: `src/utils/money.spec.ts`, `src/utils/time.spec.ts`, `src/components/EventCard.spec.ts`

**Interfaces:**
- Produces: `formatCents(cents: number): string` → `SAR 150.00`; `formatDateTime(iso: string): string` (locale `en-GB`, e.g. `19 Oct 2026, 19:00`); `statusLabel(status: EventStatus): string` (`Upcoming` / `On sale` / `Closed`).
- Produces: `EventCard` props `{ event: EventSummary }`, links to `/events/:id`.
- Consumes: `eventsApi.list()`.

- [ ] **Step 1: Write the failing tests**

`src/utils/money.spec.ts`:
```ts
import { formatCents } from './money';

describe('formatCents', () => {
  it('formats whole and fractional amounts', () => {
    expect(formatCents(15000)).toBe('SAR 150.00');
    expect(formatCents(1)).toBe('SAR 0.01');
    expect(formatCents(0)).toBe('SAR 0.00');
  });
});
```

`src/utils/time.spec.ts`:
```ts
import { formatDateTime, statusLabel } from './time';

describe('time utils', () => {
  it('formats an ISO timestamp for humans', () => {
    expect(formatDateTime('2026-10-19T19:00:00.000Z')).toMatch(/19 Oct 2026/);
  });

  it('labels event statuses', () => {
    expect(statusLabel('upcoming')).toBe('Upcoming');
    expect(statusLabel('on_sale')).toBe('On sale');
    expect(statusLabel('closed')).toBe('Closed');
  });
});
```

`src/components/EventCard.spec.ts`:
```ts
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import EventCard from './EventCard.vue';

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] });

describe('EventCard', () => {
  it('shows name, venue, status and available count, and links to the detail page', () => {
    const wrapper = mount(EventCard, {
      props: {
        event: {
          id: 'e1',
          name: 'Jazz Night',
          venueName: 'Hall',
          startsAt: '2026-10-19T19:00:00.000Z',
          salesOpenAt: '2026-10-01T00:00:00.000Z',
          status: 'on_sale',
          availableCount: 42,
        },
      },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Jazz Night');
    expect(wrapper.text()).toContain('Hall');
    expect(wrapper.text()).toContain('On sale');
    expect(wrapper.text()).toContain('42 seats left');
    expect(wrapper.find('a').attributes('href')).toBe('/events/e1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL on missing modules.

- [ ] **Step 3: Implement**

`src/utils/money.ts`:
```ts
export function formatCents(cents: number): string {
  return `SAR ${(cents / 100).toFixed(2)}`;
}
```

`src/utils/time.ts`:
```ts
import { EventStatus } from '@/api/types';

const formatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(iso: string): string {
  return formatter.format(new Date(iso));
}

const LABELS: Record<EventStatus, string> = { upcoming: 'Upcoming', on_sale: 'On sale', closed: 'Closed' };

export function statusLabel(status: EventStatus): string {
  return LABELS[status];
}
```

`src/components/EventCard.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { EventSummary } from '@/api/types';
import { formatDateTime, statusLabel } from '@/utils/time';

const props = defineProps<{ event: EventSummary }>();

const badgeClass = computed(() => ({
  'bg-green-100 text-green-800': props.event.status === 'on_sale',
  'bg-amber-100 text-amber-800': props.event.status === 'upcoming',
  'bg-slate-200 text-slate-700': props.event.status === 'closed',
}));
</script>

<template>
  <RouterLink :to="`/events/${event.id}`" class="block rounded-lg border bg-white p-4 shadow-sm hover:shadow">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ event.name }}</h2>
        <p class="text-sm text-slate-600">{{ event.venueName }} · {{ formatDateTime(event.startsAt) }}</p>
      </div>
      <span class="rounded px-2 py-0.5 text-xs font-medium" :class="badgeClass">{{ statusLabel(event.status) }}</span>
    </div>
    <p class="mt-2 text-sm">{{ event.availableCount }} seats left</p>
  </RouterLink>
</template>
```

Replace `src/views/EventsView.vue`:
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { eventsApi } from '@/api/events.api';
import { EventSummary } from '@/api/types';
import EventCard from '@/components/EventCard.vue';

const events = ref<EventSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    events.value = await eventsApi.list();
  } catch {
    error.value = 'Could not load events.';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">Events</h1>
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" role="alert" class="text-red-700">{{ error }}</p>
    <p v-else-if="events.length === 0">No events yet.</p>
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <EventCard v-for="event in events" :key="event.id" :event="event" />
    </div>
  </section>
</template>
```

- [ ] **Step 4: Run tests and typecheck; eyeball the list against the seeded API**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. `pnpm dev` → http://localhost:5173/events shows the three seeded events with badges and counts.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add events list with cards and formatting helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Seat map reducers and store

**Files:**
- Create: `src/stores/seat-map.logic.ts`, `src/stores/seat-map.store.ts`
- Test: `src/stores/seat-map.logic.spec.ts`, `src/stores/seat-map.store.spec.ts`

**Interfaces:**
- Produces (logic.ts, all pure, return new objects, never mutate):
  - `interface MySeat { seatId: string; expiresAt: string | null }`
  - `interface SeatMapState { event: EventDetail | null; mySeats: MySeat[]; lostSeatIds: string[] }`
  - `emptyState(): SeatMapState`
  - `fromDetail(detail: EventDetail): SeatMapState` — `mySeats` = seats with `held_by_me` (expiresAt `null`, unknown after reload)
  - `applySeatUpdate(state, msg: SeatUpdateMessage): SeatMapState` — `held`: others' seats → `held`, `held_by_me` stays; `released`: → `available`, drop from `mySeats`; `sold`: → `sold`, drop from `mySeats`
  - `applySalesOpened(state): SeatMapState`
  - `applyHold(state, seatId, expiresAt): SeatMapState`; `applyRelease(state, seatId)`; `applyConfirm(state, seatIds)`; `applyLost(state, lostSeatIds)` (drop from `mySeats`, seats → `held`, record `lostSeatIds`); `clearLost(state)`
  - `totalCents(state): number`; `earliestExpiry(state): string | null`; `isMine(state, seatId): boolean`
- Produces (store): `useSeatMapStore()` with state `event`, `mySeats`, `lostSeatIds`, `loading`, `error: string | null`, `lastBooking: BookingResult | null`; getters `total`, `earliestExpiry`, `canConfirm`; actions `load(eventId)`, `toggle(seatId)` (hold or release), `confirm()`, `onSocketMessage(msg: SeatUpdateMessage | SalesOpenedMessage)`, `reset()`.
- Consumes: `eventsApi.get`, `bookingsApi`, `ApiError`.

- [ ] **Step 1: Write the failing reducer tests**

`src/stores/seat-map.logic.spec.ts`:
```ts
import { EventDetail } from '@/api/types';
import {
  applyConfirm,
  applyHold,
  applyLost,
  applyRelease,
  applySalesOpened,
  applySeatUpdate,
  earliestExpiry,
  fromDetail,
  totalCents,
} from './seat-map.logic';

function detail(): EventDetail {
  return {
    id: 'e1',
    name: 'Show',
    venueName: 'Hall',
    startsAt: '2026-10-19T19:00:00.000Z',
    salesOpenAt: '2026-10-01T00:00:00.000Z',
    status: 'on_sale',
    availableCount: 2,
    seats: [
      { id: 's1', rowLabel: 'A', seatNumber: 1, priceCents: 100, state: 'available' },
      { id: 's2', rowLabel: 'A', seatNumber: 2, priceCents: 200, state: 'held_by_me' },
      { id: 's3', rowLabel: 'A', seatNumber: 3, priceCents: 300, state: 'held' },
      { id: 's4', rowLabel: 'A', seatNumber: 4, priceCents: 400, state: 'sold' },
    ],
  };
}

const stateOf = (s: ReturnType<typeof fromDetail>, id: string) => s.event?.seats.find((x) => x.id === id)?.state;

describe('seat-map reducers', () => {
  it('fromDetail seeds mySeats from held_by_me with unknown expiry', () => {
    const s = fromDetail(detail());
    expect(s.mySeats).toEqual([{ seatId: 's2', expiresAt: null }]);
  });

  it('held marks other seats held but never downgrades held_by_me', () => {
    const s = applySeatUpdate(fromDetail(detail()), { type: 'held', seatIds: ['s1', 's2'], expiresAt: 'x' });
    expect(stateOf(s, 's1')).toBe('held');
    expect(stateOf(s, 's2')).toBe('held_by_me');
    expect(s.mySeats).toHaveLength(1);
  });

  it('released frees the seat and drops it from mySeats (own expiry)', () => {
    const s = applySeatUpdate(fromDetail(detail()), { type: 'released', seatIds: ['s2', 's3'] });
    expect(stateOf(s, 's2')).toBe('available');
    expect(stateOf(s, 's3')).toBe('available');
    expect(s.mySeats).toEqual([]);
  });

  it('sold marks seats sold and drops them from mySeats', () => {
    const s = applySeatUpdate(fromDetail(detail()), { type: 'sold', seatIds: ['s2'] });
    expect(stateOf(s, 's2')).toBe('sold');
    expect(s.mySeats).toEqual([]);
  });

  it('applyHold / applyRelease / applyConfirm keep seats and mySeats in step', () => {
    let s = applyHold(fromDetail(detail()), 's1', '2026-10-19T10:05:00.000Z');
    expect(stateOf(s, 's1')).toBe('held_by_me');
    expect(s.mySeats).toEqual([
      { seatId: 's2', expiresAt: null },
      { seatId: 's1', expiresAt: '2026-10-19T10:05:00.000Z' },
    ]);
    expect(totalCents(s)).toBe(300);
    expect(earliestExpiry(s)).toBe('2026-10-19T10:05:00.000Z');

    s = applyRelease(s, 's2');
    expect(stateOf(s, 's2')).toBe('available');
    expect(s.mySeats.map((m) => m.seatId)).toEqual(['s1']);

    s = applyConfirm(s, ['s1']);
    expect(stateOf(s, 's1')).toBe('sold');
    expect(s.mySeats).toEqual([]);
    expect(earliestExpiry(s)).toBeNull();
  });

  it('applyLost removes lost seats from mySeats and records them for highlighting', () => {
    const s = applyLost(fromDetail(detail()), ['s2']);
    expect(s.mySeats).toEqual([]);
    expect(s.lostSeatIds).toEqual(['s2']);
    expect(stateOf(s, 's2')).toBe('held');
  });

  it('applySalesOpened flips the status', () => {
    const d = detail();
    d.status = 'upcoming';
    expect(applySalesOpened(fromDetail(d)).event?.status).toBe('on_sale');
  });

  it('never mutates its input', () => {
    const before = fromDetail(detail());
    const snapshot = JSON.stringify(before);
    applySeatUpdate(before, { type: 'sold', seatIds: ['s1'] });
    applyHold(before, 's1', 'x');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/stores/seat-map.logic`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the reducers**

`src/stores/seat-map.logic.ts`:
```ts
import { EventDetail, SeatState, SeatUpdateMessage } from '@/api/types';

export interface MySeat {
  seatId: string;
  expiresAt: string | null;
}

export interface SeatMapState {
  event: EventDetail | null;
  mySeats: MySeat[];
  lostSeatIds: string[];
}

export function emptyState(): SeatMapState {
  return { event: null, mySeats: [], lostSeatIds: [] };
}

export function fromDetail(detail: EventDetail): SeatMapState {
  return {
    event: detail,
    mySeats: detail.seats.filter((s) => s.state === 'held_by_me').map((s) => ({ seatId: s.id, expiresAt: null })),
    lostSeatIds: [],
  };
}

function setStates(
  state: SeatMapState,
  seatIds: string[],
  next: (current: SeatState) => SeatState,
): SeatMapState {
  if (!state.event) return state;
  const ids = new Set(seatIds);
  return {
    ...state,
    event: {
      ...state.event,
      seats: state.event.seats.map((seat) => (ids.has(seat.id) ? { ...seat, state: next(seat.state) } : seat)),
    },
  };
}

function withoutMine(state: SeatMapState, seatIds: string[]): SeatMapState {
  const ids = new Set(seatIds);
  return { ...state, mySeats: state.mySeats.filter((m) => !ids.has(m.seatId)) };
}

export function applySeatUpdate(state: SeatMapState, msg: SeatUpdateMessage): SeatMapState {
  switch (msg.type) {
    case 'held':
      // The server echoes our own hold back to us; held_by_me must win.
      return setStates(state, msg.seatIds, (current) => (current === 'held_by_me' ? 'held_by_me' : 'held'));
    case 'released':
      return withoutMine(setStates(state, msg.seatIds, () => 'available'), msg.seatIds);
    case 'sold':
      return withoutMine(setStates(state, msg.seatIds, () => 'sold'), msg.seatIds);
  }
}

export function applySalesOpened(state: SeatMapState): SeatMapState {
  return state.event ? { ...state, event: { ...state.event, status: 'on_sale' } } : state;
}

export function applyHold(state: SeatMapState, seatId: string, expiresAt: string): SeatMapState {
  const next = setStates(state, [seatId], () => 'held_by_me');
  return { ...next, mySeats: [...next.mySeats.filter((m) => m.seatId !== seatId), { seatId, expiresAt }] };
}

export function applyRelease(state: SeatMapState, seatId: string): SeatMapState {
  return withoutMine(setStates(state, [seatId], () => 'available'), [seatId]);
}

export function applyConfirm(state: SeatMapState, seatIds: string[]): SeatMapState {
  return withoutMine(setStates(state, seatIds, () => 'sold'), seatIds);
}

/** Confirm reported HOLD_EXPIRED: those seats are no longer ours. The caller refetches for the truth. */
export function applyLost(state: SeatMapState, lostSeatIds: string[]): SeatMapState {
  const next = withoutMine(setStates(state, lostSeatIds, () => 'held'), lostSeatIds);
  return { ...next, lostSeatIds };
}

export function clearLost(state: SeatMapState): SeatMapState {
  return { ...state, lostSeatIds: [] };
}

export function isMine(state: SeatMapState, seatId: string): boolean {
  return state.mySeats.some((m) => m.seatId === seatId);
}

export function totalCents(state: SeatMapState): number {
  if (!state.event) return 0;
  const prices = new Map(state.event.seats.map((s) => [s.id, s.priceCents]));
  return state.mySeats.reduce((sum, m) => sum + (prices.get(m.seatId) ?? 0), 0);
}

export function earliestExpiry(state: SeatMapState): string | null {
  const known = state.mySeats.map((m) => m.expiresAt).filter((x): x is string => x !== null);
  if (known.length === 0) return null;
  return known.reduce((min, x) => (x < min ? x : min));
}
```

- [ ] **Step 4: Run the reducer tests to verify they pass**

Run: `pnpm test src/stores/seat-map.logic`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the failing store test**

`src/stores/seat-map.store.spec.ts`:
```ts
import { createPinia, setActivePinia } from 'pinia';
import { bookingsApi } from '@/api/bookings.api';
import { ApiError } from '@/api/errors';
import { eventsApi } from '@/api/events.api';
import { EventDetail } from '@/api/types';
import { useSeatMapStore } from './seat-map.store';

vi.mock('@/api/events.api', () => ({ eventsApi: { get: vi.fn() } }));
vi.mock('@/api/bookings.api', () => ({
  bookingsApi: { hold: vi.fn(), release: vi.fn(), confirm: vi.fn(), myBookings: vi.fn() },
}));

function detail(): EventDetail {
  return {
    id: 'e1',
    name: 'Show',
    venueName: 'Hall',
    startsAt: '2026-10-19T19:00:00.000Z',
    salesOpenAt: '2026-10-01T00:00:00.000Z',
    status: 'on_sale',
    availableCount: 2,
    seats: [
      { id: 's1', rowLabel: 'A', seatNumber: 1, priceCents: 100, state: 'available' },
      { id: 's2', rowLabel: 'A', seatNumber: 2, priceCents: 200, state: 'available' },
    ],
  };
}

describe('seat map store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(eventsApi.get).mockReset().mockResolvedValue(detail());
    vi.mocked(bookingsApi.hold).mockReset();
    vi.mocked(bookingsApi.release).mockReset();
    vi.mocked(bookingsApi.confirm).mockReset();
  });

  it('toggle holds an available seat and releases a held-by-me seat', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    vi.mocked(bookingsApi.hold).mockResolvedValue({ seatId: 's1', expiresAt: '2026-10-19T10:05:00.000Z' });

    await store.toggle('s1');
    expect(store.event?.seats[0].state).toBe('held_by_me');
    expect(store.total).toBe(100);
    expect(store.earliestExpiry).toBe('2026-10-19T10:05:00.000Z');

    vi.mocked(bookingsApi.release).mockResolvedValue();
    await store.toggle('s1');
    expect(bookingsApi.release).toHaveBeenCalledWith('e1', 's1');
    expect(store.event?.seats[0].state).toBe('available');
    expect(store.mySeats).toEqual([]);
  });

  it('a lost hold race (SEAT_HELD) refetches the map and sets a message', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    vi.mocked(bookingsApi.hold).mockRejectedValue(new ApiError(409, 'SEAT_HELD', 'Seat is held', {}));
    await store.toggle('s1');
    expect(store.error).toMatch(/someone else/i);
    expect(eventsApi.get).toHaveBeenCalledTimes(2);
  });

  it('confirm marks seats sold and records the booking', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    vi.mocked(bookingsApi.hold).mockResolvedValue({ seatId: 's1', expiresAt: 'x' });
    await store.toggle('s1');
    vi.mocked(bookingsApi.confirm).mockResolvedValue({ bookingId: 'b1', seatIds: ['s1'], totalCents: 100 });

    await store.confirm();
    expect(store.lastBooking?.bookingId).toBe('b1');
    expect(store.event?.seats[0].state).toBe('sold');
    expect(store.canConfirm).toBe(false);
  });

  it('confirm with HOLD_EXPIRED drops the lost seats, highlights them and refetches', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    vi.mocked(bookingsApi.hold).mockResolvedValue({ seatId: 's1', expiresAt: 'x' });
    await store.toggle('s1');
    vi.mocked(bookingsApi.confirm).mockRejectedValue(
      new ApiError(409, 'HOLD_EXPIRED', 'x', { lostSeatIds: ['s1'] }),
    );

    await store.confirm();
    expect(store.lostSeatIds).toEqual(['s1']);
    expect(store.mySeats).toEqual([]);
    expect(store.error).toMatch(/expired/i);
    expect(eventsApi.get).toHaveBeenCalledTimes(2);
  });

  it('socket messages flow through the reducers', async () => {
    const store = useSeatMapStore();
    await store.load('e1');
    store.onSocketMessage({ type: 'sold', seatIds: ['s2'] });
    expect(store.event?.seats[1].state).toBe('sold');
    store.onSocketMessage({ type: 'sales_opened' });
    expect(store.event?.status).toBe('on_sale');
  });
});
```

- [ ] **Step 6: Run the store test to verify it fails**

Run: `pnpm test src/stores/seat-map.store`
Expected: FAIL, module not found.

- [ ] **Step 7: Implement the store**

`src/stores/seat-map.store.ts`:
```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { bookingsApi } from '@/api/bookings.api';
import { isApiError } from '@/api/errors';
import { eventsApi } from '@/api/events.api';
import { BookingResult, SalesOpenedMessage, SeatUpdateMessage } from '@/api/types';
import {
  applyConfirm,
  applyHold,
  applyLost,
  applyRelease,
  applySalesOpened,
  applySeatUpdate,
  earliestExpiry as earliestExpiryOf,
  emptyState,
  fromDetail,
  isMine,
  SeatMapState,
  totalCents,
} from './seat-map.logic';

const MESSAGES: Record<string, string> = {
  SEAT_HELD: 'Someone else just took that seat.',
  SEAT_SOLD: 'That seat has already been sold.',
  HOLD_LIMIT_REACHED: 'You can hold at most 6 seats per event.',
  SALES_NOT_OPEN: 'Sales are not open yet.',
  HOLD_EXPIRED: 'Some of your holds expired before you confirmed. They are highlighted.',
  NO_HELD_SEATS: 'Pick at least one seat first.',
  NETWORK: 'Cannot reach the server.',
};

export const useSeatMapStore = defineStore('seatMap', () => {
  const state = ref<SeatMapState>(emptyState());
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastBooking = ref<BookingResult | null>(null);

  const event = computed(() => state.value.event);
  const mySeats = computed(() => state.value.mySeats);
  const lostSeatIds = computed(() => state.value.lostSeatIds);
  const total = computed(() => totalCents(state.value));
  const earliestExpiry = computed(() => earliestExpiryOf(state.value));
  const canConfirm = computed(() => state.value.mySeats.length > 0 && !loading.value);

  function messageFor(e: unknown): string {
    if (isApiError(e)) return MESSAGES[e.code] ?? e.message;
    return 'Something went wrong.';
  }

  async function load(eventId: string): Promise<void> {
    loading.value = true;
    try {
      state.value = fromDetail(await eventsApi.get(eventId));
    } catch (e) {
      error.value = messageFor(e);
    } finally {
      loading.value = false;
    }
  }

  async function toggle(seatId: string): Promise<void> {
    const current = state.value.event;
    if (!current || loading.value) return;
    error.value = null;
    try {
      if (isMine(state.value, seatId)) {
        await bookingsApi.release(current.id, seatId);
        state.value = applyRelease(state.value, seatId);
      } else {
        const hold = await bookingsApi.hold(current.id, seatId);
        state.value = applyHold(state.value, seatId, hold.expiresAt);
      }
    } catch (e) {
      error.value = messageFor(e);
      await load(current.id);
    }
  }

  async function confirm(): Promise<void> {
    const current = state.value.event;
    if (!current || !canConfirm.value) return;
    error.value = null;
    try {
      const booking = await bookingsApi.confirm(current.id);
      state.value = applyConfirm(state.value, booking.seatIds);
      lastBooking.value = booking;
    } catch (e) {
      error.value = messageFor(e);
      if (isApiError(e) && e.code === 'HOLD_EXPIRED') {
        const lost = Array.isArray(e.details.lostSeatIds) ? (e.details.lostSeatIds as string[]) : [];
        state.value = applyLost(state.value, lost);
        const refreshed = await eventsApi.get(current.id).catch(() => null);
        if (refreshed) state.value = { ...fromDetail(refreshed), lostSeatIds: lost };
      }
    }
  }

  function onSocketMessage(msg: SeatUpdateMessage | SalesOpenedMessage): void {
    state.value = msg.type === 'sales_opened' ? applySalesOpened(state.value) : applySeatUpdate(state.value, msg);
  }

  function reset(): void {
    state.value = emptyState();
    error.value = null;
    lastBooking.value = null;
  }

  return {
    event,
    mySeats,
    lostSeatIds,
    loading,
    error,
    lastBooking,
    total,
    earliestExpiry,
    canConfirm,
    load,
    toggle,
    confirm,
    onSocketMessage,
    reset,
  };
});
```

- [ ] **Step 8: Run all tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (reducers 8, store 5, plus earlier suites).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add seat map reducers and store with hold/release/confirm actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Live seat map page: socket, grid, hold panel, countdown

**Files:**
- Create: `src/realtime/event-socket.ts`, `src/components/SeatCell.vue`, `src/components/SeatGrid.vue`, `src/components/Countdown.vue`, `src/components/HoldPanel.vue`, `src/views/EventDetailView.vue`
- Modify: `src/router/index.ts` (add `/events/:id`)
- Test: `src/realtime/event-socket.spec.ts`, `src/components/SeatCell.spec.ts`, `src/components/Countdown.spec.ts`, `src/views/EventDetailView.spec.ts`

**Interfaces:**
- Produces: `connectEventSocket(options: EventSocketOptions): EventSocket` where
  `EventSocketOptions = { url: string; token: string; eventId: string; onMessage(msg: SeatUpdateMessage | SalesOpenedMessage): void; onReconnect(): void; createSocket?: (url, opts) => SocketLike }` and `EventSocket = { close(): void }`. On every `connect` it emits `join_event { eventId }`; on the second and later connects it also calls `onReconnect()` (the page refetches the map, since missed messages are not replayed).
- Produces: `SeatCell` props `{ seat: SeatView; disabled: boolean; lost: boolean }`, emits `toggle(seatId)`; `SeatGrid` props `{ seats: SeatView[]; disabled: boolean; lostSeatIds: string[] }`, emits `toggle(seatId)`; `Countdown` props `{ expiresAt: string | null }` renders `mm:ss` and emits `expired` once when it reaches zero; `HoldPanel` props `{ seats: SeatView[]; mySeats: MySeat[]; total: number; earliestExpiry: string | null; canConfirm: boolean; error: string | null; lastBooking: BookingResult | null }`, emits `confirm`, `release(seatId)`.
- Consumes: `useSeatMapStore`, `useAuthStore`, `apiUrl()`, `formatCents`.

- [ ] **Step 1: Write the failing tests**

`src/realtime/event-socket.spec.ts`:
```ts
import { connectEventSocket, SocketLike } from './event-socket';

class FakeSocket implements SocketLike {
  handlers = new Map<string, (payload: unknown) => void>();
  emitted: { event: string; payload: unknown }[] = [];
  disconnected = false;
  on(event: string, handler: (payload: unknown) => void): this {
    this.handlers.set(event, handler);
    return this;
  }
  emit(event: string, payload: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }
  disconnect(): this {
    this.disconnected = true;
    return this;
  }
  fire(event: string, payload?: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

describe('connectEventSocket', () => {
  it('joins the room on connect, forwards messages, refetches only on reconnect', () => {
    const fake = new FakeSocket();
    const onMessage = vi.fn();
    const onReconnect = vi.fn();
    const createSocket = vi.fn(() => fake);

    const socket = connectEventSocket({ url: 'http://api', token: 'tok', eventId: 'e1', onMessage, onReconnect, createSocket });

    expect(createSocket).toHaveBeenCalledWith('http://api', { auth: { token: 'tok' }, transports: ['websocket'] });
    fake.fire('connect');
    expect(fake.emitted).toEqual([{ event: 'join_event', payload: { eventId: 'e1' } }]);
    expect(onReconnect).not.toHaveBeenCalled();

    fake.fire('seat_update', { type: 'held', seatIds: ['s1'] });
    fake.fire('sales_opened', { type: 'sales_opened' });
    expect(onMessage).toHaveBeenNthCalledWith(1, { type: 'held', seatIds: ['s1'] });
    expect(onMessage).toHaveBeenNthCalledWith(2, { type: 'sales_opened' });

    fake.fire('connect');
    expect(fake.emitted).toHaveLength(2);
    expect(onReconnect).toHaveBeenCalledTimes(1);

    socket.close();
    expect(fake.disconnected).toBe(true);
  });
});
```

`src/components/SeatCell.spec.ts`:
```ts
import { mount } from '@vue/test-utils';
import { SeatView } from '@/api/types';
import SeatCell from './SeatCell.vue';

const seat = (state: SeatView['state']): SeatView => ({ id: 's1', rowLabel: 'A', seatNumber: 7, priceCents: 100, state });

describe('SeatCell', () => {
  it.each([
    ['available', false, 'bg-white'],
    ['held', true, 'bg-amber-200'],
    ['held_by_me', false, 'bg-green-500'],
    ['sold', true, 'bg-slate-400'],
  ] as const)('%s renders the right style and disabled state', (state, disabled, cls) => {
    const w = mount(SeatCell, { props: { seat: seat(state), disabled: false, lost: false } });
    const button = w.get('button');
    expect(button.classes()).toContain(cls);
    expect(button.attributes('disabled') !== undefined).toBe(disabled);
    expect(button.text()).toBe('7');
  });

  it('emits toggle with the seat id when clicked, and is inert when disabled by the parent', async () => {
    const w = mount(SeatCell, { props: { seat: seat('available'), disabled: false, lost: false } });
    await w.get('button').trigger('click');
    expect(w.emitted('toggle')).toEqual([['s1']]);

    const locked = mount(SeatCell, { props: { seat: seat('available'), disabled: true, lost: false } });
    await locked.get('button').trigger('click');
    expect(locked.emitted('toggle')).toBeUndefined();
  });

  it('highlights a lost seat', () => {
    const w = mount(SeatCell, { props: { seat: seat('held'), disabled: false, lost: true } });
    expect(w.get('button').classes()).toContain('ring-2');
  });
});
```

`src/components/Countdown.spec.ts`:
```ts
import { mount } from '@vue/test-utils';
import Countdown from './Countdown.vue';

describe('Countdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down to zero and emits expired once', async () => {
    vi.setSystemTime(new Date('2026-10-19T10:00:00.000Z'));
    const w = mount(Countdown, { props: { expiresAt: '2026-10-19T10:00:02.000Z' } });
    expect(w.text()).toBe('00:02');
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.text()).toBe('00:01');
    await vi.advanceTimersByTimeAsync(2500);
    expect(w.text()).toBe('00:00');
    expect(w.emitted('expired')).toHaveLength(1);
  });

  it('shows a dash when the expiry is unknown', () => {
    const w = mount(Countdown, { props: { expiresAt: null } });
    expect(w.text()).toBe('--:--');
  });
});
```

`src/views/EventDetailView.spec.ts` (Review Focus 5: anonymous click → login):
```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { createMemoryHistory, createRouter } from 'vue-router';
import { eventsApi } from '@/api/events.api';
import { EventDetail } from '@/api/types';
import EventDetailView from './EventDetailView.vue';

vi.mock('@/api/events.api', () => ({ eventsApi: { get: vi.fn() } }));
vi.mock('@/api/bookings.api', () => ({ bookingsApi: { hold: vi.fn(), release: vi.fn(), confirm: vi.fn() } }));

const detail: EventDetail = {
  id: 'e1',
  name: 'Show',
  venueName: 'Hall',
  startsAt: '2026-10-19T19:00:00.000Z',
  salesOpenAt: '2026-10-01T00:00:00.000Z',
  status: 'on_sale',
  availableCount: 1,
  seats: [{ id: 's1', rowLabel: 'A', seatNumber: 1, priceCents: 100, state: 'available' }],
};

describe('EventDetailView (anonymous)', () => {
  it('sends an anonymous seat click to login with a redirect back', async () => {
    vi.mocked(eventsApi.get).mockResolvedValue(detail);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/events/:id', component: EventDetailView },
        { path: '/login', component: { template: '<div>login</div>' } },
      ],
    });
    await router.push('/events/e1');
    const w = mount(EventDetailView, {
      global: { plugins: [router, createTestingPinia({ stubActions: false })] },
    });
    await flushPromises();

    await w.get('button[data-seat="s1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/events/e1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: the four new suites FAIL on missing modules.

- [ ] **Step 3: Implement the socket module and components**

`src/realtime/event-socket.ts`:
```ts
import { io } from 'socket.io-client';
import { SalesOpenedMessage, SeatUpdateMessage } from '@/api/types';

/** The slice of a socket.io Socket we use; lets tests pass a fake. */
export interface SocketLike {
  on(event: string, handler: (payload: unknown) => void): this;
  emit(event: string, payload: unknown): this;
  disconnect(): this;
}

export interface SocketOptions {
  auth: { token: string };
  transports: string[];
}

export interface EventSocketOptions {
  url: string;
  token: string;
  eventId: string;
  onMessage(msg: SeatUpdateMessage | SalesOpenedMessage): void;
  /** Called on the second and later connects: missed messages are not replayed, so refetch. */
  onReconnect(): void;
  createSocket?: (url: string, opts: SocketOptions) => SocketLike;
}

export interface EventSocket {
  close(): void;
}

const defaultCreate = (url: string, opts: SocketOptions): SocketLike => io(url, opts) as unknown as SocketLike;

export function connectEventSocket(options: EventSocketOptions): EventSocket {
  const create = options.createSocket ?? defaultCreate;
  const socket = create(options.url, { auth: { token: options.token }, transports: ['websocket'] });
  let connects = 0;

  socket.on('connect', () => {
    connects += 1;
    socket.emit('join_event', { eventId: options.eventId });
    if (connects > 1) options.onReconnect();
  });
  socket.on('seat_update', (payload) => options.onMessage(payload as SeatUpdateMessage));
  socket.on('sales_opened', (payload) => options.onMessage(payload as SalesOpenedMessage));

  return {
    close() {
      socket.disconnect();
    },
  };
}
```

`src/components/SeatCell.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { SeatView } from '@/api/types';

const props = defineProps<{ seat: SeatView; disabled: boolean; lost: boolean }>();
const emit = defineEmits<{ toggle: [seatId: string] }>();

const isClickable = computed(
  () => !props.disabled && (props.seat.state === 'available' || props.seat.state === 'held_by_me'),
);

const stateClass = computed(() => ({
  'bg-white border-slate-300 hover:bg-slate-100': props.seat.state === 'available',
  'bg-amber-200 border-amber-300 cursor-not-allowed': props.seat.state === 'held',
  'bg-green-500 border-green-600 text-white': props.seat.state === 'held_by_me',
  'bg-slate-400 border-slate-500 text-white cursor-not-allowed': props.seat.state === 'sold',
  'ring-2 ring-red-500': props.lost,
}));

function onClick(): void {
  if (isClickable.value) emit('toggle', props.seat.id);
}
</script>

<template>
  <button
    type="button"
    class="h-9 w-9 rounded border text-sm"
    :class="stateClass"
    :disabled="!isClickable"
    :data-seat="seat.id"
    :title="`${seat.rowLabel}${seat.seatNumber} · ${seat.state.replace('_', ' ')}`"
    @click="onClick"
  >
    {{ seat.seatNumber }}
  </button>
</template>
```

`src/components/SeatGrid.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { SeatView } from '@/api/types';
import SeatCell from './SeatCell.vue';

const props = defineProps<{ seats: SeatView[]; disabled: boolean; lostSeatIds: string[] }>();
const emit = defineEmits<{ toggle: [seatId: string] }>();

const rows = computed(() => {
  const byRow = new Map<string, SeatView[]>();
  for (const seat of props.seats) {
    const row = byRow.get(seat.rowLabel) ?? [];
    row.push(seat);
    byRow.set(seat.rowLabel, row);
  }
  return [...byRow.entries()].map(([label, seats]) => ({ label, seats }));
});
const lost = computed(() => new Set(props.lostSeatIds));
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="mb-2 rounded bg-slate-200 py-1 text-center text-xs uppercase tracking-widest">Stage</div>
    <div v-for="row in rows" :key="row.label" class="flex items-center gap-2">
      <span class="w-6 text-sm font-semibold text-slate-500">{{ row.label }}</span>
      <SeatCell
        v-for="seat in row.seats"
        :key="seat.id"
        :seat="seat"
        :disabled="disabled"
        :lost="lost.has(seat.id)"
        @toggle="emit('toggle', $event)"
      />
    </div>
    <p class="mt-2 flex gap-4 text-xs text-slate-600">
      <span><i class="inline-block h-3 w-3 rounded border bg-white align-middle" /> available</span>
      <span><i class="inline-block h-3 w-3 rounded bg-amber-200 align-middle" /> held</span>
      <span><i class="inline-block h-3 w-3 rounded bg-green-500 align-middle" /> yours</span>
      <span><i class="inline-block h-3 w-3 rounded bg-slate-400 align-middle" /> sold</span>
    </p>
  </div>
</template>
```

`src/components/Countdown.vue`:
```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ expiresAt: string | null }>();
const emit = defineEmits<{ expired: [] }>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
let emittedFor: string | null = null;

const remainingMs = computed(() => (props.expiresAt ? new Date(props.expiresAt).getTime() - now.value : null));

const label = computed(() => {
  if (remainingMs.value === null) return '--:--';
  const total = Math.max(0, Math.ceil(remainingMs.value / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
});

function tick(): void {
  now.value = Date.now();
  if (remainingMs.value !== null && remainingMs.value <= 0 && emittedFor !== props.expiresAt) {
    emittedFor = props.expiresAt;
    emit('expired');
  }
}

function start(): void {
  stop();
  if (props.expiresAt) {
    tick();
    timer = setInterval(tick, 1000);
  }
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

watch(() => props.expiresAt, start, { immediate: true });
onBeforeUnmount(stop);
</script>

<template>
  <span class="font-mono tabular-nums">{{ label }}</span>
</template>
```

`src/components/HoldPanel.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { BookingResult, SeatView } from '@/api/types';
import { MySeat } from '@/stores/seat-map.logic';
import { formatCents } from '@/utils/money';
import Countdown from './Countdown.vue';

const props = defineProps<{
  seats: SeatView[];
  mySeats: MySeat[];
  total: number;
  earliestExpiry: string | null;
  canConfirm: boolean;
  error: string | null;
  lastBooking: BookingResult | null;
}>();
const emit = defineEmits<{ confirm: []; release: [seatId: string]; expired: [] }>();

const mine = computed(() =>
  props.mySeats
    .map((m) => props.seats.find((s) => s.id === m.seatId))
    .filter((s): s is SeatView => s !== undefined),
);
</script>

<template>
  <aside class="flex w-full flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:w-72">
    <h2 class="text-lg font-semibold">Your seats</h2>
    <p v-if="mine.length === 0" class="text-sm text-slate-500">Click seats on the map to hold them.</p>
    <ul v-else class="flex flex-col gap-1 text-sm">
      <li v-for="seat in mine" :key="seat.id" class="flex items-center justify-between">
        <span>{{ seat.rowLabel }}{{ seat.seatNumber }} · {{ formatCents(seat.priceCents) }}</span>
        <button type="button" class="text-xs underline" @click="emit('release', seat.id)">release</button>
      </li>
    </ul>
    <p v-if="mine.length > 0" class="text-sm">
      Expires in <Countdown :expires-at="earliestExpiry" @expired="emit('expired')" />
    </p>
    <p class="text-base font-semibold">Total {{ formatCents(total) }}</p>
    <p v-if="error" role="alert" class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="lastBooking" role="status" class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">
      Booked! Reference {{ lastBooking.bookingId.slice(0, 8) }} · {{ formatCents(lastBooking.totalCents) }}
    </p>
    <button
      type="button"
      class="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      :disabled="!canConfirm"
      @click="emit('confirm')"
    >
      Confirm booking
    </button>
  </aside>
</template>
```

`src/views/EventDetailView.vue`:
```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiUrl } from '@/config';
import HoldPanel from '@/components/HoldPanel.vue';
import SeatGrid from '@/components/SeatGrid.vue';
import { connectEventSocket, EventSocket } from '@/realtime/event-socket';
import { useAuthStore } from '@/stores/auth.store';
import { useSeatMapStore } from '@/stores/seat-map.store';
import { formatDateTime, statusLabel } from '@/utils/time';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const map = useSeatMapStore();

const eventId = computed(() => String(route.params.id));
const gridDisabled = computed(() => map.event?.status !== 'on_sale' || map.loading);

let socket: EventSocket | null = null;

function openSocket(): void {
  closeSocket();
  if (!auth.accessToken) return;
  socket = connectEventSocket({
    url: apiUrl(),
    token: auth.accessToken,
    eventId: eventId.value,
    onMessage: (msg) => map.onSocketMessage(msg),
    onReconnect: () => void map.load(eventId.value),
  });
}

function closeSocket(): void {
  socket?.close();
  socket = null;
}

async function onToggle(seatId: string): Promise<void> {
  if (!auth.isAuthenticated) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } });
    return;
  }
  await map.toggle(seatId);
}

onMounted(async () => {
  await map.load(eventId.value);
  openSocket();
});

// Logging in/out on this page: reload (held_by_me depends on the bearer) and reconnect the socket.
watch(
  () => auth.accessToken,
  async () => {
    await map.load(eventId.value);
    openSocket();
  },
);

onBeforeUnmount(() => {
  closeSocket();
  map.reset();
});
</script>

<template>
  <section class="flex flex-col gap-4">
    <p v-if="map.loading && !map.event">Loading…</p>
    <p v-else-if="!map.event" role="alert" class="text-red-700">{{ map.error ?? 'Event not found.' }}</p>
    <template v-else>
      <header>
        <h1 class="text-2xl font-semibold">{{ map.event.name }}</h1>
        <p class="text-sm text-slate-600">
          {{ map.event.venueName }} · {{ formatDateTime(map.event.startsAt) }} · {{ statusLabel(map.event.status) }}
        </p>
        <p v-if="map.event.status === 'upcoming'" class="mt-1 text-sm text-amber-700">
          Sales open {{ formatDateTime(map.event.salesOpenAt) }}. This page updates automatically.
        </p>
        <p v-if="!auth.isAuthenticated" class="mt-1 text-sm text-slate-500">
          Log in to hold seats and see live updates.
        </p>
      </header>
      <div class="flex flex-col gap-6 sm:flex-row">
        <SeatGrid :seats="map.event.seats" :disabled="gridDisabled" :lost-seat-ids="map.lostSeatIds" @toggle="onToggle" />
        <HoldPanel
          :seats="map.event.seats"
          :my-seats="map.mySeats"
          :total="map.total"
          :earliest-expiry="map.earliestExpiry"
          :can-confirm="map.canConfirm && auth.isAuthenticated"
          :error="map.error"
          :last-booking="map.lastBooking"
          @confirm="map.confirm()"
          @release="onToggle"
          @expired="map.load(eventId)"
        />
      </div>
    </template>
  </section>
</template>
```

Add the route to `src/router/index.ts` `routes` after `/events`:
```ts
  { path: '/events/:id', name: 'event-detail', component: () => import('@/views/EventDetailView.vue') },
```

- [ ] **Step 4: Run tests and typecheck, then the live manual check**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (all suites, including the four new ones).

Manual, against the API (`WEB_ORIGIN=http://localhost:5173 docker compose up -d` in `../seatly-api`, `pnpm dev` here): open the on-sale event in two browser windows logged in as two different users. Hold a seat in window A: it turns green in A and amber in B within a second. Release it: both go white. Hold two seats and confirm: both grey in both windows and the panel shows "Booked!". In window B try to hold a seat A holds: the amber cell is not clickable. Note timings and any console errors in the report.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add live seat map page with socket updates, hold panel and countdown

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: My bookings page

**Files:**
- Modify: `src/views/MyBookingsView.vue` (replace placeholder)
- Test: `src/views/MyBookingsView.spec.ts`

**Interfaces:**
- Consumes: `bookingsApi.myBookings()`, `formatCents`, `formatDateTime`.

- [ ] **Step 1: Write the failing test**

`src/views/MyBookingsView.spec.ts`:
```ts
import { flushPromises, mount } from '@vue/test-utils';
import { bookingsApi } from '@/api/bookings.api';
import MyBookingsView from './MyBookingsView.vue';

vi.mock('@/api/bookings.api', () => ({ bookingsApi: { myBookings: vi.fn() } }));

describe('MyBookingsView', () => {
  it('renders bookings newest first with seats and totals', async () => {
    vi.mocked(bookingsApi.myBookings).mockResolvedValue([
      {
        id: 'b1',
        eventName: 'Jazz Night',
        seats: [
          { rowLabel: 'A', seatNumber: 1 },
          { rowLabel: 'A', seatNumber: 2 },
        ],
        totalCents: 30000,
        createdAt: '2026-10-13T09:00:00.000Z',
      },
    ]);
    const w = mount(MyBookingsView);
    await flushPromises();
    expect(w.text()).toContain('Jazz Night');
    expect(w.text()).toContain('A1, A2');
    expect(w.text()).toContain('SAR 300.00');
  });

  it('shows an empty state', async () => {
    vi.mocked(bookingsApi.myBookings).mockResolvedValue([]);
    const w = mount(MyBookingsView);
    await flushPromises();
    expect(w.text()).toContain('No bookings yet');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/views/MyBookings`
Expected: FAIL (placeholder renders only the heading).

- [ ] **Step 3: Implement**

Replace `src/views/MyBookingsView.vue`:
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { bookingsApi } from '@/api/bookings.api';
import { MyBooking } from '@/api/types';
import { formatCents } from '@/utils/money';
import { formatDateTime } from '@/utils/time';

const bookings = ref<MyBooking[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const seatList = (booking: MyBooking): string => booking.seats.map((s) => `${s.rowLabel}${s.seatNumber}`).join(', ');

onMounted(async () => {
  try {
    bookings.value = await bookingsApi.myBookings();
  } catch {
    error.value = 'Could not load your bookings.';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="flex flex-col gap-4">
    <h1 class="text-2xl font-semibold">My bookings</h1>
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" role="alert" class="text-red-700">{{ error }}</p>
    <p v-else-if="bookings.length === 0">No bookings yet.</p>
    <table v-else class="w-full text-left text-sm">
      <thead class="border-b text-slate-500">
        <tr>
          <th class="py-2">Event</th>
          <th class="py-2">Seats</th>
          <th class="py-2">Total</th>
          <th class="py-2">Booked</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="booking in bookings" :key="booking.id" class="border-b">
          <td class="py-2">{{ booking.eventName }}</td>
          <td class="py-2">{{ seatList(booking) }}</td>
          <td class="py-2">{{ formatCents(booking.totalCents) }}</td>
          <td class="py-2">{{ formatDateTime(booking.createdAt) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add my bookings page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Docker image (nginx + runtime config) and the compose `full` profile check

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker/nginx.conf`, `docker/40-config.sh`

**Interfaces:**
- Produces: an image that serves `dist/` on port 80 with SPA fallback and writes `/usr/share/nginx/html/config.js` from the `API_URL` env at container start (the nginx image runs every `/docker-entrypoint.d/*.sh` before starting). The API repo's `docker compose --profile full up --build` builds it from `../seatly-web` and sets `API_URL=http://localhost:3000`.

- [ ] **Step 1: Write the files**

`.dockerignore`:
```
node_modules
dist
.git
docs
coverage
```

`docker/nginx.conf`:
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location = /config.js {
    add_header Cache-Control "no-store";
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

`docker/40-config.sh`:
```sh
#!/bin/sh
set -e
: "${API_URL:=http://localhost:3000}"
cat > /usr/share/nginx/html/config.js <<EOCFG
window.__SEATLY_CONFIG__ = { apiUrl: "${API_URL}" };
EOCFG
echo "[config] apiUrl=${API_URL}"
```

`Dockerfile`:
```dockerfile
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/40-config.sh /docker-entrypoint.d/40-config.sh
RUN chmod +x /docker-entrypoint.d/40-config.sh
EXPOSE 80
```

- [ ] **Step 2: Build and run the image alone**

Run:
```bash
docker build -t seatly-web:dev .
docker run --rm -d -p 8081:80 -e API_URL=http://example.test:9 --name seatly-web-check seatly-web:dev
sleep 2
curl -s localhost:8081/config.js; echo
curl -s -o /dev/null -w "%{http_code}\n" localhost:8081/events
docker rm -f seatly-web-check
```
Expected: `window.__SEATLY_CONFIG__ = { apiUrl: "http://example.test:9" };` and `200` for the deep link (SPA fallback).

- [ ] **Step 3: Run the full stack from the API repo**

Run (from `../seatly-api`):
```bash
docker compose --profile full up --build -d
sleep 20
curl -s localhost:8080/config.js; echo
curl -s localhost:3000/health; echo
```
Expected: `apiUrl: "http://localhost:3000"` and both services ok. Open http://localhost:8080, register, open the on-sale event, hold and confirm a seat. The API container's `WEB_ORIGIN` defaults to `http://localhost:8080`, so cookies and CORS work without extra env. Then `docker compose --profile full down -v`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add nginx Docker image with runtime API_URL injection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: README and CI

**Files:**
- Create: `README.md`, `.github/workflows/ci.yml`

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 2: Write the README**

`README.md`:
````markdown
# Seatly Web

Plain Vue 3 frontend for the [Seatly API](https://github.com/Abdullah-Sanji/seatly-api): events, a live seat map
with hold → confirm, and a bookings page. Design: `seatly-api/docs/superpowers/specs/2026-10-12-seatly-design.md` §8.

## Run with the API (Docker)

Clone both repos side by side, then from `seatly-api`:

```bash
docker compose --profile full up --build   # api :3000, web :8080
```

## Develop

```bash
cp .env.example .env     # optional; public/config.js already points at http://localhost:3000
pnpm install
pnpm dev                 # http://localhost:5173
```

The API must allow this origin: start it with `WEB_ORIGIN=http://localhost:5173` (the API's `pnpm start:dev`
default) so the refresh cookie and CORS work.

## Test

```bash
pnpm test        # Vitest: reducers, store, interceptor, components
pnpm typecheck   # vue-tsc
```

## How it works

- **Auth**: the access token lives in memory (Pinia). On load the app calls `POST /auth/refresh`; the httpOnly
  refresh cookie decides whether you are logged in. A 401 on any API call triggers one silent refresh and a retry.
- **Seat map**: `stores/seat-map.logic.ts` holds pure reducers; REST responses and Socket.IO `seat_update`
  messages both flow through them, so the map has one source of truth. Your own holds stay `held_by_me` even
  when the server echoes them back as `held`.
- **Live updates**: logged-in viewers open one socket per event page and join `event:{id}`. On reconnect the page
  refetches the map because missed messages are not replayed. Anonymous viewers see a static map.
- **Runtime config**: `public/config.js` sets `window.__SEATLY_CONFIG__.apiUrl`. The Docker image rewrites that
  file from `API_URL` at container start, so one image serves every environment.
````

- [ ] **Step 3: Final verification and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS.

```bash
git add -A
git commit -m "docs: add README and CI workflow

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Spec coverage map

| Spec §8 requirement | Task |
|---|---|
| Auth store: token in memory, silent refresh on load, interceptor refresh-once | 2, 3 |
| Routes `/login`, `/register`, `/events`, `/events/:id`, `/me/bookings`, auth guard | 3, 6, 7 |
| Seat map grid, click hold/release, side panel (seats, countdown, total, confirm) | 6 |
| Socket `join_event`, apply `seat_update`, `HOLD_EXPIRED` highlighting, `sales_opened` flip | 5, 6 |
| Seat map store as single source of truth | 5 |
| Docker: nginx, `API_URL` → `config.js` at start | 8 |
| Vitest: store per message type, seat cell states, interceptor refresh-once | 2, 5, 6 |
| Milestone 9: `web` compose profile builds and runs | 8 |
