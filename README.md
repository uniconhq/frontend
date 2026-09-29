# Unicon frontend

The React app people use Unicon through. It is a static bundle: an nginx
container that serves files and nothing else. Every API call is a relative
`/api/v1/...` request, which the proxy in `deploy` routes to the backend, so
the app and the API share one origin and the session cookie needs no CORS.

The app never sees a password or a token. Signing in is a full-page navigation
to `/api/v1/auth/login`, which redirects to Forgejo and comes back with a
cookie the JavaScript cannot read.

## Running it locally

You need Node 24 (see `.node-version`) and pnpm.

```sh
pnpm install
pnpm dev            # http://localhost:5173
```

`/api` and `/healthz` are proxied to `http://localhost:8080`, which is where the
compose stack in `deploy` publishes its proxy. Point somewhere else with
`VITE_API_PROXY=http://localhost:8000 pnpm dev`. Without a backend the landing
page renders its error block, which is the error path working, not a crash.

Three settings, all with dev defaults, all listed in `.env.example`.
`VITE_API_PROXY` is where the dev server forwards `/api`; `VITE_API_ORIGIN` is
what the backend believes its own public URL is (`UNICON_PUBLIC_URL`), which is
not always the same host; and `VITE_FORGE_URL` is the browser-facing Forgejo
URL the login and account pages link to. The first two are read by
`vite.config.ts`, the third is baked into the bundle at build time and read in
one place, `src/lib/config.ts`.

For requests that arrive with the dev server's own `Origin`, the dev proxy
replaces it with `VITE_API_ORIGIN`. The backend refuses a state-changing request
whose `Origin` is not its public URL — that check is the whole CSRF defence —
and the dev server answers on a different port than the deployment does, so
without the rewrite every write from `pnpm dev` comes back `403 origin_mismatch`.
A real proxy forwards the browser's `Origin` untouched, and so does this one for
any other origin: a genuine cross-site request still gets refused.

One consequence to expect: signing in from `http://localhost:5173` ends up on
`http://localhost:8080`. The `redirect_uri` Forgejo sends the browser back to is
the backend's public URL, not the dev server's. The session cookie is scoped to
the host and not the port, so going back to `:5173` is still signed in.

```sh
pnpm build          # type check, then bundle into dist/
pnpm preview        # serve dist/ on http://localhost:4173
docker build -t unicon-frontend .
docker build --build-arg VITE_FORGE_URL=https://forge.example.org -t unicon-frontend .
docker run --rm -p 8081:8080 unicon-frontend
```

The Forgejo URL is a build argument, not a runtime variable: it is baked into
the bundle, and a static file cannot read a container's environment. An image
built without it links to the dev stack's `http://localhost:3300`.

## Ports

| Where          | Port | What answers                                                 |
| -------------- | ---- | ------------------------------------------------------------ |
| `pnpm dev`     | 5173 | Vite, proxying `/api`, `/healthz` and `/readyz` to the stack |
| `pnpm preview` | 4173 | the built bundle                                             |
| the container  | 8080 | nginx, static files and the SPA fallback                     |

The container listens on 8080 and not 80 because it runs as an unprivileged
user (`nginxinc/nginx-unprivileged`), and a process that is not root cannot
bind a port below 1024. The proxy in `deploy` points at `frontend:8080`.
JavaScript, CSS, SVG and JSON come back gzipped above a kilobyte.

## The published image

CI pushes `ghcr.io/uniconhq/frontend:main` and
`ghcr.io/uniconhq/frontend:sha-<short sha>` on every push to `main`; a pull
request builds the image but pushes nothing. Both tags are built with
`VITE_FORGE_URL` at its default, so they are the dev stack's image — a
deployment with its own Forgejo builds its own, because that URL is in the
bundle rather than in the environment.

## Checks

```sh
pnpm lint           # ESLint (import boundaries below), then knip for dead exports
pnpm format:check   # Prettier
pnpm typecheck      # tsc --build, strict
pnpm test           # Vitest, jsdom, with MSW standing in for the backend
pnpm e2e            # Playwright; run `pnpm exec playwright install chromium` once
```

CI runs all of them, plus the Docker build, on every push and pull request.

## The generated API client

`src/api/schema.d.ts` is generated from the backend's `openapi.json`. It is
committed, and so is the ref it came from:

```sh
pnpm gen:api                                    # the ref named in ./api-version
pnpm gen:api --from ../backend/openapi.json     # a sibling checkout
pnpm gen:api --from http://localhost:8080/openapi.json   # a running stack
```

`api-version` holds one backend commit SHA, which is what makes the build
reproducible. The pin is the point:
the frontend builds against a known backend rather than whatever landed on the
backend's `main` an hour ago, and bumping it is a deliberate pull request — the
one moment a renamed field shows up, as a type error rather than a broken page.
There is no nightly drift check; drift surfaces at the bump or in the
end-to-end run in `deploy`.

The document spells out whole paths (`/api/v1/time`, `/healthz`), so the client
has an empty base URL and call sites pass the path exactly as the document
names it: `$api.useQuery('get', '/api/v1/time')`.

## The rules that are cheap now and expensive later

**Application code imports Mantine through `src/ui`, never directly.** The
wrappers are thin — `VerdictBadge` is the worked example — and they are what
keeps a Mantine major version, or dropping Mantine, inside one folder. ESLint
enforces it everywhere except `src/ui`, `src/theme`, `src/app.tsx` and
`src/test`.

**A feature never imports from another feature.** Shared code moves to `ui/`,
`lib/`, `api/` or `theme/` first. ESLint enforces that too, by catching
relative imports that climb out of a feature directory.

**Server time is the only time.** Countdowns and "can I still submit" read
`lib/time.ts`, which holds the offset measured from `GET /api/v1/time`.
Contestant laptops are wrong by minutes often enough to matter.

**The app never sees a password or a token.** Signing in is a full-page
navigation to `/api/v1/auth/login`, built in one place (`session/login-href.ts`);
Forgejo does the rest and the backend sets a cookie this code cannot read.
Anything that renders a sign-in control links there — it is never a fetch.

**Every error message comes from `api/describe-error.ts`.** Pages render the
sentence for a stable `code`, never the code itself, and an unknown code falls
back to the server's own title and detail so a frontend that lags the backend by
a release still says something true.

## The organiser pages

An organiser makes an org, a contest and a task and watches each one
provisioned, then opens any file of a contest or a task as text and saves it.
Saving a task's file is the save of the task, which publishes it or keeps it
as a draft.

| Address                                    | Page                                                          |
| ------------------------------------------ | ------------------------------------------------------------- |
| `/orgs`                                    | the orgs your roles reach, and New org                        |
| `/orgs/new`                                | the new org form, then its provisioning                       |
| `/orgs/:org`                               | the org's contests, and New contest                           |
| `/orgs/:org/contests/:contest`             | the contest's tasks, New task, and the contest repo's files   |
| `/orgs/:org/contests/:contest/tasks/:task` | the task's state, its publications, and the task repo's files |

**Every organiser page lives under `/orgs`.** The proxy in `deploy` sends
exactly `/orgs` and `/orgs/...` to this app, so a page anywhere else loads in
the dev server and answers 404 behind the proxy. A new organiser page goes
under `/orgs` or the proxy changes first. Every address above is built in one
place, `src/lib/organiser-paths.ts`, which the pages and the breadcrumb share.

The pages live in `src/features/organise/`: a sub-folder for each page
(`orgs/` holds `/orgs` and `/orgs/new`, then `org/`, `contest/` and `task/`),
one for the provisioning progress the three create forms share
(`provisioning/`), and one for the file tree and editor the contest and task
pages share (`files/`). The pieces more than one of those use sit at its top:
the create form, the list of links, the definition errors, the route params,
and what a person's roles reach.

All of them are behind `RequireSession`. The org list is read from the roles
the session already has, since there is no route that lists orgs. An org or a
contest page whose list is refused shows the contests or tasks the person's
own roles reach, so someone with a role at one task can still walk down to it.

A create answers with a provisioning record at once, and
`provisioning/FollowProvisioning.tsx` polls the status until it is `ready`:
about once a second while it is pending or running, and every five seconds
while it is `failed`, since forge tries a failed one again on its own. The
record says everything shown: the steps of its kind in order, the last one
completed, the step a failure stopped at, the reason, and when it is tried
again, shown as a time of day read against the server's clock.
`provisioning/steps.ts` only puts the step ids the app knows into words, and
a step it does not know shows under its own id. An org's description takes at
most 255 characters, the most the forge takes.

The open file is `?file=<path>` on the contest or task page, so a link to a
file opens it, and a reload or the back button comes back to it. The editor
reads a file once and saves with the token it was read at, so a background
refetch never swaps the token under someone's text. From Save until the file
has been read again the text is read-only, and the answer takes the focus. A
`conflict` keeps the text and offers to reload; `confirmation_required` offers
to publish the same save confirmed or to keep it as a draft; every other
refusal shows its own detail and what it names.

## Layout

```
src/
  main.tsx  app.tsx  router.tsx  global.css
  api/       generated types, the fetch client, the query wrapper, error shapes
  lib/       server clock, build settings, the organiser addresses, the t()
             every string goes through
  session/   who is signed in: the boot query, the guard, sign-out, the
             expired-session modal. Not a feature, because the shell, the
             router and three features all read it
  theme/     the design handoff's tokens, the fonts, the CSS variables
  ui/        shell (header, sidebar, breadcrumb, account menu), feedback, brand
  features/  home (landing), auth (login page), account (profile, sessions),
             organise (the organiser pages)
  test/      Vitest setup, the MSW server and the organiser's fixtures, the
             provider-aware render helpers, the fake timers polling tests use
e2e/         Playwright, run against the dev server with the API stubbed
```

The design tokens — colours, type scale, radii, the verdict colour pairs — come
from the design handoff and are decided values. Two that look like mistakes and
are not: the brand pink is a different hex in light and dark (one identity, two
grounds), and no verdict is ever pink (failure has to read as failure, not as a
button). There are no shadows anywhere; separation is borders and surface steps.
