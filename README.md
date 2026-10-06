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

`/api`, `/healthz`, `/readyz` and `/-/uploads` are proxied to `http://localhost:8080`,
which is where the compose stack in `deploy` publishes its proxy. Point
somewhere else with `VITE_API_PROXY=http://localhost:8000 pnpm dev`. Without a backend the landing
page renders its error block, which is the error path working, not a crash.

Two settings, both with dev defaults, both listed in `.env.example` and both
read by `vite.config.ts`, not by the app: `VITE_API_PROXY` is where the dev
server forwards `/api`, and `VITE_API_ORIGIN` is what the backend believes its
own public URL is (`UNICON_PUBLIC_URL`), which is not always the same host.
Where Forgejo is, which the sign-in, account and header menu link to and every
sign-out leaves through, the backend answers at `GET /api/v1/auth/forge-url`;
`session/forge.ts` asks it once and keeps the answer. Nothing about the
deployment is in the bundle.

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
docker run --rm -p 8081:8080 unicon-frontend
```

The image takes no build argument: one image serves every deployment, since
the one address that differs, Forgejo's, comes from the backend.

## Ports

| Where          | Port | What answers                                             |
| -------------- | ---- | -------------------------------------------------------- |
| `pnpm dev`     | 5173 | Vite, proxying `/api`, `/healthz`, `/readyz` and uploads |
| `pnpm preview` | 4173 | the built bundle                                         |
| the container  | 8080 | nginx, static files and the SPA fallback                 |

The container listens on 8080 and not 80 because it runs as an unprivileged
user (`nginxinc/nginx-unprivileged`), and a process that is not root cannot
bind a port below 1024. The proxy in `deploy` points at `frontend:8080`.
JavaScript, CSS, SVG and JSON come back gzipped above a kilobyte.

## The published image

CI pushes `ghcr.io/uniconhq/frontend:main` and
`ghcr.io/uniconhq/frontend:sha-<short sha>` on every push to `main`; a pull
request builds the image but pushes nothing. The same image runs on the dev
stack and on any deployment, since nothing about either is in the bundle.

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
pnpm gen:api --from http://localhost:8000/openapi.json   # a backend run on its own
```

`api-version` holds one backend commit SHA, which is what makes the build
reproducible. The pin is the point:
the frontend builds against a known backend rather than whatever landed on the
backend's `main` an hour ago, and bumping it is a deliberate pull request — the
one moment a renamed field shows up, as a type error rather than a broken page.
CI regenerates the client from the pin and fails when the committed
`src/api/schema.d.ts` differs, so the client is always the one its pin names.

The document spells out whole paths (`/api/v1/time`, `/healthz`), so the client's
base URL is the page's own origin with no prefix, and call sites pass the path
exactly as the document names it: `$api.useQuery('get', '/api/v1/time')`.

A change is a mutation from `$api.useMutation`. What it leaves stale is read
again from the hook's own `onSuccess`, which TanStack Query waits for, so a
form stays busy until the page shows the answer and a second click cannot
send the change twice; the form shows the mutation's own `isPending` and
`error`. A change whose refusal also leaves the page stale, such as cancelling
or retrying a grading, reads it again from `onSettled` instead. A part of a page that makes several changes under one busy flag and
one refusal, such as a team card, runs them through `useChange`
(`api/change.ts`), which also reads the page again after a refusal that shows
it was behind and moves the focus once a change has gone through.

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
Every way out of a session (sign out, sign out everywhere, revoking this
session, deactivating or deleting the account) ends the same way, in
`session/use-end-session.ts`: after the backend has ended the session, the
browser goes to the forge's `/-/sign-out`, which clears Forgejo's own sign-in
and comes back to the front page. Otherwise the next person at the browser
would be signed straight back in as this one, since the app signs people in
through Forgejo.

**Every error message comes from `api/describe-error.ts`.** Pages render the
sentence for a stable `code`, never the code itself, and an unknown code falls
back to the server's own title and detail so a frontend that lags the backend by
a release still says something true.

## The organiser pages

An organiser makes an org, a contest and a task, then opens any file of a
contest or a task as text and saves it. Saving a task's file is the save of
the task, which publishes it or keeps it as a draft.

| Address                                    | Page                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `/orgs`                                    | the orgs your roles reach, and New org                                        |
| `/orgs/new`                                | the new org form, then the new org                                            |
| `/orgs/:org`                               | the org's contests, New contest, and its organisers                           |
| `/orgs/:org/contests/:contest`             | the contest's tasks, New task, the contest repo's files, and its organisers   |
| `/orgs/:org/contests/:contest/contestants` | every registration, with approve, reject, undo a rejection, remove and extend |
| `/orgs/:org/contests/:contest/teams`       | every team, with make, delete, add, move, remove and change the leader        |
| `/orgs/:org/contests/:contest/tasks/:task` | the task's state, its publications, the task repo's files, and its organisers |

**Every organiser page lives under `/orgs`.** The proxy in `deploy` sends
exactly `/orgs` and `/orgs/...` to this app, and `/contests/...` for the
contestant pages below, so a page anywhere else loads in the dev server and
answers 404 behind the proxy. A new organiser page goes under `/orgs` or the
proxy changes first. Every address above is built in one
place, `src/lib/organiser-paths.ts`, which the pages and the breadcrumb share.

The pages live in `src/features/organise/`: a sub-folder for each page
(`orgs/` holds `/orgs` and `/orgs/new`, then `org/`, `contest/`, `contestants/`,
`teams/` and `task/`), one for the file tree and editor the contest and task pages
share (`files/`), and one for the organisers section all three pages
share (`people/`). The pieces more than one of those use sit at its top:
the create form and `Create`, which keeps it behind a New button and
closes it once the thing is made; the list of links, the definition errors, and what a person's roles
reach. The route params every page reads are in
`src/lib/route-params.ts`.

All of them are behind `RequireSession`. The org list is read from the roles
the session already has, since there is no route that lists orgs. An org or a
contest page whose list is refused shows the contests or tasks the person's
own roles reach, so someone with a role at one task can still walk down to it.

The organisers section lists everyone holding a role at the org, contest or
task, with the highest role they hold there and where they hold it: here, or
at a broader scope, whose page is where that role is changed. A manager adds
someone by their Forgejo username, changes a role and removes one; only an
admin is offered the admin role or may change an admin. Granting a role to
someone who holds one here moves them to it. The rules are the forge's, so
each refusal is shown where it happened, the last admin of a scope and a
contestant of the contest among them, and a change to the person's own roles
reads the session again, since those decide what every page offers. Someone
who does not observe the place is not shown the section.

Below the organisers are the invites to a role there, and the contestants
page has the invites to a place in the contest: who each is for, what it
grants, whether it is pending, lapsed, accepted, declined or withdrawn, and
what became of its mail. A manager invites by username or by email address,
in one field, since a Forgejo username has no `@`; it stands for 14 days. A
manager also sends a pending invite again, which mails a new link, and
withdraws one; an observer reads the list. While a mail waits to go out the
list is read again every five seconds. The pieces are in
`src/features/organise/invites/`.

A create makes the org, contest or task before it answers, so the form
closes as soon as it has and the new thing is in the list above; the new org
form opens the new org. A refusal keeps the form open with what was typed
and its reason, and asking again is safe. An org's description takes at
most 255 characters, the most the forge takes.

The open file is `?file=<path>` on the contest or task page, so a link to a
file opens it, and a reload or the back button comes back to it. The editor
reads a file once and saves with the token it was read at, so a background
refetch never swaps the token under someone's text. From Save until the file
has been read again the text is read-only, and the answer takes the focus. A
`conflict` keeps the text and offers to reload; `confirmation_required` offers
to publish the same save confirmed or to keep it as a draft; every other
refusal shows its own detail and what it names.

The contestants page shows an observer the table and a manager its actions
too, which the routes check again underneath. Each action's answer replaces
its row and takes the focus back to it; a refusal shows on the row, or inside
the confirmation for a removal, and a registration that moved on under the
organiser is read again. A rejected registration offers Undo rejection, which
leaves it pending again.

The teams page lists every team of a contest with its leader, its members
and the people asked in or asking, for anyone who observes the contest. A
manager makes a team, empty or led by an approved contestant named by
username, deletes one that has submitted nothing, adds an approved
contestant, moves a member to another team, removes one, turns down a
request, takes back an invitation and makes a member the leader. Adding,
moving, removing and deleting each ask first, naming the team, since they
change who reaches that team's work. The list is read again every half minute
and whenever a confirmation opens. The routes give the page no team size,
so a move into a full team is refused by the server and the refusal stays in
the dialog. A contest has teams only when its `contest.yaml` turns them on;
until it does, a new team is refused with `teams_off`.

## The contestant pages

| Address                               | Page                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/`                                   | the public contests for a visitor; your contests once signed in                           |
| `/contests/:org/:contest`             | a contest's dates, countdown, registration, your team and released tasks                  |
| `/contests/:org/:contest/tasks/:task` | a released task's statement; signed in, its limits, the submit panel and your submissions |
| `/invites`                            | your invites, with Accept and Decline; an invite mail links here                          |

One address serves a visitor and a signed-in person, so a contest's link can
be shared before anyone has an account; the page reads the public routes or
the contestant's by the session. For a visitor, a contest or task that is not
public offers sign in, since it may be one they see with an account. Signed
in, the contest page follows the registration: the register form, with a
field for the contest's code when it asks for one, then pending, rejected
with the organisers' reason, and the contest. It reads the home again every
ten seconds while pending, every minute otherwise, and at once as the countdown crosses
the start or the person's deadline. The countdown runs on the server's clock
and counts to the person's own deadline, the end plus any extension. Every
refusal code has its own sentence in `src/api/describe-error.ts`. A statement
is Markdown, rendered by `src/ui/Markdown.tsx` with raw HTML dropped, links
out of the site opened apart, images shown as links, and headings one level
down. The addresses are built in `src/lib/contest-paths.ts`.

### Invites

The home page shows the invites waiting for a signed-in person, when there
are any, and `/invites` lists them all: what each offers and where, who sent
it and when it lapses, with Accept and Decline. An invite decided there stays
in place and says what came of it: an accepted role reads the session again,
so the new role shows, and links to its page; an accepted place links to the
contest's page, where the person registers. An invite's mail links to
`/invites#<token>`. The token moves out of the address into the tab's storage
before the session guard reads it (`InviteLink`), so a sign-in on the way
never carries it in its `?next=`, which the backend and the proxy would log;
back from Forgejo, the page opens that invite first. A link that is not the
signed-in account's says so and to sign in with the account it was sent to.
The proxy in `deploy` has to send `/invites` to this app as well.

### Teams

For a contest whose settings turn teams on, an approved contestant's
contest page has a team section (`features/contest/teams/`). The home does
not say whether a contest has teams, so the section reads `my-team` and is
not there at all when it answers `teams_off`, nor while the first answer is
on its way, and it is not read again after that answer. Someone in no team
sees their invitations, with Accept and Decline, their requests, with
Withdraw, a form to make a team they then lead, and every team with how
many places it has taken, with Ask to join. Someone in a team sees its
members and the people waiting, and Leave, which says first who leads next
or that the team goes with nobody left. The leader also approves or refuses
a request, takes back an invitation, removes a member and invites by
username; inviting someone who had asked to join lets them in at once, and
the form says so. A full team's Accept, Ask to join, Approve and Invite are
off, with the reason beside them. A team's name is checked once trimmed, at
most 60 characters, and a username field takes at most 40, Forgejo's limit.

Once in a team, a person's submissions, limits and questions are the
team's, and every member sees all of them on the existing pages. Nothing
pushes a change of team, so the section is read again every ten seconds
while someone waits on an answer and every thirty otherwise. When the team
the person is in changes between two reads, by their own hand or by a
leader's or an organiser's, every read of the contest is read again, so the
submissions and questions shown follow the team. From the contest's end, or
once it is archived, the forge refuses every contestant's change of team,
so the section shows the team as it stands and says teams stand as they
are. A refusal stays in the section until it is dismissed.

### Submitting

The submit panel on the task page is built from the task's contestant
inputs, which the task page's answer carries: a drop zone for each `code`,
`file` and `file[]` input, with a language to choose when a code input lists
more than one, and a field for each `text`, `number` and `boolean` input,
starting at its default. A `jupyter` input is not submitted from the browser,
so the panel says so and leaves it out. The panel shows only while the task is
open; the list below it shows either way.

A drop zone is the browser's own file input, hidden inside the zone that
shows it, so Tab reaches it, Enter or Space opens the picker, and a screen
reader names it by the input's label. Its `accept` only narrows the picker;
the panel checks every file itself.

Submit runs in this order, in `src/features/contest/submit/use-submit.ts`:

1. The browser's own checks: every input filled, each file one its input
   takes, a language chosen, a number in range, and every size, each file
   against its input's `max_size` and the task's, and all of them together
   against the task's. The store gives no usable error for a file over its
   signed size, so a file too large is caught here, before any upload starts.
2. For each file, a slot (`POST .../uploads`), the bytes straight to the store,
   and `POST .../uploads/{id}/complete`. A form slot is one POST of exactly the
   slot's `fields`, in their order, then the file last; any other field, such
   as a Content-Type, and Garage's policy refuses it. A slot in parts, for a
   file larger than the server takes in one request, is one PUT per part of exactly its length, since each URL
   is signed for that length, and completing names every part's ETag. Sends go
   by `XMLHttpRequest`, for the progress each file shows. A send the store
   drops, answers with anything but a 2xx, or that sends nothing for 30
   seconds, is reported as a file that may be too large, since that is how
   the store answers one.
3. `POST .../submissions` with every upload and one idempotency key.

A slot's URL is sent to as a path on this origin, so a file never goes
anywhere else, and from `pnpm dev` it goes through the dev server's proxy
with the Host the URL was signed for.

The idempotency key is made once per attempt, and an attempt is one set of
panel contents: a second click while one runs does nothing, and sending the
same contents again, after a lost answer or a refusal, sends the same key, so
the server answers with the submission it already made instead of making a
second. Files that went up and checked out are not sent again within the
attempt unless a refusal says they cannot be used. Changing anything in the
panel starts a new attempt. The key is `crypto.randomUUID()`, or 32 random hex
digits on a plain-http origin, where that is missing.

A refusal is said in words from its code, with what it names: when the task
closed and why, the submission limit, when a rate-limited submit can be sent
again (by the server's clock), the size limit and whose it is, and each
problem with the input it is about. Whatever stage it came at, the progress
goes and the files stay in the panel, ready to send again.

Below the panel are the contestant's own submissions, newest first, with each
stage's verdict and metrics. While the live stream is open (below) a
nudge says when a grading moves, and the list is read again then and once a
minute besides. While it is not, the list is read by how long the newest
grading still to finish has waited: every two seconds for its first half
minute, every five to two minutes, every fifteen after, and every minute
when nothing is being graded. A verdict is the outcome once the task shows one, and
where the grading stands until then, or for good when the task keeps the
outcome hidden, as `GRADED`. `src/ui/VerdictBadge.tsx` has a label for every
outcome and status and puts each in one of the handoff's six colour pairs; an
outcome it does not know shows under its own name in the neutral one.

`?submission=<n>` opens one submission above the list: each stage's verdict,
and its summary, metrics, a row per test and its log where the task shows
them. The route leaves out what the task withholds, and the page puts nothing
in its place; the log is read only when the grading says there is one.

An open submission lists the files it was made with, each a download
through the proxy's download door, `/-/downloads/...`, which streams the
file from the forge.

## Announcements, questions and live updates

A contest's home shows its open announcements and those of every task
released to the contestant, each task's named, and a task's page shows its
own. An approved contestant also gets a form to ask the organisers a
question, optionally about one task, and their own questions with every
reply under them; commenting on an answered one opens it again. In a team
the questions are the team's, marked as the team's on both sides. The
organiser's contest and task pages have an announcements card with a
composer, Edit and Close, and no delete; the contest page lists its
questions, and the org page links to the inbox, `/orgs/<org>/clarifications`,
every question still open across the org with Reply, Mark as answered,
Unmark and Answer publicly. Each form sends once at a time, until the list
has been read again, so a second click never posts twice. The parts both
sides show are in `src/ui/threads/`; the contestant's pages are in
`features/contest/threads/` and the organiser's in
`features/organise/threads/`, since a feature does not import another.

`src/live/` keeps one Server-Sent Events stream, `/api/v1/live`, per
signed-in tab, open while the tab is in front, since a browser holds few
connections to one host and a stream in every background tab would use
them up. Each event names a kind of thing that changed and its id, never
what changed. The events of a moment are gathered, and each kind marks
stale the reads whose route shows it: a grading the submissions and
gradings lists and a submission, but not its files or log; an announcement
every announcements list; a clarification the questions and the inbox.
`resync`, and every opening of the stream after the tab's first, marks
everything stale. A stream the server refused is opened again after five
seconds, doubling to a minute, and the session is read again so a
signed-out tab stops. `useLiveConnected` says whether the stream is open,
and pages poll while it is not (`useFallbackPoll`).

## Layout

```
src/
  main.tsx  app.tsx  router.tsx  global.css
  api/       generated types, the fetch client, the query wrapper, the change
             runner, error shapes
  lib/       server clock, the organiser and contest addresses,
             the route params, scope names, sizes, the full-page way out
             to Forgejo
  session/   who is signed in: the boot query, the guard, sign-out, where Forgejo is, the
             expired-session modal. Not a feature, because the shell, the
             router and three features all read it
  live/      the live stream and whether it is open
  theme/     the design handoff's tokens, the fonts, the CSS variables
  ui/        shell (header, sidebar, breadcrumb, account menu), feedback, brand,
             the wrappers: buttons, fields, the file drop zone, verdicts, and
             the parts of announcements and questions both sides show
  features/  home (landing, the contest lists, your invites), auth (login page), account
             (profile, sessions), contest (the contestant pages, with submit/
             for the submit panel and the submissions), organise (the
             organiser pages)
  test/      Vitest setup, the MSW server and the organiser's and contestant's
             fixtures, the
             provider-aware render helpers, the fake timers polling tests use
e2e/         Playwright, run against the dev server with the API stubbed
```

The design tokens — colours, type scale, radii, the verdict colour pairs — come
from the design handoff and are decided values. Two that look like mistakes and
are not: the brand pink is a different hex in light and dark (one identity, two
grounds), and no verdict is ever pink (failure has to read as failure, not as a
button). There are no shadows anywhere; separation is borders and surface steps.
