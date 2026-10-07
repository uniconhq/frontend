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

An organiser makes an org, a contest and a task, then edits the contest's and
the task's settings as forms, or opens any file of either as text and saves
it. Saving a task's file is the save of the task, which publishes it or keeps
it as a draft.

| Address                                    | Page                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `/orgs`                                    | the orgs your roles reach, and New org                                                |
| `/orgs/new`                                | the new org form, then the new org                                                    |
| `/orgs/:org`                               | the org's display name and description, its contests, New contest, and its organisers |
| `/orgs/:org/contests/:contest`             | where each task stands, New task, the contest repo's files, and its organisers        |
| `/orgs/:org/contests/:contest/contestants` | every registration, with approve, reject, undo a rejection, remove and extend         |
| `/orgs/:org/contests/:contest/teams`       | every team, with make, delete, add, move, remove and change the leader                |
| `/orgs/:org/contests/:contest/gradings`    | every grading of the contest, its queue, and retry, cancel and rejudge                |
| `/orgs/:org/contests/:contest/tasks/:task` | the task's state, its publications, the task repo's files, and its organisers         |

**Every organiser page lives under `/orgs`.** The proxy in `deploy` sends
exactly `/orgs` and `/orgs/...` to this app, and `/contests/...` for the
contestant pages below, so a page anywhere else loads in the dev server and
answers 404 behind the proxy. A new organiser page goes under `/orgs` or the
proxy changes first. Every address above is built in one
place, `src/lib/organiser-paths.ts`, which the pages and the breadcrumb share.

The pages live in `src/features/organise/`: a sub-folder for each page
(`orgs/` holds `/orgs` and `/orgs/new`, then `org/`, `contest/`, `contestants/`,
`teams/`, `gradings/` and `task/`), one for the file tree and editor the contest and task pages
share (`files/`), one for the settings forms and the statement (`forms/`),
and one for the organisers section all three pages share (`people/`). The pieces more than one of those use sit at its top:
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
admin may change an admin. Every role is offered to a manager too, admin
included: the forge refuses admin from a manager, and the section says so
with the forge's reason rather than leaving the choice out. Granting a role to
someone who holds one here moves them to it. The rules are the forge's, so
each refusal is shown where it happened, the last admin of a scope removed or
demoted and a contestant of the contest among them. The forge leaves the
orgs' service accounts out of every list, so they never show. A change to the person's own roles
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

The editor is CodeMirror, wrapped in `src/ui/CodeEditor.tsx`: line numbers,
undo, search and bracket matching, YAML highlighted in a `.yaml` or `.yml`
file and Markdown in a `.md`, everything else plain, in the theme's own
colours. Its label names the editing area for a screen reader. jsdom has no
layout for CodeMirror to measure, so the test setup stands a plain text field
with the same props in for it (`src/test/code-editor.tsx`), and
`CodeEditor.test.tsx` tests the editor itself.

A file that is an upload is marked in the tree with the size of what it
holds, and opens as its size and SHA-256 (`files/UploadedFile.tsx`), never as
text, since its commit holds a pointer to the bytes: in the file editor, as an
older version in its history, and as a `statement.md` or `task.yaml` in the
statement editor and the settings forms. A manager of the task uploads a file
from the tree, into the folder last opened there or the open file's by
default, at a path they can change, and changes an uploaded one with Upload
again: the browser works out the SHA-256, asks `POST <task>/organise/uploads`
for a slot, sends the file through the upload door and completes it, each with
its progress, and a send the connection cuts is sent again from the start, up
to three times, to the same slot; a slot for a file the forge holds already
needs nothing sent. The upload is not in the task until the organiser saves
it, which writes the file by its upload id with the token of the file there
when the upload began, or none for a new file, through `POST <task>/save`: a
save like Save, with its answers and refusals, and a `conflict` offers to save
over the other version, each path with its token read afresh. In the file
panel an arrived upload may instead be kept waiting, listed under "Waiting to
be saved" with a Discard each; the next upload's Save, or the list's own, saves
every waiting one with it in one save, so replacing a test's input and answer
is one commit, one publication and one confirmation (`files/upload-save.ts`,
`files/WaitingUploads.tsx`). Only the page keeps the waiting uploads, and it
says so: leaving or reloading it drops them.
The door's steps, shared with a contestant's submit, are in `src/api/upload/`.

Under a task's file, History lists the file's versions newest first, each
with its author, its message and when, and the publication that froze it,
with whether that publication changed how the task grades. A publication
is joined to the version it points at, so one that froze a later change to
another file is marked on that file. An older version opens below, read-only,
and a manager rolls the file back to it after a confirmation: the forge writes
the old content as a new version, and the rollback is a save of the task with
the same token, answers and refusals as Save.

The contest page's Settings and the task page's Settings and Statement read
their file when opened, under a query key of their own, so a save there never
swaps the token under the same file open in the editor. Settings is a form
over `contest.yaml` or `task.yaml`, with the file as text in a tab beside it
for the keys that have no field, such as the leaderboards. The form parses
the file with `yaml`'s `parseDocument`, writes only the nodes whose fields
changed, and saves `String(doc)` through the same write as the editor, so
comments, key order and every untouched key stay as they were, and the answer
is the editor's. A file that is not YAML, or not a mapping, opens as text with
the reason. Times show in the organiser's own zone and a changed one is written
back with their offset. The admin's keys (`TASK-FORMAT.md` section 1.1 and 1.2)
are shown to a manager disabled, read from the session's roles as the
organisers section reads them; the forge refuses a manager's change anyway.
The task form's inputs are the ones the task's workflow declares, read with
`GET <task>/workflow-form` each time the form opens, after a save too, and
built only once that read is in, so a save naming another workflow reopens
on that workflow's declarations: one entry each, in the workflow's order. A contestant's input takes form details its type has, a
label for any, the options offered out of the workflow's own and a default
for a choice, a default, a least and a most for a number, and `max_size` for
a file or folder; any other input takes a value of its type, a number, true
or false, one of an enum's options, a path for a file or folder, or text or
`{secret: <name>}`, written as that type; a value cleared takes the key out.
One the file leaves out offers to
be given; a contestant's or an optional one may be left out again; one the
file holds the other way is written afresh at the save, and one the workflow
does not declare is marked to be removed. The test fields each test holds
are listed under the test groups. When the workflow cannot be read, the form
shows the `problem` and edits the `inputs` entries the file has, adding or
removing one by id and taking an entry holding a mapping (other than
`{secret: ...}`) as the contestant's form details and anything else as a
value. Its test groups are the folders under `tests/` and
the groups the file names: a folder with no entry is added at the next save,
and an entry with no folder is marked and may be removed. A form save refused
as a `conflict` reads the file again and shows the organiser's version and the
current one field by field, with a choice per field that starts on the side
that changed it; nothing is written until they save, which writes the chosen fields
into the current file with its token (`forms/merge.ts`, over any YAML
document). A keyed list (`contest.yaml`'s `tasks` by `id`, `leaderboards` by
`name`, a table in `merge.ts`) is compared item by item, each item matched and
named by its key (`tasks[sum].due`); an item only one side has, and the list's
order, are fields of their own, and the merge finds each item in the current
file by its key before writing. Any other list is one field. Times compare as
the moments they name and show in local time, and a manager's admin-only keys
stay as they are now. The statement is edited beside `ui/Markdown`, the renderer the
contestant's task page uses, and is read-only to a manager.

The task page's gradings are the contest's Gradings page (below) narrowed to
the task, read from the task's own route (`GET <task>/gradings`, whose rows
are the feed's, with who submitted), without the task column and with
Rejudge for the whole task. Both are `gradings/GradingsList`: one table, one
row, one set of dialogs and one actions hook.

The contest page lists its tasks in the contest's order, each by its letter
and name, with where it stands (`GET <contest>/organise/tasks`): its latest
publication, when it was made and whether it changed how the task grades, or
that it has never published; a draft on top of it with the draft's errors at
their YAML paths; and its timeline from `contest.yaml`, released, due with
what a started late day takes off, closes and worth, each at its default
where the entry gives none, as the route resolves them. The list is read
again on every visit, since a save on a task's page moves its state, and
whenever one of the contest's files is written on the page, since
`contest.yaml` holds the times. A `contest.yaml` that does not pass
validation, which the route refuses as `invalid_definition`, shows each of its
errors at its YAML path and leaves the tasks by name alone.

The contest's Gradings page (`gradings/`) lists every grading of its tasks
newest first, each submission once by its task, who made it and its number,
never by when it was made, headed by its highest attempt, with its earlier
attempts opening below it: the
attempt, the publication it graded against, the status with the reason a
system error gave and the sentence a cancel told the contestant, what a
finished run came to, its log, and when it was queued, started and finished.
Above it are how many gradings wait, queued and waiting for a machine, and
filters by task, status, team and a contestant's username, kept in the
address so a link or a reload keeps them; a username applies once sent. The
live stream marks the feed and the queue stale as gradings move; while it is
not open both are read again every ten seconds while one is still to finish.
A manager of a row's task acts only on the submission's latest attempt, as
each row's `latest` says over all its attempts: an earlier attempt a status
filter shows alone is marked as earlier and offers nothing. They retry it
once finished, unless staff cancelled the submission, since a cancel is
final, and cancel one reading as a system error, with a sentence of at most
500 characters its contestant reads; with the feed filtered to a task they
manage, they rejudge it, which grades every submission's latest attempt
again against the current publication as a new attempt. Each goes through
the task's own routes after a confirmation that keeps a refusal and closes
once the change has gone through, and then marks every task's gradings, the
feed and the queue stale. An observer reads the page alone. The feed shows
the newest 100; a filter reaches older ones.

The org page shows the org's display name and description as the forge
holds them. An admin of the org edits both in place; an emptied display name
is sent as empty, which leaves the org showing its name. A manager or an
observer reads them with no edit control.

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
the dialog. A contest has teams only when its `contest.yaml` sets
`team_size`, the most people a team holds; until it does, a new team is
refused with `teams_off`.

## The contestant pages

| Address                               | Page                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/`                                   | the public contests for a visitor; your contests once signed in                                   |
| `/contests/:org/:contest`             | a contest's dates, countdown, registration, your team and released tasks                          |
| `/contests/:org/:contest/tasks/:task` | a released task's statement; signed in, its times and caps, the submit panel and your submissions |
| `/invites`                            | your invites, with Accept and Decline; an invite mail links here                                  |

One address serves a visitor and a signed-in person, so a contest's link can
be shared before anyone has an account; the page reads the public routes or
the contestant's by the session. For a visitor, a contest or task that is not
public offers sign in, since it may be one they see with an account. Signed
in, the contest page follows the registration: the register form, with a
field for the contest's code when it asks for one, then pending, rejected
with the organisers' reason, and the contest. It reads the home again every
ten seconds while pending, every minute otherwise, and at once as the countdown crosses
the start or the end. The countdown runs on the server's clock and says what
it counts to: "Contest starts in", then "Contest ends in". Each task closes at its own time: signed in, the task list
says when each falls due, if it does, and closes for the person, any
extension they have on it included, and the task page says the same with
the task's caps, the most submissions in all and how often. Every
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

For a contest whose `contest.yaml` sets `team_size`, an approved contestant's
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

Once in a team, a person's submissions, the caps they count against, their
extra time and their questions are the team's, and every member sees all of
them on the existing pages. Nothing
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
inputs, which the task page's answer carries, each by its label: a drop zone
for a `file` input, a field for each `text`, `number` and `boolean` input,
starting at its default, and a choice of an `enum` input's options, starting
at its default. An enum with one option has nothing to choose, so the panel
says which in a line, such as `language: python`, and sends it. A `folder`
input, and a `file` input that takes a file per test, take several files and
offer a second picker that chooses a whole folder. A folder's files keep
their paths inside it, its own name left off, and a file per test is named
for its test as `<group>/<test>`, with or without an ending, so a folder
holding a folder per test group gives each file its name. A file chosen
alone goes by its name, and the server says which names it does not take.
The panel shows only while the task is open; the list below it shows either
way.

A drop zone is the browser's own file input, hidden inside the zone that
shows it, so Tab reaches it, Enter or Space opens the picker, and a screen
reader names it by the input's label, and the folder picker as
`<label>: a folder`.

Submit runs in this order, in `src/features/contest/submit/use-submit.ts`:

1. The browser's own checks: every input filled, an option chosen, a number
   in range, and the files of each input together against its `max_size`.
   A file too large is caught here, before any upload starts.
2. For each file, a slot (`POST .../uploads`) naming the input and the
   file's path under it, the bytes straight to the store,
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

A refusal is said in words from its code, with what it names: that the task
has closed for the person, the submission limit, when a rate-limited submit
can be sent again (by the server's clock), the size limit and whose it is,
and each problem with the input it is about, such as a file per test named
for no test. Whatever stage it came at, the progress
goes and the files stay in the panel, ready to send again.

Below the panel are the contestant's own submissions, newest first, each
with its verdict and how many days late it was, if it was. While the live
stream is open (below) a nudge says when a grading moves, and the list is
read again then and once a minute besides. While it is not, the list is read
by how long the newest grading still to finish has waited: every two seconds
for its first half minute, every five to two minutes, every fifteen after,
and every minute when nothing is being graded. A verdict is where the
grading stands until it is done, then what stopped the run when something
did, such as a compile error, else the outcome over the test groups the task
shows now, and `GRADED` when it shows none yet. A run that failed on the
platform's side is served as running until staff end it; then it reads
`CANCELLED` with the sentence they gave, and is no longer read again.
`src/ui/VerdictBadge.tsx` has a label for every outcome and status and puts
each in one of the handoff's six colour pairs; an outcome it does not know
shows under its own name in the neutral one.

`?submission=<n>` opens one submission above the list: its verdict, the
values the run reported once, a number in a list and a text such as the
compile log as a block of its own, and each test group as the task shows it
now: its outcome, its tests with each one's outcome and values, such as
`time_ms` and `memory_kb`, and when the rest is shown while some is held
back. A group that did not run on the grading reads "Not run on this
grading" where its outcome would be. The route leaves out what the task
withholds, and the page puts nothing in its place. A run's log names every
test, hidden ones too, so no contestant reads it; on a task's organiser
page, each grading whose run wrote one has a Log link that opens it as
plain text in a tab of its own.

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
gradings lists, a contest's queue and a submission, but not its files; an announcement
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
