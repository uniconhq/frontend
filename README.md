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

## Writing what the pages say

Every word on screen is written for someone setting up their first contest, or
entering one, who knows nothing of the files behind it: plain sentences or
clear labels, no file or format words, and one word for each idea.
[`GLOSSARY.md`](GLOSSARY.md) lists those words, the ones they replace and how
to write a hint, a button or a refusal. Use it when writing a page, and check a
change against it in review; a page that needs a word it lacks adds the word
there first. A test that finds something by its words changes with them.

## The organiser pages

An organiser makes an org, a contest and a task, then sets both up through
forms: the contest's settings, ways in and leaderboards on its pages, and the
task's workflow, inputs, tests and scoring, and statement on cards on its
page. Every file a task holds is changed on the card it belongs to, and any
change is the save of the task, which publishes it or keeps it as a draft.
The settings as they are stored are read at the foot of each Settings page,
where an admin fixes them as text when the forms cannot read them.

| Address                                    | Page                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `/orgs`                                    | the orgs your roles reach, and New org                                                |
| `/orgs/new`                                | the new org form, then the new org                                                    |
| `/orgs/:org`                               | the org's display name and description, its contests, New contest, and its organisers |
| `/orgs/:org/contests/:contest`             | failed gradings, where each task stands, New task, how it is scored, and the sections |
| `/orgs/:org/contests/:contest/contestants` | every registration, with approve, reject, undo a rejection, remove and extend         |
| `/orgs/:org/contests/:contest/teams`       | every team, with make, delete, add, move, remove and change the leader                |
| `/orgs/:org/contests/:contest/gradings`    | every grading of the contest, its queue, and retry, cancel and rejudge                |
| `/orgs/:org/contests/:contest/tasks/:task` | the task's state, the cards that build it, and a card for each section                |

**Every organiser page lives under `/orgs`.** The proxy in `deploy` sends
exactly `/orgs` and `/orgs/...` to this app, and `/contests/...` for the
contestant pages below, so a page anywhere else loads in the dev server and
answers 404 behind the proxy. A new organiser page goes under `/orgs` or the
proxy changes first. Every address above is built in one
place, `src/lib/organiser-paths.ts`, which the pages and the breadcrumb share.

The pages live in `src/features/organise/`: a sub-folder for each page
(`orgs/` holds `/orgs` and `/orgs/new`, then `org/`, `contest/`, `contestants/`,
`teams/`, `gradings/` and `task/`), one for reading, previewing and saving the files the
contest and task pages share (`files/`), one for the settings forms and the statement (`forms/`),
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

A contest's `contest.yaml` and a task's `task.yaml` are shown at the foot of
their Settings page (`files/StoredSettings.tsx`, the page's `#file`), where
"View file" leads, with their history: read-only, and for an admin, while the
forms cannot read them, as text to fix. An old link to a contest's or a
task's Files page lands there for a contest and on the task's page for a
task. The text is read once and saved with the token it was read at, so a
background refetch never swaps the token under someone's text. From Save
until the file has been read again the text is read-only and Save spins,
and nothing else makes it so; the answer takes the focus. A `conflict` shows
the organiser's text beside the version saved meanwhile (`TextConflict`),
to keep theirs or save over it; `confirmation_required` offers
to publish the same save confirmed, saying how many submissions it grades
again (`regrades`), or to keep it as a draft; every other refusal shows its own detail and
what it names. A save that publishes says what changed in grading, how many
submissions it queued to be graded again (`regraded`), and lists the notes
the forge makes of the task beside publishing, such as the steps it seals
until the reveal. A write of the contest's settings lists, beside its
version, the notes its boards report, such as a board that counts nothing
from a task. Every save path ends in this one answer (`SaveOutcome`).

The editor is CodeMirror, wrapped in `src/ui/CodeEditor.tsx`: line numbers,
undo, search and bracket matching, YAML highlighted in a `.yaml` or `.yml`
file and Markdown in a `.md`, everything else plain, in the theme's own
colours. Its label names the editing area for a screen reader. jsdom has no
layout for CodeMirror to measure, so the test setup stands a plain text field
with the same props in for it (`src/test/code-editor.tsx`), and
`CodeEditor.test.tsx` tests the editor itself.

**A task's files are changed only on its cards** (M51). Tests are added,
opened and replaced on Tests and scoring (below). A picture for the statement
is added with "Add a picture" on the Statement card, which saves it into the
task's `public/` folder at once under a name no file there has
(`forms/picture-name.ts`) and adds the line that shows it,
`![name](public/name.png)`, at the end of the statement, for the organiser to
move and save. A setting that is a file or a folder, such as a checker, has
its own box on the Inputs card (`task/FileSetting.tsx`): what it names, with
View, Replace and, for an optional one, Use none; a file chosen is marked New
or Replaced and waits for the task's save, which writes it under the input's
own folder, `<input>/`, points the setting at it and takes out what the
setting named before in that folder (`task/input-files.ts`). A task's admins
read every file it holds with "View all files" on its Settings page, a tree
with a file chosen shown below, nothing in it editable.

A file shown to read (`files/FilePreview.tsx`) shows its first lines, with
Show all and Download; one that is not text, by its size and Download. One
that is an upload, or larger than 1 MB, is not read whole: its Download is a
link through the proxy's download door,
`/-/downloads/<org>/<contest>/<task>/versions/<version>/<path>`, at the
version a read of the file named (#444) or, for a file too big to read, at
the task's head, which streams it whatever its size.

A file that is an upload opens as its size and SHA-256
(`files/UploadedFile.tsx`), never as text, since its commit holds a pointer
to the bytes: as the statement or the settings, and as an older version in
their history; a manager changes one with Upload again. A file a card saves
that is larger than 256 KB, or past 4 MB of them in one save, goes through
the upload door at the save (`task/staged.ts`, `files/use-task-upload.ts`):
the browser works out the SHA-256, asks `POST <task>/organise/uploads` for a
slot, sends the file and completes it, each with its progress, and a send the
connection cuts is sent again from the start, up to three times, to the same
slot; a slot for a file the forge holds already needs nothing sent. The save
then writes the file by its upload id through `POST <task>/save`, with its
answers and refusals, a `conflict` naming the file by the page it is changed
on. The door's steps, shared with a contestant's submit, are in
`src/api/upload/`.

Under the stored settings, History lists their versions newest first, each
with its author, its message and when, and the publication that froze it,
with whether that publication changed how the task grades. A publication
is joined to the version it points at, so one that froze a later change to
another file is marked on that file. An older version opens below, read-only,
and a manager rolls the file back to it after a confirmation: the forge writes
the old content as a new version, and the rollback is a save of the task with
the same token, answers and refusals as Save.

The contest page's Settings and the task page's Settings and Statement read
their file when opened, under a query key of their own, so a save there never
swaps the token under the same file open as the stored settings. Settings is a form
over `contest.yaml` or `task.yaml`, with the file as text in a tab beside it
for the keys that have no field, such as the leaderboards. The form parses
the file with `yaml`'s `parseDocument`, writes only the nodes whose fields
changed, and saves `String(doc)` through the same write as the stored
settings, so comments, key order and every untouched key stay as they were,
and the answer is theirs. A file that is not YAML, or not a mapping, opens as text with
the reason. Times show in the organiser's own zone and a changed one is written
back with their offset. The admin's keys (`TASK-FORMAT.md` section 1.1 and 1.2)
are shown to a manager disabled, read from the session's roles as the
organisers section reads them; the forge refuses a manager's change anyway.
The task form's inputs are the ones the task's workflow declares, read with
`GET <task>/workflow-form` each time the form opens, after a save too, and
built only once that read is in, so a save naming another workflow reopens
on that workflow's declarations: one entry each, in the workflow's order,
named by its title from the workflow, a number's unit after it, with its
help behind an ⓘ (M45); its key shows only for an input the workflow gives
no title. A contestant's input takes form details its type has, a
label for any, the options offered out of the workflow's own and a default
for a choice, a default, a least and a most for a number, and `max_size` for
a file or folder; any other input takes a value of its type, a number, true
or false, one of an enum's options, a file or folder in its own box (above),
or text or `{secret: <name>}`, written as that type; a value cleared takes
the key out.
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
and an entry with no folder is marked and may be removed. Once the task has
a graded submission (`graded` from `GET <task>/workflow-form`), a group the
save adds must say its `show`, which the save refuses otherwise (T10): the
field is required and says so, and the groups already in the file are left
as they are. Each group says how it earns its points in plain words that
speak of an entrant, with a worked example from its own number of tests
(`task/scoring.ts`, the same words "How this contest is scored" uses), and
lists its tests, a row each, "Test 1 · input 4 B, answer 2 B", its parts in
the workflow's order, with a Weight where the group's rule reads weights. A
test's name opens it in place (`task/TestView.tsx`): its parts side by side,
each as a file shown to read (above), a folder as a tree, then its values.
Add tests asks how, one test, many files at once named by test, or a zip,
each said with the task's own parts and the endings each part takes
(`task/add-words.ts`, `task/match.ts`), shows what the files make as a
table, a row per test and a column per part with Missing where a file is
not, and keeps Add tests greyed with its reason beside it until a test is
complete. A choice of a few options said in sentences, such as how a test
earns or when entrants see a group's results, is radio options, each with
what it means under it and a greyed one with why (`ui/RadioGroup.tsx`,
M46). A form save refused
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
contestant's task page uses, and is read-only to a manager; a save someone
else's beat shows both versions (`TextConflict`), never swapping the text
being edited for theirs.

These reads, and the ones the task's cards are built from, are marked
`EDITED` (`live/edited.ts`, M49): the re-read of everything when the live
stream opens again passes over them, so coming back to the tab neither
swaps what is being edited for someone else's version nor holds the form
while it reads. A change made elsewhere meanwhile is met at the save, as a
`conflict`. A save button spins only while its save runs.

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

Above the tasks, while any wait, the contest page says how many gradings
failed on Unicon's side (`failed` from `GET <contest>/gradings/queue`), that
Unicon tries each once again by itself and then waits for staff, and links
to Gradings filtered to them, `?status=system_error&latest=true`. Below them,
"How this contest is scored" (`contest/ContestScoring.tsx`, M52) says, task
by task as its latest publication has it, its worth and when it is open in
its heading, each test group by name with how it earns and a worked example,
and each leaderboard that counts it in the words of the Leaderboards page
(`forms/board-words.ts`), naming a group whose results are held until its
task closes only where that changes what the board counts.

The contest's Gradings page (`gradings/`) lists every grading of its tasks
newest first, each submission once by its task, who made it and its number,
never by when it was made, headed by its highest attempt, with its earlier
attempts opening below it: the attempt, the publication it graded against,
whether Unicon made it by itself after the attempt before it failed, the
status with the reason a system error gave and the sentence a cancel told
the contestant, which earlier attempt's result stands while it has none
(`last_good`), what a finished run came to, its log, and when it was queued,
started and finished.
A submission's Scored view opens under it the submission as its row reads it
with everything filled in (`GET <task>/organise/submissions/{number}`, the
row by its `user_id` or `team`): the contestant's own payload, drawn by the
same `ui/scored/ScoredResult` the contestant's page draws it with, every
group's outcome, tests and points shown, each saying when its row sees it,
and the grading's own status. Above it are how many gradings wait, queued,
waiting for a machine, and failed and waiting for staff, with a link to the
failed ones, and filters by task, status, latest attempts only, team and a
contestant's username, kept in the
address so a link or a reload keeps them; a username applies once sent and
finds the user's own submissions and their team's, by the team they were in
when each was made, which the field says in a contest with teams. Each
row carries its task's letter, so the page reads no task's standing for one;
the task filter lists the contest's tasks by name (`GET <contest>/tasks`). The
live stream marks the feed and the queue stale as gradings move; while it is
not open both are read again every ten seconds while one is still to finish.
A manager of a row's task acts only on the submission's latest attempt, as
each row's `latest` says over all its attempts: an earlier attempt a status
filter shows alone is marked as earlier and offers nothing. They retry it
once finished, unless staff cancelled the submission, since a cancel is
final, and cancel one reading as a system error, with a sentence of at most
500 characters its contestant reads, or, when an earlier result stands and
stays, one kept for the organisers; with the feed filtered to a task they
manage, they rejudge it, which grades every submission's latest attempt
again against the current publication as a new attempt. Each goes through
the task's own routes after a confirmation that keeps a refusal and closes
once the change has gone through, and then marks every task's gradings, the
feed and the queue stale. An observer reads the page alone. The feed shows
the newest 100; a filter reaches older ones.

The org page shows the org's display name and description as the forge
holds them. An admin of the org edits both in place; an emptied display name
is sent as empty, which leaves the org showing its name. Anyone else with a
role in the org, at the org or at one of its contests or tasks, reads them
with no edit control, also when the contest list refuses them.

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

## Workflows

A workflow is a person's or an org's, so its pages have addresses of their
own, which the proxy sends here beside `/orgs`.

| Address                              | Page                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `/workflows`                         | every workflow you may read, those you may change first; New workflow                    |
| `/workflows/:owner/:name`            | for one you may edit, the editor over its draft; otherwise its latest version, read-only |
| `/workflows/:owner/:name?version=v1` | that version, read-only, with Copy into a new workflow                                   |

There is one way to make a workflow, New workflow: from the starter (compile,
run on each test, compare with the answer) or as a copy of any version one can
read, under oneself or an org one manages; a version's "Copy into a new
workflow" opens the same dialog with that version chosen. Combining workflows
is off both pages for now (M36): `Combine.tsx` and the backend's
`POST /workflow-combinations` stay, tested on their own, for when it has a
place among the ways to make one.

**The editor is the only place a workflow is edited** (PROPOSAL.md section
12, #377). `features/organise/workflows/` holds it. `model.ts` reads
`workflow.yaml` into steps, inputs, test fields and report, forgiving a draft
with problems. A version is drawn only once the forge's check of its file
passes: one the forge refuses to serve, one that does not parse, and one the
check refuses, as it refuses the format before 2026-10-07, open one state,
"This version cannot be opened", with the forge's reason. `layout.ts` works out where everything stands
from the file alone, and nothing of it is stored: a once step one column right
of the furthest once step it reads, per-test steps the same in a shaded band
after them, the report last; inputs and test fields grouped by exactly the
steps that read them, text with one written in counting, just before the
first; a slot of its own in each column a wire skips, shared by the wires
from one port and labelled at its first; each column sorted by where its
wires come from and go, a few sweeps each way, keeping the fewest crossings;
and five colours cut from the mark's gradient, the columns taking them 1 to 5
and back. Every port has a row of its own, a step's outputs under its
inputs. Every wire joins neighbouring columns, so none passes behind a box.
React Flow draws the boxes and wires at those places and handles the drags;
it places nothing, and no box can be dragged. The graph is always at its
actual size (`Graph.tsx`): no zoom, no pan of React Flow's own and no fit on
change; it is as tall as its tallest column, so the page scrolls down it,
and slides sideways in its frame with a scrollbar, Shift and the wheel, or a
trackpad. React Flow's attribution is hidden (`proOptions.hideAttribution`,
which its MIT licence allows; its authors ask those who hide it to consider
sponsoring them). A version's page and a task's Workflow card draw the same
graph (`DrawnGraph.tsx`).

Each box says what it is in words (`words.ts`, M31): a step its name, "Once"
or "For each test", its primitive's title and what it does (#436), its
reference small; a port its type and what it does that the author acts on
("runs this as a program", "sets the time limit", "(optional)"); a wire skipping
columns its source ("time_ms from run"). What the author never acts on, a
primitive taking a batch, its outcome and a port that keeps a secret, is
under Details in the step's drawer.

`rules.ts` refuses at the drag whatever a version would refuse that the
primitives' declarations decide, in the forge's own words: the type under
the two widenings, an enum's options, an optional output into a required
port, a test field or per-test input into a once step, a once step reading a
per-test step, a contestant input or step output into a port a limit is
raised from, and a loop. A refused drop marks the port with ✕ and says why
over its box's title, covering no port, until the next press, Escape or
wire, or five seconds, fading as it goes (`notice.ts`, M53). Every port's
name is a button whose menu does what a drag does, each wire it could take
listed and one it may not shown with the reason, so the keyboard reaches
everything. A drag starts at an output and ends at an input. A change on a
panel that would newly break a wire, a value or a report entry, such as
making an input the contestant's while it feeds a port a limit is raised
from, is refused there with the same reason, and so is an output dropped on
a report entry whose meaning it cannot have. `edit.ts` makes every change as an edit of the YAML document in
place, so comments and key order survive; a wire to a step listed later
moves the fewest steps to keep every step after what it reads, and a step
switched between once and per test moves to keep the once steps first. Undo
and redo step through the page's own history.

Every definition file is read and written as the forge reads it, YAML 1.2's
core schema whatever `%YAML` line it carries (`forms/yaml-doc.ts`): `on`,
`yes`, `no` and `1_000` are text and written plain, and only text that 1.2
reads as something else, such as `true` or `12`, is written quoted. A number
keeps the digits it is written with: a form's number field reads and writes
them (`NumberText`), the workflow editor reads its bounds and values that way
(`exactJS`), the merge view compares numbers digit for digit, and an edit to
the last of thirty digits is an edit.

The page (M32, M37): a bar that stays at the top of the window, with the
switcher between the draft and each version, a line saying which one is
shown and what that means, and Save, "Publish version", Share and "View
file"; under it the toolbar, Undo, Redo, "Add step" (the primitives as a
menu, the newest version of each, with its title, what it does and its
reference) and the inputs, each test's files and the report; then the
problems; then the graph across the page's whole width. The box selected
opens in a drawer from the right (`Drawer.tsx`), over the graph, which
scrolls the box clear of it; × or Escape closes it. A step's drawer asks
"Run it: once per submission, or once for each test?", a new step starting
for each test when its primitive takes a batch; then its name, its version,
a value for each port without a wire with the port's description, what it
gives, and Details. The inputs' drawer offers each declaration only the keys
the format allows it and the title and help the task's form names it by
(#434), and a unit for a number alone, dropped when the type changes away
(M54); an older input of another type with a unit shows it only to clear.

A moment after each change the definition goes to `POST /workflows/check`
(a check that did not run says so, never that it passed), and each problem
is pinned by its YAML path to the step, port, input, field or report entry
it names, its message beside its mark, and listed in the banner above the
graph, each a link that opens its box (`Problems.tsx`). A draft with
problems saves; "Publish version" names the next version, `v` and the
number after the highest (`versions.ts`), says what publishing means, asks
for a save first, and is held while the check finds problems; a version the
forge still refuses says why, with every problem. A version is made of the
save the page made, with its token, or not at all. A save over someone
else's opens the merge view with steps matched by `id`. "View file" shows
the file a save writes, read-only, with the selected box's lines marked. A
draft whose file does not read cannot be drawn, so it opens as text to mend,
with Save and Undo, a run of typing one step back, and the graph returns
once it reads (M30). Leaving with changes not saved asks first. Who reads
the workflow is applied as it is chosen, private, shared with the people
listed or public, asking first only when that takes it from people on the
list. A wire the layout cannot draw, such as a once step reading a per-test
one in a draft, is shown on its port as text, and a step with no id keeps
its place.

A task whose workflow has a version with a larger number than the one it
names says so on
its settings form, with a button that names the newer one in the field;
nothing changes until the task is saved.

## The contestant pages

| Address                               | Page                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/`                                   | the public contests for a visitor; your contests once signed in                                   |
| `/contests/:org/:contest`             | a contest's dates, countdown, registration, your team and released tasks with your points         |
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
the task's caps, the most submissions in all and how often. In an approved
entrant, each task also shows their points out of its worth, "62 / 100", as
a leaderboard over that task counts them, so nothing a leaderboard holds
back (#440, `task-points.ts`): while some are held back it says when they
are shown, "More shown at 14:00", or "— / 100" and "Shown at 14:00" while
none are, and the page reads them again as that time passes. Every
refusal code has its own sentence in `src/api/describe-error.ts`. A statement
is Markdown, rendered by `src/ui/Markdown.tsx` with raw HTML dropped, links
out of the site opened apart, a picture saved with the task under `public/`
drawn and any other image shown as a link, and headings one level down. The addresses are built in `src/lib/contest-paths.ts`.

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
Your entry (`entry/YourEntry.tsx`) shows the team's name with Edit beside
it while the team can still change, which turns it into a box with Save and
Cancel in place (M41); each member's line says how they came in, with the
sign-up's name when it has one (M42).

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
   written as plain decimal digits and in range, its bounds compared digit
   for digit, and the files of each input together against its `max_size`.
   A number is sent as the digits it was typed as, never a JSON number.
   A file too large is caught here, before any upload starts.
2. For each file, its SHA-256 read in the browser, a slot
   (`POST .../uploads`) naming the input, the file's path under it, its
   digest and its size, one PUT of the file to the slot's address on the
   upload door, and `POST .../uploads/{id}/complete`. The forge stores the
   body and keeps it only when it has the digest and length the slot names. A
   slot with no address is a file the forge holds already, and nothing is
   sent to it. Sends go by `XMLHttpRequest`, for the progress each file shows.
   A send whose connection breaks, or that sends nothing for 30 seconds, asks
   where the upload stands before sending the file again from the start; a
   refusal is an upload that did not go through, which says the file may
   have changed since it was chosen.
3. `POST .../submissions` with every upload and one idempotency key.

A slot's address is sent to as a path on this origin (`/-/uploads/...`), so
a file never goes anywhere else, and from `pnpm dev` it goes through the dev
server's proxy, as `/api` does.

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
shows now, and `GRADED` when it shows none yet. A contestant is served a
submission's state in the format's words, `queued`, `grading`, `graded`,
`delayed` or `cancelled`, by the attempt that counts: a submission keeps its
result while it is graded again, whatever the new attempt comes to (#442).
One with no result whose grading failed on the platform's side is
`delayed`: it reads `GRADING DELAYED` with "A problem on Unicon's side.
Nothing is lost, and it does not use up a submission.", and is followed as
one being graded is, since Unicon tries it again by itself. One staff end
reads `CANCELLED` with the sentence they gave, and is read again only as
often as a list with nothing grading is.
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
gradings lists, a contest's queue, a submission, but not its files, and the
contest home, whose tasks carry the entrant's points; an announcement
every announcements list; a clarification the questions and the inbox.
`resync`, and every opening of the stream after the tab's first, marks
everything stale but the reads a form or an editor edits from (`EDITED`),
whose changes are met at their save. A stream the server refused is opened again after five
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
             the parts of announcements, questions and a scored result both
             sides show
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
