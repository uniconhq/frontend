# Unicon frontend

The React app that organisers and entrants use to run and enter Unicon
contests. It holds no rules: it sends what people enter and shows what the
server answers.

It talks only to the backend, through relative `/api/v1/...` calls. Its API
types are generated from the backend's `openapi.json`. It ships as a static
site in an nginx image. The proxy in `deploy` puts it and the backend on one
origin. Rules live in `forge`, which the backend wraps.

## Layout

```
src/
  api/       generated types, fetch client, query and change helpers, error text
  lib/       server clock, addresses, route params, shared helpers
  session/   who is signed in, sign-out, the forge address
  live/      the live update stream
  theme/     design tokens, fonts, CSS variables
  ui/        shell and wrappers over Mantine, shared views
  features/  pages: home, auth, account, contest (entrants), organise
  test/      Vitest setup, MSW server, fixtures, render helpers
e2e/         Playwright browser tests
```

## Running it locally

You need Node 24 (see `.node-version`) and pnpm.

```sh
pnpm install
pnpm dev            # http://localhost:5173
```

The dev server forwards `/api` and the upload paths to `http://localhost:8080`,
where the `deploy` compose stack serves. Use another backend with
`VITE_API_PROXY=http://localhost:8000 pnpm dev`. The settings are listed in
[`.env.example`](.env.example). Signing in from `:5173` ends on `:8080`; going
back to `:5173` keeps you signed in.

Checks (CI runs all of them):

```sh
pnpm lint           # ESLint, then knip
pnpm format:check   # Prettier
pnpm typecheck
pnpm test           # Vitest, with MSW in place of the backend
pnpm build          # into dist/
pnpm exec playwright install chromium   # once
pnpm e2e            # Playwright, own dev server on :5190, no backend needed
```

The image:

```sh
docker build -t unicon-frontend .
docker run --rm -p 8081:8080 unicon-frontend
```

## API types

`src/api/schema.d.ts` is generated and committed. Do not edit it by hand.
`api-version` holds the backend commit it comes from.

```sh
pnpm gen:api                                    # the commit in api-version
pnpm gen:api --from ../backend/openapi.json     # a sibling checkout
pnpm gen:api --from http://localhost:8000/openapi.json
```

To move to a newer backend, change `api-version`, run `pnpm gen:api`, and fix
any type errors. CI regenerates the file from `api-version` and fails if it
differs.

## Releases

CI ([`.github/workflows/ci.yaml`](.github/workflows/ci.yaml)) runs the checks
and a Docker build on every push and pull request. Each push to `main` also
publishes `ghcr.io/uniconhq/frontend:main` and `:sha-<short>`. One image fits
every deployment. To release, bump `version` in `package.json`, merge, then
tag `v<version>` on `main`. The tag runs no workflow.

## Don't break

- Import Mantine only through `src/ui` (ESLint enforces it).
- A feature never imports from another feature. Move shared code to `ui/`,
  `lib/`, `api/` or `theme/`.
- Use server time from `lib/time.ts`, never the laptop clock.
- Signing in is a full-page link to `/api/v1/auth/login`, never a fetch. The
  app never sees a password or token.
- Error text comes from `api/describe-error.ts`, keyed by the error `code`.
- Words on screen follow [`GLOSSARY.md`](GLOSSARY.md).
