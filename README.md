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

`pnpm test` sets `NODE_OPTIONS` inline, which only works in a POSIX shell. On Windows use Git Bash, or run it
through `cross-env`.

## Test

```bash
pnpm test        # Vitest: reducers, store, interceptor, components
pnpm typecheck   # vue-tsc
```

## How it works

- **Auth**: the access token lives in memory (Pinia). On load the app calls `POST /auth/refresh`; the httpOnly
  refresh cookie decides whether you are logged in. A 401 on any API call triggers one silent refresh and a retry.
  Concurrent 401s share one refresh request, because the API consumes each refresh token exactly once.
- **Seat map**: `stores/seat-map.logic.ts` holds pure reducers; REST responses and Socket.IO `seat_update`
  messages both flow through them, so the map has one source of truth. Your own holds stay `held_by_me` even
  when the server echoes them back as `held`. Hold/release/confirm requests are serialised client-side (`busy`),
  and a refetch does not overwrite a newer local change made through this page or forget a known expiry time.
- **Live updates**: logged-in viewers open one socket per event page and join `event:{id}`. On reconnect the page
  refetches the map because missed messages are not replayed. Anonymous viewers see a static map.
- **Runtime config**: `public/config.js` sets `window.__SEATLY_CONFIG__.apiUrl`. The Docker image rewrites that
  file from `API_URL` at container start, so one image serves every environment.

## Deployment notes

- Serve the API at the origin root. An `API_URL` with a path (e.g. `https://host/api`) breaks the Socket.IO
  namespace and the refresh cookie, which the API scopes to `Path=/auth`.
- The web and API hosts must be same-site, because the refresh cookie is `SameSite=Lax`. Mixing `localhost`
  and `127.0.0.1` silently breaks it: every reload looks logged out.
