# seatly-web

Vue 3 + Vite + TypeScript + Pinia + Vue Router + axios + socket.io-client + Tailwind 4. pnpm.
Intentionally plain UI; it exists to exercise the API. Design: `../seatly-api/docs/superpowers/specs/2026-10-12-seatly-design.md`.

## Commands

```bash
pnpm dev             # :5173, API at VITE_API_URL or http://localhost:3000
pnpm typecheck
pnpm test            # Vitest + Vue Test Utils, src/**/*.spec.ts
pnpm api:types       # regenerate src/api/generated/openapi.d.ts from ../seatly-api/contracts/openapi.yaml
pnpm api:types:check # fails if the generated file is stale (CI runs this)
pnpm e2e             # Playwright against the full Docker stack (see e2e/README.md)
pnpm e2e:fresh       # same, but rebuilds the stack first (after code changes)
pnpm e2e:down        # tear the e2e stack down
```

`SEATLY_CONTRACT=<path>` points `api:types` at another contract (a worktree's).
`SEATLY_API_DIR=<path>` points `e2e` at another seatly-api checkout.

## The contract rule

API types come from the backend contract. `src/api/types.ts` only aliases generated types; never
hand-write a response shape. If a field you need is missing, the contract must change first
(in seatly-api, through the story's contract step), then regenerate.

Socket.IO events and payloads are in the same contract under `x-socket-events`.

## Conventions

- API calls live in `src/api/*.api.ts` and return typed data; errors are `ApiError` from `src/api/errors.ts`.
- State in Pinia stores under `src/stores`; pure logic split out (see `seat-map.logic.ts`) so it is unit-testable.
- Views under `src/views`, reusable pieces under `src/components`. Tailwind utility classes, no component library.
- Unit tests next to the code, `*.spec.ts`, mocking HTTP with `axios-mock-adapter`.
- Browser tests in `e2e/`, one file per story key, titles prefixed with the test-case id (`TC-7 …`).
- Prettier defaults; conventional commit messages.
