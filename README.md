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
`VITE_API_PROXY=none` runs it with no backend at all, every proxied path
answering 404 at once; the browser tests (`pnpm e2e`) run their own dev server
that way on port 5190, so they pass the same with or without a local stack.

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
| `pnpm e2e`     | 5190 | Vite for the browser tests, with no backend behind it    |
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
task's workflow, inputs, runs, scoring, checks, submissions and statement on
cards on its page. Every file a task holds is changed on the card it belongs
to, and any change is the save of the task, which publishes it or keeps it as
a draft.
The settings as they are stored are read at the foot of each Settings page,
where an admin fixes them as text when the forms cannot read them.

| Address                                                      | Page                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `/orgs`                                                      | the orgs your roles reach, and New org                                                           |
| `/orgs/new`                                                  | the new org form, then the new org                                                               |
| `/orgs/:org`                                                 | the org's display name and description, its contests, New contest, and its organisers            |
| `/orgs/:org/contests/:contest`                               | failed gradings, the latest regrades, where each task stands, New task, and the sections         |
| `/orgs/:org/contests/:contest/entrants`                      | every entrant, one person or a team, with approve, reject, undo, remove and manage               |
| `/orgs/:org/contests/:contest/gradings`                      | every grading of the contest, its queue, the latest regrades, and retry, cancel and rejudge      |
| `/orgs/:org/contests/:contest/leaderboards`                  | a card for each leaderboard, with Preview as, and the contest's hold                             |
| `/orgs/:org/contests/:contest/tasks/:task`                   | the task's state and whether its results are released, the cards that build it, and the sections |
| `/orgs/:org/contests/:contest/tasks/:task/queue`             | the rows the task has closed for, their counted submissions, and the marks to enter              |
| `/orgs/:org/contests/:contest/tasks/:task/regrades/:regrade` | one regrade: each leaderboard after it, and the values and verdicts that changed                 |

**Every organiser page lives under `/orgs`.** The proxy in `deploy` sends
exactly `/orgs` and `/orgs/...` to this app, and `/contests/...` for the
contestant pages below, so a page anywhere else loads in the dev server and
answers 404 behind the proxy. A new organiser page goes under `/orgs` or the
proxy changes first. The addresses are built in `src/lib/organiser-paths.ts`,
and a section's under its level in `src/lib/sections.ts`, the one list that
also draws each section's card, sidebar entry and crumb; the pages and the
breadcrumb share both.

The pages live in `src/features/organise/`: a sub-folder for each page
(`orgs/` holds `/orgs` and `/orgs/new`, then `org/`, `contest/`, `entrants/`,
`gradings/`, `leaderboards/`, and `task/`, which holds the
queue too), one for the formula editor a task's values and a leaderboard's
columns share (`formula/`), one for reading, previewing and saving the files the
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

Below the organisers are the invites to a role there, and the Entrants
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
to publish the same save confirmed, saying what it does (`effect`), or to
keep it as a draft; every other refusal shows its own detail and
what it names. A save that publishes says what it does in the words its
question used: whether anyone's result changes, what runs again, the scores
and what entrants read. It says whether the publication's checks still run
or it was never checked, and lists the notes the forge makes of the task
beside publishing. A write of the contest's settings lists, beside its
version, the notes its leaderboards report. Every save path ends in this one
answer (`SaveOutcome`).

The editor is CodeMirror, wrapped in `src/ui/CodeEditor.tsx`: line numbers,
undo, search and bracket matching, YAML highlighted in a `.yaml` or `.yml`
file and Markdown in a `.md`, everything else plain, in the theme's own
colours. Its label names the editing area for a screen reader. jsdom has no
layout for CodeMirror to measure, so the test setup stands a plain text field
with the same props in for it (`src/test/code-editor.tsx`), and
`CodeEditor.test.tsx` tests the editor itself.

**A task's files are changed only on its cards** (M51). A file a run takes
is uploaded in its cell on the Runs card (below) and written at
`runs/<axis>/<row>/<input>` with the task's save. A picture for the statement
is added with "Add a picture" on the Statement card, which takes only a
picture the page can show (by its ending, as the backend serves `public/`)
of at most 10 MB, refusing anything else in words, names it so no file
under `public/` has its name (`forms/picture-name.ts`) and adds the line
that shows it, `![name](public/name.png)`, at the end of the statement, for
the organiser to move. The card lists the pictures under `public/`, saying
of one the statement does not show that it is not shown, with Remove; a
picture added or removed is marked New or To be removed, with Undo, and the
preview draws an added one from its own bytes. The statement's Save writes
`statement.md` and every picture with it in one save of the task
(`POST <task>/save`), answered as any other (`forms/StatementEditor.tsx`,
`forms/statement-pictures.ts`), so a picture never publishes on its own. As
the forge serves a file only while the task's `show` lists it, a new picture
`scoring.show.now` does not cover adds `public/` there in the same save, or
the picture alone when a file under `public/` is shown only later. A
setting that is a file or a folder, such as a checker, has
its own box on the Inputs card (`task/FileSetting.tsx`): what it names, with
View, Replace and, for an optional one, Use none; a file chosen is marked New
or Replaced and waits for the task's save, which writes it under the input's
own folder, `<input>/` (`inputs/<input>/` for an older version's input named `tests`, `public` or `plans`), points the setting at it and takes out what the
setting named before in that folder (`task/input-files.ts`). A task's admins
read every file it holds with "View all files" on its Settings page, a tree
with a file chosen shown below, nothing in it editable.

A file shown to read (`files/FilePreview.tsx`) shows its first lines, with
Show all and Download; one that is not text, by its size and Download. One
that is an upload, or larger than 1 MB, is not read whole: its Download is a
link through the proxy's download door,
`/-/downloads/<org>/<contest>/<task>/versions/<version>/<path>`, at the
version a read of the file named (#444) or, for a file too big to read, at
the version the listing it was found in named, the commit that last changed
it, so the link fetches the file whose size was shown, whatever its size.
No link is made where neither names a version.

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
swaps the token under the same file open as the stored settings. Each form,
the contest's Settings, How people enter and Leaderboards and a task's title,
is over `contest.yaml` or `task.yaml`: it parses
the file with `yaml`'s `parseDocument`, writes only the nodes whose fields
changed, and saves `String(doc)` through the same write as the stored
settings, so comments, key order and every untouched key stay as they were,
and the answer is theirs. A file that is not YAML, or not a mapping, is no
form: the page says why, and where an admin fixes it as text. Times show in
the organiser's own zone and a changed one is written
back with their offset. The admin's keys (`TASK-FORMAT.md` section 1.1 and 1.2)
are shown to a manager disabled, read from the session's roles as the
organisers section reads them; the forge refuses a manager's change anyway.
The task's cards are built from its workflow's inputs, read with
`GET <task>/workflow-form` each time the page opens, after a save too, and
built only once that read is in, so a save naming another workflow reopens
on that workflow's inputs; another workflow chosen on the Workflow card turns
the other cards to its inputs at once, read from its own file. Inputs has
one entry for each, in the workflow's order, named by its title from the
workflow, with its help behind an ⓘ (M45); its key shows only for an input
the workflow gives no title. Each says who gives it. "You set it" takes a
value of its type: a number, yes or no, one of an enum's options, a file or
folder in its own box (above), or text or one of the org's secrets; a value
cleared takes the key out. "The entrant gives it" takes what entrants see of
it: a label, the options offered and the one chosen to start with, a
starting value, a number's least and most, and the most a file or folder may
hold. "One for each run" makes it a column of an axis on Runs. An input the
task has that the workflow does not is listed to remove, and the task cannot
be saved until it is. When the workflow cannot be read, the card shows why
and edits the inputs the file has, adding or removing one by its name.

Runs (`task/RunsCard.tsx`) is one table per axis, with a column for each
input given once for each run: a file cell takes an upload, a scalar cell a
value, any cell may be one the entrant gives, and a row may have a title
and, where the entrant gives part of it, a largest size. Under the tables it
says how many runs that makes, "2 × 3 = 6 runs." Scoring and Checks show once
the saved workflow can be read. Scoring (`task/ScoringCard.tsx`) reads the
catalogue of what a formula can use, `GET /blocks`, and has four parts. What
one submission gives is a table of the runs, by their rows' titles, with a
column for the verdict, `passed` and each output by its title and unit,
filled with made-up numbers to show the shape. Groups is a column of dots
for each group against the runs, `all` built in, each group saved as the
inputs' values it picks. The whole result draws every value as a flow, from
the runs through the groups to Result (`task/BoxGraph.tsx`), its wires worked
out from the formulas; a value clicked opens wide with its formula line
inside, and under the flow each part of a result, every value, every group's
runs, the compile log and the task's files, says when entrants see it: Now,
After the close, On release or Never. Then a card for each value: its name,
when it is shown, a chip saying number, text or to fix, and its formula
line. Before the save the card refuses a value named like another value, a
group, a fact or `all`, and a value that reads itself round other values,
naming the loop. Checks (`task/ChecksCard.tsx`) are made-up submissions the
save grades: the entrant's inputs, one for each run where the entrant gives
part of it, and the verdict every run gets or the values it should get. How
many submissions an entrant may send is the Submissions card, whose anchor
is still `tests`, so an old link to the tests card opens it.

The formula editor (`features/organise/formula/`) edits one value or one
leaderboard column as a line of text, told whether it is in a task or on a
leaderboard and the names it may read. Our own parser reads the text into a
tree, keeping where each part of it sits and every number exact as written,
and our own printer writes a saved tree back as text, so what is saved is
the blocks, never the text. Names show coloured by kind as they are typed;
what fits at the cursor is offered as it is typed or with Ctrl+Space; a
mistake is underlined once the line is left, so a half-typed word is never
called wrong; a refused save is underlined where its path points; and under
the line it says what the formula means in words. The tiles under it, one
for each name and block in scope, put a piece at the cursor of the line last
written in.

A choice of a few options said in sentences, such as who sees a leaderboard
or when a task opens, is radio options, each with
what it means under it and a greyed one with why (`ui/RadioGroup.tsx`,
M46). A form save refused
as a `conflict` reads the file again and shows the organiser's version and the
current one field by field, with a choice per field that starts on the side
that changed it; nothing is written until they save, which writes the chosen fields
into the current file with its token (`forms/merge.ts`, over any YAML
document). A keyed list (`contest.yaml`'s `tasks` by `id`, a workflow's
`steps` by `id`, a table in `merge.ts`) is compared item by item, each item matched and
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

Under the task's title its page says where its results stand
(`task/ResultsControls.tsx`): "Results are released." or not, and who
released or took them back, and when. A manager's Release results, or Take
back once they are released, asks first, in the words the backend gives. Beside it the task's chip says where its latest
publication's checks stand, Checking, Refused or Never checked, and a
refused one lists each failing check with its runs. The live stream's
`checks` nudge reads the task again when a save's checks end; the page does
not poll for them.

A task's Queue (`task/QueuePage.tsx`) is one block for each entrant row the
task has closed for, with when it closed: each counted submission, with the
leaderboard and column that counted it, and a box for each mark the task
leaves to staff, by its value's name. A manager's mark is sent once the box
is left or Enter is pressed, as the exact digits typed, and says when it was
saved; an empty box clears it, and a refusal is said under the box. An
observer reads each mark, "–" for one not entered. "Open the submission"
shows its files, each a download, and its result as staff read it (below).
"Unmarked only" and a choice of leaderboard cut the list.

The contest page lists its tasks in the contest's order, each by its letter
and name, with where it stands (`GET <contest>/organise/tasks`): its latest
publication, when it was made and whether it changed how the task grades, or
that it has never published; a draft on top of it with the draft's errors at
their YAML paths; and its timeline from `contest.yaml`, released, due and
closes, each at its default where the entry gives none, as the route
resolves them, and how many submissions an entrant may mark where a
leaderboard counts only marked ones. The list is read
again on every visit, since a save on a task's page moves its state, and
whenever one of the contest's files is written on the page, since
`contest.yaml` holds the times. A `contest.yaml` that does not pass
validation, which the route refuses as `invalid_definition`, shows each of its
errors at its YAML path and leaves the tasks by name alone.

Above the tasks, while any wait, the contest page says how many gradings
failed on Unicon's side (`failed` from `GET <contest>/gradings/queue`), that
Unicon tries each once again by itself and then waits for staff, and links
to Gradings filtered to them, `?status=system_error&latest=true`. Under
that, on the contest page and on Gradings, is the latest regrade of each task
in a line (`gradings/RegradeSummaries.tsx`, #448), until a newer one or a
manager of the task's Dismiss: "Regrade of A: 120 graded · 2 failed on
Unicon’s side", each count a link to Gradings read by that regrade, and
"graded" one only while it is every submission the regrade took; what
started it, by whom and when; whether it still runs; and
"What it changed", its own page (`gradings/RegradePage.tsx`). That page draws
each leaderboard that reads the task after the regrade, each row "moved from
3 to 1" or "stayed at 2", each changed cell old → new, marked "regrading" or
"waiting" where it is; it says how many still run and how many cannot be
compared; with no leaderboard it lists the values each submission changed,
and beside either the verdicts that changed, by run, past 20 runs and 100
submissions as a count.

The contest's Leaderboards page (`leaderboards/`) is one card for each
leaderboard, a form over `contest.yaml` (`leaderboards/LeaderboardsForm.tsx`): its
key, which other leaderboards' formulas read it by, and its title; who sees
it, Staff, Entrants or Everyone, and which rows, every row, each entrant's
own row (not for everyone) or the top rows; its columns, each a name and a
formula on a leaderboard, which reads the contest's tasks, its other
leaderboards and this one's columns; Sort, the columns that order its rows
in turn, each highest or lowest first; Display, which columns show, a number
with its decimals, a text column as given; and Preview as, the saved
leaderboard as one chosen entrant would see it. Under the cards is the hold:
off, or from a time, which "An hour before the end" fills, until a time or
until staff end it. Before the save the page refuses what the forge would (a
key that is a task's, a sort on a text column or a column not displayed, a
hold that starts in the past), and a refused save is said on the field it
names, a formula's underlined where its path points. Only a manager of the
contest changes them. The Leaderboards card on the contest's page says where
the hold stands, from when until when and who ended it, with "End the hold
now" for a contest manager, asked first and not undone.

The contest's Gradings page (`gradings/`) lists every grading of its tasks
newest first, each submission once by its task, who made it and its number,
never by when it was made, headed by its highest attempt, with its earlier
attempts opening below it: the attempt, the publication it graded against,
whether Unicon made it by itself after the attempt before it failed, the
status with the reason a system error gave and the sentence a cancel told
the contestant, which earlier attempt's result stands while it has none
(`last_good`), what a finished run came to, and when it was queued, started
and finished.
A submission's Scored view opens under it the submission as its row reads it
with everything filled in (`GET <task>/organise/submissions/{number}`, the
row by its `entrant`): the files it was made with, each a download
(`staff-read.tsx`), and its result, drawn by the same
`ui/scored/ScoredResult` the entrant's page draws it with, with every value
and run there, each value saying when its entrant sees it, a dropped run
marked, and the facts; and the grading's own status, naming the attempt
whose result it is when that is an earlier one than the row's. Read by a
regrade (`?regrade=`), the page lists each submission that regrade graded,
its attempt before the regrade and after it, filtered by "What the regrade
did". Above it are how many gradings wait, queued,
waiting for a machine, and failed, whether or not Unicon has tried them again
yet, with a link to the failed ones unless the feed already shows them, and filters by task, status, latest attempts only, team and a
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

The Entrants page (`entrants/EntrantsPage.tsx`) lists every entrant of a
contest, one person or a team, for anyone who observes it: its members, the
way each came in, with the sign-up's name when it has one, where its
registration stands and its extension, filtered by status, kept in the
address. A manager approves, rejects, undoes a rejection, removes, and under
Manage extends an entrant's time and, in a contest of teams, moves a member
to another entrant or takes one out; each asks first where it changes who
reaches the entrant's work, and the routes check it again underneath. A
refusal shows where it happened, and one that shows the list was behind
reads it again; nothing pushes a change of entrant, so the list is read again
every half minute. The old `/contestants` and `/teams` addresses lead here.

## Workflows

A workflow is a person's or an org's, so its pages have addresses of their
own, which the proxy sends here beside `/orgs`.

| Address                              | Page                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `/workflows`                         | every workflow you may read, those you may change first; New workflow                    |
| `/workflows/:owner/:name`            | for one you may edit, the editor over its draft; otherwise its latest version, read-only |
| `/workflows/:owner/:name?version=v1` | that version, read-only, with Copy into a new workflow                                   |

There is one way to make a workflow, New workflow: from the starter (compile,
run on the run's input, compare with the run's answer) or as a copy of any
version one can read, under oneself or an org one manages; a version's "Copy
into a new workflow" opens the same dialog with that version chosen. A
workflow is not combined from others: it uses another as a box (below).

**The editor is the only place a workflow is edited** (PROPOSAL.md section
12, #377). `features/organise/workflows/` holds it. `model.ts` reads
`workflow.yaml` into its inputs, its steps and its outputs, forgiving a draft
with problems. A version is drawn only once the forge's check of its file
passes: one the forge refuses to serve, one that does not parse, and one the
check refuses, as it refuses the format before 2026-10-07, open one state,
"This version cannot be opened", with the forge's reason. `layout.ts` works out where everything stands
from the file alone, and nothing of it is stored: a step one column right
of the furthest step it reads, the outputs last; inputs grouped by exactly
the steps that read them, text with one written in counting, just before the
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

A step whose `use:` names a workflow at a version is a box (`boxes.ts`),
drawn as one node with that workflow's inputs as its ports in and its outputs
as its ports out, from `GET /workflows/{owner}/{name}/versions/{version}/box`,
so the page never parses an inner workflow's file. Its Open shows the
workflow it uses at that version as a graph of its own, read-only
(`Inside.tsx`); a box inside it opens the same way, and the line of buttons
above that graph names where you are, each going back to its level. A
problem whose step path runs into a box opens the innermost one. A box says
"A newer version is v3" when its workflow has one; moving to it is an edit
of its `use:`. A task's grading never sees a box: the forge flattens the
boxes into their steps when it checks and saves.

Each box says what it is in words (`words.ts`, M31): a step its name, its
primitive's title and what it does (#436), its reference small; a port its type and what it does that the author acts on
("runs this as a program", "sets the time limit", "(optional)"); a wire skipping
columns its source ("time_ms from run"). What the author never acts on, a
primitive taking a batch, its outcome and a port that keeps a secret, is
under Details in the step's drawer.

`rules.ts` refuses at the drag whatever a version would refuse that the
primitives' declarations decide, in the forge's own words: the type under
the two widenings, an enum's options, an optional output into a required
port, a step output into a port a limit is raised from, and a loop. A refused drop marks the port with ✕ and says why
over its box's title, covering no port, until the next press, Escape or
wire, or five seconds, fading as it goes (`notice.ts`, M53). Every port's
name is a button whose menu does what a drag does, each wire it could take
listed and one it may not shown with the reason, so the keyboard reaches
everything. A drag starts at an output and ends at an input. A change on a
panel that would newly break a wire, a value or an output, such as a
version whose port no longer takes what it is given, is refused there with
the same reason, and so is a step's output named as an output it cannot be. `edit.ts` makes every change as an edit of the YAML document in
place, so comments and key order survive; a wire to a step listed later
moves the fewest steps to keep every step after what it reads. Undo and redo
step through the page's own history.

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
reference, then every version of each workflow the person can read but this
one, to add as a box), Inputs and Outputs; then the
problems; then the graph across the page's whole width. The box selected
opens in a drawer from the right (`Drawer.tsx`), over the graph, which
scrolls the box clear of it; × or Escape closes it. A step's drawer holds
its name, its version, What it takes, a value for each port without a wire
with the port's description, What it gives, and Details. The outputs'
drawer lists each output with the step output it reads, a title and, for a
number, a unit, and adds one from what the steps give. The inputs' drawer offers each declaration only the keys
the format allows it and the title and help the task's form names it by
(#434), and a unit for a number alone, dropped when the type changes away
(M54); an older input of another type with a unit shows it only to clear.

A moment after each change the definition goes to `POST /workflows/check`
(a check that did not run says so, never that it passed), and each problem
is pinned by its YAML path to the step, port, input or output it names, its message beside its mark, and listed in the banner above the
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
list. A wire the layout cannot draw is shown on its port as text, and a
step with no id keeps its place.

A task whose workflow has a version with a larger number than the one it
names says so on its Workflow card, "v3 available", with "Use v3", which
chooses it; nothing changes until the task is saved.

## The contestant pages

| Address                                | Page                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                    | the public contests for a visitor; your contests once signed in                                                                                   |
| `/contests/:org/:contest`              | a contest's dates, countdown, registration, your team, released tasks with your points, and your row on each leaderboard                          |
| `/contests/:org/:contest/leaderboards` | the leaderboards as you are shown them; a visitor reads the public ones                                                                           |
| `/contests/:org/:contest/questions`    | your questions to the organisers, and the form to ask one                                                                                         |
| `/contests/:org/:contest/tasks/:task`  | a released task's statement; signed in, its times and caps, the submit panel and your submissions, with your marks when a leaderboard counts them |
| `/invites`                             | your invites, with Accept and Decline; an invite mail links here                                                                                  |

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
the task's caps, the most submissions in all and how often. Each task also
shows the person's points on it from their own rows, one for each
leaderboard that counted it: the cell's number over the most its column can
show, "62 / 100", or the number alone when the column has no most
(`src/ui/leaderboards/points.ts`). A Leaderboards card under the tasks holds
the person's own row of each leaderboard they can read; a visitor's card has
"See the leaderboards" instead. Every
refusal code has its own sentence in `src/api/describe-error.ts`. A statement
is Markdown, rendered by `src/ui/Markdown.tsx` with raw HTML dropped, links
out of the site opened apart, a picture saved with the task under `public/`
drawn and any other image shown as a link, and headings one level down. The addresses are built in `src/lib/contest-paths.ts`.

The Leaderboards page (`features/contest/leaderboards/`) shows every
leaderboard the person can read, a visitor the public ones, each drawn by
`src/ui/leaderboards/table.tsx`, as the home's card is. A row has its place,
shared by ties, its entrant and a cell for each column. When the order sorts
by a column the reader is not shown, no row has a place and the leaderboard
says "The order is partial." A column's header says "Self-reported" when it
reads a column an entrant could set, and staff also read its bounds, "at
least 0, at most 100". A cell shows its value as every page does
(`src/ui/number/ShownValue.tsx`): a number to the column's decimals,
its exact digits on hover, a text on one line, and "–" when it is missing or
hidden. On the reader's own row, and on every row for staff, a cell links
the submissions it counted, and "Submission 4, being checked" for one it
left out while it waits. A row says "3 held" and "1 grading" of the
submissions not in it yet, and a leaderboard on hold says "Held from …".

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

### Your entry

A contest's page holds the person's entry (`entry/YourEntry.tsx`):
registering, with a name in a contest of teams, which the team goes by, and
the code only when a code is their way in; then where the registration
stands. In a contest of teams it shows the team, its members and how each
came in, with the sign-up's name when it has one (M42), the invites
waiting, and inviting, renaming and leaving until the team is fixed, and
the invitations the person holds into other teams. The team's name has Edit
beside it while the team can still change, which turns it into a box with
Save and Cancel in place (M41). A team's name is checked once trimmed, at
most 60 characters, and a username field takes at most 40, Forgejo's limit.

Once in a team, a person's submissions, the caps they count against, their
extra time and their questions are the team's, and every member sees all of
them on the existing pages. Every change of entry reads the contest's reads
again, so the submissions and questions shown follow the team. Nothing
pushes a change of entry, so the page reads it again every ten seconds
while the person waits on an organiser or an invite, and every minute
otherwise. A refusal is said in words until it is dismissed, and one that
shows the page was behind reads it again.

### Submitting

The submit panel on the task page is built from the task's contestant
inputs, which the task page's answer carries, each by its label: a drop zone
for a `file` input, a field for each `text`, `number` and `boolean` input,
starting at its default, and a choice of an `enum` input's options, starting
at its default. An enum with one option has nothing to choose, so the panel
says which in a line, such as `language: python`, and sends it. A `folder`
input takes several files and offers a second picker that chooses a whole
folder, whose files keep their paths inside it, its own name left off. A
`file` input given once for each row of a runs table has a drop zone for
each part instead, named by the row's title or "Part 1", "Part 2", each with
its own "At most …"; at least one part needs a file, and a part left empty
makes its runs skipped. A file chosen alone goes by its name, and the server
says which names it does not take.
The panel shows only while the task is open; the list below it shows either
way.

A drop zone is the browser's own file input, hidden inside the zone that
shows it, so Tab reaches it, Enter or Space opens the picker, and a screen
reader names it by the input's label, and the folder picker as
`<label>: a folder`.

Submit runs in this order, in `src/features/contest/submit/use-submit.ts`:

1. The browser's own checks: every input filled, an option chosen, a number
   written as plain decimal digits and in range, its bounds compared digit
   for digit, the files of each input together against its `max_size`, and
   each part's file against its own.
   A number is sent as the digits it was typed as, never a JSON number.
   A file too large is caught here, before any upload starts.
2. For each file, its SHA-256 read in the browser, a slot
   (`POST .../uploads`) naming the input, its part when it has parts, the
   file's path under it, its
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
a part's own ("This part may be at most 1 MB."), and each problem with the
input it is about. Whatever stage it came at, the progress
goes and the files stay in the panel, ready to send again.

Below the panel are the contestant's own submissions, newest first, as
Submission, Submitted and Result, with a Mark column when a leaderboard of
the contest counts the submissions an entrant marks on the task: a tick on
each until the task closes for the row, under "Marked 2 of 3. The
leaderboards that count marks count the best of those you mark, and you may
change them until …", then "Your marks are final". While the live
stream is open (below) a nudge says when a grading moves, and the list is
read again then and once a minute besides. While it is not, the list is read
by how long the newest grading still to finish has waited: every two seconds
for its first half minute, every five to two minutes, every fifteen after,
and every minute when nothing is being graded. The Result is the
submission's state as a badge, by the attempt that counts: `queued`,
`grading`, `graded`, `submitted` (graded, its results after the contest),
`delayed`, `over_limit` or `cancelled`. A submission keeps its result while
it is graded again, whatever the new attempt comes to (#442).
One with no result whose grading failed on the platform's side is
`delayed`: it reads `GRADING DELAYED` with "A problem on Unicon's side.
Nothing is lost, and it does not use up a submission.", and is followed as
one being graded is, since Unicon tries it again by itself. One staff end
reads `CANCELLED` with the sentence they gave, and is read again only as
often as a list with nothing grading is. One past the task's limit reads
`OVER THE LIMIT` with "Not graded: you had reached the limit of 3
submissions for this task."
`src/ui/verdicts.ts` has a label for every outcome and state, and
`src/ui/VerdictBadge.tsx` puts each in one of the handoff's six colour pairs; an outcome it does not know
shows under its own name in the neutral one.

`?submission=<n>` opens one submission above the list
(`SubmissionDetail.tsx`): when it was made, the files and values it was made
with, and its result, with "Graded again" beside the badge when a later
attempt counts. The result (`src/ui/scored/ScoredResult.tsx`, which the
organiser's gradings and queue show too) holds the values the entrant is shown, each
by its name, "being checked" while one waits on a check; then the runs by
group, each "Test 1", "Test 2" with its row titles joined by " · ", its
verdict, "Dropped" when the scoring drops it, the numbers it reported by
output name, and its texts, Label and Message, each read only when its
button opens it; then what the steps done once reported, such as a compile
log. The route leaves out what the task withholds, and the page puts nothing
in its place. A submission whose results come after the contest reads
"Submitted, results after the contest" and "Results at 14:00", and is read
again at that time and on a release.

An open submission lists the files it was made with, each a download
through the proxy's download door, `/-/downloads/...`, which streams the
file from the forge.

## Announcements, questions and live updates

A contest's home shows its open announcements and those of every task
released to the contestant, each task's named, and a task's page shows its
own. An approved contestant also gets the questions page, with a form to ask
the organisers a question, optionally about one task, which a task's page
links to as "Ask a question about this task", and their own questions, each in its
own box with every message under it and Follow up folded until asked for;
following up on an answered one opens it again. A public answer's message
on the question links to its announcement, or says the organisers have
since closed it, since the contest home lists only open ones. In a team
the questions are the team's, marked as the team's on both sides. The
organiser's contest and task pages have an announcements card with a
composer, Edit and Close, and no delete; the contest page lists its
questions, and the org page links to the inbox, `/orgs/<org>/clarifications`,
every question still open across the org with Reply, which opens one form
to answer only the asker or every entrant as an announcement, Mark it
answered and Reopen. Each form sends once at a time, until the list has
been read again, so a second click never posts twice. The parts both
sides show are in `src/ui/threads/`; the contestant's pages are in
`features/contest/threads/` and the organiser's in
`features/organise/threads/`, since a feature does not import another.

`src/live/` keeps one Server-Sent Events stream, `/api/v1/live`, per
signed-in tab, open while the tab is in front, since a browser holds few
connections to one host and a stream in every background tab would use
them up. Each event names a kind of thing that changed and its id, never
what changed. The events of a moment are gathered, and each kind marks
stale the reads whose route shows it: a grading the submissions and
gradings lists, a contest's queue, a submission, but not its files, the
regrades under way, and the contest home, whose tasks carry the entrant's
points; an announcement every announcements list; a clarification the
questions and the inbox; `checks`, a save's checks ended, the task and its
publications; `results`, a release or a take-back, the submissions and the
contest home, whose shown values change with no grading moving.
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
  lib/       server clock, the organiser and contest addresses and
             sections, the route params, scope names, sizes, exact numbers,
             who the viewer is to a contest, the full-page way out to
             Forgejo
  session/   who is signed in: the boot query, the guard, sign-out, where Forgejo is, the
             expired-session modal. Not a feature, because the shell, the
             router and three features all read it
  live/      the live stream and whether it is open
  theme/     the design handoff's tokens, the fonts, the CSS variables
  ui/        shell (header, sidebar, breadcrumb, account menu), feedback, brand,
             the wrappers: buttons, fields, the file drop zone, verdicts, and
             what both sides show: announcements and questions (threads/),
             how a value or a cell is shown (number/), a leaderboard
             (leaderboards/) and a grading's result (scored/)
  features/  home (landing, the contest lists, your invites), auth (login page), account
             (profile, sessions), contest (the contestant pages, with submit/
             for the submit panel and the submissions), organise (the
             organiser pages, with formula/ for the formula editor, leaderboards/
             for the leaderboards and workflows/ for the workflow editor)
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
