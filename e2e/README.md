# Browser e2e (Playwright)

Runs against the real stack started by `seatly-api/docker-compose.yml --profile full`
(seeded demo data: "Riyadh Jazz Night", "Comedy Showcase", "Spring Orchestra").

```bash
pnpm exec playwright install chromium   # once
pnpm e2e                                # starts the e2e stack (ports 3100/8180) unless it is already up
pnpm e2e:fresh                          # tear down and rebuild the stack first (use after code changes)
pnpm e2e:down                           # tear the stack down
```

Conventions:

- One spec file per story, named after the Jira key: `e2e/SEAT-123.spec.ts`.
- Each test title starts with the test-case id it proves, e.g. `test('TC-7 typing filters the list', …)`.
- Use `registerAndLogin(page)` from `e2e/helpers.ts` for an authenticated session; every run gets a fresh user.
- The seed is idempotent and only runs on an empty database. Tests must not depend on seat availability
  of seeded events beyond what `helpers.ts` provides, because earlier runs may have sold seats.
