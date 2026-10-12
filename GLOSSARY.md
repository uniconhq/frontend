# Words

The words Unicon uses on screen, one word per idea. Use these and no others;
when a page needs a word that is not here, add it here first, and check a
change against this list in review.

Nothing on screen names a file, a format key or how something is stored
(`task.yaml`, "the id", "declares", "pins", "form details", "mapping"): say what
the person is doing and what happens. Two places are the exception. "View
file" shows a contest's or a task's stored settings, read-only, for checking.
The workflow editor shows what a workflow's author must type: a port's name, a
reference such as `${{ inputs.language }}`, and `fold` and `better`. And where
files are added to a task, the folders and files people make for it are named
as they make them: `public/` for a statement's pictures, and a test's own
`test.yaml` in a zip of tests.

## Places and people

| Word                                                    | Means                                                                                                          | Not                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **org**                                                 | an organisation that runs contests                                                                             | organization, team (for an org)                         |
| **contest**                                             | a set of tasks people enter together, with a start and an end                                                  | competition, event, round                               |
| **task**                                                | one problem in a contest                                                                                       | problem, question, exercise                             |
| **organiser**                                           | someone with a role at an org, a contest or a task                                                             | staff, admin (as a general word)                        |
| **admin, manager, observer**                            | the three organiser roles                                                                                      | owner, editor, viewer                                   |
| **Org organisers, Contest organisers, Task organisers** | the list of organisers at each level, named for it                                                             | Organisers (alone, as a section's name)                 |
| **entrant**                                             | who enters a contest: one person, or a team of several                                                         | contestant, participant, row                            |
| **team**                                                | an entrant of more than one person; used on entrants' pages of a contest whose entrants may hold more than one | group (for people)                                      |
| **member**                                              | a person in an entrant                                                                                         |                                                         |
| **register, registration**                              | entering a contest, and where that stands: waiting for approval, approved, not accepted, withdrawn, removed    | sign up (except for a sign-up way in), join (a contest) |
| **fixed (a team)**                                      | a team whose members only organisers can change any more, from the contest's start or its first submission     | locked, frozen                                          |
| **invite**                                              | an offer an organiser or a member sends, which the person accepts or declines                                  | invitation, request                                     |
| **expires, expired (an invite)**                        | an invite running out after its days, unanswered                                                               | lapses, lapsed                                          |
| **way in**                                              | one of a contest's ways people may register by: an invite, or a sign-up                                        | eligibility, rule                                       |

## Building a task

| Word            | Means                                                                        | Not                                                            |
| --------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **workflow**    | the steps that grade a submission, which a task chooses                      | pipeline, grader, checker (for the whole)                      |
| **step**        | one stage of a workflow, which runs a primitive                              | node, job                                                      |
| **primitive**   | a ready-made program a step runs, such as Compile or Run program             | component, action                                              |
| **input**       | a setting a workflow asks of the task, or of the entrant                     | parameter, option, field (for these)                           |
| **test**        | one case a submission is graded on                                           | test case, sample (unless it is a sample group)                |
| **test group**  | tests scored together under one rule                                         | subtask, group alone (except where "test group" was just said) |
| **statement**   | the text entrants read about a task                                          | description, problem text                                      |
| **publication** | a saved version of a task that grades; every save without problems publishes | release, version (for a task), deploy                          |
| **draft**       | a save kept without publishing, because it has problems or was held back     | kept back                                                      |
| **upload**      | a file put into a task from the organiser's computer, with Upload and save   |                                                                |

## Running a contest

| Word                             | Means                                                                      | Not                                                       |
| -------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| **submission**                   | what an entrant sends for a task                                           | attempt (unless counting tries), solution (as a record)   |
| **grading**                      | one run of a workflow on a submission                                      | judging, evaluation, run (on screen)                      |
| **rejudge**                      | grade every submission of a task again against its current publication     | regrade (as a button)                                     |
| **result**                       | what a grading found                                                       | verdict (except the pass/fail word itself)                |
| **points**                       | what a submission earned on a task                                         | score (except a value a workflow reports for a test)      |
| **worth**                        | the most points a task gives in a contest                                  | max score, weight                                         |
| **leaderboard**                  | a ranking of entrants a contest shows, on every page, organisers' included | board (alone), standings (except as a leaderboard's name) |
| **announcement**                 | a message organisers post to everyone in a contest or task                 | notice, broadcast                                         |
| **question**                     | something an entrant asks the organisers; organisers answer it             | clarification (on screen)                                 |
| **extra time**                   | more time given to an entrant on some tasks                                | extension (on screen)                                     |
| **open (a contest)**             | let entrants see and register for it; it is then **live**                  | publish (for a contest)                                   |
| **Draft, Live, Ended, Archived** | where a contest stands, in one word                                        | Published, Running, Finished (as its state)               |
| **Unicon's clock**               | the time every deadline and countdown follows                              | server time                                               |

## How to write

- Full sentences or clear labels. No clipped "Empty: X" shorthand: say "Uses the workflow's default when left empty", or put the default in the placeholder.
- Say what happens: "Saving publishes this task", "Entrants will see this at once".
- Buttons are verbs on their object: "Open the contest", "Add a test", "Save".
- Say who may do something as "can": "Only an admin of the contest can change these", not "changes these".
- A refusal says what is wrong and what to do: "That code is not right. Check it with the organisers."
- Settings that cannot be read "cannot be read", and are fixed; nothing "does not read" or is "mended".
- Spell words out: "RUNTIME ERROR", not "RUNTIME ERR".
