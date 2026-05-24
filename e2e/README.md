# E2E Tests (Playwright)

This directory contains end-to-end tests for HearthVTT using [Playwright](https://playwright.dev).

## When to run E2E tests

E2E tests are **not** run as part of the default `npm test` command (which runs unit + integration tests only). Run E2E tests when you need to verify:

- Full user flows (admin setup, invite claim, joining a campaign)
- Cross-browser rendering of the canvas/map
- Session and auth flows as a real browser client

## Prerequisites

1. **Install browser binaries** (first time only):

   ```sh
   npx playwright install chromium
   ```

2. **Start the server** in a separate terminal:
   ```sh
   npm run dev:server
   ```
   The client bundle is served by the server at `http://localhost:3000`.

## Running E2E tests

```sh
npm run e2e
```

To run against a different server address:

```sh
E2E_BASE_URL=http://localhost:4000 npm run e2e
```

To run with the Playwright UI (interactive mode):

```sh
npx playwright test --ui
```

## Writing E2E tests

Place test files in `e2e/tests/`. Name them `*.spec.ts`.

Prefer targeting user-visible elements (labels, roles, text) over CSS selectors or data-testid attributes, unless testing a specific visual element that has no accessible label.

See the [Playwright docs](https://playwright.dev/docs/writing-tests) for guidance.
