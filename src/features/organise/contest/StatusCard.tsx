import { ReadOnlyAt } from '../ReadOnlyAt';
import type { ApiError } from '@/api/problem';
import { useState, type ReactNode } from 'react';
import { $api, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { Group } from '@/ui/layout';
import { standingOf } from '@/lib/contest-state';
import { contestPath, taskPath } from '@/lib/organiser-paths';
import { contestSectionPath, taskCardPath } from '@/lib/sections';
import { formatDateTime, serverNow } from '@/lib/time';
import { DefinitionErrors } from '../DefinitionErrors';
import { SaveOutcome, type Outcome } from '../files/SaveOutcome';
import { definitionErrorsOf } from '../files/refusals';
import type { ContestValues } from '../forms/contest-values';
import { isoOf } from '../forms/times';
import { DEFAULT_WAYS, registrationSentence } from '../forms/ways';
import type { SettingsBody } from '../forms/settings-hooks';
import { writeAt } from '../forms/values';
import { usePlaceMay } from '../may';
import { FieldBox } from './ContestFile';
import { contestPlaceOf, useOpenedField } from './opened';
import { useContestChange } from './save';
import { useContestSettings } from './settings';
import { labelOf, useTaskTitles } from './task-entry';
import { visibilitySentence } from './words';
import shared from '../organise.module.css';
import type { ProblemPath } from '../problem-path';
import { Checklist, StatusBox, type Check } from '../hub/Status';

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

/**
 * How a task stands for opening the contest: published without errors, with
 * a statement written, or what stops it. A published statement that is blank
 * or still the one a new task starts with stops it too (M57), and its line
 * goes to the task's Statement card. A last save with problems over a
 * publication that would open is only a warning, as the forge's opening
 * refusal does not check it either.
 */
function taskCheck(
  org: string,
  contest: string,
  standing: TaskStanding,
  titles: ReadonlyMap<string, string>,
): Check {
  const { latest, draft, errors, statement_written } = standing.state;
  const name = labelOf(standing, titles);
  const to = taskPath(org, contest, standing.task.name);
  if (draft && errors.length > 0) {
    if (latest !== null && statement_written) {
      return {
        key: name,
        ok: false,
        warning: true,
        text: `${name}: its last save has problems, so entrants get the publication before it. The contest can open with it.`,
        to,
      };
    }
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
  titles: ReadonlyMap<string, string>,
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
    ...tasks.map((task) => taskCheck(org, contest, task, titles)),
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

type Ask = 'open' | 'draft' | 'archive' | null;

/**
 * A refusal about this card's own setting, where it stands
 * (#438: a contest that has started never goes back to draft), as its
 * sentences alone, here where the button was; null for any other refusal,
 * which says where each problem is.
 */
function ownRefusals(error: ApiError) {
  const errors = definitionErrorsOf(error);
  if (errors.length === 0) return null;
  const own = (path: ProblemPath) => path.length === 1 && path[0] === 'state';
  if (!errors.every((each) => own(each.path))) return null;
  return (
    <>
      {errors.map((each) => (
        <BodyText key={each.message}>{each.message}</BodyText>
      ))}
    </>
  );
}

/**
 * What opening the contest needs while it is a draft, and an admin's
 * buttons. Its state is the page header's badge. Going back to draft
 * after the start is the forge's to refuse, so the button stays while live.
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
  const titles = useTaskTitles(
    org,
    contest,
    tasks.state === 'ready' ? tasks.data.map((standing) => standing.task.name) : [],
  );
  const admin = usePlaceMay({ kind: 'contest', org, contest }).edit_admin_settings;
  const { apply, write, pending } = useContestChange(org, contest);
  const [asking, setAsking] = useState<Ask>(null);
  const [refused, setRefused] = useState<Outcome<SettingsBody> | null>(null);
  const { field } = useOpenedField(settings.state === 'ready');

  const run = async (change: Parameters<typeof apply>[0]) => {
    setRefused(null);
    const outcome = await apply(change, { retry: true });
    setAsking(null);
    if (outcome.kind === 'refused') setRefused(outcome);
  };

  return (
    <StatusBox field={field === 'state' ? 'state' : undefined}>
      <Loaded view={settings} compact>
        {(values) => {
          if (values === null) {
            return <BodyText>The contest’s settings cannot be read.</BodyText>;
          }
          const now = serverNow();
          const standing = standingOf(dated(values), now);
          const checks =
            tasks.state === 'ready'
              ? checksOf(org, contest, values, tasks.data, titles)
              : [];
          const blocked = checks.some((check) => !check.ok && check.warning !== true);
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
          if (admin && standing === 'live') {
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
              <ReadOnlyAt place={{ kind: 'contest', org, contest }} allowed={admin} />
              {standing === 'draft' && (
                <Loaded view={tasks} compact>
                  {() => <Checklist label="Before it opens" checks={checks} />}
                </Loaded>
              )}
              {actions.length > 0 && <Group gap="xs">{actions}</Group>}
              {refused?.kind === 'refused' &&
              refused.error.code === 'confirmation_required' ? (
                <SaveOutcome
                  outcome={refused}
                  onConfirm={(body, asked) => {
                    void write({ ...body, confirm: true, asked }).then((answer) =>
                      setRefused(answer.kind === 'refused' ? answer : null),
                    );
                  }}
                  onCancel={() => setRefused(null)}
                  onReload={() => setRefused(null)}
                />
              ) : (
                refused?.kind === 'refused' && (
                  <div className={shared.panel} role="alert">
                    {ownRefusals(refused.error) ?? (
                      <>
                        <ErrorBlock
                          error={refused.error}
                          compact
                          heading="Couldn’t save"
                        />
                        <DefinitionErrors
                          errors={definitionErrorsOf(refused.error)}
                          placeOf={contestPlaceOf(org, contest, refused.body.values)}
                        />
                      </>
                    )}
                  </div>
                )
              )}
              <ConfirmDialog
                opened={asking === 'open'}
                onClose={() => setAsking(null)}
                title="Open the contest?"
                confirm="Open the contest"
                loading={pending}
                onConfirm={() =>
                  void run((fresh) => writeAt(fresh, ['state'], 'published'))
                }
              >
                {openingSentences(values, now).map((sentence) => (
                  <BodyText key={sentence}>{sentence}</BodyText>
                ))}
              </ConfirmDialog>
              <ConfirmDialog
                opened={asking === 'draft'}
                onClose={() => setAsking(null)}
                title="Put the contest back to draft?"
                confirm="Back to draft"
                variant="danger"
                loading={pending}
                onConfirm={() =>
                  void run((fresh) => writeAt(fresh, ['state'], 'draft'))
                }
              >
                <BodyText>
                  Only its organisers see it until it is opened again: entrants can no
                  longer reach it, and nobody new can register. Those already registered
                  stay registered.
                </BodyText>
                <BodyText tone="secondary">
                  Once the contest starts, it can no longer go back to draft.
                </BodyText>
              </ConfirmDialog>
              <ConfirmDialog
                opened={asking === 'archive'}
                onClose={() => setAsking(null)}
                title="Archive the contest?"
                confirm="Archive"
                variant="danger"
                loading={pending}
                onConfirm={() =>
                  void run((fresh) => writeAt(fresh, ['state'], 'archived'))
                }
              >
                <BodyText>
                  Nobody can submit to its tasks any more, though they can still be
                  read. Its entrants and their results stay as they are.
                </BodyText>
              </ConfirmDialog>
            </>
          );
        }}
      </Loaded>
    </StatusBox>
  );
}
