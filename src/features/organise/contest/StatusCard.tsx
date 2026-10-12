import type { ApiError } from '@/api/problem';
import { useState, type ReactNode } from 'react';
import { $api, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Modal } from '@/ui/Modal';
import { PageLink } from '@/ui/PageLink';
import { RadioGroup } from '@/ui/RadioGroup';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { useMe } from '@/session';
import { STANDING_WORD, standingOf, type ContestStanding } from '@/lib/contest-state';
import { contestPath, taskPath } from '@/lib/organiser-paths';
import { contestSectionPath, taskCardPath } from '@/lib/sections';
import { formatDateTime, serverNow } from '@/lib/time';
import { DefinitionErrors } from '../DefinitionErrors';
import type { Outcome } from '../files/SaveOutcome';
import { definitionErrorsOf } from '../files/refusals';
import type { ContestValues } from '../forms/contest-values';
import { isoOf } from '../forms/times';
import { DEFAULT_WAYS, registrationSentence } from '../forms/ways';
import { writeAt } from '../forms/yaml-doc';
import { holdsAt } from '../roles';
import { FieldBox } from './ContestFile';
import { contestPlaceOf, useOpenedField } from './opened';
import { useContestChange } from './save';
import { useContestSettings } from './settings';
import { VISIBILITY_CHOICES, visibilitySentence } from './words';
import shared from '../organise.module.css';
import classes from './contest.module.css';

const STANDINGS = '/api/v1/orgs/{org}/contests/{contest}/organise/tasks';

/** A time the form holds, as a date and time, or that it is not set. */
function when(local: string): string {
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? 'at a time not set yet' : formatDateTime(at);
}

/** The contest's dates as the standing reads them, from the form's local times. */
function dated(values: ContestValues) {
  const state =
    values.state === 'published' || values.state === 'archived'
      ? values.state
      : 'draft';
  return {
    state,
    start: isoOf(values.start) ?? '',
    end: isoOf(values.end) ?? '',
  } as const;
}

/** The one sentence under the contest's state. */
function standingSentence(
  standing: ContestStanding,
  values: ContestValues,
  now: Date,
): string {
  switch (standing) {
    case 'draft':
      return 'Only its organisers can see it.';
    case 'live':
      return now.getTime() < Date.parse(values.start)
        ? `${visibilitySentence(values.visibility)} It starts ${when(values.start)}.`
        : `${visibilitySentence(values.visibility)} It is live, and ends ${when(values.end)}.`;
    case 'finished':
      return `It ended ${when(values.end)}. Archive it once nothing more needs doing.`;
    case 'archived':
      return 'Its tasks can still be read, and they take no submissions.';
  }
}

type Check = {
  key: string;
  ok: boolean;
  /** Only a warning: opening goes ahead without it. */
  warning?: boolean;
  text: string;
  to: string;
};

/**
 * How a task stands for opening the contest: published without errors, with
 * a statement written, or what stops it. A published statement that is blank
 * or still the one a new task starts with stops it too (M57), and its line
 * goes to the task's Statement card.
 */
function taskCheck(org: string, contest: string, standing: TaskStanding): Check {
  const { latest, draft, errors, statement_written } = standing.state;
  const name = `${standing.label} · ${standing.task.name}`;
  const to = taskPath(org, contest, standing.task.name);
  if (draft && errors.length > 0) {
    return { key: name, ok: false, text: `${name}: its last save has problems`, to };
  }
  if (latest === null)
    return { key: name, ok: false, text: `${name}: not published yet`, to };
  if (!statement_written) {
    return {
      key: name,
      ok: false,
      text: `${name}: statement not written yet`,
      to: taskCardPath(org, contest, standing.task.name, 'statement'),
    };
  }
  return { key: name, ok: true, text: `${name}: published`, to };
}

/**
 * What opening the contest needs, each item linking to where it is fixed. A
 * withdrawn task is not counted (#450): entrants never see it, so it needs
 * nothing to open.
 */
function checksOf(
  org: string,
  contest: string,
  values: ContestValues,
  listed: TaskStanding[],
): Check[] {
  const tasks = listed.filter((task) => !task.withdrawn);
  const settings = contestSectionPath(org, contest, 'settings');
  const timed =
    values.name.trim() !== '' &&
    values.start !== '' &&
    values.end !== '' &&
    Date.parse(values.end) > Date.parse(values.start);
  const ways = values.ways ?? DEFAULT_WAYS;
  return [
    {
      key: 'times',
      ok: timed,
      text: timed
        ? 'Name and times set'
        : 'Give it a name, a start and an end after it',
      to: `${settings}?field=start`,
    },
    {
      key: 'tasks',
      ok: tasks.length > 0,
      text: tasks.length > 0 ? 'At least one task' : 'Add a task',
      to: `${contestPath(org, contest)}?part=tasks`,
    },
    ...tasks.map((task) => taskCheck(org, contest, task)),
    {
      key: 'entry',
      ok: ways.length > 0,
      text: registrationSentence(values),
      to: contestSectionPath(org, contest, 'entry'),
    },
    {
      key: 'boards',
      ok: values.boards.length > 0,
      warning: true,
      text:
        values.boards.length > 0
          ? 'A leaderboard'
          : 'No leaderboard yet, so nobody sees a ranking. The contest can open without one.',
      to: contestSectionPath(org, contest, 'boards'),
    },
  ];
}

function Mark({ check }: { check: Check }) {
  if (check.ok) return <span aria-label="Done">✓</span>;
  return check.warning === true ? (
    <span aria-label="Worth doing">!</span>
  ) : (
    <span aria-label="To do">✗</span>
  );
}

/** What opening the contest will do, said before it is done. */
function openingSentences(values: ContestValues, now: Date): string[] {
  const ways = values.ways ?? DEFAULT_WAYS;
  const registration =
    ways.length === 0
      ? 'Nobody can register, since it has no way in.'
      : values.opens !== '' && Date.parse(values.opens) > now.getTime()
        ? `Registration opens ${when(values.opens)}.`
        : 'Registration opens now.';
  const starts =
    Date.parse(values.start) > now.getTime()
      ? `It starts ${when(values.start)}.`
      : `It has started already, and runs until ${when(values.end)}.`;
  return [visibilitySentence(values.visibility), registration, starts];
}

type Ask = 'open' | 'draft' | 'archive' | 'visibility' | null;

/**
 * A refusal about this card's own settings, where it stands and who sees it
 * (#438: a contest that has started never goes back to draft), as its
 * sentences alone, here where the button was; null for any other refusal,
 * which says where each problem is.
 */
function ownRefusals(error: ApiError) {
  const errors = definitionErrorsOf(error);
  if (errors.length === 0) return null;
  if (!errors.every((each) => each.path === 'state' || each.path === 'visibility'))
    return null;
  return (
    <>
      {errors.map((each) => (
        <BodyText key={each.message}>{each.message}</BodyText>
      ))}
    </>
  );
}

/**
 * Where the contest stands, at the top of its page: one word and a sentence,
 * who sees it, and while it is a draft what opening it needs, each item a
 * link to where it is fixed. An admin opens it with one button, once every
 * item it needs holds, after a confirmation that says what will happen;
 * takes it back to draft until it starts; archives it once it has ended;
 * and changes who sees it. A refusal says why, the forge's own sentence
 * included, such as a contest that started in the meantime.
 */
export function StatusCard({ org, contest }: { org: string; contest: string }) {
  const settings = useContestSettings(org, contest);
  const tasks = queryView(
    $api.useQuery(
      'get',
      STANDINGS,
      { params: { path: { org, contest } } },
      { staleTime: 0 },
    ),
  );
  const admin = holdsAt(useMe().roles, { kind: 'contest', org, contest }, 'admin');
  const { apply, pending } = useContestChange(org, contest);
  const [asking, setAsking] = useState<Ask>(null);
  const [refused, setRefused] = useState<Outcome | null>(null);
  const [visibility, setVisibility] = useState('');
  const { field } = useOpenedField(settings.state === 'ready');

  const run = async (change: Parameters<typeof apply>[0]) => {
    setRefused(null);
    const outcome = await apply(change);
    setAsking(null);
    if (outcome.kind === 'refused') setRefused(outcome);
  };

  return (
    <section
      className={classes.status}
      aria-label="Status"
      data-field={field === 'state' ? 'state' : undefined}
    >
      <Loaded view={settings} compact>
        {(values) => {
          if (values === null) {
            return <BodyText>The contest’s settings cannot be read.</BodyText>;
          }
          const now = serverNow();
          const standing = standingOf(dated(values), now);
          const checks =
            tasks.state === 'ready' ? checksOf(org, contest, values, tasks.data) : [];
          const blocked = checks.some((check) => !check.ok && check.warning !== true);
          const started = Date.parse(values.start) <= now.getTime();
          const actions: ReactNode[] = [];
          if (admin && standing === 'draft') {
            actions.push(
              <FieldBox key="open" name="state">
                <Button
                  disabled={blocked || tasks.state !== 'ready'}
                  loading={pending && asking === null}
                  onClick={() => setAsking('open')}
                >
                  Open the contest
                </Button>
              </FieldBox>,
            );
          }
          if (admin && standing === 'live' && !started) {
            actions.push(
              <FieldBox key="draft" name="state">
                <Button variant="secondary" onClick={() => setAsking('draft')}>
                  Back to draft
                </Button>
              </FieldBox>,
            );
          }
          if (admin && standing === 'finished') {
            actions.push(
              <FieldBox key="archive" name="state">
                <Button variant="secondary" onClick={() => setAsking('archive')}>
                  Archive
                </Button>
              </FieldBox>,
            );
          }
          return (
            <>
              <div className={classes.statusHead}>
                <Chip
                  tone={
                    standing === 'live'
                      ? 'live'
                      : standing === 'draft'
                        ? 'warn'
                        : 'quiet'
                  }
                >
                  {STANDING_WORD[standing]}
                </Chip>
                <BodyText>{standingSentence(standing, values, now)}</BodyText>
              </div>
              <div className={classes.statusHead}>
                <BodyText tone="secondary">
                  Who sees it:{' '}
                  {VISIBILITY_CHOICES.find((one) => one.value === values.visibility)
                    ?.label ?? 'Not set'}
                </BodyText>
                {admin && (
                  <FieldBox name="visibility">
                    <Button
                      size="xs"
                      variant="secondary"
                      label="Change who sees it"
                      onClick={() => {
                        setVisibility(values.visibility);
                        setAsking('visibility');
                      }}
                    >
                      Change
                    </Button>
                  </FieldBox>
                )}
              </div>
              {standing === 'draft' && (
                <Loaded view={tasks} compact>
                  {() => (
                    <ul className={classes.checklist} aria-label="Before it opens">
                      {checks.map((check) => (
                        <li key={check.key}>
                          <Mark check={check} />
                          <PageLink to={check.to}>{check.text}</PageLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </Loaded>
              )}
              {standing === 'live' && started && (
                <BodyText tone="secondary">
                  It has started, so it can no longer go back to draft. Its end can
                  still be moved in Settings.
                </BodyText>
              )}
              {!admin && standing === 'draft' && (
                <BodyText tone="secondary">
                  Only an admin of the contest can open it.
                </BodyText>
              )}
              {actions.length > 0 && <div className={shared.actions}>{actions}</div>}
              {refused?.kind === 'refused' && (
                <div className={shared.panel} role="alert">
                  {ownRefusals(refused.error) ?? (
                    <>
                      <ErrorBlock error={refused.error} compact />
                      <DefinitionErrors
                        errors={definitionErrorsOf(refused.error)}
                        placeOf={contestPlaceOf(org, contest)}
                      />
                    </>
                  )}
                </div>
              )}
              <Modal
                opened={asking === 'open'}
                onClose={() => setAsking(null)}
                title="Open the contest?"
              >
                <div className={shared.stack}>
                  {openingSentences(values, now).map((sentence) => (
                    <BodyText key={sentence}>{sentence}</BodyText>
                  ))}
                  <div className={shared.actions}>
                    <Button
                      loading={pending}
                      onClick={() =>
                        void run((doc) => writeAt(doc, ['state'], 'published'))
                      }
                    >
                      Open the contest
                    </Button>
                    <Button variant="secondary" onClick={() => setAsking(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Modal>
              <Modal
                opened={asking === 'draft'}
                onClose={() => setAsking(null)}
                title="Put the contest back to draft?"
              >
                <div className={shared.stack}>
                  <BodyText>
                    Only its organisers see it until it is opened again: entrants can no
                    longer reach it, and nobody new can register. Those already
                    registered stay registered.
                  </BodyText>
                  <BodyText tone="secondary">
                    Once the contest starts, it can no longer go back to draft.
                  </BodyText>
                  <div className={shared.actions}>
                    <Button
                      variant="danger"
                      loading={pending}
                      onClick={() =>
                        void run((doc) => writeAt(doc, ['state'], 'draft'))
                      }
                    >
                      Back to draft
                    </Button>
                    <Button variant="secondary" onClick={() => setAsking(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Modal>
              <Modal
                opened={asking === 'archive'}
                onClose={() => setAsking(null)}
                title="Archive the contest?"
              >
                <div className={shared.stack}>
                  <BodyText>
                    Nobody can submit to its tasks any more, though they can still be
                    read. Its entrants and their results stay as they are.
                  </BodyText>
                  <div className={shared.actions}>
                    <Button
                      variant="danger"
                      loading={pending}
                      onClick={() =>
                        void run((doc) => writeAt(doc, ['state'], 'archived'))
                      }
                    >
                      Archive
                    </Button>
                    <Button variant="secondary" onClick={() => setAsking(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Modal>
              <Modal
                opened={asking === 'visibility'}
                onClose={() => setAsking(null)}
                title="Who sees it"
              >
                <div className={shared.stack}>
                  <RadioGroup
                    label="Who sees the contest"
                    value={visibility}
                    options={VISIBILITY_CHOICES}
                    onChange={setVisibility}
                  />
                  <BodyText tone="secondary">
                    Who may enter is set separately, under How people enter: a contest
                    can be seen by anyone and still entered only by invite.
                  </BodyText>
                  <div className={shared.actions}>
                    <Button
                      loading={pending}
                      disabled={visibility === values.visibility || visibility === ''}
                      onClick={() =>
                        void run((doc) => writeAt(doc, ['visibility'], visibility))
                      }
                    >
                      Save
                    </Button>
                    <Button variant="secondary" onClick={() => setAsking(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Modal>
            </>
          );
        }}
      </Loaded>
    </section>
  );
}
